// 1000 行を超えうる読み取りを、1000 行ずつ区切って最後まで読む共通処理
// （開発・制作 設計基準 4.2 / M38。原本: app-template src/lib/rawRest.ts の fetchAllPages）。
//
// Supabase（PostgREST）は 1 回に最大 1000 行しか返さず、超えた分はエラーにならず黙って切れる。
// .limit(2000) と書いても 1000 行で止まる。件数が増えうる一覧・集計は必ずこちらを通す。

/** Supabase（PostgREST）が 1 回に返す行数の上限（既定の max-rows） */
export const PAGE_ROWS = 1000;

/** 1 ページずつ読む関数を受け取り、短いページが来るまで最後まで読む */
export async function fetchAllPages<T>(
    fetchPage: (offset: number, limit: number) => Promise<T[]>,
    limit = PAGE_ROWS,
): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; ; offset += limit) {
        const page = await fetchPage(offset, limit);
        all.push(...page);
        if (page.length < limit) return all;
    }
}

/** supabase-js 用。buildPage(from, to) で 1 ページ分のクエリを毎回作り直して返す
 *  （query builder は破壊的に更新されるので使い回せない）。
 *  区切りの間で行がずれないよう、order は一意になる列まで含める（例 created_at desc, id desc）。
 *  エラーは supabase-js の error をそのまま投げる（既存の catch がそのまま動くように）。 */
export function selectAll<T>(
    buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
    return fetchAllPages<T>(async (offset, limit) => {
        const { data, error } = await buildPage(offset, offset + limit - 1);
        if (error) throw error;
        return data || [];
    });
}
