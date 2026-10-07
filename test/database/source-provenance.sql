SELECT public.test_assert((SELECT count(*) = 2 FROM public.transcript_source_versions), 'one source per existing run');
SELECT public.test_assert((SELECT duration_ms = 1250 FROM public.transcript_source_versions WHERE summary_id = '20000000-0000-4000-8000-000000000001'), 'decimal duration survives');
SELECT public.test_assert((SELECT duration_ms IS NULL FROM public.transcript_source_versions WHERE summary_id = '20000000-0000-4000-8000-000000000002'), 'out-of-range legacy duration does not break upgrade');
SELECT public.test_assert((SELECT bool_and(source_version_id IS NOT NULL) FROM public.summary_revisions), 'revision backfill and insert binding');
SELECT public.test_assert(NOT has_table_privilege('anon', 'public.transcript_source_versions', 'SELECT'), 'anon cannot read');
SELECT public.test_assert(NOT has_table_privilege('service_role', 'public.transcript_source_versions', 'SELECT'), 'service role has no source grant');
SELECT public.test_assert(NOT has_table_privilege('authenticated', 'public.transcript_source_versions', 'INSERT,UPDATE,DELETE'), 'no direct mutation');
SELECT public.test_assert(NOT has_function_privilege('anon', 'public.persist_transcript_evidence_v2(uuid,text,text,text,text,jsonb,jsonb,text)', 'EXECUTE'), 'anon cannot call RPC');
SELECT public.test_assert(NOT has_function_privilege('authenticated', 'private.create_transcript_source_version()', 'EXECUTE'), 'trigger is not an RPC');
SELECT public.test_assert(NOT has_function_privilege('authenticated', 'private.attach_summary_revision_source_version()', 'EXECUTE'), 'revision trigger is not an RPC');
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM count(*) FROM public.transcript_source_versions;
    RAISE EXCEPTION 'FAIL: anon SELECT accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
SELECT public.test_assert((SELECT count(*) = 1 FROM public.transcript_source_versions), 'owner A isolation');
SELECT public.persist_transcript_evidence_v2(
  '20000000-0000-4000-8000-000000000001', 'dummy-a', 'groq', 'dummy', NULL,
  '{"status":"good"}',
  '[{"start_ms":0,"end_ms":1250,"text":"Dummy evidence","average_log_probability":null,"no_speech_probability":null}]', repeat('A', 64)
);
SELECT public.persist_transcript_evidence_v2(
  '20000000-0000-4000-8000-000000000001', 'dummy-a', 'groq', 'dummy', NULL,
  '{"status":"good"}',
  '[{"start_ms":0,"end_ms":1250,"text":"Dummy evidence","average_log_probability":null,"no_speech_probability":null}]', repeat('a', 64)
);
DO $$ BEGIN
  BEGIN
    UPDATE public.transcript_source_versions SET content_hash = repeat('d',64);
    RAISE EXCEPTION 'FAIL: direct UPDATE accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.transcript_source_versions;
    RAISE EXCEPTION 'FAIL: direct DELETE accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.persist_transcript_evidence_v2('20000000-0000-4000-8000-000000000001', 'dummy-a', 'groq', 'dummy', NULL, '{"status":"good"}', '[]', 'invalid-hash');
    RAISE EXCEPTION 'FAIL: invalid hash accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.persist_transcript_evidence_v2('20000000-0000-4000-8000-000000000001', 'dummy-a', 'groq', 'dummy', NULL, '{"status":"good"}', '[{"start_ms":0,"end_ms":1250,"text":"Dummy evidence","average_log_probability":null,"no_speech_probability":null}]', repeat('b', 64));
    RAISE EXCEPTION 'FAIL: fingerprint overwrite accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.persist_transcript_evidence_v2('20000000-0000-4000-8000-000000000001', 'dummy-a', 'groq', 'dummy', NULL, '{"status":"good"}', '[{"start_ms":0,"end_ms":1250,"text":"Changed evidence","average_log_probability":null,"no_speech_probability":null}]', repeat('a', 64));
    RAISE EXCEPTION 'FAIL: changed evidence accepted on replay';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.persist_transcript_evidence_v2('20000000-0000-4000-8000-000000000002', 'dummy-b', 'groq', 'dummy', NULL, '{"status":"good"}', '[]', repeat('a',64));
    RAISE EXCEPTION 'FAIL: cross-owner RPC accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.persist_transcript_evidence_v2('20000000-0000-4000-8000-000000000004', 'atomic', 'groq', 'dummy', NULL, '{"status":"good"}', '[{"start_ms":0,"end_ms":1,"text":""}]', repeat('a',64));
    RAISE EXCEPTION 'FAIL: invalid segment accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SELECT public.test_assert((SELECT content_hash = repeat('a',64) FROM public.transcript_source_versions), 'fingerprint remains unchanged');
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
SELECT public.test_assert((SELECT count(*) = 1 FROM public.transcript_source_versions), 'owner B isolation');
SET request.jwt.claim.sub = '';
SELECT public.test_assert((SELECT count(*) = 0 FROM public.transcript_source_versions), 'no UID sees nothing');
DO $$ BEGIN
  BEGIN
    PERFORM public.persist_transcript_evidence_v2('20000000-0000-4000-8000-000000000001','dummy-a','groq','dummy',NULL,'{"status":"good"}','[]',NULL);
    RAISE EXCEPTION 'FAIL: no-UID RPC accepted';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT public.test_assert((SELECT count(*) = 0 FROM public.processing_runs WHERE summary_id = '20000000-0000-4000-8000-000000000004'), 'invalid segment rolled back run');
