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

    // Outside-click & ESC close, owned by DotMenu so it works regardless of
    // any other document-level click handlers in the app.
    //
    // Why we need a real ref check (not target.closest('.dot-menu')):
    // - The menu is rendered via React Portal into document.body. React 18
    //   delegates events on the createRoot container (#root), so native clicks
    //   inside the portal don't go through React's bubble path back to the
    //   trigger's React parents — they hit document directly. Any document-
    //   level click listener registered elsewhere in the tree therefore fires
    //   on every menu click, including the one that opened the menu (the
    //   click event finishes bubbling AFTER React's onClick has set state).
    // - We attach a SHORT-LIVED listener only while open, and only consider
    //   it an "outside" click if the target is not contained in trigger or
    //   menu DOM nodes. This is independent of any selector / class names so
    //   it can't be defeated by stale CSS or markup changes.
    useEffect(() => {
        console.log('[DotMenu] useEffect run, open=', open, 'time=', performance.now().toFixed(0));
        if (!open) return;

        let armed = false;
        const armId = window.setTimeout(() => { armed = true; console.log('[DotMenu] ARMED', performance.now().toFixed(0)); }, 0);

        const onPointerDown = (e: PointerEvent | MouseEvent) => {
            const target = e.target as Node | null;
            const inTrigger = !!(target && triggerRef.current?.contains(target));
            const inMenu = !!(target && menuRef.current?.contains(target));
            console.log('[DotMenu] pointerdown', {
                armed, inTrigger, inMenu,
                target: (target as HTMLElement)?.tagName + '.' + (target as HTMLElement)?.className,
                t: performance.now().toFixed(0),
            });
            if (!armed) return;
            if (!target) return;
            if (inTrigger) return;
            if (inMenu) return;
            console.log('[DotMenu] >> onClose() triggered by pointerdown');
            onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { console.log('[DotMenu] >> onClose() triggered by ESC'); onClose(); } };
        const onResize = () => calcPosition();
        const onScroll = () => calcPosition();

        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            console.log('[DotMenu] cleanup, open was', open, 'time=', performance.now().toFixed(0));
            window.clearTimeout(armId);
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll, true);
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
