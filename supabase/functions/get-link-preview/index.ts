import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Fetching preview for: ${url}`);
    
    // Fetch target URL with a realistic User-Agent to avoid being blocked
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Parse HTML to extract OGP
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) {
        throw new Error('Failed to parse HTML');
    }

    const getMeta = (name: string) => 
        doc.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
        doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
        doc.querySelector(`meta[property="og:${name}"]`)?.getAttribute('content') ||
        doc.querySelector(`meta[name="twitter:${name}"]`)?.getAttribute('content');

    const title = getMeta('title') || doc.querySelector('title')?.innerText || url;
    const description = getMeta('description');
    const image = getMeta('image');
    const siteName = getMeta('site_name');

    console.log(`Found title: ${title}`);

    return new Response(
      JSON.stringify({
        title,
        description,
        image,
        siteName,
        url
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error(`Error processing request: ${error.message}`);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
