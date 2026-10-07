-- Local-only Supabase auth stand-in. This is NOT a Supabase migration.
DO $$
BEGIN
  IF current_user <> 'nalira_rehearsal' OR inet_server_port() <> 55439 THEN
    RAISE EXCEPTION 'Not the isolated Nalira rehearsal cluster';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE supabase_auth_admin NOLOGIN;
  END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id UUID PRIMARY KEY,
  email TEXT,
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'
);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
-- Mimic legacy Supabase default grants so revokes are tested, not assumed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
CREATE FUNCTION public.test_assert(p_condition BOOLEAN, p_message TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FAIL: %', p_message;
  END IF;
END $$;
