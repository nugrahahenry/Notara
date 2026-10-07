-- Source provenance post-migration audit: metadata and aggregate counts only.
-- Run in a fresh SQL Editor tab after migration commit, not alongside pending work.
-- Read-only verification: no schema, permission, or material-content changes.
ROLLBACK;
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
WITH checks(check_name, ok) AS (
  SELECT 'supported_postgres', current_setting('server_version_num')::INTEGER >= 170000
  UNION ALL SELECT 'source_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.transcript_source_versions'))
  UNION ALL SELECT 'owner_active_expiry_policy', EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transcript_source_versions' AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::NAME[] AND qual LIKE '%auth.uid()%' AND qual LIKE '%active%' AND qual LIKE '%expires_at%' AND qual LIKE '%statement_timestamp()%')
  UNION ALL SELECT 'authenticated_read', has_table_privilege('authenticated', 'public.transcript_source_versions', 'SELECT')
  UNION ALL SELECT 'authenticated_no_direct_write', NOT has_table_privilege('authenticated', 'public.transcript_source_versions', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  UNION ALL SELECT 'anon_no_table_access', NOT has_table_privilege('anon', 'public.transcript_source_versions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  UNION ALL SELECT 'service_no_table_grant', NOT has_table_privilege('service_role', 'public.transcript_source_versions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  UNION ALL SELECT 'one_source_per_run', EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'public.transcript_source_versions'::REGCLASS AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (processing_run_id)')
  UNION ALL SELECT 'unique_material_version', EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'public.transcript_source_versions'::REGCLASS AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (summary_id, version)')
  UNION ALL SELECT 'tenant_revision_fk', EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'public.summary_revisions'::REGCLASS AND confrelid = 'public.transcript_source_versions'::REGCLASS AND conname = 'summary_revisions_source_version_fkey' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (source_version_id, summary_id, user_id)%ON DELETE SET NULL (source_version_id)')
  UNION ALL SELECT 'run_trigger_enabled', EXISTS (SELECT FROM pg_trigger WHERE tgrelid = 'public.processing_runs'::REGCLASS AND tgname = 'processing_runs_create_transcript_source_version' AND tgenabled = 'O' AND tgfoid = to_regprocedure('private.create_transcript_source_version()'))
  UNION ALL SELECT 'revision_trigger_enabled', EXISTS (SELECT FROM pg_trigger WHERE tgrelid = 'public.summary_revisions'::REGCLASS AND tgname = 'summary_revisions_attach_source_version' AND tgenabled = 'O' AND tgfoid = to_regprocedure('private.attach_summary_revision_source_version()'))
  UNION ALL SELECT 'run_trigger_not_client_callable', NOT has_function_privilege('authenticated', to_regprocedure('private.create_transcript_source_version()'), 'EXECUTE') AND NOT has_function_privilege('anon', to_regprocedure('private.create_transcript_source_version()'), 'EXECUTE') AND NOT has_function_privilege('service_role', to_regprocedure('private.create_transcript_source_version()'), 'EXECUTE')
  UNION ALL SELECT 'revision_trigger_not_client_callable', NOT has_function_privilege('authenticated', to_regprocedure('private.attach_summary_revision_source_version()'), 'EXECUTE') AND NOT has_function_privilege('anon', to_regprocedure('private.attach_summary_revision_source_version()'), 'EXECUTE') AND NOT has_function_privilege('service_role', to_regprocedure('private.attach_summary_revision_source_version()'), 'EXECUTE')
  UNION ALL SELECT 'v2_authenticated_execute', has_function_privilege('authenticated', to_regprocedure('public.persist_transcript_evidence_v2(uuid,text,text,text,text,jsonb,jsonb,text)'), 'EXECUTE')
  UNION ALL SELECT 'v2_anon_denied', NOT has_function_privilege('anon', to_regprocedure('public.persist_transcript_evidence_v2(uuid,text,text,text,text,jsonb,jsonb,text)'), 'EXECUTE')
  UNION ALL SELECT 'v2_service_denied', NOT has_function_privilege('service_role', to_regprocedure('public.persist_transcript_evidence_v2(uuid,text,text,text,text,jsonb,jsonb,text)'), 'EXECUTE')
  UNION ALL SELECT 'v2_definer_empty_search_path', EXISTS (SELECT FROM pg_proc WHERE oid = to_regprocedure('public.persist_transcript_evidence_v2(uuid,text,text,text,text,jsonb,jsonb,text)') AND prosecdef AND 'search_path=""' = ANY(proconfig))
  UNION ALL SELECT 'v2_immutable_retry_guard', EXISTS (SELECT FROM pg_proc WHERE oid = to_regprocedure('public.persist_transcript_evidence_v2(uuid,text,text,text,text,jsonb,jsonb,text)') AND prosrc LIKE '%v_stored_segments IS DISTINCT FROM v_input_segments%' AND prosrc LIKE '%v_existing_hash IS DISTINCT FROM LOWER(p_content_hash)%')
  UNION ALL SELECT 'all_runs_backfilled', NOT EXISTS (SELECT FROM public.processing_runs r LEFT JOIN public.transcript_source_versions s ON s.processing_run_id = r.id AND s.summary_id = r.summary_id AND s.user_id = r.user_id WHERE s.id IS NULL)
  UNION ALL SELECT 'no_source_owner_mismatch', NOT EXISTS (SELECT FROM public.transcript_source_versions s JOIN public.processing_runs r ON r.id = s.processing_run_id JOIN public.summaries m ON m.id = s.summary_id WHERE s.summary_id IS DISTINCT FROM r.summary_id OR s.user_id IS DISTINCT FROM r.user_id OR s.user_id IS DISTINCT FROM m.user_id)
  UNION ALL SELECT 'revisions_backfilled', NOT EXISTS (SELECT FROM public.summary_revisions r JOIN public.processing_runs run ON run.summary_id = r.summary_id AND run.user_id = r.user_id LEFT JOIN public.transcript_source_versions s ON s.id = r.source_version_id WHERE s.id IS NULL OR s.processing_run_id IS DISTINCT FROM run.id)
  UNION ALL SELECT 'source_count_matches_runs', (SELECT count(*) FROM public.transcript_source_versions) = (SELECT count(*) FROM public.processing_runs)
)
SELECT
  CASE WHEN bool_and(COALESCE(ok, false)) THEN 'PASS' ELSE 'FAIL' END AS audit_status,
  count(*) FILTER (WHERE ok IS TRUE) AS checks_passed,
  count(*) AS checks_total,
  (SELECT count(*) FROM public.transcript_source_versions) AS source_versions,
  (SELECT count(*) FROM public.processing_runs) AS processing_runs,
  COALESCE(jsonb_agg(check_name ORDER BY check_name) FILTER (WHERE ok IS DISTINCT FROM true), '[]'::JSONB) AS failed_checks
FROM checks;
COMMIT;
