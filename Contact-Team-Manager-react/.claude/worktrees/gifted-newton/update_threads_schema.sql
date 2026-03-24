
-- Add updated_at column to threads table
ALTER TABLE threads ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Optional: Create a trigger to automatically update updated_at on modify
-- However, the code currently updates it explicitly when a reply is added.
-- To be safe, we can initialize existing rows.
UPDATE threads SET updated_at = created_at WHERE updated_at IS NULL;
