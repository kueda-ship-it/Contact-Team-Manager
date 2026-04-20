-- Add team_id to tasks for Gantt team-sharing.
-- team_id IS NULL  => personal task (owner-only, existing behavior)
-- team_id = X      => shared with team X

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS team_id uuid
    REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_team_id_idx
  ON public.tasks(team_id);

COMMENT ON COLUMN public.tasks.team_id IS
  'If set, task is shared with this team (visible to team_members). NULL = personal task visible only to owner_id.';
