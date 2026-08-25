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

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
const escapeRe = (s: string) => s.replace(ESCAPE_RE, '\\$&');

/** メンション辞書。profiles/tags が変わらない限り作り直さない。
 *
 *  ★以前は「プロフィール1人につき本文を1回走査」していた。在籍204人 x 1画面150本文で
 *    3万回の走査になり、1描画あたり実測 44ms。**1本の交替正規表現にまとめて1回で済ませる。**
 *  ★長い名前から並べる（`@田中` が `@田中太郎` を食わないように）。 */
let dictKey = '';
let dictRe: RegExp | null = null;
let dictCls = new Map<string, string>();

function ensureDict(options: HighlightMentionsOptions) {
    const key = options.allProfiles.map(p => `${p.display_name}|${p.email}`).join(',')
        + '#' + options.allTags.map(t => t.name).join(',')
        + '#' + (options.currentUserEmail || '');
    if (key === dictKey) return;

    const cls = new Map<string, string>();
    options.allTags.forEach(t => {
        if (!t.name) return;
        cls.set(`@${t.name}`, 'mention mention-tag');
        cls.set(`#${t.name}`, 'mention mention-tag');
    });
    options.allProfiles.forEach(p => {
        if (!p.display_name) return;
        cls.set(`@${p.display_name}`, p.email === options.currentUserEmail ? 'mention mention-me' : 'mention');
    });
    cls.set('@all', 'mention mention-all');

    const words = Array.from(cls.keys()).sort((a, b) => b.length - a.length);
    dictRe = words.length ? new RegExp(words.map(escapeRe).join('|'), 'g') : null;
    dictCls = cls;
    dictKey = key;
    resultCache.clear();   // 辞書が変わったら変換結果は無効
}

/** 同じ本文を何度も変換し直さない。再描画のたびに全本文を作り直すのが効いていた。 */
const resultCache = new Map<string, string>();
const CACHE_MAX = 2000;

const URL_RE = /((?:https?|file):\/\/[^\s<]+[^<.,:;"')\s])/g;

// Helper to replace only in text nodes (roughly) by matching outside of tags
const replaceOutsideTags = (str: string, regex: RegExp, replacement: (match: string) => string) =>
    str.replace(/(<(?:"[^"]*"|'[^']*'|[^'">])*>)|([^<]+)/g, (_match, tag, textNode) =>
        tag ? tag : textNode.replace(regex, replacement));

/**
 * Replace mention syntax and URLs with styled spans/links
 */
export function highlightMentions(text: string | null, options: HighlightMentionsOptions): string {
    if (!text) return '';

    ensureDict(options);

    const cached = resultCache.get(text);
    if (cached !== undefined) return cached;

    // 1. URLs
    let highlighted = replaceOutsideTags(text, URL_RE,
        (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="post-link">${url}</a>`);

    // 2. メンション（プロフィール / @all / タグ）を1回の走査でまとめて置換
    if (dictRe) {
        highlighted = replaceOutsideTags(highlighted, dictRe,
            (m) => `<span class="${dictCls.get(m) || 'mention'}">${m}</span>`);
    }

    if (resultCache.size >= CACHE_MAX) resultCache.clear();
    resultCache.set(text, highlighted);
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
