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

        // --- 受信者判定 ---
        // 「To」フィールドに含まれる、かつ「Bcc」フィールドにも含まれるチームのアドレスを探す
        const toRecipients = (to || '').toLowerCase().split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0)
        const bccRecipients = (bcc || '').toLowerCase().split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0)

        // 両方のフィールドに存在するアドレスのみを抽出
        const commonRecipients = toRecipients.filter((addr: string) => bccRecipients.includes(addr))

        console.log('[handle-inbound-email] Recipients in both To & Bcc:', commonRecipients)

        if (commonRecipients.length === 0) {
            console.log('[handle-inbound-email] Ignored: No team address found in BOTH To and Bcc fields')
            return new Response('Ignored: Team address must be in both To and Bcc fields', { status: 200 })
        }

        // チームを検索
        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('id, name')
            .in('email_address', commonRecipients)
            .maybeSingle()

        if (teamError) {
            console.error('[handle-inbound-email] Team lookup error:', teamError)
            throw teamError
        }

        if (!team) {
            console.log('[handle-inbound-email] No matching team found in common recipients:', commonRecipients)
            return new Response('No matching team found for the common recipients', { status: 404 })
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
