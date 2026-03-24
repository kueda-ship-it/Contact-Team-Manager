import React, { useEffect, useState } from 'react';

interface PreviewData {
    title?: string;
    description?: string;
    image?: string;
    url: string;
    siteName?: string;
}

interface LinkPreviewProps {
    url: string;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const fetchPreview = async () => {
            setLoading(true);
            try {
                // Since this is a demo/internal app, we'll try a public fetch proxy or similar 
                // In a production app, this should be a backend call to avoid CORS
                // For now, we'll implement a simple fetching logic and fallback to basic link view
                
                // We'll use a simple proxy for OGP if available, or just try fetching
                // Note: Direct fetch will likely fail CORS for many sites.
                // A better way is using a Supabase Edge Function "get-link-preview"
                
                // For now, let's try a common free service OR just a simplified view
                const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
                const data = await response.json();
                
                if (!isMounted) return;

                if (data.contents) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(data.contents, 'text/html');
                    
                    const getMeta = (name: string) => 
                        doc.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
                        doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content');

                    const title = doc.querySelector('title')?.innerText || getMeta('og:title') || getMeta('twitter:title');
                    const description = getMeta('og:description') || getMeta('description') || getMeta('twitter:description');
                    const image = getMeta('og:image') || getMeta('twitter:image');
                    const siteName = getMeta('og:site_name');

                    if (title || description) {
                        setPreview({
                            title,
                            description,
                            image,
                            url,
                            siteName
                        });
                    } else {
                        setError(true);
                    }
                } else {
                    setError(true);
                }
            } catch (err) {
                console.error('Failed to fetch link preview:', err);
                if (isMounted) setError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchPreview();
        return () => { isMounted = false; };
    }, [url]);

    if (loading) return (
        <div className="link-preview-skeleton" style={{ 
            height: '100px', 
            background: 'rgba(255,255,255,0.05)', 
            borderRadius: '8px', 
            margin: '10px 0',
            animation: 'pulse 1.5s infinite ease-in-out'
        }}></div>
    );

    if (error || !preview) return null;

    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="link-preview-card" style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            overflow: 'hidden',
            margin: '10px 0',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'background 0.2s',
            maxHeight: '120px'
        }}>
            {preview.image && (
                <div className="link-preview-image" style={{
                    width: '120px',
                    minWidth: '120px',
                    height: '120px',
                    backgroundImage: `url(${preview.image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }} />
            )}
            <div className="link-preview-content" style={{
                padding: '12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                flex: 1
            }}>
                {preview.siteName && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--primary-light)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>
                        {preview.siteName}
                    </div>
                )}
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {preview.title}
                </div>
                {preview.description && (
                    <div style={{ fontSize: '0.8rem', opacity: 0.7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {preview.description}
                    </div>
                )}
                <div style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '4px' }}>
                    {new URL(url).hostname}
                </div>
            </div>
        </a>
    );
};
