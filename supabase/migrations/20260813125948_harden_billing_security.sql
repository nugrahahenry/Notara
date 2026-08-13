-- Harden security-definer functions and the Midtrans billing transition.
-- This migration is intentionally not applied automatically by the app.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, updated_at)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = excluded.email,
    full_name = excluded.full_name,
    updated_at = now();
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_payment_callback(
  p_order_id TEXT,
  p_status TEXT,
  p_payment_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_existing_status TEXT;
  v_effective_status TEXT;
  v_current_period_end TIMESTAMPTZ;
  v_tier TEXT;
BEGIN
  IF p_order_id IS NULL OR btrim(p_order_id) = '' THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('pending', 'success', 'failed', 'expired') THEN
    RAISE EXCEPTION 'unsupported billing status' USING ERRCODE = '22023';
  END IF;

  SELECT subscriptions.user_id, subscriptions.status, subscriptions.current_period_end
  INTO v_user_id, v_existing_status, v_current_period_end
  FROM public.subscriptions
  WHERE subscriptions.order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_existing_status = 'success' THEN
    v_effective_status := 'success';
  ELSIF p_status = 'success' THEN
    v_effective_status := 'success';
  ELSIF v_existing_status IN ('failed', 'expired') THEN
    v_effective_status := v_existing_status;
  ELSE
    v_effective_status := p_status;
  END IF;

  UPDATE public.subscriptions
  SET
    status = v_effective_status,
    payment_type = coalesce(nullif(btrim(p_payment_type), ''), payment_type),
    current_period_start = CASE
      WHEN v_effective_status = 'success'
        AND v_existing_status IS DISTINCT FROM 'success'
      THEN now()
      ELSE current_period_start
    END,
    current_period_end = CASE
      WHEN v_effective_status = 'success'
        AND v_existing_status IS DISTINCT FROM 'success'
      THEN now() + interval '30 days'
      ELSE current_period_end
    END
  WHERE order_id = p_order_id;

  IF v_effective_status = 'success' THEN
    v_tier := CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.subscriptions
        WHERE user_id = v_user_id
          AND status = 'success'
          AND (current_period_end IS NULL OR current_period_end > now())
          AND order_id LIKE 'NOTARA-MAX-%'
      ) THEN 'max'
      WHEN EXISTS (
        SELECT 1
        FROM public.subscriptions
        WHERE user_id = v_user_id
          AND status = 'success'
          AND (current_period_end IS NULL OR current_period_end > now())
      ) THEN 'pro'
      ELSE 'free'
    END;

    UPDATE public.profiles
    SET subscription_tier = v_tier
    WHERE id = v_user_id;
  ELSIF v_effective_status IN ('failed', 'expired')
    AND (v_current_period_end IS NULL OR v_current_period_end <= now())
    AND NOT EXISTS (
      SELECT 1
      FROM public.subscriptions
      WHERE user_id = v_user_id
        AND order_id <> p_order_id
        AND status = 'success'
        AND (current_period_end IS NULL OR current_period_end > now())
    )
  THEN
    -- Checkout memakai satu baris per user. Pertahankan tier lama ketika
    -- upgrade baru gagal tetapi periode sebelumnya masih aktif.
    UPDATE public.profiles
    SET subscription_tier = 'free'
    WHERE id = v_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_payment_callback(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_payment_callback(text, text, text) TO service_role;

-- Policies that call is_group_member must never be evaluated for anon.
-- Their predicates stay equivalent to the working catch-up migration.
DROP POLICY IF EXISTS "Members can view folders shared in their groups" ON public.folders;
CREATE POLICY "Members can view folders shared in their groups"
ON public.folders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_folders gf
    WHERE gf.folder_id = folders.id
      AND public.is_group_member(gf.group_id)
  )
);

DROP POLICY IF EXISTS "Profiles are viewable by group members and self" ON public.profiles;
CREATE POLICY "Profiles are viewable by group members and self"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR
  EXISTS (
    SELECT 1 FROM public.group_members gm1
    WHERE gm1.user_id = profiles.id
      AND public.is_group_member(gm1.group_id)
  )
);

DROP POLICY IF EXISTS "Members can view summaries in shared folders" ON public.summaries;
CREATE POLICY "Members can view summaries in shared folders"
ON public.summaries FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_folders gf
    WHERE gf.folder_id = summaries.folder_id
      AND public.is_group_member(gf.group_id)
  )
);

DROP POLICY IF EXISTS "Members can insert summaries into shared folders" ON public.summaries;
CREATE POLICY "Members can insert summaries into shared folders"
ON public.summaries FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id AND
  (
    summaries.folder_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.group_folders gf
      WHERE gf.folder_id = summaries.folder_id
        AND public.is_group_member(gf.group_id)
    )
  )
);

DROP POLICY IF EXISTS "Users can access chat for their own or shared summaries" ON public.chat_messages;
CREATE POLICY "Users can access chat for their own or shared summaries"
ON public.chat_messages FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.summaries s
    WHERE s.id = chat_messages.summary_id
      AND (
        s.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.group_folders gf
          WHERE gf.folder_id = s.folder_id
            AND public.is_group_member(gf.group_id)
        )
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = chat_messages.thread_id
      AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Members can view their study groups" ON public.study_groups;
CREATE POLICY "Members can view their study groups"
ON public.study_groups FOR SELECT
TO authenticated
USING (
  auth.uid() = owner_id
  OR public.is_group_member(study_groups.id)
);

DROP POLICY IF EXISTS "Members can view group membership" ON public.group_members;
CREATE POLICY "Members can view group membership"
ON public.group_members FOR SELECT
TO authenticated
USING (public.is_group_member(group_members.group_id));

DROP POLICY IF EXISTS "Members can view group folders" ON public.group_folders;
CREATE POLICY "Members can view group folders"
ON public.group_folders FOR SELECT
TO authenticated
USING (public.is_group_member(group_folders.group_id));