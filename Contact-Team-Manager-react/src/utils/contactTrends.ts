// 連絡スレッド本文のルールベース分類（傾向ダッシュボード用）。
// DB にカテゴリ/方向カラムは無いため、title + content の文言から推定する。

export type ContactCategory =
    | '通信・障害'
    | '荷物・保管'
    | '解錠・鍵'
    | '点検'
    | '案内対応'
    | 'FC対応'
    | '連絡・対応依頼'
    | 'その他';

export const CATEGORY_ORDER: ContactCategory[] = [
    '通信・障害',
    '荷物・保管',
    '解錠・鍵',
    '点検',
    '案内対応',
    'FC対応',
    '連絡・対応依頼',
    'その他',
];

export const CATEGORY_COLORS: Record<ContactCategory, string> = {
    '案内対応': '#60a5fa',
    'FC対応': '#f97316',
    '荷物・保管': '#34d399',
    '通信・障害': '#fbbf24',
    '点検': '#a78bfa',
    '解錠・鍵': '#f472b6',
    '連絡・対応依頼': '#38bdf8',
    'その他': '#9ca3af',
};

export function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

// 特定度の高いものから順に判定する（1スレッド = 1カテゴリ）
const CATEGORY_RULES: { category: ContactCategory; pattern: RegExp }[] = [
    { category: '通信・障害', pattern: /通信|障害|復旧|エラー|不具合|通報|使えない|故障/ },
    { category: '荷物・保管', pattern: /荷物|保管|着払い|延滞|入庫|破棄|返送|発送/ },
    { category: '解錠・鍵', pattern: /解錠|施錠|鍵|カギ/ },
    { category: '点検', pattern: /点検/ },
    { category: '案内対応', pattern: /案内/ },
    { category: 'FC対応', pattern: /FC|ＦＣ/ },
    { category: '連絡・対応依頼', pattern: /連絡|対応|確認|依頼/ },
];

export function classifyCategory(text: string): ContactCategory {
    for (const rule of CATEGORY_RULES) {
        if (rule.pattern.test(text)) return rule.category;
    }
    return 'その他';
}

const INBOUND_PATTERN =
    /(より|から)(連絡|TEL|電話|メール|入電|通報|申し出)|連絡あり|連絡有|TEL有|入電|通報あり|とのこと|との事|問い?合わ?せ|申し出あり/;

const OUTBOUND_REQUEST_PATTERN =
    /お願い(します|いたします|致します)|願います|折り?返し|折返|架電|かけ直|発信|ご案内ください/;

// 受電起点（〜より連絡あり 等）/ 架電・対応依頼（〜お願いします 等）の推定。
// 1スレッドが両方に該当し得る（受電内容を書いて架電を依頼するパターンが典型）。
export function detectDirection(text: string): { inbound: boolean; outboundRequest: boolean } {
    return {
        inbound: INBOUND_PATTERN.test(text),
        outboundRequest: OUTBOUND_REQUEST_PATTERN.test(text),
    };
}

export function medianMs(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
