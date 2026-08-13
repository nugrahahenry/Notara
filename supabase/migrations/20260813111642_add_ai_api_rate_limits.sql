-- Shared per-user limiter for Groq-backed application endpoints.
-- Apply this migration before deploying the matching v0.3.19 route guards.

CREATE SCHEMA IF NOT EXISTS private;


CREATE TABLE IF NOT EXISTS private.ai_rate_limits (
  user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('capture', 'summarize', 'chat')),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, operation, window_started_at)
);

ALTER TABLE private.ai_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.ai_rate_limits FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user_window
  ON private.ai_rate_limits (user_id, window_started_at);

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
  v_user_id UUID := auth.uid();
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
    ELSE NULL
  END;

  IF v_request_limit IS NULL THEN
    RAISE EXCEPTION 'Unsupported AI operation.' USING ERRCODE = '22023';
  END IF;

  v_window_started_at := date_bin(
    INTERVAL '10 minutes',
    v_now,
    TIMESTAMPTZ '2001-01-01 00:00:00+00'
  );

  -- Bound retained rows without scanning or deleting another user's counters.
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

REVOKE EXECUTE ON FUNCTION public.consume_ai_rate_limit(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(TEXT) TO authenticated;
