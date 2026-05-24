import { createClient } from '@supabase/supabase-js';

// Supabase configuration
// TODO: Move these to environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        // navigator.locks の競合 (AbortError: Lock broken by another request with the 'steal' option) を回避
        // 複数タブやリロード時のセッション管理におけるデッドロック・競合を、ロック機構をパススルーすることで防ぎます
        lock: async (_name, _acquireTimeout, fn) => {
            return await fn();
        }
    }
});
