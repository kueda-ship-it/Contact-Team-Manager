import React, { useEffect, useRef } from 'react';
import type { SearchHit } from '../../hooks/useGlobalSearch';

interface Props {
    query: string;
    hits: SearchHit[];
    loading: boolean;
    activeIndex: number;
    onHover: (index: number) => void;
    onSelect: (hit: SearchHit) => void;
    onClose: () => void;
}

// 検索語をハイライトするスニペット描画。
const Highlighted: React.FC<{ text: string; query: string }> = ({ text, query }) => {
    if (!query) return <>{text}</>;
    const lower = text.toLowerCase();
    const qLower = query.toLowerCase();
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let found = lower.indexOf(qLower, cursor);
    while (found !== -1) {
        if (found > cursor) parts.push(text.slice(cursor, found));
        parts.push(
            <mark key={`${found}-${parts.length}`} className="ctm-search-hit-mark">
                {text.slice(found, found + query.length)}
            </mark>
        );
        cursor = found + query.length;
        found = lower.indexOf(qLower, cursor);
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return <>{parts}</>;
};

export const GlobalSearchResults: React.FC<Props> = ({
    query,
    hits,
    loading,
    activeIndex,
    onHover,
    onSelect,
    onClose,
}) => {
    const trimmed = query.trim();
    const listRef = useRef<HTMLUListElement>(null);

    // activeIndex が変わったら該当行を可視領域に追従させる。
    // block:'nearest' なのでリストが既に画面内なら何もせず、外にはみ出した時だけ最小移動で追いつく。
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>('.ctm-search-hit.is-active');
        el?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    if (trimmed.length === 0) return null;

    return (
        <div
            className="ctm-search-dropdown"
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}  // blur を防ぐ（クリックで選択できるように）
        >
            <div className="ctm-search-dropdown-header">
                <span>
                    {loading ? '検索中…' : hits.length > 0
                        ? `${hits.length} 件ヒット`
                        : trimmed.length < 2 ? '2 文字以上で検索' : '該当なし'}
                </span>
                <button className="ctm-search-dropdown-close" onClick={onClose} title="閉じる (Esc)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            {hits.length > 0 && (
                <ul className="ctm-search-hit-list" ref={listRef}>
                    {hits.map((hit, i) => (
                        <li
                            key={`${hit.threadId}-${hit.matchedIn}`}
                            className={`ctm-search-hit ${i === activeIndex ? 'is-active' : ''}`}
                            role="option"
                            aria-selected={i === activeIndex}
                            // hover 時の activeIndex 同期は、既に一致していない時だけ実行して
                            // 無駄な再レンダを避ける(マウス上を通過するだけで 30 行再描画しない)
                            onMouseEnter={() => { if (i !== activeIndex) onHover(i); }}
                            onClick={() => onSelect(hit)}
                        >
                            <div className="ctm-search-hit-row1">
                                <span className="ctm-search-hit-team">{hit.teamName || '—'}</span>
                                <span className="ctm-search-hit-type">
                                    {hit.matchedIn === 'title' ? 'タイトル'
                                        : hit.matchedIn === 'content' ? '本文'
                                            : '返信'}
                                </span>
                            </div>
                            <div className="ctm-search-hit-title">
                                <Highlighted text={hit.threadTitle} query={trimmed} />
                            </div>
                            <div className="ctm-search-hit-snippet">
                                <Highlighted text={hit.snippet} query={trimmed} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
