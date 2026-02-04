// Utility functions migrated from original app.js

/**
 * Normalize text for comparison (lowercase, trim, normalize Unicode)
 */
export function cleanText(text: string): string {
    if (!text) return '';
    return text.toLowerCase().trim().normalize('NFC');
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Get plain text from HTML for sidebar display
 * Preserves mention spans while stripping other HTML
 */
export function getPlainTextForSidebar(html: string): string {
    if (!html) return '';
    // Temporarily replace mention spans with markers
    let processed = html.replace(/<span class="mention".*?>(.*?)<\/span>/g, '___MENTION_START___$1___MENTION_END___');
    // Strip other HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processed;
    let plain = tempDiv.innerText || tempDiv.textContent || '';
    // Restore mention spans
    plain = plain.replace(/___MENTION_START___(.*?)___MENTION_END___/g, '<span class="mention">$1</span>');
    return plain;
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

/**
 * Format datetime for display
 */
export function formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
