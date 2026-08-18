-- Durable, owner-only evidence for completed transcript processing.
-- Raw audio and inferred speaker identities are intentionally out of scope.

CREATE TABLE public.processing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL REFERENCES public.summaries (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL CHECK (
    BTRIM(client_request_id) <> ''
    AND CHAR_LENGTH(client_request_id) <= 128
  ),
  state TEXT NOT NULL DEFAULT 'completed' CHECK (state = 'completed'),
  provider TEXT NOT NULL CHECK (provider = 'groq'),
  transcription_model TEXT NOT NULL CHECK (
    BTRIM(transcription_model) <> ''
    AND CHAR_LENGTH(transcription_model) <= 200
  ),
  summary_model TEXT CHECK (
    summary_model IS NULL
    OR (
      BTRIM(summary_model) <> ''
      AND CHAR_LENGTH(summary_model) <= 200
    )
  ),
  quality_status TEXT NOT NULL CHECK (quality_status IN ('good', 'review', 'poor')),
  quality_report JSONB NOT NULL CHECK (
    JSONB_TYPEOF(quality_report) = 'object'
    AND PG_COLUMN_SIZE(quality_report) <= 131072
  ),
  segment_count INTEGER NOT NULL CHECK (segment_count >= 0 AND segment_count <= 5000),
  transcript_character_count INTEGER NOT NULL CHECK (
    transcript_character_count >= 0
    AND transcript_character_count <= 500000
  ),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (user_id, client_request_id),
  UNIQUE (summary_id),
  UNIQUE (id, summary_id, user_id)
);