SELECT public.test_assert((SELECT count(*) = 0 FROM public.transcript_source_versions WHERE summary_id = '20000000-0000-4000-8000-000000000004'), 'invalid segment rolled back source');
DO $$ DECLARE v_source UUID; BEGIN
  SELECT id INTO v_source FROM public.transcript_source_versions WHERE summary_id = '20000000-0000-4000-8000-000000000002';
  BEGIN
    UPDATE public.summary_revisions SET source_version_id = v_source WHERE summary_id = '20000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL: cross-tenant source pointer accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;
UPDATE public.transcript_source_versions SET state = 'revoked', revoked_at = now() WHERE summary_id = '20000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
SELECT public.test_assert((SELECT count(*) = 0 FROM public.transcript_source_versions), 'revoked hidden from owner');
DO $$ BEGIN
  BEGIN
    PERFORM public.persist_transcript_evidence_v2('20000000-0000-4000-8000-000000000001', 'dummy-a', 'groq', 'dummy', NULL, '{"status":"good"}', '[]', repeat('a',64));
    RAISE EXCEPTION 'FAIL: revoked source RPC accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END $$;
RESET ROLE;
UPDATE public.transcript_source_versions SET state = 'active', revoked_at = NULL, expires_at = now() - interval '1 second' WHERE summary_id = '20000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) = 0 FROM public.transcript_source_versions), 'elapsed expiry hidden without cron');
RESET ROLE;
UPDATE public.transcript_source_versions SET state = 'expired' WHERE summary_id = '20000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) = 0 FROM public.transcript_source_versions), 'expired state hidden');
RESET ROLE;
UPDATE public.transcript_source_versions SET state = 'superseded', superseded_at = now(), expires_at = NULL WHERE summary_id = '20000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*) = 0 FROM public.transcript_source_versions), 'superseded state hidden');
RESET ROLE;
-- Partial SET NULL must preserve the owned material/revision identity.
DELETE FROM public.transcript_source_versions WHERE summary_id = '20000000-0000-4000-8000-000000000001';
SELECT public.test_assert((SELECT source_version_id IS NULL AND summary_id IS NOT NULL AND user_id IS NOT NULL FROM public.summary_revisions WHERE summary_id = '20000000-0000-4000-8000-000000000001'), 'source deletion preserves revision identity');
-- Owner deletion follows existing cascade without dangling pointers.
DELETE FROM public.summaries WHERE id = '20000000-0000-4000-8000-000000000002';
SELECT public.test_assert((SELECT count(*) = 0 FROM public.transcript_source_versions WHERE user_id = '10000000-0000-4000-8000-000000000002'), 'material deletion cascades source');
SELECT public.test_assert((SELECT count(*) = 0 FROM public.transcript_segments WHERE user_id = '10000000-0000-4000-8000-000000000002'), 'material deletion cascades segments');
SELECT public.test_assert((SELECT count(*) = 0 FROM public.summary_revisions WHERE user_id = '10000000-0000-4000-8000-000000000002'), 'material deletion cascades revisions');
