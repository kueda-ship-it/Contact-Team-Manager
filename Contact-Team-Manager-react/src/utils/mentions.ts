import { cleanText } from '../utils/text';

interface Profile {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    role: 'Admin' | 'Manager' | 'Member' | 'Viewer';
    created_at: string;
    updated_at?: string;
}

interface TagData {
    id: string | number;
    name: string;
    color?: string;
    created_at: string;
}

interface HighlightMentionsOptions {
    allProfiles: Profile[];
    allTags: TagData[];
    currentProfile: Profile | null;
    currentUserEmail: string | null;
}

/**
 * Replace mention syntax and URLs with styled spans/links
 */
export function highlightMentions(text: string | null, options: HighlightMentionsOptions): string {
    if (!text) return '';

    let highlighted = text;

    // Helper to replace only in text nodes (roughly) by matching outside of tags
    const replaceOutsideTags = (str: string, regex: RegExp, replacement: string | ((match: string) => string)) => {
        // Matches HTML tags or content
        return str.replace(/(<(?:"[^"]*"|'[^']*'|[^'">])*>)|([^<]+)/g, (_match, tag, textNode) => {
            if (tag) return tag; // Return tag as is
            if (typeof replacement === 'string') {
                return textNode.replace(regex, replacement);
            }
            return textNode.replace(regex, replacement);
        });
    };

    // 1. URLs
    const urlRegex = /((?:https?|file):\/\/[^\s<]+[^<.,:;"')\s])/g;
    highlighted = replaceOutsideTags(highlighted, urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="post-link">${url}</a>`;
    });

    // 2. Profiles (@DisplayName)
    options.allProfiles.forEach(p => {
        if (!p.display_name) return;
        const mentionText = `@${p.display_name}`;
        const escapedMention = mentionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedMention, 'g');
        const isSelf = p.email === options.currentUserEmail;
        const className = isSelf ? 'mention mention-me' : 'mention';
        highlighted = replaceOutsideTags(highlighted, regex, `<span class="${className}">${mentionText}</span>`);
    });

    // 3. @all
    const allRegex = /@all/g;
    highlighted = replaceOutsideTags(highlighted, allRegex, '<span class="mention mention-all">@all</span>');

    // 4. Tags (@TagName or #TagName)
    options.allTags.forEach(t => {
        const prefixes = ['@', '#'];
        prefixes.forEach(prefix => {
            const mentionText = `${prefix}${t.name}`;
            const escapedMention = mentionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedMention, 'g');
            highlighted = replaceOutsideTags(highlighted, regex, `<span class="mention mention-tag">${mentionText}</span>`);
        });
    });

    return highlighted;
}

/**
 * Check if the current user is mentioned in the text
 */
export function hasMention(text: string | null, currentProfile: Profile | null, currentUserEmail: string | null): boolean {
    if (!text) return false;

    const cleanedText = cleanText(text);

    // Check by display name
    if (currentProfile?.display_name) {
        if (cleanedText.includes(`@${cleanText(currentProfile.display_name)}`)) {
            return true;
        }
    }

    // Check by email
    if (currentUserEmail) {
        if (cleanedText.includes(`@${cleanText(currentUserEmail)}`)) {
            return true;
        }
    }

    return false;
}
