-- 複数リマインドを管理するテーブル
CREATE TABLE IF NOT EXISTS public.thread_reminders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
    remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
    reminder_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_reminders_remind_at ON public.thread_reminders(remind_at) WHERE reminder_sent = false;
CREATE INDEX IF NOT EXISTS idx_thread_reminders_thread_id ON public.thread_reminders(thread_id);

-- Row Level Security
ALTER TABLE public.thread_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read thread_reminders"
    ON public.thread_reminders FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert thread_reminders"
    ON public.thread_reminders FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update thread_reminders"
    ON public.thread_reminders FOR UPDATE
    TO authenticated
    USING (true);

-- チームごとの通知設定：team_members にカラム追加
ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;
