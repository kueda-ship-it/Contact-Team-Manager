# Contact Team Manager - 子細仕様書

## 1. システム概要
本システムは、Microsoft 365 エコシステムと連携し、チーム内およびチーム間での連絡事項をスレッド形式で管理する Web サービスです。

### アーキテクチャ
- **Frontend**: React (v19) + Vite (v7)
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, Realtime)
- **認証**: Microsoft MSAL (Azure AD / Entra ID) + Supabase Auth
- **UI/UX**: Vanilla CSS + Glassmorphism デザインシステム (Liquid Glass)

---

## 2. データベース設計 (Schema)

### 主要テーブル
- **profiles**: ユーザー全般情報
  - `id`: uuid (Primary Key)
  - `email`: text (MSアカウント照合用)
  - `display_name`: 表示名
  - `role`: 権限 ('Admin', 'Manager', 'Member', 'Viewer')
- **teams**: チーム情報
  - `id`: int8 (Primary Key)
  - `name`: チーム名
  - `icon`, `icon_color`: UI表示用アイコン設定
- **threads**: 投稿（スレッド）本体
  - `id`: uuid (Primary Key)
  - `title`: タイトル
  - `content`: 本文（URL自動抽出、OGPプレビュー付き）
  - `user_id`: 投稿者プロフィールID
  - `team_id`: 所属チームID
  - `status`: 'pending' (未解決) / 'completed' (解決済み)
  - `remind_at`: リマインド日時
- **replies**: スレッドへの返信
  - `id`: uuid
  - `thread_id`: 紐づくスレッド
  - `user_id`: 投稿者
- **tags / tag_members**: メンション用カスタムタグ
  - 特定のグループ（例：#開発担当）への一括通知を実現。

---

## 3. 主要機能の内部ロジック

### 3.1 認証と SSO 連携
1. `main.tsx` にて **MSAL (Microsoft Authentication Library)** を初期化。
2. ログイン時、Azure AD のアクセストークンを取得し、Supabase Auth に渡す。
3. `useAuth` フックにて、Supabase 側で事前に管理者が登録した `profiles` (ホワイトリスト) と照合。
4. アクセストークンはメモリ保持され、Microsoft Graph API (リンクプレビューやOneDrive等) の実行に利用される。

### 3.2 リアルタイム通知システム
- **Realtime**: Supabase の `postgres_changes` を購読。
- **通知トリガー**: `threads` または `replies` への `INSERT` が発生した際、`useNotifications` フックがペイロードを受信。
- **フィルタリング**: 
  - 自分の投稿はスキップ。
  - `@ユーザー名`, `@all`, `#タグ名` をコンテンツから正規表現で抽出。
  - 条件に合致する場合のみ、Browser Notification API (Service Worker 経由) で通知を表示。

### 3.3 リンクプレビュー機能
1. 投稿保存時にコンテンツをスキャン（フロントエンド）。
2. URLが検出された場合、Supabase Edge Function `get-link-preview` を呼び出し。
3. Edge Function 内でメタデータをスクレイピングし、タイトル・画像・説明文を返す。
4. UI上の `.link-preview-card` に動的に反映。

---

## 4. UI/UX 仕様

### デザインシステム (Onyx / Liquid Glass)
- **CSS 変数**: `--glass`, `--glass-blur`, `--glass-border` 等で集中管理。
- **ガラス効果**: `backdrop-filter: blur(20px)` と `background: rgba(255, 255, 255, 0.03)` の組み合わせ。
- **動的レイヤー**: `refraction-layer`, `tint-layer`, `specular-layer` の 3 層構造により、Apple WWDC25 スタイルの透過背景を実現。

---

## 5. 運用上の注意点
- **通知の許可**: 初回起動時にブラウザの通知許可が必要です。
- **リマインド**: `threads.remind_at` が過去になると、フロントエンドのポーリングまたはリアルタイム検知により通知が飛びます。
