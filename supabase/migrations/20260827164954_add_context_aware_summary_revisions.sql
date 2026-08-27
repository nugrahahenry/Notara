-- Context-aware summary revisions for explicit owner preview/apply/restore.
-- Candidate content is private. public.summaries.summary remains canonical.

ALTER TABLE public.summaries
  ADD COLUMN active_revision_id UUID,
  ADD COLUMN revision_epoch BIGINT NOT NULL DEFAULT 0
    CHECK (revision_epoch >= 0);

ALTER TABLE public.summaries
  ADD CONSTRAINT summaries_revision_tenant_key UNIQUE (id, user_id);

CREATE TABLE public.summary_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1 AND version <= 25),
  parent_revision_id UUID,
  request_id BIGINT,
  source_kind TEXT NOT NULL CHECK (
    source_kind IN ('original', 'context_regeneration')
  ),
  state TEXT NOT NULL CHECK (state IN ('candidate', 'accepted')),
  content TEXT NOT NULL CHECK (
    BTRIM(content) <> ''
    AND CHAR_LENGTH(content) <= 100000
  ),
  prompt_version TEXT CHECK (
    prompt_version IS NULL
    OR (
      BTRIM(prompt_version) <> ''
      AND CHAR_LENGTH(prompt_version) <= 100
    )
  ),
  provider TEXT CHECK (
    provider IS NULL
    OR (
      BTRIM(provider) <> ''
      AND CHAR_LENGTH(provider) <= 50
    )
  ),
  model TEXT CHECK (
    model IS NULL
    OR (
      BTRIM(model) <> ''
      AND CHAR_LENGTH(model) <= 200
    )
  ),
  context_annotation_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[] CHECK (
    CARDINALITY(context_annotation_ids) <= 5000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (summary_id, version),
  UNIQUE (id, summary_id, user_id),
  UNIQUE (request_id),
  FOREIGN KEY (summary_id, user_id)
    REFERENCES public.summaries (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (parent_revision_id, summary_id, user_id)
    REFERENCES public.summary_revisions (id, summary_id, user_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (source_kind = 'original'
      AND state = 'accepted'
      AND parent_revision_id IS NULL
      AND request_id IS NULL
      AND prompt_version IS NULL
      AND provider IS NULL
      AND model IS NULL
      AND CARDINALITY(context_annotation_ids) = 0
      AND accepted_at IS NOT NULL)
    OR
    (source_kind = 'context_regeneration'
      AND parent_revision_id IS NOT NULL
      AND prompt_version IS NOT NULL
      AND provider = 'groq'
      AND model IS NOT NULL)
  ),
  CHECK (
    (state = 'candidate' AND accepted_at IS NULL)
    OR (state = 'accepted' AND accepted_at IS NOT NULL)
  )
);

CREATE TABLE public.summary_regeneration_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  summary_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_request_id UUID NOT NULL,
  base_revision_id UUID NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('generating', 'completed', 'failed')),
  context_annotation_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[] CHECK (
    CARDINALITY(context_annotation_ids) <= 5000
  ),
  candidate_revision_id UUID,
  failure_code TEXT CHECK (
    failure_code IS NULL
    OR failure_code IN (
      'provider_unavailable',
      'provider_failed',
      'provider_timeout',
      'invalid_output',
      'generation_timeout',
      'internal_error'
    )
  ),
  started_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, client_request_id),
  UNIQUE (candidate_revision_id),
  FOREIGN KEY (summary_id, user_id)
    REFERENCES public.summaries (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (base_revision_id, summary_id, user_id)
    REFERENCES public.summary_revisions (id, summary_id, user_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (candidate_revision_id, summary_id, user_id)
    REFERENCES public.summary_revisions (id, summary_id, user_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (state = 'generating'
      AND candidate_revision_id IS NULL
      AND failure_code IS NULL
      AND completed_at IS NULL)
    OR
    (state = 'completed'
      AND candidate_revision_id IS NOT NULL
      AND failure_code IS NULL
      AND completed_at IS NOT NULL)
    OR
    (state = 'failed'
      AND candidate_revision_id IS NULL
      AND failure_code IS NOT NULL
      AND completed_at IS NOT NULL)
  )
);

ALTER TABLE public.summary_revisions
  ADD CONSTRAINT summary_revisions_request_fkey
  FOREIGN KEY (request_id)
  REFERENCES public.summary_regeneration_requests (id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.summaries
  ADD CONSTRAINT summaries_active_revision_fkey
  FOREIGN KEY (active_revision_id, id, user_id)
  REFERENCES public.summary_revisions (id, summary_id, user_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX idx_summary_revisions_owner_summary_version
  ON public.summary_revisions (user_id, summary_id, version DESC);
CREATE INDEX idx_summary_revisions_summary_state_version
  ON public.summary_revisions (summary_id, state, version DESC);
CREATE INDEX idx_summary_revisions_parent
  ON public.summary_revisions (parent_revision_id, summary_id, user_id);
CREATE INDEX idx_summary_regeneration_requests_owner_started
  ON public.summary_regeneration_requests (user_id, started_at DESC);
CREATE INDEX idx_summary_regeneration_requests_summary_started
  ON public.summary_regeneration_requests (summary_id, started_at DESC);
CREATE INDEX idx_summary_regeneration_requests_base
  ON public.summary_regeneration_requests (base_revision_id, summary_id, user_id);

ALTER TABLE public.summary_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summary_regeneration_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read summary revisions"
ON public.summary_revisions
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE
  public.summary_revisions,
  public.summary_regeneration_requests
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.summary_regeneration_requests_id_seq
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.summary_revisions TO authenticated;

CREATE OR REPLACE FUNCTION private.latest_summary_annotation_ids(
  p_summary_id UUID,
  p_user_id UUID
)
RETURNS BIGINT[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY_AGG(latest.id ORDER BY latest.segment_id),
    ARRAY[]::BIGINT[]
  )
  FROM (
    SELECT DISTINCT ON (annotation.segment_id)
      annotation.id,
      annotation.segment_id
    FROM public.transcript_segment_annotations AS annotation
    WHERE annotation.summary_id = p_summary_id
      AND annotation.user_id = p_user_id
    ORDER BY annotation.segment_id, annotation.version DESC
  ) AS latest;
$$;

REVOKE EXECUTE ON FUNCTION private.latest_summary_annotation_ids(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_summary_regeneration(
  p_summary_id UUID,
  p_client_request_id UUID
)
RETURNS TABLE (
  request_id BIGINT,
  request_state TEXT,
  should_generate BOOLEAN,
  processing_run_id UUID,
  base_revision_id UUID,
  base_summary_content TEXT,
  active_revision_id UUID,
  revision_epoch BIGINT,
  context_annotation_ids BIGINT[],
  candidate_revision_id UUID,
  candidate_content TEXT,
  candidate_version INTEGER,
  candidate_state TEXT,
  candidate_created_at TIMESTAMPTZ,
  candidate_accepted_at TIMESTAMPTZ,
  failure_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_now TIMESTAMPTZ := statement_timestamp();
  v_summary_content TEXT;
  v_active_revision_id UUID;
  v_revision_epoch BIGINT;
  v_processing_run_id UUID;
  v_annotation_ids BIGINT[];
  v_revision_count INTEGER;
  v_request_count INTEGER;
  v_existing public.summary_regeneration_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_summary_id IS NULL OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Summary and client request IDs are required.' USING ERRCODE = '22023';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED('summary-regeneration-owner:' || v_user_id::TEXT, 20260827::BIGINT)
  );

  UPDATE public.summary_regeneration_requests AS regeneration
  SET
    state = 'failed',
    failure_code = 'generation_timeout',
    completed_at = v_now
  WHERE regeneration.user_id = v_user_id
    AND regeneration.state = 'generating'
    AND regeneration.started_at < v_now - INTERVAL '10 minutes';

  DELETE FROM public.summary_regeneration_requests AS regeneration
  WHERE regeneration.user_id = v_user_id
    AND regeneration.state IN ('completed', 'failed')
    AND regeneration.completed_at < v_now - INTERVAL '30 days';

  SELECT regeneration.*
  INTO v_existing
  FROM public.summary_regeneration_requests AS regeneration
  WHERE regeneration.user_id = v_user_id
    AND regeneration.client_request_id = p_client_request_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.summary_id <> p_summary_id THEN
      RAISE EXCEPTION 'Client request belongs to another summary.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.state,
      FALSE,
      run.id,
      v_existing.base_revision_id,
      base.content,
      summary.active_revision_id,
      summary.revision_epoch,
      v_existing.context_annotation_ids,
      v_existing.candidate_revision_id,
      candidate.content,
      candidate.version,
      candidate.state,
      candidate.created_at,
      candidate.accepted_at,
      v_existing.failure_code
    FROM public.summaries AS summary
    JOIN public.processing_runs AS run ON run.summary_id = summary.id
    JOIN public.summary_revisions AS base ON base.id = v_existing.base_revision_id
    LEFT JOIN public.summary_revisions AS candidate
      ON candidate.id = v_existing.candidate_revision_id
    WHERE summary.id = p_summary_id
      AND summary.user_id = v_user_id;
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_request_count
  FROM public.summary_regeneration_requests AS regeneration
  WHERE regeneration.user_id = v_user_id;

  IF v_request_count >= 100 THEN
    RAISE EXCEPTION 'Summary regeneration request limit reached.' USING ERRCODE = '54000';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED('summary-revision:' || p_summary_id::TEXT, 20260827::BIGINT)
  );

  SELECT summary.summary, summary.active_revision_id, summary.revision_epoch
  INTO v_summary_content, v_active_revision_id, v_revision_epoch
  FROM public.summaries AS summary
  WHERE summary.id = p_summary_id
    AND summary.user_id = v_user_id
  FOR UPDATE;

  IF v_summary_content IS NULL THEN
    RAISE EXCEPTION 'Owned summary not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT run.id
  INTO v_processing_run_id
  FROM public.processing_runs AS run
  WHERE run.summary_id = p_summary_id
    AND run.user_id = v_user_id;

  IF v_processing_run_id IS NULL THEN
    RAISE EXCEPTION 'Transcript evidence not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_active_revision_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.summary_revisions AS revision
      WHERE revision.summary_id = p_summary_id
    ) THEN
      RAISE EXCEPTION 'Summary revision pointer is inconsistent.' USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.summary_revisions (
      summary_id,
      user_id,
      version,
      source_kind,
      state,
      content,
      accepted_at
    )
    VALUES (
      p_summary_id,
      v_user_id,
      1,
      'original',
      'accepted',
      v_summary_content,
      v_now
    )
    RETURNING id INTO v_active_revision_id;

    UPDATE public.summaries AS summary
    SET active_revision_id = v_active_revision_id
    WHERE summary.id = p_summary_id
      AND summary.user_id = v_user_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.summary_revisions AS revision
      WHERE revision.id = v_active_revision_id
        AND revision.summary_id = p_summary_id
        AND revision.user_id = v_user_id
        AND revision.state = 'accepted'
        AND revision.content = v_summary_content
    ) THEN
      RAISE EXCEPTION 'Canonical summary revision is inconsistent.' USING ERRCODE = '55000';
    END IF;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_revision_count
  FROM public.summary_revisions AS revision
  WHERE revision.summary_id = p_summary_id;

  IF v_revision_count >= 25 THEN
    RAISE EXCEPTION 'Summary revision limit reached.' USING ERRCODE = '54000';
  END IF;

  v_annotation_ids := private.latest_summary_annotation_ids(
    p_summary_id,
    v_user_id
  );

  INSERT INTO public.summary_regeneration_requests (
    summary_id,
    user_id,
    client_request_id,
    base_revision_id,
    state,
    context_annotation_ids
  )
  VALUES (
    p_summary_id,
    v_user_id,
    p_client_request_id,
    v_active_revision_id,
    'generating',
    v_annotation_ids
  )
  RETURNING id INTO request_id;

  request_state := 'generating';
  should_generate := TRUE;
  processing_run_id := v_processing_run_id;
  base_revision_id := v_active_revision_id;
  base_summary_content := v_summary_content;
  active_revision_id := v_active_revision_id;
  revision_epoch := v_revision_epoch;
  context_annotation_ids := v_annotation_ids;
  candidate_revision_id := NULL;
  candidate_content := NULL;
  candidate_version := NULL;
  candidate_state := NULL;
  candidate_created_at := NULL;
  candidate_accepted_at := NULL;
  failure_code := NULL;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_summary_regeneration(
  p_request_id BIGINT,
  p_content TEXT,
  p_prompt_version TEXT,
  p_provider TEXT,
  p_model TEXT
)
RETURNS TABLE (
  revision_id UUID,
  revision_version INTEGER,
  revision_content TEXT,
  revision_state TEXT,
  parent_revision_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_now TIMESTAMPTZ := statement_timestamp();
  v_request public.summary_regeneration_requests%ROWTYPE;
  v_revision_id UUID;
  v_revision_version INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_request_id IS NULL OR p_request_id <= 0 THEN
    RAISE EXCEPTION 'Invalid regeneration request.' USING ERRCODE = '22023';
  END IF;
  IF p_content IS NULL OR BTRIM(p_content) = '' OR CHAR_LENGTH(p_content) > 100000 THEN
    RAISE EXCEPTION 'Invalid summary candidate.' USING ERRCODE = '22023';
  END IF;
  IF p_prompt_version IS DISTINCT FROM 'context-summary-v1'
    OR p_provider IS DISTINCT FROM 'groq'
    OR p_model IS NULL
    OR BTRIM(p_model) = ''
    OR CHAR_LENGTH(p_model) > 200
  THEN
    RAISE EXCEPTION 'Invalid generation provenance.' USING ERRCODE = '22023';
  END IF;

  SELECT regeneration.*
  INTO v_request
  FROM public.summary_regeneration_requests AS regeneration
  WHERE regeneration.id = p_request_id
    AND regeneration.user_id = v_user_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Regeneration request not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED('summary-revision:' || v_request.summary_id::TEXT, 20260827::BIGINT)
  );

  SELECT regeneration.*
  INTO v_request
  FROM public.summary_regeneration_requests AS regeneration
  WHERE regeneration.id = p_request_id
    AND regeneration.user_id = v_user_id
  FOR UPDATE;

  IF v_request.state = 'completed' THEN
    RETURN QUERY
    SELECT
      revision.id,
      revision.version,
      revision.content,
      revision.state,
      revision.parent_revision_id,
      revision.created_at
    FROM public.summary_revisions AS revision
    WHERE revision.id = v_request.candidate_revision_id
      AND revision.user_id = v_user_id;
    RETURN;
  END IF;

  IF v_request.state <> 'generating' THEN
    RAISE EXCEPTION 'Regeneration request is not active.' USING ERRCODE = '55000';
  END IF;

  IF v_request.started_at < v_now - INTERVAL '10 minutes' THEN
    UPDATE public.summary_regeneration_requests AS regeneration
    SET state = 'failed', failure_code = 'generation_timeout', completed_at = v_now
    WHERE regeneration.id = v_request.id;
    RAISE EXCEPTION 'Regeneration request expired.' USING ERRCODE = '57014';
  END IF;

  SELECT COALESCE(MAX(revision.version), 0) + 1
  INTO v_revision_version
  FROM public.summary_revisions AS revision
  WHERE revision.summary_id = v_request.summary_id;

  IF v_revision_version > 25 THEN
    RAISE EXCEPTION 'Summary revision limit reached.' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.summary_revisions (
    summary_id,
    user_id,
    version,
    parent_revision_id,
    request_id,
    source_kind,
    state,
    content,
    prompt_version,
    provider,
    model,
    context_annotation_ids
  )
  VALUES (
    v_request.summary_id,
    v_user_id,
    v_revision_version,
    v_request.base_revision_id,
    v_request.id,
    'context_regeneration',
    'candidate',
    BTRIM(p_content),
    p_prompt_version,
    p_provider,
    BTRIM(p_model),
    v_request.context_annotation_ids
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.summary_regeneration_requests AS regeneration
  SET
    state = 'completed',
    candidate_revision_id = v_revision_id,
    completed_at = v_now
  WHERE regeneration.id = v_request.id;

  RETURN QUERY
  SELECT
    revision.id,
    revision.version,
    revision.content,
    revision.state,
    revision.parent_revision_id,
    revision.created_at
  FROM public.summary_revisions AS revision
  WHERE revision.id = v_revision_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_summary_regeneration(
  p_request_id BIGINT,
  p_failure_code TEXT
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
  IF p_request_id IS NULL OR p_request_id <= 0
    OR p_failure_code IS NULL
    OR p_failure_code NOT IN (
      'provider_unavailable',
      'provider_failed',
      'provider_timeout',
      'invalid_output',
      'internal_error'
    )
  THEN
    RAISE EXCEPTION 'Invalid regeneration failure.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.summary_regeneration_requests AS regeneration
  SET
    state = 'failed',
    failure_code = p_failure_code,
    completed_at = statement_timestamp()
  WHERE regeneration.id = p_request_id
    AND regeneration.user_id = v_user_id
    AND regeneration.state = 'generating';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_summary_revision(
  p_summary_id UUID,
  p_revision_id UUID,
  p_expected_active_revision_id UUID,
  p_expected_revision_epoch BIGINT,
  p_intent TEXT
)
RETURNS TABLE (
  summary_id UUID,
  summary_content TEXT,
  active_revision_id UUID,
  revision_epoch BIGINT,
  revision_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_active_revision_id UUID;
  v_revision_epoch BIGINT;
  v_target public.summary_revisions%ROWTYPE;
  v_latest_annotation_ids BIGINT[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_summary_id IS NULL OR p_revision_id IS NULL
    OR p_expected_revision_epoch IS NULL OR p_expected_revision_epoch < 0
    OR p_intent NOT IN ('apply_candidate', 'restore_accepted')
  THEN
    RAISE EXCEPTION 'Invalid revision application.' USING ERRCODE = '22023';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED('summary-revision:' || p_summary_id::TEXT, 20260827::BIGINT)
  );

  SELECT summary.active_revision_id, summary.revision_epoch
  INTO v_active_revision_id, v_revision_epoch
  FROM public.summaries AS summary
  WHERE summary.id = p_summary_id
    AND summary.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owned summary not found.' USING ERRCODE = 'P0002';
  END IF;
  SELECT revision.*
  INTO v_target
  FROM public.summary_revisions AS revision
  WHERE revision.id = p_revision_id
    AND revision.summary_id = p_summary_id
    AND revision.user_id = v_user_id
  FOR UPDATE;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Summary revision not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_target.id = v_active_revision_id THEN
    RETURN QUERY SELECT
      p_summary_id,
      v_target.content,
      v_target.id,
      v_revision_epoch,
      v_target.version;
    RETURN;
  END IF;

  IF v_active_revision_id IS DISTINCT FROM p_expected_active_revision_id
    OR v_revision_epoch <> p_expected_revision_epoch
  THEN
    RAISE EXCEPTION 'Active summary revision changed.' USING ERRCODE = '40001';
  END IF;

  IF p_intent = 'apply_candidate' THEN
    IF v_target.state <> 'candidate'
      OR v_target.parent_revision_id IS DISTINCT FROM v_active_revision_id
    THEN
      RAISE EXCEPTION 'Summary candidate is stale.' USING ERRCODE = '40001';
    END IF;

    v_latest_annotation_ids := private.latest_summary_annotation_ids(
      p_summary_id,
      v_user_id
    );
    IF v_target.context_annotation_ids IS DISTINCT FROM v_latest_annotation_ids THEN
      RAISE EXCEPTION 'Transcript context changed.' USING ERRCODE = '40001';
    END IF;

    UPDATE public.summary_revisions AS revision
    SET state = 'accepted', accepted_at = statement_timestamp()
    WHERE revision.id = v_target.id;
  ELSE
    IF v_target.state <> 'accepted' THEN
      RAISE EXCEPTION 'Only an accepted revision can be restored.' USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.summaries AS summary
  SET
    summary = v_target.content,
    active_revision_id = v_target.id,
    revision_epoch = summary.revision_epoch + 1
  WHERE summary.id = p_summary_id
    AND summary.user_id = v_user_id
  RETURNING summary.revision_epoch INTO v_revision_epoch;

  RETURN QUERY SELECT
    p_summary_id,
    v_target.content,
    v_target.id,
    v_revision_epoch,
    v_target.version;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_transcript_segment_annotation(
  p_segment_id BIGINT,
  p_context_label TEXT,
  p_summary_treatment TEXT
)
RETURNS TABLE (
  annotation_id BIGINT,
  annotation_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_processing_run_id UUID;
  v_summary_id UUID;
  v_existing_versions INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_segment_id IS NULL OR p_segment_id <= 0 THEN
    RAISE EXCEPTION 'Invalid segment ID.' USING ERRCODE = '22023';
  END IF;
  IF p_context_label IS NULL OR p_context_label NOT IN (
    'lecturer_explanation',
    'student_question',
    'class_discussion',
    'side_conversation',
    'unknown'
  ) THEN
    RAISE EXCEPTION 'Invalid transcript context.' USING ERRCODE = '22023';
  END IF;
  IF p_summary_treatment IS NULL
    OR p_summary_treatment NOT IN ('include', 'deprioritize')
  THEN
    RAISE EXCEPTION 'Invalid summary treatment.' USING ERRCODE = '22023';
  END IF;

  SELECT segment.processing_run_id, segment.summary_id
  INTO v_processing_run_id, v_summary_id
  FROM public.transcript_segments AS segment
  WHERE segment.id = p_segment_id
    AND segment.user_id = v_user_id;

  IF v_processing_run_id IS NULL OR v_summary_id IS NULL THEN
    RAISE EXCEPTION 'Transcript segment not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED('summary-revision:' || v_summary_id::TEXT, 20260827::BIGINT)
  );

  SELECT COUNT(*)::INTEGER
  INTO v_existing_versions
  FROM public.transcript_segment_annotations AS annotation
  WHERE annotation.segment_id = p_segment_id;

  IF v_existing_versions >= 100 THEN
    RAISE EXCEPTION 'Transcript context history limit reached.' USING ERRCODE = '54000';
  END IF;

  RETURN QUERY
  INSERT INTO public.transcript_segment_annotations (
    segment_id,
    processing_run_id,
    summary_id,
    user_id,
    version,
    context_label,
    summary_treatment
  )
  VALUES (
    p_segment_id,
    v_processing_run_id,
    v_summary_id,
    v_user_id,
    v_existing_versions + 1,
    p_context_label,
    p_summary_treatment
  )
  RETURNING id, version;
END;
$$;

ALTER TABLE private.ai_rate_limits
  DROP CONSTRAINT IF EXISTS ai_rate_limits_operation_check;
ALTER TABLE private.ai_rate_limits
  ADD CONSTRAINT ai_rate_limits_operation_check
  CHECK (operation IN ('capture', 'summarize', 'chat', 'context', 'regenerate'));

ALTER TABLE private.ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_operation_check;
ALTER TABLE private.ai_usage_events
  ADD CONSTRAINT ai_usage_events_operation_check
  CHECK (operation IN ('capture', 'summarize', 'chat', 'context', 'regenerate'));

CREATE OR REPLACE FUNCTION public.consume_ai_rate_limit(p_operation TEXT)
RETURNS TABLE (
  allowed BOOLEAN,
  request_limit INTEGER,
  remaining INTEGER,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_now TIMESTAMPTZ := statement_timestamp();
  v_window_started_at TIMESTAMPTZ;
  v_request_limit INTEGER;
  v_request_count INTEGER;
  v_retry_after_seconds INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  v_request_limit := CASE p_operation
    WHEN 'capture' THEN 30
    WHEN 'summarize' THEN 10
    WHEN 'chat' THEN 30
    WHEN 'context' THEN 10
    WHEN 'regenerate' THEN 5
    ELSE NULL
  END;

  IF v_request_limit IS NULL THEN
    RAISE EXCEPTION 'Unsupported AI operation.' USING ERRCODE = '22023';
  END IF;

  v_window_started_at := DATE_BIN(
    INTERVAL '10 minutes',
    v_now,
    TIMESTAMPTZ '2001-01-01 00:00:00+00'
  );

  DELETE FROM private.ai_rate_limits
  WHERE user_id = v_user_id
    AND window_started_at < v_window_started_at - INTERVAL '1 day';

  INSERT INTO private.ai_rate_limits AS counters (
    user_id,
    operation,
    window_started_at,
    request_count
  )
  VALUES (
    v_user_id,
    p_operation,
    v_window_started_at,
    1
  )
  ON CONFLICT (user_id, operation, window_started_at)
  DO UPDATE SET request_count = counters.request_count + 1
  RETURNING request_count INTO v_request_count;

  v_retry_after_seconds := GREATEST(
    CEIL(EXTRACT(EPOCH FROM (
      v_window_started_at + INTERVAL '10 minutes' - v_now
    )))::INTEGER,
    1
  );

  RETURN QUERY SELECT
    v_request_count <= v_request_limit,
    v_request_limit,
    GREATEST(v_request_limit - v_request_count, 0),
    v_retry_after_seconds;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_summary_regeneration(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.complete_summary_regeneration(
  BIGINT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fail_summary_regeneration(BIGINT, TEXT)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.apply_summary_revision(
  UUID, UUID, UUID, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_transcript_segment_annotation(
  BIGINT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.consume_ai_rate_limit(TEXT)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_summary_regeneration(UUID, UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_summary_regeneration(
  BIGINT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_summary_regeneration(BIGINT, TEXT)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_summary_revision(
  UUID, UUID, UUID, BIGINT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_transcript_segment_annotation(
  BIGINT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(TEXT)
TO authenticated;

COMMENT ON TABLE public.summary_revisions IS
  'Private bounded summary candidates and accepted owner history; contains no transcript or audio copy.';
COMMENT ON TABLE public.summary_regeneration_requests IS
  'Private bounded idempotency state for explicit summary regeneration; contains no transcript or provider response.';
