-- Synthetic owners and materials only. No copied production content.
INSERT INTO auth.users (id, email) VALUES
  ('10000000-0000-4000-8000-000000000001', 'owner-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'owner-b@example.invalid');
INSERT INTO public.summaries (id, user_id, title, transcript, summary) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Dummy A', 'Dummy evidence', 'Dummy summary'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Dummy B', 'Dummy evidence', 'Dummy summary'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Concurrent dummy', 'Dummy evidence', 'Dummy summary'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Atomic dummy', 'Dummy evidence', 'Dummy summary');
SET ROLE authenticated;
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
SELECT public.persist_transcript_evidence(
  '20000000-0000-4000-8000-000000000001', 'dummy-a', 'groq', 'dummy', NULL,
  '{"status":"good","durationSec":1.25}',
  '[{"start_ms":0,"end_ms":1250,"text":"Dummy evidence","average_log_probability":null,"no_speech_probability":null}]'
);
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
SELECT public.persist_transcript_evidence(
  '20000000-0000-4000-8000-000000000002', 'dummy-b', 'groq', 'dummy', NULL,
  '{"status":"good","durationSec":90000}',
  '[{"start_ms":0,"end_ms":1250,"text":"Dummy evidence","average_log_probability":null,"no_speech_probability":null}]'
);
RESET ROLE;
INSERT INTO public.summary_revisions (summary_id, user_id, version, source_kind, state, content, accepted_at)
SELECT id, user_id, 1, 'original', 'accepted', summary, now()
FROM public.summaries WHERE id IN (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
);
