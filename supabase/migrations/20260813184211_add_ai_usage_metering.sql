-- Private per-user accounting for successful Groq provider calls.
-- This migration records operational metrics only; it does not enforce quotas.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.ai_usage_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('capture', 'summarize', 'chat')),
  stage TEXT NOT NULL CHECK (stage IN ('transcription', 'generation')),
  provider TEXT NOT NULL CHECK (provider = 'groq'),
  model TEXT NOT NULL CHECK (BTRIM(model) <> ''),
  provider_request_id TEXT,
  input_tokens BIGINT CHECK (input_tokens IS NULL OR input_tokens >= 0),
  cached_input_tokens BIGINT CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  output_tokens BIGINT CHECK (output_tokens IS NULL OR output_tokens >= 0),
  audio_duration_ms BIGINT CHECK (audio_duration_ms IS NULL OR audio_duration_ms >= 0),
  billable_audio_ms BIGINT CHECK (billable_audio_ms IS NULL OR billable_audio_ms >= 0),
  estimated_cost_microusd BIGINT CHECK (
    estimated_cost_microusd IS NULL OR estimated_cost_microusd >= 0
  ),
  pricing_version TEXT NOT NULL CHECK (BTRIM(pricing_version) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (request_id, stage),
  CHECK (
    cached_input_tokens IS NULL
    OR input_tokens IS NULL
    OR cached_input_tokens <= input_tokens
  ),
  CHECK (
    billable_audio_ms IS NULL
    OR audio_duration_ms IS NULL
    OR billable_audio_ms >= audio_duration_ms
  )
);

ALTER TABLE private.ai_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.ai_usage_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE private.ai_usage_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX idx_ai_usage_events_user_created
  ON private.ai_usage_events (user_id, created_at DESC);
CREATE INDEX idx_ai_usage_events_created
  ON private.ai_usage_events (created_at);

CREATE OR REPLACE FUNCTION public.record_ai_usage(
  p_user_id UUID,
  p_request_id UUID,
  p_operation TEXT,
  p_stage TEXT,
  p_provider TEXT,
  p_model TEXT,
  p_provider_request_id TEXT,
  p_input_tokens BIGINT,
  p_cached_input_tokens BIGINT,
  p_output_tokens BIGINT,
  p_audio_duration_ms BIGINT,
  p_billable_audio_ms BIGINT,
  p_estimated_cost_microusd BIGINT,
  p_pricing_version TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.ai_usage_events (
    user_id,
    request_id,
    operation,
    stage,
    provider,
    model,
    provider_request_id,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    audio_duration_ms,
    billable_audio_ms,
    estimated_cost_microusd,
    pricing_version
  )
  VALUES (
    p_user_id,
    p_request_id,
    p_operation,
    p_stage,
    p_provider,
    p_model,
    NULLIF(BTRIM(p_provider_request_id), ''),
    p_input_tokens,
    p_cached_input_tokens,
    p_output_tokens,
    p_audio_duration_ms,
    p_billable_audio_ms,
    p_estimated_cost_microusd,
    p_pricing_version
  )
  ON CONFLICT (request_id, stage) DO NOTHING;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_ai_usage(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_ai_usage(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) TO service_role;
