# Project Memory - Contact-Team-Manager

## プロジェクト概要
Teamsライクな連絡・チーム管理ツール。React + Vite (Frontend) と Supabase (Backend/Auth) を中心とした構成。

## UI/UX の極意 (設計思想)
- **グラスモーフィズム (Glassmorphism)**: 深いボカシ (`backdrop-filter`)、高透過率、微細なエッジ・ハイライト (`border-top`) を基本とする。
- **リキッドUI (Liquid UI)**: なめらかなグラデーション、流動的なアニメーション、角丸を活かした「有機的」な質感。
- **プレミアムな質感**: 安易なベタ塗りを避け、奥行きと透過性を重視する。
- **画像・メディア**: 高品質なプレビューとスムーズな遷移を追求する。

## 重要な決定事項
- **認証フロー**: Supabase SSO (Microsoft) で取得した `provider_token` をそのまま Microsoft Graph API に引き継ぎ、二度手間を完全に排除する。
- **データ連携**: OneDrive への自動アップロードと、セッション維持によるシームレスな画像表示。

## 既知の課題 / 今後の計画
- 検索バーや小バッジ類への Liquid UI 適用（進行中）。
- 画像プレビューの画質改善（進行中）。
