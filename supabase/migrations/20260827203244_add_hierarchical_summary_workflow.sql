-- Resumable, owner-only hierarchical summary previews for long lecture evidence.
-- This is a forward migration. Existing single-call v0.13.x requests remain compatible.

ALTER TABLE public.summary_revisions
  ADD COLUMN grounding_manifest JSONB;

ALTER TABLE public.summary_revisions
  ADD CONSTRAINT summary_revisions_grounding_manifest_check CHECK (
    grounding_manifest IS NULL
    OR (
      JSONB_TYPEOF(grounding_manifest) = 'object'
      AND OCTET_LENGTH(grounding_manifest::TEXT) <= 20000
    )
  );

ALTER TABLE public.summary_regeneration_requests
  ADD COLUMN workflow_kind TEXT NOT NULL DEFAULT 'single'
    CHECK (workflow_kind IN ('single', 'hierarchical')),
  ADD COLUMN plan_version TEXT NOT NULL DEFAULT 'single-v1'
    CHECK (BTRIM(plan_version) <> '' AND CHAR_LENGTH(plan_version) <= 100),
  ADD COLUMN plan_digest TEXT
    CHECK (plan_digest IS NULL OR plan_digest ~ '^[0-9a-f]{64}$'),
  ADD COLUMN stage_count INTEGER NOT NULL DEFAULT 0
    CHECK (stage_count >= 0 AND stage_count <= 24),
  ADD COLUMN completed_stage_count INTEGER NOT NULL DEFAULT 0
    CHECK (completed_stage_count >= 0 AND completed_stage_count <= stage_count),
  ADD COLUMN last_progress_at TIMESTAMPTZ,
  ADD COLUMN next_step_at TIMESTAMPTZ,
  ADD CONSTRAINT summary_regeneration_requests_workflow_shape_check CHECK (
    (workflow_kind = 'single'
      AND plan_digest IS NULL
      AND stage_count = 0
      AND completed_stage_count = 0)
    OR
    (workflow_kind = 'hierarchical'
      AND plan_digest IS NOT NULL
      AND stage_count >= 2)
  );

ALTER TABLE public.summary_regeneration_requests
  ADD CONSTRAINT summary_regeneration_requests_tenant_key
  UNIQUE (id, summary_id, user_id);

CREATE UNIQUE INDEX idx_summary_regeneration_one_active_hierarchy
  ON public.summary_regeneration_requests (user_id, summary_id)
  WHERE workflow_kind = 'hierarchical' AND state = 'generating';

