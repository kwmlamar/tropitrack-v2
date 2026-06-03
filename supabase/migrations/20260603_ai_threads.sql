-- ============================================================
-- AI threads + messages for the Claude assistant page
-- Private by default; threads can be shared to the whole company
-- (read-only for non-owners). RLS-enforced.
-- ============================================================

-- ─── AI THREADS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL,
  skill_id    text,
  title       text NOT NULL DEFAULT 'New thread',
  is_shared   boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_threads_user      ON public.ai_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_threads_company   ON public.ai_threads(company_id) WHERE is_shared = true;

ALTER TABLE public.ai_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads_select_own_or_shared"
  ON public.ai_threads FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      is_shared = true
      AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "threads_insert_own"
  ON public.ai_threads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "threads_update_own"
  ON public.ai_threads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "threads_delete_own"
  ON public.ai_threads FOR DELETE
  USING (user_id = auth.uid());

-- ─── AI THREAD MESSAGES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_thread_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES public.ai_threads(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant')),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_thread_messages_thread ON public.ai_thread_messages(thread_id, created_at);

ALTER TABLE public.ai_thread_messages ENABLE ROW LEVEL SECURITY;

-- Read messages if you can read the parent thread
CREATE POLICY "messages_select_via_thread"
  ON public.ai_thread_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_threads t
      WHERE t.id = ai_thread_messages.thread_id
      AND (
        t.user_id = auth.uid()
        OR (t.is_shared = true AND t.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
      )
    )
  );

-- Only thread owner can add messages (shared = read-only for others)
CREATE POLICY "messages_insert_into_own_threads"
  ON public.ai_thread_messages FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.ai_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );

-- Bump thread updated_at when a message lands
CREATE OR REPLACE FUNCTION public.bump_thread_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ai_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bump_thread_updated_at ON public.ai_thread_messages;
CREATE TRIGGER trg_bump_thread_updated_at
  AFTER INSERT ON public.ai_thread_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_thread_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_threads          TO authenticated;
GRANT SELECT, INSERT,         DELETE ON public.ai_thread_messages  TO authenticated;

NOTIFY pgrst, 'reload schema';
