import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

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
                // Use Supabase Edge Function to fetch link preview (avoids CORS)
                const { data, error: invokeError } = await supabase.functions.invoke('get-link-preview', {
                    body: { url }
                });
                
                if (invokeError) throw invokeError;
                if (!isMounted) return;

                if (data && (data.title || data.description)) {
                    setPreview({
                        title: data.title ?? undefined,
                        description: data.description ?? undefined,
                        image: data.image ?? undefined,
                        url,
                        siteName: data.siteName ?? undefined
                    });
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
