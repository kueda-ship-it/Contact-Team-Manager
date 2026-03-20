-- 既存の threads テーブルにリマインド用のカラムを追加します
ALTER TABLE public.threads
ADD COLUMN IF NOT EXISTS remind_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- indexを追加しておくと、ポーリング時の検索が高速になります
CREATE INDEX IF NOT EXISTS idx_threads_remind_at ON public.threads(remind_at);
