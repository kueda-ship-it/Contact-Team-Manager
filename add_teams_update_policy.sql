-- チーム設定の更新（UPDATE）を許可するポリシーを追加
-- 管理者、またはそのチームのメンバー（ロール不問、またはManager以上に制限も可能）に許可を与えます

-- 既存のポリシーがあれば削除
DROP POLICY IF EXISTS "Team update access" ON teams;

-- ポリシー作成: 管理者、またはチーム作成者、またはチームメンバーに更新を許可
CREATE POLICY "Team update access" ON teams FOR UPDATE
USING (
    auth.role() = 'authenticated' AND (
        -- 1. 自分がシステム管理者 (profilesテーブルのroleがAdmin)
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin') OR
        -- 2. 自分がチームの作成者
        created_by = auth.uid() OR
        -- 3. 自分がそのチームのメンバーである
        EXISTS (SELECT 1 FROM team_members WHERE team_id = teams.id AND user_id = auth.uid())
    )
);

-- 確認用
-- SELECT * FROM pg_policies WHERE tablename = 'teams';
