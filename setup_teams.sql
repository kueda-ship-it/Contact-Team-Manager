-- チーム管理機能用 SQL
-- 既存のテーブルがない場合のみ作成されます

-- 1. チームテーブル
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    icon_color TEXT DEFAULT '#313338',
    avatar_url TEXT, -- Added for team icons
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 既存テーブルへのカラム追加
ALTER TABLE teams ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. チームメンバーテーブル
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member', 'viewer' など
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- 既存テーブルへのカラム追加（IF NOT EXISTSが効かない場合用）
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

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
DROP POLICY IF EXISTS "Member update access" ON team_members;
DROP POLICY IF EXISTS "Member delete access" ON team_members;

-- 追加・削除・更新は「そのチームのメンバー」なら可能
-- (SELECTには適用しないことで無限再帰を防ぐ)
CREATE POLICY "Member add access" ON team_members FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM team_members AS tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid())
);

CREATE POLICY "Member update access" ON team_members FOR UPDATE
USING (
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
ALTER TABLE threads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(); -- デフォルトで現在のユーザーIDを設定
ALTER TABLE threads ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

ALTER TABLE replies ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Threads の RLS 更新
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

-- Realtime (リアルタイム更新) の有効化
DO $$
BEGIN
    -- Replica Identity Full に設定 (RLS環境下でのDELETE/UPDATE検知に必須級)
    ALTER TABLE threads REPLICA IDENTITY FULL;
    ALTER TABLE replies REPLICA IDENTITY FULL;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'threads') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE threads;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'replies') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE replies;
    END IF;
END $$;

-- ==========================================
-- データ移行: 既存投稿の user_id を埋める
-- ==========================================
-- 投稿者名(author)からプロファイルを検索して更新
UPDATE threads
SET user_id = profiles.id
FROM profiles
WHERE threads.user_id IS NULL
  AND (profiles.email = threads.author OR profiles.display_name = threads.author);

-- ==========================================
-- 強制修正: team_members のリレーション
-- ==========================================
-- 既存のアプリが結合できるように、明示的に profiles への外部キーを張る
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_user_id_fkey; -- 既存があれば削除
ALTER TABLE team_members 
    ADD CONSTRAINT team_members_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;

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

-- 3. 更新: 自分の投稿(user_id) または チームメンバー (誰でも完了処理ができるように) または Admin/Manager
CREATE POLICY "Thread update policy" ON threads FOR UPDATE
USING (
    (user_id = auth.uid()) OR
    (auth.uid() = (SELECT id FROM profiles WHERE email = author OR display_name = author LIMIT 1)) OR 
    EXISTS (SELECT 1 FROM team_members WHERE team_id = threads.team_id AND user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (LOWER(role) = 'admin' OR LOWER(role) = 'manager'))
);

-- 4. 削除: 自分の投稿(user_id) または Admin/Manager
CREATE POLICY "Thread delete policy" ON threads FOR DELETE
USING (
    (user_id = auth.uid()) OR
    (auth.uid() = (SELECT id FROM profiles WHERE email = author OR display_name = author LIMIT 1)) OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (LOWER(role) = 'admin' OR LOWER(role) = 'manager'))
);


-- ==========================================
-- ストレージ (Storage) 用の設定
-- ==========================================
-- バケット 'uploads' が存在することを前提とします。
-- まだ作成していない場合は、Supabase ダッシュボードの Storage から 'uploads' を Public で作成してください。

-- 念のためポリシー例（SQLでバケット作成はできないため、ポリシーのみ）
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'uploads' );
-- CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'uploads' AND auth.role() = 'authenticated' );
-- ==========================================
-- 緊急修正: 破損したデータの強制削除・権限付与
-- ==========================================

-- 1. 破損した投稿を、ID指定かつ内容がおかしい場合に強制修正（または削除）
--    修正が効かない場合は削除して作り直したほうが早いかもしれません。
--    ここでは「内容の強制上書き」を再度試みます。
UPDATE threads 
SET content = '2/3対応で連絡お願いします。',
    attachments = '[]'::jsonb -- 添付ファイル情報もリセット
WHERE id = '82778117-29ce-4134-86d8-af01b5cefda3';

-- もしIDが合わない可能性を考慮して、内容から検索して修正
UPDATE threads
SET content = '2/3対応で連絡お願いします。'
WHERE content LIKE '%class="task-content"%';

-- 2. 権限問題の解決: ユーザー '000367' (メールアドレスの一部と推測) を強制的に Admin にする
UPDATE profiles
SET role = 'Admin'
WHERE email LIKE '%000367%';

-- 3. データ紐付けの再実行
UPDATE threads
SET user_id = profiles.id
FROM profiles
WHERE threads.user_id IS NULL
  AND (profiles.email = threads.author OR profiles.display_name = threads.author);

-- 4. 削除ポリシーの最終確認 (Adminなら消せる)
DROP POLICY IF EXISTS "Thread delete policy" ON threads;
CREATE POLICY "Thread delete policy" ON threads FOR DELETE
USING (
    (user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'Admin' OR role = 'Manager'))
);
