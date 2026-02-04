import React, { useState, useEffect, useRef } from 'react';
import { useProfiles, useTags } from '../hooks/useSupabase';

interface MentionInputHandlerProps {
    contentEditableRef: React.RefObject<HTMLDivElement>;
    onMentionSelect?: (mention: string) => void;
}

export const useMentionInputHandler = ({ contentEditableRef }: MentionInputHandlerProps) => {
    const [showMentions, setShowMentions] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { profiles } = useProfiles();
    const { tags } = useTags();

    const mentionCandidates = React.useMemo(() => {
        const profileItems = profiles.map(p => ({
            type: 'profile' as const,
            value: `@${p.display_name || p.email}`,
            display: p.display_name || p.email,
            avatar: p.avatar_url
        }));

        const tagItems = tags.map(t => ({
            type: 'tag' as const,
            value: `@${t.name}`,
            display: t.name,
            avatar: null
        }));

        const allItems = [...profileItems, ...tagItems];

        if (!mentionFilter) return allItems;

        const lowerFilter = mentionFilter.toLowerCase();
        return allItems.filter(item =>
            item.display.toLowerCase().includes(lowerFilter)
        );
    }, [profiles, tags, mentionFilter]);

    const handleInput = () => {
        if (!contentEditableRef.current) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const textBeforeCursor = range.startContainer.textContent?.substring(0, range.startOffset) || '';

        // Check if @ was just typed
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
        if (lastAtIndex !== -1) {
            const afterAt = textBeforeCursor.substring(lastAtIndex + 1);
            // Show mentions if @ is at start or after a space
            if (lastAtIndex === 0 || textBeforeCursor[lastAtIndex - 1] === ' ' || textBeforeCursor[lastAtIndex - 1] === '\n') {
                setMentionFilter(afterAt);
                setShowMentions(true);
                setSelectedIndex(0);
                return;
            }
        }

        setShowMentions(false);
    };

    const insertMention = (mentionValue: string) => {
        if (!contentEditableRef.current) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const textNode = range.startContainer;
        const textBeforeCursor = textNode.textContent?.substring(0, range.startOffset) || '';
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        if (lastAtIndex !== -1) {
            // Remove @ and filter text
            const textBefore = textBeforeCursor.substring(0, lastAtIndex);
            const textAfter = textNode.textContent?.substring(range.startOffset) || '';

            // Create mention span
            const mentionSpan = document.createElement('span');
            mentionSpan.className = 'mention';
            mentionSpan.textContent = mentionValue;
            mentionSpan.contentEditable = 'false';

            // Replace text
            if (textNode.parentNode) {
                const beforeText = document.createTextNode(textBefore);
                const afterText = document.createTextNode(' ' + textAfter);

                textNode.parentNode.replaceChild(afterText, textNode);
                textNode.parentNode.insertBefore(mentionSpan, afterText);
                textNode.parentNode.insertBefore(beforeText, mentionSpan);

                // Set cursor after mention
                const newRange = document.createRange();
                newRange.setStartAfter(afterText);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
        }

        setShowMentions(false);
        setMentionFilter('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showMentions) return false;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % mentionCandidates.length);
            return true;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
            return true;
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (mentionCandidates.length > 0) {
                e.preventDefault();
                insertMention(mentionCandidates[selectedIndex].value);
                return true;
            }
        } else if (e.key === 'Escape') {
            setShowMentions(false);
            return true;
        }

        return false;
    };

    return {
        showMentions,
        mentionCandidates,
        selectedIndex,
        handleInput,
        handleKeyDown,
        insertMention
    };
};

export const MentionList: React.FC<{
    show: boolean;
    candidates: Array<{ type: string; value: string; display: string; avatar: string | null }>;
    selectedIndex: number;
    onSelect: (value: string) => void;
}> = ({ show, candidates, selectedIndex, onSelect }) => {
    if (!show || candidates.length === 0) return null;

    return (
        <div className="mention-list" style={{ display: 'block' }}>
            {candidates.map((item, index) => (
                <div
                    key={item.value}
                    className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => onSelect(item.value)}
                    onMouseEnter={() => { }}
                >
                    {item.avatar ? (
                        <img src={item.avatar} alt="" className="mention-avatar" />
                    ) : (
                        <div className="mention-avatar">{item.display[0].toUpperCase()}</div>
                    )}
                    <span>{item.display}</span>
                </div>
            ))}
        </div>
    );
};
