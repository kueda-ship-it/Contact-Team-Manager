import React from 'react';

// お知らせを更新するときはこのバージョンを変更する（changelog.ts の日付と合わせる）
const WHATS_NEW_VERSION = '2026-07-06-waiting-contact';
const STORAGE_KEY = 'whatsnew_seen_version';

const PhoneIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
    </svg>
);

export const WhatsNewModal: React.FC = () => {
    const [visible, setVisible] = React.useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) !== WHATS_NEW_VERSION;
        } catch {
            return false;
        }
    });

    if (!visible) return null;

    const close = () => {
        try {
            localStorage.setItem(STORAGE_KEY, WHATS_NEW_VERSION);
        } catch { /* private mode 等で保存できなくても閉じる */ }
        setVisible(false);
    };

    const itemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)'
    };

    const iconBoxStyle: React.CSSProperties = {
        width: '28px',
        height: '28px',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        boxSizing: 'border-box'
    };

    return (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 100000 }}>
            <div className="modal" style={{ maxWidth: '520px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '24px', borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '1.4rem' }}>📢</span>
                    <h2 style={{ margin: 0, fontSize: '1.15rem' }}>新機能のお知らせ</h2>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '18px' }}>2026/07/06 更新</div>

                <h3 style={{ fontSize: '0.95rem', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '8px', color: '#EAB308' }}>
                    <PhoneIcon size={16} /> 連絡待ち（Waiting for contact）機能
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                    <div style={itemStyle}>
                        <span style={{ ...iconBoxStyle, border: '1px solid #EAB308', color: '#EAB308', background: 'rgba(234,179,8,0.12)' }}>
                            <PhoneIcon />
                        </span>
                        <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                            <strong>完了ボタンの左に「連絡待ち」ボタンを追加。</strong><br />
                            押すと連絡待ち状態になり、カードの枠が<span style={{ color: '#EAB308', fontWeight: 600 }}>黄色</span>に変わります。もう一度押すと解除されます。
                        </div>
                    </div>
                    <div style={itemStyle}>
                        <span style={{ ...iconBoxStyle, border: '1px solid rgba(255,255,255,0.3)', color: 'var(--text-main, #fff)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
                            </svg>
                        </span>
                        <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                            <strong>右サイドバーに「Waiting for contact」セクションを新設。</strong><br />
                            連絡待ちにした投稿は Not Finished から移動して表示され、通常の未完了と分けて管理できます。
                        </div>
                    </div>
                    <div style={itemStyle}>
                        <span style={{ ...iconBoxStyle, border: '1px solid rgba(255,255,255,0.3)', color: 'var(--text-main, #fff)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                        </span>
                        <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                            <strong>表示フィルタに「連絡待ち」を追加。</strong><br />
                            画面左上のフィルタから連絡待ちの投稿だけを絞り込めます。投稿を完了にすると連絡待ちは自動で解除されます。
                        </div>
                    </div>
                </div>

                <h3 style={{ fontSize: '0.95rem', margin: '0 0 10px' }}>不具合修正</h3>
                <div style={{ ...itemStyle, marginBottom: '20px' }}>
                    <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                        サイドバーのカードをクリックしても対象の投稿へ移動しないことがある問題を修正しました。クリックすると対象投稿がハイライト付きで画面中央に表示されます。
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={close} style={{ padding: '8px 24px' }}>
                        確認しました
                    </button>
                </div>
            </div>
        </div>
    );
};
