import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
    // CORS header for preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    try {
        const { to, cc, subject, body, from } = await req.json()

        console.log('[handle-inbound-email] Received email from:', from)
        console.log('[handle-inbound-email] To:', to)

        // --- 条件フィルタ ---
        // 1. k_ueda@fts.co.jp が To または CC に「含まれない」ことを確認 (BCC受信の判定)
        const myAddress = 'k_ueda@fts.co.jp'
        const toLower = (to || '').toLowerCase()
        const ccLower = (cc || '').toLowerCase()

        const isBccForMe = !toLower.includes(myAddress) && !ccLower.includes(myAddress)

        if (!isBccForMe) {
            console.log('[handle-inbound-email] Ignored: recipient is in To/CC (Expected BCC only)')
            return new Response('Ignored: recipient is in To/CC (Expected BCC only)', { status: 200 })
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 2. 「To」フィールドに含まれるアドレスの中に、チームの投稿用アドレスがあるか探す
        // ブラケット形式 (Name <email@example.com>) からも抽出できるように正規表現を使用
        const emailRegex = /<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
        const toRecipients: string[] = [];
        let match;
        while ((match = emailRegex.exec(toLower)) !== null) {
            const email = (match[1] || match[2]).trim().toLowerCase();
            toRecipients.push(email);
        }

        console.log('[handle-inbound-email] Normalized recipients:', toRecipients)

        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('id, name')
            .in('email_address', toRecipients)
            .maybeSingle()

        if (teamError) {
            console.error('[handle-inbound-email] Team lookup error:', teamError)
            throw teamError
        }

        if (!team) {
            console.log('[handle-inbound-email] No matching team found for recipients:', toRecipients)
            return new Response('No matching team found in the To field', { status: 404 })
        }

        // 3. スレッドを作成
        const { error: insertError } = await supabase
            .from('threads')
            .insert({
                team_id: team.id,
                title: subject || '(No Subject)',
                content: body || '(No Content)',
                status: 'pending',
                user_id: '00000000-0000-0000-0000-000000000000' // システムアカウント（profilesテーブルに存在することを確認）
            })

        if (insertError) {
            console.error('[handle-inbound-email] Thread creation error:', insertError)
            throw insertError
        }

        console.log('[handle-inbound-email] Success! Thread created for team:', team.name)

        return new Response(JSON.stringify({ success: true, team: team.name }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        })

    } catch (error: any) {
        console.error('[handle-inbound-email] Unexpected error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        })
    }
})
