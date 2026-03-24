-- tag_members テーブル作成
-- タグにメンバーを紐づけるための中間テーブル
-- #タグ名 でメンションすると、紐づいた全メンバーに通知が届く

CREATE TABLE IF NOT EXISTS tag_members (
    id BIGSERIAL PRIMARY KEY,
    tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tag_id, user_id)
);

-- RLS (Row Level Security) ポリシー
ALTER TABLE tag_members ENABLE ROW LEVEL SECURITY;

-- 全認証ユーザーが閲覧可能
CREATE POLICY "tag_members_select" ON tag_members
    FOR SELECT TO authenticated USING (true);

-- 全認証ユーザーが挿入可能
CREATE POLICY "tag_members_insert" ON tag_members
    FOR INSERT TO authenticated WITH CHECK (true);

-- 全認証ユーザーが削除可能
CREATE POLICY "tag_members_delete" ON tag_members
    FOR DELETE TO authenticated USING (true);

-- リアルタイムサブスクリプション用
ALTER PUBLICATION supabase_realtime ADD TABLE tag_members;
