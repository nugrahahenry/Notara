-- NOTARA — Remove legacy permissive RLS policies
-- Safe to re-run: each statement only removes an obsolete policy.
-- No application data, tables, columns, or functions are changed.
--
-- RLS policies are permissive (combined with OR). The three old policies
-- named "Allow all" bypass every ownership and sharing rule, so they must
-- never coexist with the current policies.

DROP POLICY IF EXISTS "Allow all" ON public.folders;
DROP POLICY IF EXISTS "Allow all" ON public.summaries;
DROP POLICY IF EXISTS "Allow all" ON public.chat_messages;

-- Superseded by "Users can access chat for their own or shared summaries".
DROP POLICY IF EXISTS "Users can access chat for their summaries" ON public.chat_messages;

-- Superseded by "Profiles are viewable by group members and self".
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Expected result after this migration: 21 policies total.
