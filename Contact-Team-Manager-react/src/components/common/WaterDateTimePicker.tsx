import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface WaterDateTimePickerProps {
    value: string;          // "YYYY-MM-DDTHH:mm" format
    onChange: (value: string) => void;
    disabled?: boolean;
    title?: string;
    className?: string;
    style?: React.CSSProperties;
}

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const GlassTimeSelect = ({ value, options, onChange, pad }: { value: number, options: number[], onChange: (v: number) => void, pad?: boolean }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    // Scrolls to the selected value automatically when opened
    useEffect(() => {
        if (open && ref.current) {
            const dropdown = ref.current.querySelector('.glass-time-dropdown') as HTMLDivElement;
            const selected = ref.current.querySelector('.glass-time-option-selected') as HTMLDivElement;
            if (dropdown && selected) {
                dropdown.scrollTop = selected.offsetTop - dropdown.clientHeight / 2 + selected.clientHeight / 2;
            }
        }
    }, [open]);

    return (
        <div ref={ref} style={{ position: 'relative', width: '60px' }}>
            <div 
                className="water-dtp-time-input glass-input-liquid"
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: 0, padding: '4px', width: '100%' }}
                onClick={() => setOpen(!open)}
            >
                {pad ? String(value).padStart(2, '0') : value}
            </div>
            {open && (
                <div 
                    className="glass-time-dropdown"
                    style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(150deg, rgba(20, 40, 80, 0.95), rgba(10, 20, 55, 0.98))',
                        backdropFilter: 'blur(32px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                        border: '1px solid rgba(160, 215, 255, 0.4)',
                        borderTop: '1px solid rgba(255, 255, 255, 0.5)',
                        borderRadius: '12px',
                        boxShadow: '0 -8px 24px rgba(0, 5, 25, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
                        width: '68px',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        zIndex: 100000000,
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '4px',
                        scrollbarWidth: 'none', // Firefox
                    }}
                >
                    {options.map((opt) => (
                        <div 
                            key={opt}
                            className={opt === value ? 'glass-time-option-selected' : ''}
                            style={{
                                padding: '6px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                color: opt === value ? '#ffffff' : 'rgba(210, 238, 255, 0.8)',
                                background: opt === value ? 'rgba(100, 180, 255, 0.35)' : 'transparent',
                                borderRadius: '6px',
                                transition: 'all 0.15s',
                                fontWeight: opt === value ? 'bold' : 'normal',
                            }}
                            onMouseEnter={(e) => {
                                if (opt !== value) e.currentTarget.style.background = 'rgba(100, 180, 255, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                                if (opt !== value) e.currentTarget.style.background = 'transparent';
                            }}
                            onClick={() => {
                                onChange(opt);
                                setOpen(false);
                            }}
                        >
                            {pad ? String(opt).padStart(2, '0') : opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

function formatDisplay(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}年${m}月${day}日 ${h}:${min}`;
}

function toLocalDateTimeString(date: Date, hour: number, minute: number): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(hour).padStart(2, '0');
    const min = String(minute).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
}

function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 1).getDay();
}

export function WaterDateTimePicker({
    value, onChange, disabled, title, className, style
}: WaterDateTimePickerProps) {
    const today = new Date();

    const parseValue = () => {
        if (!value) return null;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    };

    const parsed = parseValue();
    const [open, setOpen] = useState(false);
    const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
    const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());
    const [selDate, setSelDate] = useState<Date | null>(parsed);
    const [hour, setHour] = useState(parsed?.getHours() ?? 9);
    const [minute, setMinute] = useState(parsed?.getMinutes() ?? 0);
    // position: fixed でオーバーフロー回避
    const [panelPos, setPanelPos] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef  = useRef<HTMLDivElement>(null);

    // パネルの位置を計算（overflow:hidden を回避するため fixed を使う）
    const calcPosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const panelH = 340; // 推定高さ
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        const panelW = 260; // パネルの幅
        let left = rect.left;
        if (left + panelW > window.innerWidth) {
            left = Math.max(10, window.innerWidth - panelW - 10);
        }

        if (spaceAbove > panelH || spaceAbove > spaceBelow) {
            // 上に開く（top は明示的に auto にして CSS の残存を無効化）
            setPanelPos({ top: 'auto', bottom: `${window.innerHeight - rect.top + 6}px`, left: `${left}px`, right: 'auto' });
        } else {
            // 下に開く（bottom は明示的に auto にして CSS の残存を無効化）
            setPanelPos({ top: `${rect.bottom + 6}px`, bottom: 'auto', left: `${left}px`, right: 'auto' });
        }
    }, []);

    // 外クリックで閉じる
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                panelRef.current && !panelRef.current.contains(e.target as Node) &&
                triggerRef.current && !triggerRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // value が外部から変わったとき同期
    useEffect(() => {
        const p = parseValue();
        setSelDate(p);
        if (p) {
            setViewYear(p.getFullYear());
            setViewMonth(p.getMonth());
            setHour(p.getHours());
            setMinute(p.getMinutes());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleOpen = () => {
        if (disabled) return;
        if (!open) {
            calcPosition();
            setOpen(true);
        } else {
            setOpen(false);
        }
    };

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };

    const selectDay = (day: number) => {
        const d = new Date(viewYear, viewMonth, day);
        setSelDate(d);
        onChange(toLocalDateTimeString(d, hour, minute));
    };

    const handleHour = (v: number) => {
        const h = Math.max(0, Math.min(23, v));
        setHour(h);
        if (selDate) onChange(toLocalDateTimeString(selDate, h, minute));
    };

    const handleMinute = (v: number) => {
        const min = Math.max(0, Math.min(59, v));
        setMinute(min);
        if (selDate) onChange(toLocalDateTimeString(selDate, hour, min));
    };

    const goToday = () => {
        setViewYear(today.getFullYear());
        setViewMonth(today.getMonth());
        setSelDate(today);
        onChange(toLocalDateTimeString(today, hour, minute));
    };

    const clear = () => {
        setSelDate(null);
        onChange('');
        setOpen(false);
    };

    // カレンダーグリッド生成
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const isToday = (day: number) =>
        day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const isSelected = (day: number) =>
        selDate !== null &&
        day === selDate.getDate() && viewMonth === selDate.getMonth() && viewYear === selDate.getFullYear();

    return (
        <div
            className={`water-dtp-root ${className ?? ''}`}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}
            title={title}
        >
            {/* トリガー */}
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={handleOpen}
                className="water-dtp-trigger"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', flexShrink: 0 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span className="water-dtp-display">
                    {value ? formatDisplay(value) : <span className="water-dtp-placeholder">年/月/日 --:--</span>}
                </span>
            </button>

            {/* ピッカーパネル — React Portal でドキュメントルートに直接描画 */}
            {open && createPortal(
                <div
                    ref={panelRef}
                    className="water-dtp-panel"
                    style={{ position: 'fixed', zIndex: 99999999, width: '260px', ...panelPos }}
                >
                    {/* ヘッダー */}
                    <div className="water-dtp-header">
                        <button type="button" className="water-dtp-nav" onClick={prevMonth}>‹</button>
                        <span className="water-dtp-month-label">
                            {viewYear}年 {MONTHS[viewMonth]}
                        </span>
                        <button type="button" className="water-dtp-nav" onClick={nextMonth}>›</button>
                    </div>

                    {/* グリッド */}
                    <div className="water-dtp-grid">
                        {DAYS.map(d => (
                            <div key={d} className={`water-dtp-weekday ${d === '日' ? 'sun' : d === '土' ? 'sat' : ''}`}>{d}</div>
                        ))}
                        {cells.map((day, i) => (
                            <button
                                key={i}
                                type="button"
                                disabled={!day}
                                onClick={() => day && selectDay(day)}
                                className={[
                                    'water-dtp-day',
                                    day && isToday(day)     ? 'today'    : '',
                                    day && isSelected(day)  ? 'selected' : '',
                                    !day                    ? 'empty'    : '',
                                    day && (i % 7 === 0)    ? 'sun'      : '',
                                    day && (i % 7 === 6)    ? 'sat'      : '',
                                ].filter(Boolean).join(' ')}
                            >
                                {day ?? ''}
                            </button>
                        ))}
                    </div>

                    {/* 時刻 */}
                    <div className="water-dtp-time" style={{ justifyContent: 'center', gap: '8px' }}>
                        <span className="water-dtp-time-label" style={{ marginRight: '8px' }}>時刻</span>
                        <GlassTimeSelect 
                            value={hour} 
                            options={Array.from({length: 24}, (_, i) => i)} 
                            onChange={handleHour} 
                            pad 
                        />
                        <span className="water-dtp-time-sep" style={{ fontWeight: 'bold', color: 'rgba(210, 238, 255, 0.9)' }}>:</span>
                        <GlassTimeSelect 
                            value={minute} 
                            options={Array.from({length: 12}, (_, i) => i * 5)} 
                            onChange={handleMinute} 
                            pad 
                        />
                    </div>

                    {/* フッター */}
                    <div className="water-dtp-footer">
                        <button type="button" className="water-dtp-btn-clear" onClick={clear}>削除</button>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button type="button" className="water-dtp-btn-today" onClick={goToday}>今日</button>
                            <button type="button" className="water-dtp-btn-confirm" onClick={() => setOpen(false)}>確定</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
