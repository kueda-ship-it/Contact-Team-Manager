-- チーム管理機能用 SQL
-- 既存のテーブルがない場合のみ作成されます

-- 1. チームテーブル
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    icon_color TEXT DEFAULT '#313338',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. チームメンバーテーブル (ここが重要: user_id と profiles のリレーション)
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- これで profiles と結合可能になります
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- 3. RLS (Row Level Security) の設定
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- ポリシーのクリア (再実行用)
DROP POLICY IF EXISTS "Team read access" ON teams;
DROP POLICY IF EXISTS "Team insert access" ON teams;
DROP POLICY IF EXISTS "Member read access" ON team_members;
DROP POLICY IF EXISTS "Member manage access" ON team_members;

-- A. チームの読み取り: 自分がメンバーであるチーム、または自分が作成したチームは見れる
-- (簡易的に「ログインユーザーなら誰でもチーム情報は引ける」とするケースもありますが、ここではメンバーシップに基づきます)
CREATE POLICY "Team read access" ON teams FOR SELECT
USING (
    auth.role() = 'authenticated' AND (
        created_by = auth.uid() OR
        EXISTS (SELECT 1 FROM team_members WHERE team_id = teams.id AND user_id = auth.uid())
    )
);

-- B. チーム作成: ログインユーザーなら誰でも作成可能
CREATE POLICY "Team insert access" ON teams FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- C. メンバー情報の読み取り: 同じチームのメンバー情報は見れる
CREATE POLICY "Member read access" ON team_members FOR SELECT
USING (
    auth.role() = 'authenticated'
);

-- D. メンバーの追加・削除: 
DROP POLICY IF EXISTS "Member manage access" ON team_members;
DROP POLICY IF EXISTS "Member add access" ON team_members;
DROP POLICY IF EXISTS "Member delete access" ON team_members;

-- 追加・削除は「そのチームのメンバー」なら可能
-- (SELECTには適用しないことで無限再帰を防ぐ)
CREATE POLICY "Member add access" ON team_members FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM team_members AS tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid())
);

CREATE POLICY "Member delete access" ON team_members FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM team_members AS tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid())
);

-- ※ 初回作成時は自分がまだメンバーにいないため、自分自身の追加は許可する特例が必要かもしれません。
--   または、INSERT トリガーで自動追加するか。
--   Teams-api の実装では、チーム作成後に insert しているので、ここでは「チーム作成者」権限も加味します。

DROP POLICY IF EXISTS "Creator can manage members" ON team_members;
DROP POLICY IF EXISTS "Creator add members" ON team_members;
DROP POLICY IF EXISTS "Creator delete members" ON team_members;

-- 作成者はメンバーを追加・削除できる (SELECTには適用しない)
CREATE POLICY "Creator add members" ON team_members FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id AND created_by = auth.uid())
);

CREATE POLICY "Creator delete members" ON team_members FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id AND created_by = auth.uid())
);


-- ==========================================
-- 2024-01-30 追加: Threads テーブルへのチーム連携とユーザー紐付け
-- ==========================================
ALTER TABLE threads ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE threads ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE replies ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Threads の RLS 更新
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

-- 既存の Thread ポリシーを削除して再定義
DROP POLICY IF EXISTS "Thread view policy" ON threads;
DROP POLICY IF EXISTS "Thread insert policy" ON threads;
DROP POLICY IF EXISTS "Thread update policy" ON threads;
DROP POLICY IF EXISTS "Thread delete policy" ON threads;

-- 1. 閲覧: 
--    a) チームに紐付かない(team_id IS NULL) -> 全員
--    b) チームに紐付く -> そのチームのメンバー または 投稿者(user_id)
CREATE POLICY "Thread view policy" ON threads FOR SELECT
USING (
    (team_id IS NULL) OR 
    (EXISTS (SELECT 1 FROM team_members WHERE team_id = threads.team_id AND user_id = auth.uid())) OR
    (auth.uid() = user_id)
);

-- 2. 投稿: ログインユーザーならOK
CREATE POLICY "Thread insert policy" ON threads FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- 3. 更新/削除: 自分の投稿(user_id) または Admin/Manager
CREATE POLICY "Thread update policy" ON threads FOR UPDATE
USING (
    (user_id = auth.uid()) OR
    (auth.uid() = (SELECT id FROM profiles WHERE email = author OR display_name = author LIMIT 1)) OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'Admin' OR role = 'Manager'))
);

CREATE POLICY "Thread delete policy" ON threads FOR DELETE
USING (
    (user_id = auth.uid()) OR
    (auth.uid() = (SELECT id FROM profiles WHERE email = author OR display_name = author LIMIT 1)) OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'Admin' OR role = 'Manager'))
);


-- ==========================================
-- ストレージ (Storage) 用の設定
-- ==========================================
-- バケット 'uploads' が存在することを前提とします。
-- まだ作成していない場合は、Supabase ダッシュボードの Storage から 'uploads' を Public で作成してください。

-- 念のためポリシー例（SQLでバケット作成はできないため、ポリシーのみ）
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'uploads' );
-- CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'uploads' AND auth.role() = 'authenticated' );
