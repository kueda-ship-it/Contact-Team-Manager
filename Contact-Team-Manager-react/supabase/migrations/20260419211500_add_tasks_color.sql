-- Per-task custom bar color (nullable). NULL = use status-based default.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.tasks.color IS
  'Custom bar color as any CSS color string (hex, oklch, etc). NULL = use status-based default.';
