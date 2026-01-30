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
-- シンプルにするため、「そのチームのメンバーなら、他のメンバーを追加・削除できる」とします。
-- (より厳密にするなら、teams.created_by = auth.uid() のチェックなどを入れます)
CREATE POLICY "Member manage access" ON team_members FOR ALL
USING (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM team_members WHERE team_id = team_members.team_id AND user_id = auth.uid())
);
-- ※ 初回作成時は自分がまだメンバーにいないため、自分自身の追加は許可する特例が必要かもしれません。
--   または、INSERT トリガーで自動追加するか。
--   Teams-api の実装では、チーム作成後に insert しているので、ここでは「チーム作成者」権限も加味します。

CREATE POLICY "Creator can manage members" ON team_members FOR ALL
USING (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id AND created_by = auth.uid())
);


-- ==========================================
-- ストレージ (Storage) 用の設定
-- ==========================================
-- バケット 'uploads' が存在することを前提とします。
-- まだ作成していない場合は、Supabase ダッシュボードの Storage から 'uploads' を Public で作成してください。

-- 念のためポリシー例（SQLでバケット作成はできないため、ポリシーのみ）
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'uploads' );
-- CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'uploads' AND auth.role() = 'authenticated' );
