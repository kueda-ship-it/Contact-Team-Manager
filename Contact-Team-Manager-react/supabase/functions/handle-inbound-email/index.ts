import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
    // CORS header for preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    try {
        const { to, cc, bcc, categories, subject, body, from } = await req.json()

        console.log('[handle-inbound-email] Received email from:', from)
        console.log('[handle-inbound-email] To:', to)
        console.log('[handle-inbound-email] Cc:', cc)
        console.log('[handle-inbound-email] Bcc:', bcc)

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // --- 受信者判定 ---
        // メールのテキストから正式なメールアドレスのみを抽出する補助関数
        const extractEmails = (str: string | any) => {
            if (!str) return []
            let text = '';
            if (typeof str === 'string') {
                text = str;
            } else if (Array.isArray(str)) {
                text = str.join(', ');
            } else if (typeof str === 'object') {
                text = JSON.stringify(str);
            }
            
            // Slightly more robust regex
            const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
            // Use Set to unique and normalize
            return matches ? Array.from(new Set(matches.map(m => m.toLowerCase().trim()))) : []
        }

        const toEmails = extractEmails(to)
        const bccEmails = extractEmails(bcc)
        const ccEmails = extractEmails(cc)

        console.log('[handle-inbound-email] Extracted Emails:', {
            to: toEmails,
            cc: ccEmails,
            bcc: bccEmails
        })
        console.log('[handle-inbound-email] Categories:', categories)

        // --- 判定ロジック ---
        // カテゴリー（Outlook分類項目）に "スレッド投稿" が含まれているか確認
        const categoriesStr = (categories || '').toString().toLowerCase()
        const hasTriggerCategory = categoriesStr.includes('スレッド投稿')

        let commonRecipients: string[] = []

        if (hasTriggerCategory) {
            // カテゴリーがある場合：To, Cc, Bcc のいずれかにチームアドレスがあればOK
            console.log('[handle-inbound-email] Trigger category found. Checking all recipients.')
            commonRecipients = Array.from(new Set([...toEmails, ...ccEmails, ...bccEmails]))
        } else {
            // カテゴリーがない場合：従来通り To と Bcc の両方に含まれている場合のみ
            console.log('[handle-inbound-email] No trigger category. Checking To & Bcc strict match.')
            commonRecipients = toEmails.filter((addr: string) => bccEmails.includes(addr))
        }

        console.log('[handle-inbound-email] Final candidate recipients:', commonRecipients)

        if (commonRecipients.length === 0) {
            const reason = hasTriggerCategory 
                ? 'No team address found in any recipient field' 
                : 'No overlapping address between To and Bcc fields';
            
            console.log(`[handle-inbound-email] Ignored: ${reason}`)
            return new Response(JSON.stringify({ 
                success: false, 
                message: `Ignored: ${reason}`,
                extracted: { to: toEmails, bcc: bccEmails, cc: ccEmails },
                categories: categoriesStr
            }), { 
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            })
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