CREATE TABLE public.transcript_segments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  processing_run_id UUID NOT NULL REFERENCES public.processing_runs (id) ON DELETE CASCADE,
  summary_id UUID NOT NULL REFERENCES public.summaries (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  start_ms BIGINT NOT NULL CHECK (start_ms >= 0),
  end_ms BIGINT NOT NULL CHECK (end_ms >= start_ms),
  text TEXT NOT NULL CHECK (
    BTRIM(text) <> ''
    AND CHAR_LENGTH(text) <= 20000
  ),
  average_log_probability DOUBLE PRECISION CHECK (
    average_log_probability IS NULL
    OR average_log_probability::TEXT NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  no_speech_probability DOUBLE PRECISION CHECK (
    no_speech_probability IS NULL
    OR no_speech_probability BETWEEN 0 AND 1
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (processing_run_id, ordinal),
  FOREIGN KEY (processing_run_id, summary_id, user_id)
    REFERENCES public.processing_runs (id, summary_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_processing_runs_summary_created
  ON public.processing_runs (summary_id, created_at DESC);
CREATE INDEX idx_processing_runs_user_created
  ON public.processing_runs (user_id, created_at DESC);
CREATE INDEX idx_transcript_segments_summary_time
  ON public.transcript_segments (summary_id, start_ms, ordinal);
CREATE INDEX idx_transcript_segments_user_summary
  ON public.transcript_segments (user_id, summary_id);

ALTER TABLE public.processing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read processing runs"
ON public.processing_runs
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Owners can read transcript segments"
ON public.transcript_segments
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.processing_runs, public.transcript_segments
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.transcript_segments_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.processing_runs, public.transcript_segments TO authenticated;

CREATE OR REPLACE FUNCTION public.persist_transcript_evidence(
  p_summary_id UUID,
  p_client_request_id TEXT,
  p_provider TEXT,
  p_transcription_model TEXT,
  p_summary_model TEXT,
  p_quality JSONB,
  p_segments JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_run_id UUID;
  v_existing_summary_id UUID;
  v_segment_count INTEGER;
  v_total_text_characters BIGINT;
  v_existing_run_count BIGINT;
  v_existing_segment_count BIGINT;
  v_existing_text_characters BIGINT;
  v_recent_run_count BIGINT;
  v_quality_status TEXT;
  v_quality_report JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF p_summary_id IS NULL THEN
    RAISE EXCEPTION 'Summary ID is required.' USING ERRCODE = '22023';
  END IF;

  IF p_client_request_id IS NULL
    OR BTRIM(p_client_request_id) = ''
    OR CHAR_LENGTH(BTRIM(p_client_request_id)) > 128
  THEN
    RAISE EXCEPTION 'Invalid client request ID.' USING ERRCODE = '22023';
  END IF;

  IF p_provider IS DISTINCT FROM 'groq' THEN
    RAISE EXCEPTION 'Unsupported transcript provider.' USING ERRCODE = '22023';
  END IF;

  IF p_transcription_model IS NULL
    OR BTRIM(p_transcription_model) = ''
    OR CHAR_LENGTH(BTRIM(p_transcription_model)) > 200
  THEN
    RAISE EXCEPTION 'Invalid transcription model.' USING ERRCODE = '22023';
  END IF;

  IF p_summary_model IS NOT NULL
    AND (
      BTRIM(p_summary_model) = ''
      OR CHAR_LENGTH(BTRIM(p_summary_model)) > 200
    )
  THEN
    RAISE EXCEPTION 'Invalid summary model.' USING ERRCODE = '22023';
  END IF;

  IF p_quality IS NULL
    OR JSONB_TYPEOF(p_quality) <> 'object'
    OR PG_COLUMN_SIZE(p_quality) > 131072
  THEN
    RAISE EXCEPTION 'Invalid transcript quality report.' USING ERRCODE = '22023';
  END IF;

  v_quality_status := p_quality ->> 'status';
  IF v_quality_status IS NULL OR v_quality_status NOT IN ('good', 'review', 'poor') THEN
    RAISE EXCEPTION 'Invalid transcript quality status.' USING ERRCODE = '22023';
  END IF;

  IF p_segments IS NULL OR JSONB_TYPEOF(p_segments) <> 'array' THEN
    RAISE EXCEPTION 'Transcript segments must be an array.' USING ERRCODE = '22023';
  END IF;

  v_segment_count := JSONB_ARRAY_LENGTH(p_segments);
  IF v_segment_count > 5000 THEN
    RAISE EXCEPTION 'Transcript segment limit exceeded.' USING ERRCODE = '22023';
  END IF;

  IF PG_COLUMN_SIZE(p_segments) > 2000000 THEN
    RAISE EXCEPTION 'Transcript evidence payload is too large.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(CHAR_LENGTH(segment_json ->> 'text')), 0)
  INTO v_total_text_characters
  FROM JSONB_ARRAY_ELEMENTS(p_segments) AS segment (segment_json);

  IF v_total_text_characters > 500000 THEN
    RAISE EXCEPTION 'Transcript evidence text limit exceeded.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.summaries
    WHERE id = p_summary_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Summary is not owned by the active user.' USING ERRCODE = '42501';
  END IF;

  -- Serialize quota and idempotency decisions for one account. This prevents
  -- concurrent direct RPC calls from racing past the same storage limits.
  PERFORM PG_ADVISORY_XACT_LOCK(
    HASHTEXTEXTENDED('transcript-evidence:' || v_user_id::TEXT, 20260819::BIGINT)
  );

  SELECT id, summary_id
  INTO v_run_id, v_existing_summary_id
  FROM public.processing_runs
  WHERE user_id = v_user_id
    AND client_request_id = BTRIM(p_client_request_id);

  IF v_run_id IS NOT NULL THEN
    IF v_existing_summary_id IS DISTINCT FROM p_summary_id THEN
      RAISE EXCEPTION 'Client request ID belongs to another summary.' USING ERRCODE = '23505';
    END IF;

    RETURN v_run_id;
  END IF;

  SELECT id
  INTO v_run_id
  FROM public.processing_runs
  WHERE user_id = v_user_id
    AND summary_id = p_summary_id;

  IF v_run_id IS NOT NULL THEN
    RETURN v_run_id;
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM(segment_count), 0),
    COALESCE(SUM(transcript_character_count), 0),
    COUNT(*) FILTER (
      WHERE created_at >= statement_timestamp() - INTERVAL '1 hour'
    )
  INTO
    v_existing_run_count,
    v_existing_segment_count,
    v_existing_text_characters,
    v_recent_run_count
  FROM public.processing_runs
  WHERE user_id = v_user_id;

  IF v_recent_run_count >= 60 THEN
    RAISE EXCEPTION 'Transcript evidence hourly limit exceeded.' USING ERRCODE = '54000';
  END IF;

  IF v_existing_run_count >= 500
    OR v_existing_segment_count + v_segment_count > 250000
    OR v_existing_text_characters + v_total_text_characters > 50000000
  THEN
    RAISE EXCEPTION 'Transcript evidence account storage limit exceeded.' USING ERRCODE = '54000';
  END IF;

  v_quality_report := p_quality || JSONB_BUILD_OBJECT(
    'status', v_quality_status,
    'segmentCount', v_segment_count
  );

  INSERT INTO public.processing_runs (
    summary_id,
    user_id,
    client_request_id,
    state,
    provider,
    transcription_model,
    summary_model,
    quality_status,
    quality_report,
    segment_count,
    transcript_character_count
  )
  VALUES (
    p_summary_id,
    v_user_id,
    BTRIM(p_client_request_id),
    'completed',
    p_provider,
    BTRIM(p_transcription_model),
    NULLIF(BTRIM(p_summary_model), ''),
    v_quality_status,
    v_quality_report,
    v_segment_count,
    v_total_text_characters
  )
  ON CONFLICT (user_id, client_request_id) DO NOTHING
  RETURNING id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT id, summary_id
    INTO v_run_id, v_existing_summary_id
    FROM public.processing_runs
    WHERE user_id = v_user_id
      AND client_request_id = BTRIM(p_client_request_id);

    IF v_existing_summary_id IS DISTINCT FROM p_summary_id THEN
      RAISE EXCEPTION 'Client request ID belongs to another summary.' USING ERRCODE = '23505';
    END IF;

    RETURN v_run_id;
  END IF;

  INSERT INTO public.transcript_segments (
    processing_run_id,
    summary_id,
    user_id,
    ordinal,
    start_ms,
    end_ms,
    text,
    average_log_probability,
    no_speech_probability
  )
  SELECT
    v_run_id,
    p_summary_id,
    v_user_id,
    (segment_position - 1)::INTEGER,
    (segment_json ->> 'start_ms')::BIGINT,
    (segment_json ->> 'end_ms')::BIGINT,
    BTRIM(segment_json ->> 'text'),
    (segment_json ->> 'average_log_probability')::DOUBLE PRECISION,
    (segment_json ->> 'no_speech_probability')::DOUBLE PRECISION
  FROM JSONB_ARRAY_ELEMENTS(p_segments)
    WITH ORDINALITY AS segment (segment_json, segment_position);

  RETURN v_run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.persist_transcript_evidence(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_transcript_evidence(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) TO authenticated;

COMMENT ON TABLE public.processing_runs IS
  'Owner-only completed transcript processing metadata; raw audio is not retained.';
COMMENT ON TABLE public.transcript_segments IS
  'Owner-only immutable timestamp evidence. Speaker identity remains intentionally absent.';
