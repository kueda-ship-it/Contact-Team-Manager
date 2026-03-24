import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { url } = await req.json()
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[get-link-preview] Fetching: ${url}`)
    
    // Fetch the URL with a basic User-Agent to avoid some bot blocks
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    
    if (!doc) {
      throw new Error('Failed to parse HTML')
    }

    const getMeta = (name: string) => {
      const selectors = [
        `meta[property="og:${name}"]`,
        `meta[name="twitter:${name}"]`,
        `meta[name="${name}"]`,
        `meta[itemprop="${name}"]`
      ]
      for (const selector of selectors) {
        const el = doc.querySelector(selector)
        if (el) {
          const content = el.getAttribute('content')
          if (content) return content
        }
      }
      return null
    }

    // Extract basic info
    const title = getMeta('title') || doc.querySelector('title')?.innerText || ''
    const description = getMeta('description') || ''
    const image = getMeta('image') || ''
    const siteName = getMeta('site_name') || ''

    const result = {
      title: title.trim(),
      description: description.trim(),
      image: image,
      siteName: siteName.trim(),
    }

    console.log(`[get-link-preview] Success: ${result.title}`)

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error(`[get-link-preview] Error: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
