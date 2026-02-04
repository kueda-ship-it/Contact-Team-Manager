import { useState, useCallback, useEffect } from 'react';
import { cleanText } from '../utils/text';

export interface MentionCandidate {
    id: string;
    display: string;
    sub?: string;
    type: 'user' | 'tag';
    avatar?: string;
}

interface UseMentionsProps {
    profiles: any[];
    tags: any[];
    currentTeamId: number | null;
}

export const useMentions = ({ profiles, tags, currentTeamId }: UseMentionsProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    // Removed unused position state
    const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
    const [targetThreadId, setTargetThreadId] = useState<string | null>(null);
    const [mentionPosition, setMentionPosition] = useState<'top' | 'bottom'>('bottom');

    // Filter candidates based on query
    useEffect(() => {
        if (!isOpen) {
            setCandidates([]);
            return;
        }

        const lowerQuery = cleanText(query).toLowerCase();

        // Users
        const matchedProfiles = profiles
            .filter(p => {
                const name = cleanText(p.display_name || '').toLowerCase();
                const email = cleanText(p.email || '').toLowerCase();
                return name.includes(lowerQuery) || email.includes(lowerQuery);
            })
            .map(p => ({
                id: p.id,
                display: p.display_name || 'No Name',
                sub: p.email,
                type: 'user' as const,
                avatar: p.avatar_url
            }));

        // Tags
        const matchedTags = tags
            .filter(t => {
                // Determine visibility based on current team
                if (currentTeamId !== null && t.team_id !== null && t.team_id !== currentTeamId) return false;
                const name = cleanText(t.name).toLowerCase();
                return name.includes(lowerQuery);
            })
            .map(t => ({
                id: String(t.id),
                display: t.name,
                sub: 'タグ',
                type: 'tag' as const
            }));

        setCandidates([...matchedProfiles, ...matchedTags]);
        setActiveIndex(0);
    }, [query, isOpen, profiles, tags, currentTeamId]);

    const [mentionCoords, setMentionCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const handleInput = useCallback((_e: React.FormEvent<HTMLDivElement>, threadId: string) => {
        const selection = window.getSelection();

        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const node = range.startContainer;

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            const cursor = range.startOffset;
            const lastAt = text.lastIndexOf('@', cursor - 1);

            if (lastAt !== -1 && !text.slice(lastAt, cursor).includes(' ')) {
                const newQuery = text.slice(lastAt + 1, cursor);
                setQuery(newQuery);
                setIsOpen(true);
                setTargetThreadId(threadId);

                // Calculate position based on cursor location
                const rect = range.getBoundingClientRect();
                const windowHeight = window.innerHeight;

                // Set precise fixed coordinates
                if (rect.top > windowHeight / 2) {
                    setMentionPosition('top');
                    setMentionCoords({ top: rect.top, left: rect.left });
                } else {
                    setMentionPosition('bottom');
                    setMentionCoords({ top: rect.bottom, left: rect.left });
                }
            } else {
                setIsOpen(false);
                setTargetThreadId(null);
            }
        } else {
            setIsOpen(false);
            setTargetThreadId(null);
        }
    }, []);

    const insertMention = useCallback((candidate: MentionCandidate, inputEl: HTMLDivElement) => {
        inputEl.focus();
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const node = range.startContainer;

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            const cursor = range.startOffset;
            const lastAt = text.lastIndexOf('@', cursor - 1);

            if (lastAt !== -1) {
                const before = text.slice(0, lastAt);
                const after = text.slice(cursor);

                const beforeNode = document.createTextNode(before);
                const mentionSpan = document.createElement('span');
                mentionSpan.className = 'mention';
                mentionSpan.contentEditable = 'false';
                mentionSpan.innerText = `@${candidate.display}`;
                const spaceNode = document.createTextNode('\u00A0'); // nbsp
                const afterNode = document.createTextNode(after);

                const parent = node.parentNode;
                if (parent) {
                    parent.insertBefore(beforeNode, node);
                    parent.insertBefore(mentionSpan, node);
                    parent.insertBefore(spaceNode, node);
                    parent.insertBefore(afterNode, node);
                    parent.removeChild(node);

                    // Move cursor after space
                    const newRange = document.createRange();
                    newRange.setStart(spaceNode, 1);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }
            }
        }
        setIsOpen(false);
        setTargetThreadId(null);
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent, threadId: string, inputEl: HTMLDivElement) => {
        if (!isOpen || targetThreadId !== threadId) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev + 1) % candidates.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev - 1 + candidates.length) % candidates.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (candidates[activeIndex]) {
                insertMention(candidates[activeIndex], inputEl);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    }, [isOpen, targetThreadId, candidates, activeIndex, insertMention]);

    return {
        isOpen,
        candidates,
        activeIndex,
        targetThreadId,
        mentionPosition,
        mentionCoords,
        handleInput,
        handleKeyDown,
        insertMention: (candidate: MentionCandidate, inputEl: HTMLDivElement) => insertMention(candidate, inputEl),
        close: () => setIsOpen(false)
    };
};
