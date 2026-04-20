// Supabase REST API への raw fetch ヘルパー
// supabase-js の getSession() が Web Lock でハングする問題を回避するため
// Bearer token を直接付与して fetch する。

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const restFetch = async (method, path, token, body = undefined, extraHeaders = {}) => {
  const headers = {
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
    ...extraHeaders,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`${method} ${path}: ${res.status} ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};
