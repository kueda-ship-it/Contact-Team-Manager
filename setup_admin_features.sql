-- ホワイトリスト管理用
CREATE TABLE IF NOT EXISTS allowed_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by UUID REFERENCES auth.users(id)
);

-- タグ管理用
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザーへのタグ割当用
CREATE TABLE IF NOT EXISTS tag_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, tag_id)
);

-- RLS を有効化
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_members ENABLE ROW LEVEL SECURITY;

-- 【重要】既存のポリシーがある場合に備えて一度削除
DROP POLICY IF EXISTS "Public allowed_users read" ON allowed_users;
DROP POLICY IF EXISTS "Admin manage allowed_users" ON allowed_users;
DROP POLICY IF EXISTS "Everyone can read tags" ON tags;
DROP POLICY IF EXISTS "Admin manage tags" ON tags;
DROP POLICY IF EXISTS "Everyone can read tag_members" ON tag_members;
DROP POLICY IF EXISTS "Admin manage tag_members" ON tag_members;

-- 1. ホワイトリスト: ログイン前にもチェックが必要なため、読み取りは全員に許可
CREATE POLICY "Public allowed_users read" ON allowed_users FOR SELECT USING (true);
-- 1-2. ホワイトリスト: 追加・削除は Admin/Manager のみ
CREATE POLICY "Admin manage allowed_users" ON allowed_users FOR ALL 
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'Admin' OR role = 'Manager' OR role = 'admin' OR role = 'manager')));

-- 2. タグ: 読み取りはログイン済み全員
CREATE POLICY "Everyone can read tags" ON tags FOR SELECT USING (auth.role() = 'authenticated');
-- 2-2. タグ: 管理は Admin/Manager のみ
CREATE POLICY "Admin manage tags" ON tags FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'Admin' OR role = 'Manager' OR role = 'admin' OR role = 'manager')));

-- 3. タグメンバー（割当）: 読み取りは全員
CREATE POLICY "Everyone can read tag_members" ON tag_members FOR SELECT USING (auth.role() = 'authenticated');
-- 3-2. タグメンバー: 管理は Admin/Manager のみ
CREATE POLICY "Admin manage tag_members" ON tag_members FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'Admin' OR role = 'Manager' OR role = 'admin' OR role = 'manager')));


-- ==========================================
-- 2024-01-30 追加: 添付ファイル用カラム
-- ==========================================
ALTER TABLE threads ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE replies ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Storage バケット 'uploads' は Supabase のダッシュボードから作成してください。
-- 公開ポリシー (Public) に設定するか、以下のポリシーを参考に設定してください。
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'uploads' );
-- CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'uploads' AND auth.role() = 'authenticated' );
