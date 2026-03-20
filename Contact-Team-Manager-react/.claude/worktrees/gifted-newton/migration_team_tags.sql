-- タグをチームごとに管理するためのマイグレーション
-- 1. tags テーブルに team_id を追加
ALTER TABLE tags ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

-- 2. 既存の name ユニーク制約を削除 (チームが違えば同じ名前を許可するため)
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key;

-- 3. (team_id, name) の複合ユニーク制約を追加
-- 注意: team_id が NULL の場合（グローバルタグ）と区別するため、NULL許容のユニークインデックスにするか、
-- 今回の要件では「すべてチーム帰属」を目指すため、既存データを移行してから NOT NULL にするのが理想。
-- まずは制約を追加（PostgreSQLではNULLは重複とみなされないため、NULL同士は複数作れてしまうが、アプリ側で制御）
CREATE UNIQUE INDEX IF NOT EXISTS tags_team_id_name_key ON tags (team_id, name) WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tags_name_global_key ON tags (name) WHERE team_id IS NULL; -- グローバルタグは名前重複不可

-- 4. 既存タグ '1' を '連絡' チーム (あれば) に移動
DO $$
DECLARE
    target_team_id UUID;
BEGIN
    -- '連絡' または 'Contact' という名前のチームを探す
    SELECT id INTO target_team_id FROM teams WHERE name LIKE '%連絡%' OR name LIKE '%Contact%' LIMIT 1;
    
    IF target_team_id IS NOT NULL THEN
        UPDATE tags SET team_id = target_team_id WHERE name = '1';
    END IF;
END $$;

-- 5. RLSポリシーの更新
-- タグの読み取り: 所属チームのタグ、またはグローバルタグ(team_id IS NULL)のみ可
DROP POLICY IF EXISTS "Everyone can read tags" ON tags;
CREATE POLICY "Team members can read tags" ON tags FOR SELECT
USING (
    auth.role() = 'authenticated' AND (
        team_id IS NULL OR
        EXISTS (SELECT 1 FROM team_members WHERE team_id = tags.team_id AND user_id = auth.uid()) OR
        -- Admin/Managerはすべて見れるようにするなら
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Manager'))
    )
);

-- タグの作成・削除: Admin/Manager は常にOK、またはチーム管理者ならOK
-- 今回は「チームごとに作成」なので、そのチームのメンバーなら作成OKにするか？
-- 要望「タグもチームごとに作成としたい」 -> Admin/Manager権限がなくても作れるようにするか確認が必要だが、
-- 現状のコードは `['Admin', 'Manager'].includes(currentProfile.role)` で制限されている。
-- 権限チェックはアプリ側で行われているため、DBポリシーは厳しめにする。

DROP POLICY IF EXISTS "Admin manage tags" ON tags;
CREATE POLICY "Manage tags" ON tags FOR ALL
USING (
    auth.role() = 'authenticated' AND (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Manager')) OR
        -- チームオーナーも許可する場合
        EXISTs (SELECT 1 FROM teams WHERE id = tags.team_id AND created_by = auth.uid())
    )
);
