-- Supabase Storage セットアップ用 SQL
-- このスクリプトは Supabase の SQL Editor で実行してください

-- 1. uploads バケットの作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 公開アクセスポリシー (誰でもファイルを閲覧可能)
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT USING ( bucket_id = 'uploads' );

-- 3. アップロードポリシー (ログインユーザーならアップロード可能)
CREATE POLICY "Authenticated Upload" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'uploads' AND
  auth.role() = 'authenticated'
);

-- 4. 削除ポリシー (自分のフォルダ内のファイルのみ削除可能 - 任意)
CREATE POLICY "Owner Delete" ON storage.objects
FOR DELETE USING (
  bucket_id = 'uploads' AND
  (auth.uid())::text = (storage.foldername(name))[1]
);
