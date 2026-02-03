-- Add user_id column to replies table
ALTER TABLE replies ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Enable RLS on replies if not already enabled (it should be, but just in case)
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

-- Backfill user_id for existing replies based on author name matching profile display_name or email
-- This helps fix existing data so they can be edited/managed properly
UPDATE replies
SET user_id = profiles.id
FROM profiles
WHERE replies.user_id IS NULL
  AND (profiles.email = replies.author OR profiles.display_name = replies.author);

-- Grant permissions (Update policies)
-- 1. Insert: Authenticated users can insert
DROP POLICY IF EXISTS "Reply insert policy" ON replies;
CREATE POLICY "Reply insert policy" ON replies FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- 2. Select: Visible if the parent thread is visible
-- (Simplified: Visible to everyone authenticated or public if logic allows. 
--  Usually we want to match thread visibility, but for now 'authenticated' is a safe baseline matching app usage)
DROP POLICY IF EXISTS "Reply select policy" ON replies;
CREATE POLICY "Reply select policy" ON replies FOR SELECT
USING (auth.role() = 'authenticated');

-- 3. Update: Own reply
DROP POLICY IF EXISTS "Reply update policy" ON replies;
CREATE POLICY "Reply update policy" ON replies FOR UPDATE
USING (user_id = auth.uid());

-- 4. Delete: Own reply or Admin/Manager
DROP POLICY IF EXISTS "Reply delete policy" ON replies;
CREATE POLICY "Reply delete policy" ON replies FOR DELETE
USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'Admin' OR role = 'Manager'))
);
