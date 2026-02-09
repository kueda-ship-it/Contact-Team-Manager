import React, { useState } from 'react';

interface ReactionPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '🎉', '🔥'];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, onClose }) => {
    return (
        <div
            className="reaction-picker"
            style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                background: '#1F1E1D',
                border: '1px solid rgba(232, 81, 255, 0.3)',
                borderRadius: '8px',
                padding: '6px',
                display: 'flex',
                gap: '4px',
                zIndex: 1000,
                boxShadow: '0 4px 15px rgba(232, 81, 255, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {COMMON_EMOJIS.map(emoji => (
                <button
                    key={emoji}
                    className="emoji-btn"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#e851ff',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '6px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    onClick={() => {
                        onSelect(emoji);
                        onClose();
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(232, 81, 255, 0.1)';
                        e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <span style={{ fontSize: '20px' }}>{emoji}</span>
                </button>
            ))}
        </div>
    );
};

interface ReactionBarProps {
    reactions: Array<{
        id: string;
        emoji: string;
        profile_id: string;
    }>;
    profiles: any[];
    currentUserId?: string;
    currentProfile?: any;
    onAdd: (emoji: string) => void;
    onRemove: (reactionId: string) => void;
    style?: React.CSSProperties;
}

export const ReactionBar: React.FC<ReactionBarProps> = (props) => {
    const {
        reactions,
        profiles,
        currentUserId,
        currentProfile,
        onAdd,
        onRemove,
        style
    } = props;
    const [showPicker, setShowPicker] = useState(false);

    const groupedReactions = reactions.reduce((acc, reaction) => {
        if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = [];
        }
        acc[reaction.emoji].push(reaction);
        return acc;
    }, {} as Record<string, typeof reactions>);

    const handleReactionClick = (emoji: string, reactionsByEmoji: typeof reactions) => {
        const userReaction = reactionsByEmoji.find(r => r.profile_id === currentUserId);
        if (userReaction) {
            onRemove(userReaction.id);
        } else {
            onAdd(emoji);
        }
    };

    const getReactionTooltip = (reactionList: typeof reactions) => {
        return reactionList.map(r => {
            const profile = profiles.find(p => p.id === r.profile_id);
            if (profile) return profile.display_name || profile.email;
            if (currentUserId && r.profile_id === currentUserId && currentProfile) {
                return currentProfile.display_name || currentProfile.email || 'You';
            }
            return 'Unknown';
        }).join(', ');
    };

    return (
        <div
            className="reaction-bar"
            style={Object.assign({ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', position: 'relative' }, style || {})}
            onMouseLeave={() => setShowPicker(false)}
        >
            {Object.entries(groupedReactions).map(([emoji, reactionList]) => {
                const hasUserReacted = reactionList.some(r => r.profile_id === currentUserId);
                const tooltipNames = getReactionTooltip(reactionList);

                return (
                    <button
                        key={emoji}
                        className={`reaction-bubble ${hasUserReacted ? 'user-reacted' : ''}`}
                        style={{
                            borderRadius: '20px',
                            padding: '4px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            transformOrigin: 'center'
                        }}
                        onClick={() => handleReactionClick(emoji, reactionList)}
                        title={tooltipNames}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                            {emoji}
                        </span>
                        <span style={{
                            fontSize: '11px',
                            fontWeight: '700'
                        }}>
                            {reactionList.length}
                        </span>
                    </button>
                );
            })}

            <div style={{ position: 'relative' }}>
                <button
                    className="reaction-bubble"
                    style={{
                        borderRadius: '20px',
                        width: '32px',
                        height: '24px',
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                        padding: '0',
                        opacity: 0.8
                    }}
                    onClick={() => setShowPicker(!showPicker)}
                    onClick={() => setShowPicker(!showPicker)}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
                {showPicker && (
                    <ReactionPicker
                        onSelect={onAdd}
                        onClose={() => setShowPicker(false)}
                    />
                )}
            </div>
        </div>
    );
};
