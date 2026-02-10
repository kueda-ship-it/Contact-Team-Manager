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
    id: number;
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
 * Replace mention syntax with styled spans
 */
export function highlightMentions(text: string | null, options: HighlightMentionsOptions): string {
    if (!text) return '';

    let highlighted = text;

    // Profiles (@DisplayName)
    options.allProfiles.forEach(p => {
        if (!p.display_name) return;
        const mentionText = `@${p.display_name}`;
        const escapedMention = mentionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedMention, 'g');
        const isSelf = p.email === options.currentUserEmail;
        const className = isSelf ? 'mention mention-me' : 'mention';
        highlighted = highlighted.replace(regex, `<span class="${className}">${mentionText}</span>`);
    });

    // @all
    const allRegex = /@all/g;
    highlighted = highlighted.replace(allRegex, '<span class="mention mention-all">@all</span>');

    // Tags (#TagName)
    options.allTags.forEach(t => {
        const mentionText = `#${t.name}`;
        const escapedMention = mentionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedMention, 'g');
        highlighted = highlighted.replace(regex, `<span class="mention mention-tag">${mentionText}</span>`);
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
