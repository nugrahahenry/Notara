-- Source-version provenance foundation.
-- This wraps the existing immutable transcript evidence without retaining audio,
-- inferring speakers, or changing the active summary contract.

CREATE TABLE public.transcript_source_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_run_id UUID NOT NULL,
  summary_id UUID NOT NULL REFERENCES public.summaries (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1 AND version <= 100),
  source_kind TEXT NOT NULL DEFAULT 'transcript' CHECK (source_kind = 'transcript'),
  state TEXT NOT NULL DEFAULT 'active' CHECK (
    state IN ('active', 'superseded', 'revoked', 'expired')
  ),
  content_hash TEXT CHECK (
    content_hash IS NULL
    OR content_hash ~ '^[0-9a-f]{64}$'
  ),
  hash_algorithm TEXT NOT NULL DEFAULT 'sha256' CHECK (hash_algorithm = 'sha256'),
  duration_ms BIGINT CHECK (
    duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000
  ),
  segment_count INTEGER NOT NULL CHECK (segment_count >= 0 AND segment_count <= 5000),
  transcript_character_count INTEGER NOT NULL CHECK (
    transcript_character_count >= 0
    AND transcript_character_count <= 500000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  superseded_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  UNIQUE (processing_run_id),
  UNIQUE (summary_id, version),
  UNIQUE (id, summary_id, user_id),
  FOREIGN KEY (processing_run_id, summary_id, user_id)
    REFERENCES public.processing_runs (id, summary_id, user_id)
    ON DELETE CASCADE,
  CHECK (
    (state = 'active' AND superseded_at IS NULL AND revoked_at IS NULL)
    OR (state = 'superseded' AND superseded_at IS NOT NULL AND revoked_at IS NULL)
    OR (state = 'revoked' AND revoked_at IS NOT NULL)
    OR (state = 'expired' AND expires_at IS NOT NULL)
  )
);

CREATE INDEX idx_transcript_source_versions_owner_state
  ON public.transcript_source_versions (user_id, state, created_at DESC);
CREATE INDEX idx_transcript_source_versions_summary_version
  ON public.transcript_source_versions (summary_id, version DESC);

ALTER TABLE public.transcript_source_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read transcript source versions"
ON public.transcript_source_versions
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.transcript_source_versions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.transcript_source_versions TO authenticated;

-- Existing runs become version one of their summary's transcript source.
INSERT INTO public.transcript_source_versions (
  processing_run_id,
  summary_id,
  user_id,
  version,
  source_kind,
  state,
  duration_ms,
  segment_count,
  transcript_character_count
)
SELECT
  run.id,
  run.summary_id,
  run.user_id,
  1,
  'transcript',
  'active',
  CASE
    WHEN (run.quality_report ->> 'durationSec') ~ '^[0-9]+(\\.[0-9]+)?$'
      THEN ROUND(((run.quality_report ->> 'durationSec')::NUMERIC) * 1000)::BIGINT
    ELSE NULL
  END,
  run.segment_count,
  run.transcript_character_count
FROM public.processing_runs AS run
ON CONFLICT (processing_run_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.create_transcript_source_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_version INTEGER;
  v_duration_ms BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('transcript-source:' || NEW.summary_id::TEXT, 20261003::BIGINT)
  );

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.transcript_source_versions
  WHERE summary_id = NEW.summary_id;

  v_duration_ms := CASE
    WHEN (NEW.quality_report ->> 'durationSec') ~ '^[0-9]+(\\.[0-9]+)?$'
      THEN ROUND(((NEW.quality_report ->> 'durationSec')::NUMERIC) * 1000)::BIGINT
    ELSE NULL
  END;

  INSERT INTO public.transcript_source_versions (
    processing_run_id,
    summary_id,
    user_id,
    version,
    duration_ms,
    segment_count,
    transcript_character_count
  )
  VALUES (
    NEW.id,
    NEW.summary_id,
    NEW.user_id,
    v_version,
    v_duration_ms,
    NEW.segment_count,
    NEW.transcript_character_count
  )
  ON CONFLICT (processing_run_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS processing_runs_create_transcript_source_version
  ON public.processing_runs;
CREATE TRIGGER processing_runs_create_transcript_source_version
AFTER INSERT ON public.processing_runs
FOR EACH ROW
EXECUTE FUNCTION private.create_transcript_source_version();

-- A summary revision points to the source version that was active when it was
-- created. Nullable keeps legacy summaries without durable evidence compatible.
ALTER TABLE public.summary_revisions
  ADD COLUMN source_version_id UUID;

ALTER TABLE public.summary_revisions
  ADD CONSTRAINT summary_revisions_source_version_fkey
  FOREIGN KEY (source_version_id)
  REFERENCES public.transcript_source_versions (id)
  ON DELETE SET NULL;

CREATE INDEX idx_summary_revisions_source_version
  ON public.summary_revisions (summary_id, source_version_id);

UPDATE public.summary_revisions AS revision
SET source_version_id = source.id
FROM public.transcript_source_versions AS source
WHERE revision.source_version_id IS NULL
  AND revision.summary_id = source.summary_id
  AND revision.user_id = source.user_id
  AND source.state = 'active';

CREATE OR REPLACE FUNCTION private.attach_summary_revision_source_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.source_version_id IS NULL THEN
    SELECT source.id
    INTO NEW.source_version_id
    FROM public.transcript_source_versions AS source
    WHERE source.summary_id = NEW.summary_id
      AND source.user_id = NEW.user_id
      AND source.state = 'active'
    ORDER BY source.version DESC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS summary_revisions_attach_source_version
  ON public.summary_revisions;
CREATE TRIGGER summary_revisions_attach_source_version
BEFORE INSERT ON public.summary_revisions
FOR EACH ROW
EXECUTE FUNCTION private.attach_summary_revision_source_version();

-- New clients can provide a SHA-256 fingerprint while legacy clients keep the
-- original RPC contract. The wrapper preserves the existing transaction and
-- idempotency behavior, then annotates the run-scoped source version.
CREATE OR REPLACE FUNCTION public.persist_transcript_evidence_v2(
  p_summary_id UUID,
  p_client_request_id TEXT,
  p_provider TEXT,
  p_transcription_model TEXT,
  p_summary_model TEXT,
  p_quality JSONB,
  p_segments JSONB,
  p_content_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_run_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF p_content_hash IS NOT NULL
    AND p_content_hash !~ '^[0-9a-fA-F]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid source content hash.' USING ERRCODE = '22023';
  END IF;

  v_run_id := public.persist_transcript_evidence(
    p_summary_id,
    p_client_request_id,
    p_provider,
    p_transcription_model,
    p_summary_model,
    p_quality,
    p_segments
  );

  UPDATE public.transcript_source_versions
  SET content_hash = COALESCE(LOWER(p_content_hash), content_hash)
  WHERE processing_run_id = v_run_id
    AND user_id = v_user_id
    AND state = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transcript source version was not created.' USING ERRCODE = '55000';
  END IF;

  RETURN v_run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.persist_transcript_evidence_v2(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_transcript_evidence_v2(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT
) TO authenticated;

COMMENT ON TABLE public.transcript_source_versions IS
  'Owner-only immutable transcript source versions; raw audio and speaker identity are intentionally absent.';
COMMENT ON COLUMN public.summary_revisions.source_version_id IS
  'The owner-only transcript source version used when this revision was created; nullable for legacy summaries without evidence.';
