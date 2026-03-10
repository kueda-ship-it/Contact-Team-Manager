import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
    // CORS header for preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    try {
        const { to, cc, bcc, subject, body, from } = await req.json()

        console.log('[handle-inbound-email] Received email from:', from)
        console.log('[handle-inbound-email] To:', to)
        console.log('[handle-inbound-email] Cc:', cc)
        console.log('[handle-inbound-email] Bcc:', bcc)

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // --- 受信者リストの作成 ---
        // To, Cc, Bcc のすべてのアドレスをマージしてチームを検索する
        const recipients = [
            ...(to || '').toLowerCase().split(','),
            ...(cc || '').toLowerCase().split(','),
            ...(bcc || '').toLowerCase().split(',')
        ].map(e => e.trim()).filter(e => e.length > 0)

        console.log('[handle-inbound-email] All recipients:', recipients)

        // チームを検索
        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('id, name')
            .in('email_address', recipients)
            .maybeSingle()

        if (teamError) {
            console.error('[handle-inbound-email] Team lookup error:', teamError)
            throw teamError
        }

        if (!team) {
            console.log('[handle-inbound-email] No matching team found for recipients:', recipients)
            return new Response('No matching team found for the recipients', { status: 404 })
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
