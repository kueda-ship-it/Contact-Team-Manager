import React from 'react';
import { CHANGELOG } from '../../data/changelog';

// changelog.ts の先頭セクション（最初の `# 見出し` から次の `# ` の手前まで）を
// 起動時ダイアログとして自動表示する。UI 変更時は changelog.ts の先頭に
// 新しい `# YYYY-MM-DD 更新履歴` セクションを追記するだけでよい。
const STORAGE_KEY = 'whatsnew_seen_version';

const getLatestSection = (): { version: string; lines: string[] } | null => {
    const lines = CHANGELOG.trim().split('\n');
    const start = lines.findIndex(l => l.startsWith('# '));
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].startsWith('# ')) { end = i; break; }
    }
    return {
        version: lines[start].replace(/^#\s*/, '').trim(),
        lines: lines.slice(start + 1, end)
    };
};

// **bold** とバッククォートを処理した inline 描画
const renderInline = (text: string): React.ReactNode[] =>
    text.replace(/`/g, '').split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
            ? <strong key={i} style={{ color: 'var(--text-main, #fff)' }}>{part.slice(2, -2)}</strong>
            : part
    );

export const WhatsNewModal: React.FC = () => {
    const section = React.useMemo(getLatestSection, []);

    const [visible, setVisible] = React.useState(() => {
        if (!section) return false;
        try {
            let seen = localStorage.getItem(STORAGE_KEY);
            // 旧キー形式からの移行: 確認済みだったのは「2026-07-06 更新履歴」セクション
            if (seen === '2026-07-06-waiting-contact') {
                seen = '2026-07-06 更新履歴';
                localStorage.setItem(STORAGE_KEY, seen);
            }
            return seen !== section.version;
        } catch {
            return false;
        }
    });

    const close = React.useCallback(() => {
        try {
            if (section) localStorage.setItem(STORAGE_KEY, section.version);
        } catch { /* private mode 等で保存できなくても閉じる */ }
        setVisible(false);
    }, [section]);

    // Esc でも閉じられるようにする（項目が多いときの逃げ道）
    React.useEffect(() => {
        if (!visible) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [visible, close]);

    if (!visible || !section) return null;

    return (
        // ★.modal は CSS 側で display:flex / flex-direction:column / overflow:hidden。
        //   コンテナ自体はスクロールしないので、**本文だけをスクロールさせ、
        //   ボタンは常に見える位置に固定する**（設定モーダルの .settings-body と同じ作り）。
        //   ここを overflowY:auto にしても、項目が増えるとボタンが画面外に出て閉じられなくなる。
        <div
            className="modal-overlay"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 100000 }}
            onClick={close}
        >
            <div className="modal" style={{ maxWidth: '560px', width: '100%', maxHeight: '85vh', padding: '24px', borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexShrink: 0 }}>
                    <span style={{ fontSize: '1.4rem' }}>📢</span>
                    <h2 style={{ margin: 0, fontSize: '1.15rem' }}>新機能のお知らせ</h2>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px', flexShrink: 0 }}>{section.version}</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {section.lines.map((line, i) => {
                        const trimmed = line.trim();
                        if (!trimmed) return null;
                        if (trimmed.startsWith('## ')) {
                            return (
                                <h3 key={i} style={{ fontSize: '0.95rem', margin: '12px 0 6px', color: 'var(--accent, #00B7C3)' }}>
                                    {renderInline(trimmed.slice(3))}
                                </h3>
                            );
                        }
                        if (trimmed.startsWith('- ')) {
                            const indented = line.startsWith('  ');
                            return (
                                <div key={i} style={{
                                    display: 'flex',
                                    gap: '8px',
                                    marginLeft: indented ? '20px' : 0,
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    background: indented ? 'transparent' : 'rgba(255,255,255,0.04)',
                                    border: indented ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                    fontSize: '0.85rem',
                                    lineHeight: 1.6
                                }}>
                                    <span style={{ color: 'var(--accent, #00B7C3)', flexShrink: 0 }}>✓</span>
                                    <span>{renderInline(trimmed.slice(2))}</span>
                                </div>
                            );
                        }
                        return (
                            <div key={i} style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{renderInline(trimmed)}</div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button className="btn btn-primary" onClick={close} style={{ padding: '8px 24px' }}>
                        確認しました
                    </button>
                </div>
            </div>
        </div>
    );
};
