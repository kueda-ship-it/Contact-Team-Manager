// 読み込み中の輪（全アプリ共通の決まり。2026-10-16）。光が尾を引いて途切れずに回る。文字は出さない（読み上げ用の名前だけ持つ）
export function Spinner({ size = 16, label = '読み込み中' }: { size?: number; label?: string }) {
  return <span className="spinner" role="status" aria-label={label} style={{ width: size, height: size }} />
}

/** 画面全体・区画の読み込み中。中央に輪だけを出す */
export function SpinnerBlock({ size = 24 }: { size?: number }) {
  return (
    <div className="spinner-block">
      <Spinner size={size} />
    </div>
  )
}