CREATE TABLE public.summary_regeneration_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id BIGINT NOT NULL,
  summary_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  stage_index INTEGER NOT NULL CHECK (stage_index >= 1 AND stage_index <= 24),
  level INTEGER NOT NULL CHECK (level >= 0 AND level <= 24),
  position INTEGER NOT NULL CHECK (position >= 0 AND position <= 24),
  kind TEXT NOT NULL CHECK (kind IN ('map', 'reduce', 'final')),
  ordinal_start INTEGER,
  ordinal_end INTEGER,
  input_stage_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[] CHECK (
    CARDINALITY(input_stage_ids) <= 2
  ),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (
    state IN ('queued', 'generating', 'completed', 'failed')
  ),
  client_step_id UUID,
  attempt_id UUID,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5),
  failure_code TEXT CHECK (
    failure_code IS NULL OR failure_code IN (
      'provider_unavailable',
      'provider_failed',
      'provider_rate_limited',
      'provider_timeout_ambiguous',
      'invalid_output',
      'internal_error'
    )
  ),
  locked_until TIMESTAMPTZ,
  output_text TEXT CHECK (
    output_text IS NULL OR (
      BTRIM(output_text) <> '' AND CHAR_LENGTH(output_text) <= 100000
    )
  ),
  output_digest TEXT CHECK (output_digest IS NULL OR output_digest ~ '^[0-9a-f]{64}$'),
  grounding_manifest JSONB CHECK (
    grounding_manifest IS NULL OR (
      JSONB_TYPEOF(grounding_manifest) = 'object'
      AND OCTET_LENGTH(grounding_manifest::TEXT) <= 20000
    )
  ),
  provider TEXT CHECK (provider IS NULL OR provider = 'groq'),
  model TEXT CHECK (model IS NULL OR (BTRIM(model) <> '' AND CHAR_LENGTH(model) <= 200)),
  prompt_version TEXT CHECK (
    prompt_version IS NULL
    OR (BTRIM(prompt_version) <> '' AND CHAR_LENGTH(prompt_version) <= 100)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (request_id, stage_index),
  UNIQUE (request_id, id),
  UNIQUE (request_id, client_step_id),
  FOREIGN KEY (request_id, summary_id, user_id)
    REFERENCES public.summary_regeneration_requests (id, summary_id, user_id)
    ON DELETE CASCADE,
  CHECK (
    (kind = 'map'
      AND ordinal_start IS NOT NULL
      AND ordinal_end IS NOT NULL
      AND ordinal_start >= 0
      AND ordinal_end >= ordinal_start
      AND CARDINALITY(input_stage_ids) = 0)
    OR
    (kind = 'reduce'
      AND ordinal_start IS NULL
      AND ordinal_end IS NULL
      AND CARDINALITY(input_stage_ids) = 2)
    OR
    (kind = 'final'
      AND ordinal_start IS NULL
      AND ordinal_end IS NULL
      AND CARDINALITY(input_stage_ids) = 1)
  ),
  CHECK (
    (state = 'queued'
      AND client_step_id IS NULL
      AND attempt_id IS NULL
      AND failure_code IS NULL
      AND locked_until IS NULL
      AND output_text IS NULL
      AND completed_at IS NULL)
    OR
    (state = 'generating'
      AND client_step_id IS NOT NULL
      AND attempt_id IS NOT NULL
      AND failure_code IS NULL
      AND locked_until IS NOT NULL
      AND output_text IS NULL
      AND started_at IS NOT NULL
      AND completed_at IS NULL)
    OR
    (state = 'completed'
      AND client_step_id IS NOT NULL
      AND attempt_id IS NOT NULL
      AND failure_code IS NULL
      AND locked_until IS NULL
      AND output_digest IS NOT NULL
      AND completed_at IS NOT NULL)
    OR
    (state = 'failed'
      AND client_step_id IS NOT NULL
      AND attempt_id IS NOT NULL
      AND failure_code IS NOT NULL
      AND locked_until IS NULL
      AND output_text IS NULL
      AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idx_summary_regeneration_stages_request_state_index
  ON public.summary_regeneration_stages (request_id, state, stage_index);
CREATE INDEX idx_summary_regeneration_stages_owner_request
  ON public.summary_regeneration_stages (user_id, request_id, stage_index);
CREATE INDEX idx_summary_regeneration_stages_inputs
  ON public.summary_regeneration_stages USING GIN (input_stage_ids);

ALTER TABLE public.summary_regeneration_stages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.summary_regeneration_stages
FROM PUBLIC, anon, authenticated, service_role;

-- The legacy single-call reservation helper marks any generating request older
-- than ten minutes as failed. Hierarchical work is intentionally resumable and
-- can take much longer, so preserve active progress for 24 hours. Once that
-- boundary is crossed, the legacy cleanup may close the request normally.
CREATE OR REPLACE FUNCTION private.guard_hierarchical_generation_timeout()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.workflow_kind = 'hierarchical'
    AND OLD.state = 'generating'
    AND NEW.state = 'failed'
    AND NEW.failure_code = 'generation_timeout'
    AND COALESCE(OLD.last_progress_at, OLD.started_at)
      >= statement_timestamp() - INTERVAL '24 hours'
  THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_hierarchical_generation_timeout
BEFORE UPDATE OF state, failure_code
ON public.summary_regeneration_requests
FOR EACH ROW
EXECUTE FUNCTION private.guard_hierarchical_generation_timeout();

-- Intermediate text is private resumability state, not durable revision data.
-- Scrub it whenever a hierarchical request reaches a terminal state, including
-- lazy 24-hour expiry performed by the existing reservation cleanup.
CREATE OR REPLACE FUNCTION private.scrub_terminal_hierarchical_stage_output()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.workflow_kind = 'hierarchical'
    AND OLD.state = 'generating'
    AND NEW.state IN ('completed', 'failed')
  THEN
    UPDATE public.summary_regeneration_stages AS stage
    SET
      output_text = NULL,
      grounding_manifest = NULL
    WHERE stage.request_id = NEW.id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER scrub_terminal_hierarchical_stage_output
AFTER UPDATE OF state
ON public.summary_regeneration_requests
FOR EACH ROW
EXECUTE FUNCTION private.scrub_terminal_hierarchical_stage_output();

CREATE OR REPLACE FUNCTION public.start_hierarchical_summary_regeneration(
  p_summary_id UUID,
  p_client_request_id UUID,
  p_plan_version TEXT,
  p_plan_digest TEXT,
  p_stage_plan JSONB
)
RETURNS TABLE (
  request_id BIGINT,
  request_state TEXT,
  stage_count INTEGER,
  completed_stage_count INTEGER,
  next_step_at TIMESTAMPTZ,
  candidate_revision_id UUID,
  active_revision_id UUID,
  revision_epoch BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_reserved RECORD;
  v_stage JSONB;
  v_stage_ids UUID[];
  v_stage_indexes INTEGER[];
  v_stage_total INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_plan_version IS DISTINCT FROM 'hierarchical-summary-plan-v1'
    OR p_plan_digest IS NULL
    OR p_plan_digest !~ '^[0-9a-f]{64}$'
    OR JSONB_TYPEOF(p_stage_plan) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Invalid hierarchical plan.' USING ERRCODE = '22023';
  END IF;

  v_stage_total := JSONB_ARRAY_LENGTH(p_stage_plan);
  IF v_stage_total < 2 OR v_stage_total > 24 THEN
    RAISE EXCEPTION 'Hierarchical plan exceeds bounds.' USING ERRCODE = '54000';
  END IF;

  SELECT * INTO v_reserved
  FROM public.reserve_summary_regeneration(p_summary_id, p_client_request_id);

  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED('summary-hierarchy:' || v_reserved.request_id::TEXT, 20260827::BIGINT)
  );

  IF EXISTS (
    SELECT 1
    FROM public.summary_regeneration_requests AS regeneration
    WHERE regeneration.id = v_reserved.request_id
      AND regeneration.user_id = v_user_id
      AND regeneration.workflow_kind = 'hierarchical'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.summary_regeneration_requests AS regeneration
      WHERE regeneration.id = v_reserved.request_id
        AND regeneration.user_id = v_user_id
        AND regeneration.plan_version = p_plan_version
        AND regeneration.plan_digest = p_plan_digest
        AND regeneration.stage_count = v_stage_total
    ) THEN
      RAISE EXCEPTION 'Stored plan differs from requested plan.' USING ERRCODE = '40001';
    END IF;
  ELSE
    IF v_reserved.request_state <> 'generating' OR NOT v_reserved.should_generate THEN
      RAISE EXCEPTION 'Regeneration request cannot start a hierarchy.' USING ERRCODE = '55000';
    END IF;

    SELECT
      ARRAY_AGG((stage ->> 'id')::UUID ORDER BY (stage ->> 'stageIndex')::INTEGER),
      ARRAY_AGG((stage ->> 'stageIndex')::INTEGER ORDER BY (stage ->> 'stageIndex')::INTEGER)
    INTO v_stage_ids, v_stage_indexes
    FROM JSONB_ARRAY_ELEMENTS(p_stage_plan) AS stage;

    IF CARDINALITY(v_stage_ids) <> v_stage_total
      OR CARDINALITY(ARRAY(SELECT DISTINCT UNNEST(v_stage_ids))) <> v_stage_total
      OR v_stage_indexes IS DISTINCT FROM ARRAY(
        SELECT GENERATE_SERIES(1, v_stage_total)
      )
    THEN
      RAISE EXCEPTION 'Stage identifiers are invalid.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.summary_regeneration_requests AS regeneration
    SET
      workflow_kind = 'hierarchical',
      plan_version = p_plan_version,
      plan_digest = p_plan_digest,
      stage_count = v_stage_total,
      completed_stage_count = 0,
      last_progress_at = statement_timestamp(),
      next_step_at = statement_timestamp()
    WHERE regeneration.id = v_reserved.request_id
      AND regeneration.user_id = v_user_id
      AND regeneration.workflow_kind = 'single'
      AND regeneration.state = 'generating';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Hierarchical request initialization conflict.' USING ERRCODE = '40001';
    END IF;

    FOR v_stage IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_stage_plan)
    LOOP
      IF JSONB_TYPEOF(v_stage) IS DISTINCT FROM 'object'
        OR (v_stage ->> 'kind') NOT IN ('map', 'reduce', 'final')
        OR (v_stage ->> 'level')::INTEGER < 0
        OR (v_stage ->> 'position')::INTEGER < 0
      THEN
        RAISE EXCEPTION 'Invalid stage topology.' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.summary_regeneration_stages (
        id,
        request_id,
        summary_id,
        user_id,
        stage_index,
        level,
        position,
        kind,
        ordinal_start,
        ordinal_end,
        input_stage_ids
      ) VALUES (
        (v_stage ->> 'id')::UUID,
        v_reserved.request_id,
        p_summary_id,
        v_user_id,
        (v_stage ->> 'stageIndex')::INTEGER,
        (v_stage ->> 'level')::INTEGER,
        (v_stage ->> 'position')::INTEGER,
        v_stage ->> 'kind',
        NULLIF(v_stage ->> 'ordinalStart', '')::INTEGER,
        NULLIF(v_stage ->> 'ordinalEnd', '')::INTEGER,
        COALESCE(
          ARRAY(SELECT JSONB_ARRAY_ELEMENTS_TEXT(v_stage -> 'inputStageIds')::UUID),
          ARRAY[]::UUID[]
        )
      );
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM public.summary_regeneration_stages AS stage
      CROSS JOIN LATERAL UNNEST(stage.input_stage_ids) AS input_id
      LEFT JOIN public.summary_regeneration_stages AS input_stage
        ON input_stage.request_id = stage.request_id
       AND input_stage.id = input_id
      WHERE stage.request_id = v_reserved.request_id
        AND (
          input_stage.id IS NULL
          OR input_stage.stage_index >= stage.stage_index
        )
    ) THEN
      RAISE EXCEPTION 'Stage dependency is invalid.' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    regeneration.id,
    regeneration.state,
    regeneration.stage_count,
    regeneration.completed_stage_count,
    regeneration.next_step_at,
    regeneration.candidate_revision_id,
    summary.active_revision_id,
    summary.revision_epoch
  FROM public.summary_regeneration_requests AS regeneration
  JOIN public.summaries AS summary
    ON summary.id = regeneration.summary_id
   AND summary.user_id = regeneration.user_id
  WHERE regeneration.id = v_reserved.request_id
    AND regeneration.user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_hierarchical_summary_stage(
  p_request_id BIGINT,
  p_client_step_id UUID,
  p_retry_stage_id UUID DEFAULT NULL
)
RETURNS TABLE (
  request_state TEXT,
  stage_id UUID,
  attempt_id UUID,
  stage_index INTEGER,
  stage_kind TEXT,
  stage_state TEXT,
  ordinal_start INTEGER,
  ordinal_end INTEGER,
  input_stage_outputs JSONB,
  processing_run_id UUID,
  context_annotation_ids BIGINT[],
  stage_count INTEGER,
  completed_stage_count INTEGER,
  next_step_at TIMESTAMPTZ,
  replayed BOOLEAN,
  failed_stage_id UUID,
  failure_code TEXT,
  candidate_revision_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_request public.summary_regeneration_requests%ROWTYPE;
  v_stage public.summary_regeneration_stages%ROWTYPE;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_replayed BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_request_id IS NULL OR p_request_id <= 0 OR p_client_step_id IS NULL THEN
    RAISE EXCEPTION 'Invalid stage claim.' USING ERRCODE = '22023';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED('summary-hierarchy:' || p_request_id::TEXT, 20260827::BIGINT)
  );

  SELECT regeneration.* INTO v_request
  FROM public.summary_regeneration_requests AS regeneration
  WHERE regeneration.id = p_request_id
    AND regeneration.user_id = v_user_id
    AND regeneration.workflow_kind = 'hierarchical'
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Hierarchical request not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.summary_regeneration_stages AS stage
  SET
    state = 'failed',
    failure_code = 'provider_timeout_ambiguous',
    locked_until = NULL,
    completed_at = v_now
  WHERE stage.request_id = p_request_id
    AND stage.user_id = v_user_id
    AND stage.state = 'generating'
    AND stage.locked_until < v_now;

  SELECT stage.* INTO v_stage
  FROM public.summary_regeneration_stages AS stage
  WHERE stage.request_id = p_request_id
    AND stage.user_id = v_user_id
    AND stage.client_step_id = p_client_step_id;

  IF v_stage.id IS NOT NULL THEN
    v_replayed := TRUE;
  ELSIF v_request.state = 'generating' AND v_request.next_step_at > v_now THEN
    v_stage.id := NULL;
  ELSIF p_retry_stage_id IS NOT NULL THEN
    SELECT stage.* INTO v_stage
    FROM public.summary_regeneration_stages AS stage
    WHERE stage.id = p_retry_stage_id
      AND stage.request_id = p_request_id
      AND stage.user_id = v_user_id
      AND stage.state = 'failed'
    FOR UPDATE;
    IF v_stage.id IS NULL THEN
      RAISE EXCEPTION 'Failed stage is not retryable.' USING ERRCODE = '55000';
    END IF;
    IF v_stage.attempt_count >= 5 THEN
      RAISE EXCEPTION 'Stage retry limit reached.' USING ERRCODE = '54000';
    END IF;
    UPDATE public.summary_regeneration_stages AS stage
    SET
      state = 'generating',
      client_step_id = p_client_step_id,
      attempt_id = gen_random_uuid(),
      attempt_count = stage.attempt_count + 1,
      failure_code = NULL,
      locked_until = v_now + INTERVAL '2 minutes',
      started_at = v_now,
      completed_at = NULL
    WHERE stage.id = v_stage.id
    RETURNING stage.* INTO v_stage;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.summary_regeneration_stages AS failed
    WHERE failed.request_id = p_request_id AND failed.state = 'failed'
  ) THEN
    SELECT stage.* INTO v_stage
    FROM public.summary_regeneration_stages AS stage
    WHERE stage.request_id = p_request_id
      AND stage.user_id = v_user_id
      AND stage.state = 'queued'
      AND NOT EXISTS (
        SELECT 1
        FROM UNNEST(stage.input_stage_ids) AS input_id
        LEFT JOIN public.summary_regeneration_stages AS dependency
          ON dependency.request_id = stage.request_id
         AND dependency.id = input_id
         AND dependency.state = 'completed'
        WHERE dependency.id IS NULL
      )
    ORDER BY stage.stage_index
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_stage.id IS NOT NULL THEN
      UPDATE public.summary_regeneration_stages AS stage
      SET
        state = 'generating',
        client_step_id = p_client_step_id,
        attempt_id = gen_random_uuid(),
        attempt_count = stage.attempt_count + 1,
        locked_until = v_now + INTERVAL '2 minutes',
        started_at = v_now
      WHERE stage.id = v_stage.id
      RETURNING stage.* INTO v_stage;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_request.state,
    v_stage.id,
    v_stage.attempt_id,
    v_stage.stage_index,
    v_stage.kind,
    v_stage.state,
    v_stage.ordinal_start,
    v_stage.ordinal_end,
    CASE WHEN v_stage.id IS NULL THEN '[]'::JSONB ELSE COALESCE((
      SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
        'stageId', dependency.id,
        'output', dependency.output_text
      ) ORDER BY dependency.stage_index)
      FROM public.summary_regeneration_stages AS dependency
      WHERE dependency.request_id = p_request_id
        AND dependency.id = ANY(v_stage.input_stage_ids)
        AND dependency.state = 'completed'
    ), '[]'::JSONB) END,
    run.id,
    v_request.context_annotation_ids,
    v_request.stage_count,
    v_request.completed_stage_count,
    v_request.next_step_at,
    v_replayed,
    failed.id,
    failed.failure_code,
    v_request.candidate_revision_id
  FROM public.processing_runs AS run
  LEFT JOIN LATERAL (
    SELECT failed_stage.id, failed_stage.failure_code
    FROM public.summary_regeneration_stages AS failed_stage
    WHERE failed_stage.request_id = p_request_id
      AND failed_stage.state = 'failed'
    ORDER BY failed_stage.stage_index
    LIMIT 1
  ) AS failed ON TRUE
  WHERE run.summary_id = v_request.summary_id
    AND run.user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_hierarchical_summary_stage(
  p_stage_id UUID,
  p_attempt_id UUID,
  p_output_text TEXT,
  p_output_digest TEXT,
  p_grounding_manifest JSONB,
  p_prompt_version TEXT,
  p_provider TEXT,
  p_model TEXT,
  p_next_step_at TIMESTAMPTZ
)
RETURNS TABLE (
  request_id BIGINT,
  request_state TEXT,
  stage_count INTEGER,
  completed_stage_count INTEGER,
  next_step_at TIMESTAMPTZ,
  candidate_revision_id UUID,
  candidate_version INTEGER,
  candidate_content TEXT,
  candidate_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_stage public.summary_regeneration_stages%ROWTYPE;
  v_request public.summary_regeneration_requests%ROWTYPE;
  v_now TIMESTAMPTZ := statement_timestamp();
  v_revision_id UUID;
  v_revision_version INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_stage_id IS NULL OR p_attempt_id IS NULL
    OR p_output_text IS NULL OR BTRIM(p_output_text) = ''
    OR p_output_digest IS NULL OR p_output_digest !~ '^[0-9a-f]{64}$'
    OR p_prompt_version IS DISTINCT FROM 'context-summary-hierarchical-v1'
    OR p_provider IS DISTINCT FROM 'groq'
    OR p_model IS NULL OR BTRIM(p_model) = '' OR CHAR_LENGTH(p_model) > 200
  THEN
    RAISE EXCEPTION 'Invalid stage completion.' USING ERRCODE = '22023';
  END IF;

  SELECT stage.* INTO v_stage
  FROM public.summary_regeneration_stages AS stage
  WHERE stage.id = p_stage_id
    AND stage.user_id = v_user_id;
  IF v_stage.id IS NULL THEN
    RAISE EXCEPTION 'Stage not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED('summary-hierarchy:' || v_stage.request_id::TEXT, 20260827::BIGINT)
  );

  SELECT stage.* INTO v_stage
  FROM public.summary_regeneration_stages AS stage
  WHERE stage.id = p_stage_id
    AND stage.user_id = v_user_id
  FOR UPDATE;
  SELECT regeneration.* INTO v_request
  FROM public.summary_regeneration_requests AS regeneration
  WHERE regeneration.id = v_stage.request_id
    AND regeneration.user_id = v_user_id
  FOR UPDATE;

  IF v_stage.state = 'completed' AND v_stage.attempt_id = p_attempt_id THEN
    NULL;
  ELSIF v_stage.state <> 'generating' OR v_stage.attempt_id IS DISTINCT FROM p_attempt_id THEN
    RAISE EXCEPTION 'Stage attempt is stale.' USING ERRCODE = '40001';
  ELSE
    IF (v_stage.kind <> 'final' AND CHAR_LENGTH(BTRIM(p_output_text)) > 5000)
      OR (v_stage.kind = 'final' AND CHAR_LENGTH(BTRIM(p_output_text)) > 100000)
      OR (v_stage.kind = 'final' AND (
        p_grounding_manifest IS NULL
        OR JSONB_TYPEOF(p_grounding_manifest) IS DISTINCT FROM 'object'
        OR OCTET_LENGTH(p_grounding_manifest::TEXT) > 20000
      ))
      OR (v_stage.kind <> 'final' AND p_grounding_manifest IS NOT NULL)
    THEN
      RAISE EXCEPTION 'Stage output exceeds bounds.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.summary_regeneration_stages AS stage
    SET
      state = 'completed',
      failure_code = NULL,
      locked_until = NULL,
      output_text = BTRIM(p_output_text),
      output_digest = p_output_digest,
      grounding_manifest = p_grounding_manifest,
      provider = p_provider,
      model = BTRIM(p_model),
      prompt_version = p_prompt_version,
      completed_at = v_now
    WHERE stage.id = v_stage.id;

    UPDATE public.summary_regeneration_requests AS regeneration
    SET
      completed_stage_count = regeneration.completed_stage_count + 1,
      last_progress_at = v_now,
      next_step_at = CASE
        WHEN p_next_step_at IS NULL THEN v_now + INTERVAL '125 seconds'
        WHEN p_next_step_at < v_now THEN v_now
        WHEN p_next_step_at > v_now + INTERVAL '10 minutes' THEN v_now + INTERVAL '10 minutes'
        ELSE p_next_step_at
      END
    WHERE regeneration.id = v_request.id;

    IF v_stage.kind = 'final' THEN
      SELECT COALESCE(MAX(revision.version), 0) + 1 INTO v_revision_version
      FROM public.summary_revisions AS revision
      WHERE revision.summary_id = v_request.summary_id;
      IF v_revision_version > 25 THEN
        RAISE EXCEPTION 'Summary revision limit reached.' USING ERRCODE = '54000';
      END IF;

      INSERT INTO public.summary_revisions (
        summary_id, user_id, version, parent_revision_id, request_id,
        source_kind, state, content, prompt_version, provider, model,
        context_annotation_ids, grounding_manifest
      ) VALUES (
        v_request.summary_id, v_user_id, v_revision_version,
        v_request.base_revision_id, v_request.id, 'context_regeneration',
        'candidate', BTRIM(p_output_text), p_prompt_version, p_provider,
        BTRIM(p_model), v_request.context_annotation_ids, p_grounding_manifest
      ) RETURNING id INTO v_revision_id;

      UPDATE public.summary_regeneration_requests AS regeneration
      SET
        state = 'completed',
        candidate_revision_id = v_revision_id,
        completed_at = v_now,
        next_step_at = NULL
      WHERE regeneration.id = v_request.id;

      UPDATE public.summary_regeneration_stages AS stage
      SET output_text = NULL, grounding_manifest = NULL
      WHERE stage.request_id = v_request.id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    regeneration.id,
    regeneration.state,
    regeneration.stage_count,
    regeneration.completed_stage_count,
    regeneration.next_step_at,
    regeneration.candidate_revision_id,
    revision.version,
    revision.content,
    revision.created_at
  FROM public.summary_regeneration_requests AS regeneration
  LEFT JOIN public.summary_revisions AS revision
    ON revision.id = regeneration.candidate_revision_id
   AND revision.user_id = v_user_id
  WHERE regeneration.id = v_request.id
    AND regeneration.user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_hierarchical_summary_stage(
  p_stage_id UUID,
  p_attempt_id UUID,
  p_failure_code TEXT,
  p_next_step_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_stage_id IS NULL OR p_attempt_id IS NULL OR p_failure_code NOT IN (
    'provider_unavailable', 'provider_failed', 'provider_rate_limited',
    'provider_timeout_ambiguous', 'invalid_output', 'internal_error'
  ) THEN
    RAISE EXCEPTION 'Invalid stage failure.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.summary_regeneration_stages AS stage
  SET
    state = 'failed',
    failure_code = p_failure_code,
    locked_until = NULL,
    completed_at = statement_timestamp()
  WHERE stage.id = p_stage_id
    AND stage.user_id = v_user_id
    AND stage.state = 'generating'
    AND stage.attempt_id = p_attempt_id;

  IF FOUND THEN
    UPDATE public.summary_regeneration_requests AS regeneration
    SET
      last_progress_at = statement_timestamp(),
      next_step_at = p_next_step_at
    WHERE regeneration.id = (
      SELECT failed.request_id
      FROM public.summary_regeneration_stages AS failed
      WHERE failed.id = p_stage_id
        AND failed.user_id = v_user_id
    );
  END IF;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_hierarchical_summary_progress(
  p_summary_id UUID
)
RETURNS TABLE (
  request_id BIGINT,
  client_request_id UUID,
  plan_version TEXT,
  plan_digest TEXT,
  request_state TEXT,
  stage_count INTEGER,
  completed_stage_count INTEGER,
  next_step_at TIMESTAMPTZ,
  failed_stage_id UUID,
  failed_stage_kind TEXT,
  failure_code TEXT,
  candidate_revision_id UUID,
  candidate_version INTEGER,
  candidate_content TEXT,
  candidate_created_at TIMESTAMPTZ,
  candidate_state TEXT,
  candidate_parent_revision_id UUID,
  active_revision_id UUID,
  revision_epoch BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    regeneration.id,
    regeneration.client_request_id,
    regeneration.plan_version,
    regeneration.plan_digest,
    regeneration.state,
    regeneration.stage_count,
    regeneration.completed_stage_count,
    regeneration.next_step_at,
    failed.id,
    failed.kind,
    failed.failure_code,
    regeneration.candidate_revision_id,
    candidate.version,
    candidate.content,
    candidate.created_at,
    candidate.state,
    candidate.parent_revision_id,
    summary.active_revision_id,
    summary.revision_epoch
  FROM public.summary_regeneration_requests AS regeneration
  JOIN public.summaries AS summary
    ON summary.id = regeneration.summary_id
   AND summary.user_id = regeneration.user_id
  LEFT JOIN public.summary_revisions AS candidate
    ON candidate.id = regeneration.candidate_revision_id
   AND candidate.user_id = regeneration.user_id
  LEFT JOIN LATERAL (
    SELECT stage.id, stage.kind, stage.failure_code
    FROM public.summary_regeneration_stages AS stage
    WHERE stage.request_id = regeneration.id
      AND stage.state = 'failed'
    ORDER BY stage.stage_index
    LIMIT 1
  ) AS failed ON TRUE
  WHERE regeneration.summary_id = p_summary_id
    AND regeneration.user_id = (SELECT auth.uid())
    AND regeneration.workflow_kind = 'hierarchical'
    AND regeneration.state = 'generating'
  ORDER BY regeneration.started_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.read_hierarchical_summary_request(
  p_request_id BIGINT
)
RETURNS TABLE (
  request_id BIGINT,
  client_request_id UUID,
  plan_version TEXT,
  plan_digest TEXT,
  request_state TEXT,
  stage_count INTEGER,
  completed_stage_count INTEGER,
  next_step_at TIMESTAMPTZ,
  failed_stage_id UUID,
  failed_stage_kind TEXT,
  failure_code TEXT,
  candidate_revision_id UUID,
  candidate_version INTEGER,
  candidate_content TEXT,
  candidate_created_at TIMESTAMPTZ,
  candidate_state TEXT,
  candidate_parent_revision_id UUID,
  active_revision_id UUID,
  revision_epoch BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    regeneration.id,
    regeneration.client_request_id,
    regeneration.plan_version,
    regeneration.plan_digest,
    regeneration.state,
    regeneration.stage_count,
    regeneration.completed_stage_count,
    regeneration.next_step_at,
    failed.id,
    failed.kind,
    failed.failure_code,
    regeneration.candidate_revision_id,
    candidate.version,
    candidate.content,
    candidate.created_at,
    candidate.state,
    candidate.parent_revision_id,
    summary.active_revision_id,
    summary.revision_epoch
  FROM public.summary_regeneration_requests AS regeneration
  JOIN public.summaries AS summary
    ON summary.id = regeneration.summary_id
   AND summary.user_id = regeneration.user_id
  LEFT JOIN public.summary_revisions AS candidate
    ON candidate.id = regeneration.candidate_revision_id
   AND candidate.user_id = regeneration.user_id
  LEFT JOIN LATERAL (
    SELECT stage.id, stage.kind, stage.failure_code
    FROM public.summary_regeneration_stages AS stage
    WHERE stage.request_id = regeneration.id
      AND stage.state = 'failed'
    ORDER BY stage.stage_index
    LIMIT 1
  ) AS failed ON TRUE
  WHERE regeneration.id = p_request_id
    AND regeneration.user_id = (SELECT auth.uid())
    AND regeneration.workflow_kind = 'hierarchical';
$$;

REVOKE EXECUTE ON FUNCTION public.start_hierarchical_summary_regeneration(
  UUID, UUID, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_hierarchical_summary_stage(
  BIGINT, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.complete_hierarchical_summary_stage(
  UUID, UUID, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fail_hierarchical_summary_stage(
  UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.read_hierarchical_summary_progress(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.read_hierarchical_summary_request(BIGINT)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.start_hierarchical_summary_regeneration(
  UUID, UUID, TEXT, TEXT, JSONB
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_hierarchical_summary_stage(
  BIGINT, UUID, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_hierarchical_summary_stage(
  UUID, UUID, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_hierarchical_summary_stage(
  UUID, UUID, TEXT, TIMESTAMPTZ
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_hierarchical_summary_progress(UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_hierarchical_summary_request(BIGINT)
TO authenticated;

COMMENT ON TABLE public.summary_regeneration_stages IS
  'Private resumable stage state. Direct Data API access is revoked; owner-only RPCs coordinate bounded work.';
