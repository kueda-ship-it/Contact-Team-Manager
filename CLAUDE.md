# Contact-Team-Manager — Claude への指示

このリポジトリで Claude（Local Claude Code / Cowork / 他環境）が作業するときの規約。
ユーザー: k_ueda（dragonball.gokou-rose@au.com / 業務: k_ueda@fts.co.jp）

⚠️ **リポジトリ構成**: root と `Contact-Team-Manager-react/` サブフォルダの 2 層。
React アプリ本体はサブフォルダ。Claude が cwd を解釈する際に注意。

## 1. 最初にやること（セッション開始時、必ず）

「Claude 外部脳 Vault」を参照する。**Cowork 等のリモート環境では clone が必要**。

```bash
if [ ! -d "Obsidian Vault" ]; then
  git clone https://github.com/kueda-ship-it/obsidian-vault.git "Obsidian Vault"
else
  (cd "Obsidian Vault" && git pull)
fi
```

clone 後、必ず:

- `Obsidian Vault/CLAUDE.md` — 全体振る舞いルール（Magic Phrases 含む）
- `Obsidian Vault/00_Meta/嗜好まとめ.md` — UI / コーディング嗜好
- `Obsidian Vault/Projects/Contact-Team-Manager/README.md`
- `Obsidian Vault/Projects/Contact-Team-Manager/Mistakes/` — **既知の地雷（必読）**
- `Obsidian Vault/30_Knowledge/2026-05-18_過去ミスから抽出した最優先ルール.md` — TOP 4

## 2. このプロジェクトの Vault 投入先

| 種類 | パス |
|------|------|
| ミスログ | `Obsidian Vault/Projects/Contact-Team-Manager/Mistakes/YYYY-MM-DD_<topic>.md` |
| ADR | `Obsidian Vault/Projects/Contact-Team-Manager/Decisions/YYYY-MM-DD_<topic>.md` |
| ノウハウ | `Obsidian Vault/Projects/Contact-Team-Manager/Knowledge/<topic>.md` |
| セッション | `Obsidian Vault/Projects/Contact-Team-Manager/Sessions/YYYY-MM-DD_<topic>.md` |
| 日次ログ（横断） | `Obsidian Vault/50_Daily/YYYY/MM/YYYY-MM-DD.md` |

書き込み後は必ず Vault repo に commit + push:
```bash
(cd "Obsidian Vault" && git add -A && git commit -m "<種別>: <topic>" && git push)
```

## 3. 既知の地雷（Contact-Team-Manager 固有）

🔴 **DotMenu バグで console.log 追加 → デプロイ → ダメ、を 4 回繰り返した（severity high, 4 回再発）**

ユーザーから「**コンソールに貼っていくのではなく、なんでそうなっているかを考えて改修できませんか？個の工数は本当に必要？**」「もともとできてた機能ができなくなるのでしょうか？」と強く指摘された。

### 再発防止プロトコル（このプロジェクトで最重要）

1. ログ追加で原因特定は **最大 1 周まで**
2. 2 周目以降は **コードを読み、仮説の根拠（ファイル名・行番号・差分）を提示してから** 次の変更
3. **回帰バグ**（前は動いていた）の場合、**`git blame` / 直前の commit diff を最優先で確認**
4. 「とりあえずデプロイして見る」を成果として扱わない

## 4. プロジェクト横断の最優先 TOP 4 ルール

1. 🔴 **「ダメ」を 2 回連続で受けたらコード読むまでデプロイ禁止** ← **このプロジェクトで 4 回再発した張本人**
2. 🟡 **UI 修正指示は「対象 / 属性 / 期待値」を 1 行復唱してから着手**
3. 🟡 **バッジは `inline-flex + height:28px + icon 12px` をデフォ適用**
4. 🟡 **「Ctrl+Shift+R / unregister」を完了報告に書かない**

## 5. Magic Phrases（強制トリガー）

| フレーズ | 動作 |
|---------|------|
| 「失敗として記録」「ミスに残」 | `Projects/Contact-Team-Manager/Mistakes/` に作成 + push |
| 「ADR にして」「決定を残」 | `Projects/Contact-Team-Manager/Decisions/` に作成 + push |
| 「今日のまとめ」「デイリー更新」 | `50_Daily/YYYY/MM/YYYY-MM-DD.md` 更新 + push |
| 「知識に昇格」「Knowledge に」 | `Knowledge/<topic>.md` 作成/更新 + push |
| 「Vault に同期」「push して」 | Vault の commit + push を強制実行 |
| 「過去のミス」「Vault 検索」 | Vault 内を Glob/Grep で検索して要約 |

## 6. このプロジェクトの基本スタック

- React
- `Contact-Team-Manager-react/` サブフォルダがアプリ本体
- 通知（notification）、スレッド、リマインダー機能あり

## 7. その他の規約

- ソートは **作成日降順** で固定、更新で並び替えない
- 一覧カードは `display: grid` + `gridTemplateColumns` で列固定
- 書き込み系は **必ずタイムアウト付き**（通常 15 秒）
- 応答は簡潔、コードコメントは原則書かない（非自明な WHY のみ）

---

正本は `Obsidian Vault/CLAUDE.md` および `00_Meta/嗜好まとめ.md`。
