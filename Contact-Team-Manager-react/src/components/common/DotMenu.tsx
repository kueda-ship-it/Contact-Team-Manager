import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DotMenuProps {
    open: boolean;
    onTriggerClick: (e: React.MouseEvent) => void;
    onClose: () => void;
    children: React.ReactNode;
    containerStyle?: React.CSSProperties;
}

const MENU_WIDTH = 180;

export const DotMenu: React.FC<DotMenuProps> = ({
    open,
    onTriggerClick,
    onClose,
    children,
    containerStyle,
}) => {
    const triggerRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const calcPosition = useCallback(() => {
        const trig = triggerRef.current;
        if (!trig) return;
        const rect = trig.getBoundingClientRect();
        const menuH = menuRef.current?.offsetHeight || 200;
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < menuH + 12 && rect.top > menuH + 12;
        const top = openUp ? rect.top - menuH - 4 : rect.bottom + 4;
        const left = Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, rect.right - MENU_WIDTH));
        setPos({ top, left });
    }, []);

    useLayoutEffect(() => {
        if (open) {
            calcPosition();
        } else {
            setPos(null);
        }
    }, [open, calcPosition]);

    useEffect(() => {
        if (!open) return;
        // NOTE: don't auto-close on scroll. Capture-phase scroll on window fires
        // for any descendant scroll (incl. the focus-induced scroll-into-view
        // triggered by clicking the trigger itself), which closes the menu the
        // instant it opens. Keep the menu pinned via position:fixed and let the
        // user dismiss with an outside click instead.
        const onResize = () => calcPosition();
        const onScroll = () => calcPosition();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('resize', onResize);
        // Listen for scroll only to recompute position so the menu follows the
        // trigger if a sibling scroll container moves under it.
        window.addEventListener('scroll', onScroll, true);
        document.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, calcPosition, onClose]);

    return (
        <div className="dot-menu-container" ref={triggerRef} style={containerStyle}>
            <div className="dot-menu-trigger" onClick={onTriggerClick}>⋮</div>
            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    className="dot-menu dot-menu-open"
                    style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto', width: MENU_WIDTH }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {children}
                </div>,
                document.body
            )}
        </div>
    );
};
