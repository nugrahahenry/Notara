-- Review-first transcript context for owner-approved learning decisions.
-- Machine suggestions remain ephemeral; source transcript evidence stays immutable.

ALTER TABLE public.transcript_segments
  ADD CONSTRAINT transcript_segments_annotation_tenant_key
  UNIQUE (id, processing_run_id, summary_id, user_id);

CREATE TABLE public.transcript_segment_annotations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  segment_id BIGINT NOT NULL,
  processing_run_id UUID NOT NULL,
  summary_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1 AND version <= 100),
  context_label TEXT NOT NULL CHECK (
    context_label IN (
      'lecturer_explanation',
      'student_question',
      'class_discussion',
      'side_conversation',
      'unknown'
    )
  ),
  summary_treatment TEXT NOT NULL CHECK (
    summary_treatment IN ('include', 'deprioritize')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (segment_id, version),
  FOREIGN KEY (segment_id, processing_run_id, summary_id, user_id)
    REFERENCES public.transcript_segments (
      id,
      processing_run_id,
      summary_id,
      user_id
    )
    ON DELETE CASCADE
);

CREATE INDEX idx_transcript_segment_annotations_owner_run
  ON public.transcript_segment_annotations (
    user_id,
    processing_run_id,
    segment_id,
    version DESC
  );

ALTER TABLE public.transcript_segment_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read transcript context decisions"
ON public.transcript_segment_annotations
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.transcript_segment_annotations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.transcript_segment_annotations_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.transcript_segment_annotations TO authenticated;

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

  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED(v_user_id::TEXT || ':' || p_segment_id::TEXT, 0)
  );

  SELECT segment.processing_run_id, segment.summary_id
  INTO v_processing_run_id, v_summary_id
  FROM public.transcript_segments AS segment
  WHERE segment.id = p_segment_id
    AND segment.user_id = v_user_id;

  IF v_processing_run_id IS NULL OR v_summary_id IS NULL THEN
    RAISE EXCEPTION 'Transcript segment not found.' USING ERRCODE = 'P0002';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.save_transcript_segment_annotation(
  BIGINT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.save_transcript_segment_annotation(
  BIGINT, TEXT, TEXT
) TO authenticated;

ALTER TABLE private.ai_rate_limits
  DROP CONSTRAINT IF EXISTS ai_rate_limits_operation_check;
ALTER TABLE private.ai_rate_limits
  ADD CONSTRAINT ai_rate_limits_operation_check
  CHECK (operation IN ('capture', 'summarize', 'chat', 'context'));

ALTER TABLE private.ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_operation_check;
ALTER TABLE private.ai_usage_events
  ADD CONSTRAINT ai_usage_events_operation_check
  CHECK (operation IN ('capture', 'summarize', 'chat', 'context'));

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

REVOKE EXECUTE ON FUNCTION public.consume_ai_rate_limit(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(TEXT) TO authenticated;

COMMENT ON TABLE public.transcript_segment_annotations IS
  'Append-only owner decisions for review-first transcript context; contains no machine suggestion or speaker identity.';
