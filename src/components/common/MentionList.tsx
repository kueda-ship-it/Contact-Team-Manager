import React from 'react';
import { MentionCandidate } from '../../hooks/useMentions';

interface MentionListProps {
    candidates: MentionCandidate[];
    activeIndex: number;
    onSelect: (candidate: MentionCandidate) => void;
    style?: React.CSSProperties;
}

import ReactDOM from 'react-dom';

export const MentionList: React.FC<MentionListProps> = ({ candidates, activeIndex, onSelect, style }) => {
    if (candidates.length === 0) return null;

    const listStyle: React.CSSProperties = {
        position: 'fixed',
        background: 'var(--bg-elevated, #2b2d31)', // Fallback for dark mode
        border: '1px solid var(--border-color, #444)',
        zIndex: 10000, // Ensure highest priority
        width: '280px',
        maxHeight: '200px',
        overflowY: 'auto',
        ...style
    };

    const listRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (listRef.current) {
            const activeEl = listRef.current.children[activeIndex] as HTMLElement;
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    const itemStyle = (isActive: boolean): React.CSSProperties => ({
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
        background: isActive ? 'var(--primary-alpha, rgba(100, 108, 255, 0.2))' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        height: '50px',
        flexShrink: 0
    });

    const content = (
        <div className="mention-list mention-candidate-list" style={listStyle} ref={listRef}>
            {candidates.map((candidate, index) => (
                <div
                    key={`${candidate.type}-${candidate.id}`}
                    className={`mention-item ${index === activeIndex ? 'active' : ''}`}
                    style={itemStyle(index === activeIndex)}
                    onMouseDown={(e) => {
                        e.preventDefault(); // Prevent blur
                        onSelect(candidate);
                    }}
                >
                    <div className={`avatar ${candidate.type === 'tag' ? 'tag-avatar' : ''}`} style={{
                        width: '24px', height: '24px', borderRadius: '50%',
                        background: candidate.type === 'tag' ? 'var(--accent, #646cff)' : 'var(--primary-dark, #464775)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0
                    }}>
                        {candidate.type === 'tag' ? '#' : (
                            candidate.avatar ? (
                                <img src={candidate.avatar} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                candidate.display[0].toUpperCase()
                            )
                        )}
                    </div>
                    <div className="mention-info" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                        <span className="mention-name" style={{ fontWeight: 500, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{candidate.display}</span>
                        {candidate.sub && <span className="mention-email" style={{ fontSize: '0.75rem', color: 'var(--text-muted, #999)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{candidate.sub}</span>}
                    </div>
                </div>
            ))}
        </div>
    );

    return ReactDOM.createPortal(content, document.body);
};
