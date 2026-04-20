import React from 'react';
import type { PresenceStatus } from '../../context/PresenceContext';

type Size = 'sm' | 'md' | 'lg';

interface PresenceDotProps {
    status: PresenceStatus;
    size?: Size;
    /** When rendered inside a positioned container, this places it as a
     *  bottom-right pip on the parent. Set to false to render inline. */
    overlay?: boolean;
    title?: string;
    className?: string;
}

const SIZE_PX: Record<Size, number> = { sm: 8, md: 10, lg: 12 };
const RING_PX: Record<Size, number> = { sm: 2, md: 2, lg: 3 };

// Emerald for online — sharper and more "live" than the generic completed-green
// token. Offline is a solid neutral (not hollow) so the dot always registers.
const STATUS_COLOR: Record<PresenceStatus, string> = {
    online: 'oklch(0.72 0.17 158)',
    away: 'var(--state-warning, #f59e0b)',
    busy: 'var(--state-danger, #ef4444)',
    offline: 'oklch(0.62 0.01 260)',
};

const STATUS_LABEL_JA: Record<PresenceStatus, string> = {
    online: 'オンライン',
    away: '離席中',
    busy: '取り込み中',
    offline: 'オフライン',
};

export const PresenceDot: React.FC<PresenceDotProps> = ({
    status,
    size = 'md',
    overlay = true,
    title,
    className,
}) => {
    const px = SIZE_PX[size];
    const ring = RING_PX[size];
    const bg = STATUS_COLOR[status];

    const style: React.CSSProperties = {
        width: px,
        height: px,
        borderRadius: '50%',
        background: bg,
        boxShadow: `0 0 0 ${ring}px var(--surface-raised)`,
        display: 'inline-block',
        flexShrink: 0,
    };

    if (overlay) {
        style.position = 'absolute';
        style.right = 0;
        style.bottom = 0;
    }

    return (
        <span
            role="img"
            aria-label={title ?? STATUS_LABEL_JA[status]}
            title={title ?? STATUS_LABEL_JA[status]}
            className={className}
            style={style}
        />
    );
};

export const presenceLabelJa = (status: PresenceStatus) => STATUS_LABEL_JA[status];
