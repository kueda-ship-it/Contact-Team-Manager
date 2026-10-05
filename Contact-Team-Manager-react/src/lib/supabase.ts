import { createClient } from '@supabase/supabase-js';

// Supabase configuration
// TODO: Move these to environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// 書き込み（PostgREST への GET/HEAD 以外）は 15 秒で打ち切る。
// supabase-js は既定でタイムアウトを持たず、回線が詰まると「送信中…」のまま永久に待ち続ける
// （Knowledge-DB で 2 回起きた入力不能ハング）。呼び出し 100 箇所超を個別に包む代わりに、
// クライアントの fetch 1 箇所で掛ける。打ち切られた呼び出しは { error } で返るので、
// 各画面の既存のエラー処理（アラート・ロールバック）がそのまま動く。
// 読み取り・Storage のアップロード・Edge Functions は対象外（大きいファイルや長い処理を止めないため）。
const WRITE_TIMEOUT_MS = 15_000;

const fetchWithWriteTimeout: typeof fetch = (input, init) => {
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (method === 'GET' || method === 'HEAD' || !url.includes('/rest/v1/')) {
        return fetch(input, init);
    }
    // AbortSignal.timeout / any が無い古いブラウザ（Safari 17.4 未満）でも動くよう、自前の controller で組む
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('書き込みが 15 秒以内に終わりませんでした', 'TimeoutError')), WRITE_TIMEOUT_MS);
    const outer = init?.signal;
    if (outer) {
        if (outer.aborted) controller.abort(outer.reason);
        else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
    }
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: fetchWithWriteTimeout },
    auth: {
        // navigator.locks の競合 (AbortError: Lock broken by another request with the 'steal' option) を回避
        // 複数タブやリロード時のセッション管理におけるデッドロック・競合を、ロック機構をパススルーすることで防ぎます
        lock: async (_name, _acquireTimeout, fn) => {
            return await fn();
        }
    }
});
