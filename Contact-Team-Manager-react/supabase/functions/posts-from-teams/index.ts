import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Authorization チェック（Bearer <ANON_KEY> or SERVICE_ROLE_KEY）
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body: {
    team_id: string;       // Contact TM チームUUID
    source_name?: string;  // Teams メッセージ件名
    message_body: string;  // Teamsメッセージ本文
    sender_email: string;  // 送信者メール（profilesと照合）
    sender_name?: string;  // 送信者表示名（profilesに一致しない場合のフォールバック）
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { team_id, source_name, message_body, sender_email, sender_name } = body;

  if (!team_id || !message_body || !sender_email) {
    return new Response(
      JSON.stringify({ error: 'team_id, message_body, sender_email are required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 送信者メールからプロフィールを検索
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .eq('email', sender_email.toLowerCase())
    .maybeSingle();

  // HTMLタグを除去（Teamsメッセージ本文はHTMLを含む場合がある）
  const cleanBody = message_body
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/@add\s+thread\s*/gi, '')  // @add thread タグメンションを除去
    .trim();

  // 投稿者名：profilesに一致すれば表示名、なければsender_name、最終的にメール
  const authorName = profile?.display_name ?? sender_name ?? sender_email;

  // スレッドタイトル：件名があればそのまま使用、なければ送信者名
  const title = source_name?.trim()
    ? source_name.trim()
    : `[Teams] ${authorName}`;

  const { error: insertError } = await supabase.from('threads').insert({
    team_id,
    title,
    content: cleanBody,
    author: authorName,
    user_id: profile?.id ?? null,
    status: 'pending',
  });

  if (insertError) {
    console.error('Insert error:', insertError);
    return new Response(JSON.stringify({ error: insertError.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, title }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
