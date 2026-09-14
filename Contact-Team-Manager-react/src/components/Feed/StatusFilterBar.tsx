import React, { useEffect, useRef, useState } from 'react';
import { CustomSelect } from '../common/CustomSelect';

export type StatusFilter = 'all' | 'pending' | 'completed' | 'waiting' | 'mentions' | 'myposts' | 'open';

// スイッチは文字を出さず色だけで示す。色はカードの状態色と同じ（未完了=紫、連絡待ち=黄、両方=紫→黄）
const SWITCH_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'すべて' },
    { value: 'pending', label: '未完了' },
    { value: 'waiting', label: '連絡待ち' },
    { value: 'open', label: '未完了/連絡待ち' },
];

const MORE_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'completed', label: '完了済み' },
    { value: 'mentions', label: '自分宛て' },
    { value: 'myposts', label: '自分の投稿' },
];

const LABELS: Record<StatusFilter, string> = {
    all: 'すべて',
    waiting: '連絡待ち',
    pending: '未完了',
    completed: '完了済み',
    mentions: '自分宛て',
    myposts: '自分の投稿',
    open: '未完了/連絡待ち',
};

interface StatusSwitchProps {
    value: StatusFilter;
    onChange: (value: StatusFilter) => void;
    vertical?: boolean;
}

const StatusSwitch: React.FC<StatusSwitchProps> = ({ value, onChange, vertical = false }) => {
    const activeIndex = SWITCH_OPTIONS.findIndex(o => o.value === value);

    // 「その他」を選んでつまみを消すときは、最後の位置のままフェードさせる（端へ飛ばない）
    const [thumbIndex, setThumbIndex] = useState(Math.max(activeIndex, 0));
    if (activeIndex >= 0 && activeIndex !== thumbIndex) setThumbIndex(activeIndex);

    return (
        <div
            className={`status-switch ${vertical ? 'is-vertical' : ''}`}
            role="radiogroup"
            aria-label="表示する投稿"
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            style={{ '--thumb-index': thumbIndex } as React.CSSProperties}
        >
            <span
                className={`status-switch-thumb status-switch-thumb--${SWITCH_OPTIONS[thumbIndex].value} ${activeIndex < 0 ? 'is-hidden' : ''}`}
                aria-hidden="true"
            />
            {SWITCH_OPTIONS.map(o => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    aria-label={o.label}
                    title={o.label}
                    className={`status-switch-item status-switch-item--${o.value} ${value === o.value ? 'active' : ''}`}
                    onClick={() => onChange(o.value)}
                >
                    <span className="status-switch-dot" aria-hidden="true" />
                </button>
            ))}
        </div>
    );
};

interface StatusFilterBarProps {
    value: StatusFilter;
    onChange: (value: StatusFilter) => void;
}

// スマホ用: 一覧の上に横向きで置く
export const StatusFilterBar: React.FC<StatusFilterBarProps> = ({ value, onChange }) => {
    const moreActive = MORE_OPTIONS.some(o => o.value === value);

    return (
        <div className="status-filter-bar">
            <StatusSwitch value={value} onChange={onChange} />
            {/* スイッチ側を選んでいる間は「その他」と表示し、選択中でないことが分かるようにする */}
            <CustomSelect
                options={MORE_OPTIONS}
                value={moreActive ? value : ''}
                onChange={(v) => onChange(v as StatusFilter)}
                placeholder="その他"
                className={`status-more-select ${moreActive ? 'active' : ''}`}
                style={{ width: '124px', borderRadius: '18px' }}
            />
        </div>
    );
};

interface StatusFilterRailProps extends StatusFilterBarProps {
    sortAscending: boolean;
    onToggleSort: () => void;
}

// デスクトップ用: 一覧の右隣に縦に並べる（色スイッチ / その他 / 並べ替え）
export const StatusFilterRail: React.FC<StatusFilterRailProps> = ({ value, onChange, sortAscending, onToggleSort }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const moreRef = useRef<HTMLDivElement>(null);
    const moreActive = MORE_OPTIONS.some(o => o.value === value);
    const sortLabel = sortAscending ? '最新が下（古い順）' : '最新が上（新しい順）';
    const moreLabel = moreActive ? `その他: ${LABELS[value]}` : 'その他（完了済み・自分宛て・自分の投稿）';

    useEffect(() => {
        if (!menuOpen) return;
        const onMouseDown = (e: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenuOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [menuOpen]);

    return (
        <div className="feed-rail">
            <StatusSwitch value={value} onChange={onChange} vertical />
            <div className="feed-rail-divider" aria-hidden="true" />
            <div className="feed-rail-more" ref={moreRef}>
                <button
                    type="button"
                    className={`feed-rail-btn ${moreActive ? 'active' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label={moreLabel}
                    title={moreLabel}
                    onClick={() => setMenuOpen(open => !open)}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                    </svg>
                </button>
                {menuOpen && (
                    <div className="feed-rail-menu" role="menu">
                        {MORE_OPTIONS.map(o => (
                            <button
                                key={o.value}
                                type="button"
                                role="menuitemradio"
                                aria-checked={value === o.value}
                                className={`feed-rail-menu-item ${value === o.value ? 'selected' : ''}`}
                                onClick={() => {
                                    onChange(o.value);
                                    setMenuOpen(false);
                                }}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <button
                type="button"
                className="feed-rail-btn"
                aria-label={sortLabel}
                title={sortLabel}
                onClick={onToggleSort}
            >
                {/* 矢印は最新が来る方向。最新が上のアイコンは最新が下のアイコンを上下反転したもの */}
                {sortAscending ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="M11 4h10" /><path d="M11 8h7" /><path d="M11 12h4" />
                    </svg>
                ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m3 8 4-4 4 4" /><path d="M7 4v16" /><path d="M11 12h4" /><path d="M11 16h7" /><path d="M11 20h10" />
                    </svg>
                )}            </button>
        </div>
    );
};

// 一覧上のチャネル名の横に、今の表示を色付きで出す。スイッチに文字が無いため、色の意味をここで補う
export const StatusFilterLabel: React.FC<{ value: StatusFilter }> = ({ value }) => {
    return (
        <span className={`status-filter-label status-filter-label--${value}`}>
            <span className="status-filter-label-dot" aria-hidden="true" />
            {LABELS[value]}
        </span>
    );
};
