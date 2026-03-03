import React, { useState, useRef, useEffect } from 'react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
    const [startY, setStartY] = useState(0);
    const [currentY, setCurrentY] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const MAX_PULL = 80;
    const THRESHOLD = 60;

    const handleTouchStart = (e: React.TouchEvent) => {
        // スクロールトップが0の時のみプルを許可する
        if (contentRef.current && contentRef.current.scrollTop === 0) {
            setStartY(e.touches[0].clientY);
            setIsPulling(true);
        } else {
            setIsPulling(false);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isPulling || refreshing) return;

        const y = e.touches[0].clientY;
        const diff = y - startY;

        if (diff > 0) {
            // スクロールチェーンを防ぐため、プルダウン操作中は通常スクロールを止める
            if (e.cancelable) {
                e.preventDefault();
            }

            // ダンピング処理で引っ張り具合を重くする
            const dampedDiff = diff < MAX_PULL ? diff : MAX_PULL + (diff - MAX_PULL) * 0.2;
            setCurrentY(dampedDiff);
        }
    };

    const handleTouchEnd = async () => {
        if (!isPulling) return;
        setIsPulling(false);

        if (currentY >= THRESHOLD) {
            setRefreshing(true);
            setCurrentY(50); // スピナー表示位置で固定

            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
                setCurrentY(0);
            }
        } else {
            setCurrentY(0); // 閾値に達していなければ戻す
        }
    };

    // Prevent default scroll behavior on passive touch listeners
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;

        const onTouchMove = (e: TouchEvent) => {
            if (isPulling && currentY > 0) {
                e.preventDefault();
            }
        };

        el.addEventListener('touchmove', onTouchMove, { passive: false });
        return () => {
            el.removeEventListener('touchmove', onTouchMove);
        };
    }, [isPulling, currentY]);

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${MAX_PULL}px`,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    transform: `translateY(${currentY - MAX_PULL}px)`,
                    transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    zIndex: 10,
                    color: 'var(--accent)',
                }}
            >
                {refreshing ? (
                    <svg className="spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                        <line x1="12" y1="2" x2="12" y2="6"></line>
                        <line x1="12" y1="18" x2="12" y2="22"></line>
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                        <line x1="2" y1="12" x2="6" y2="12"></line>
                        <line x1="18" y1="12" x2="22" y2="12"></line>
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                    </svg>
                ) : (
                    <div style={{
                        transform: `rotate(${currentY * 2}deg)`,
                        opacity: currentY / THRESHOLD
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="17 1 21 5 17 9"></polyline>
                            <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                            <polyline points="7 23 3 19 7 15"></polyline>
                            <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                        </svg>
                    </div>
                )}
            </div>

            <div
                ref={contentRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                    width: '100%',
                    height: '100%',
                    overflowY: 'auto',
                    transform: `translateY(${currentY}px)`,
                    transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
                className="pull-to-refresh-content"
            >
                {children}
            </div>
        </div>
    );
};
