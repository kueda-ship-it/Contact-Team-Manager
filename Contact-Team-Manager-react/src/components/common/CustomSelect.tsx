import React, { useState, useRef, useEffect } from 'react';

interface Option {
    value: string | number;
    label: React.ReactNode;
}

interface CustomSelectProps {
    options: Option[];
    value: string | number;
    onChange: (value: string | number) => void;
    placeholder?: string;
    style?: React.CSSProperties;
    className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = '選択してください...',
    style,
    className
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [dropUp, setDropUp] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    // 下に 280px の余白が無ければ上向きに開く（モーダル下端で切れるのを防ぐ）
    const toggleOpen = () => {
        const next = !isOpen;
        if (next && triggerRef.current) {
            const r = triggerRef.current.getBoundingClientRect();
            setDropUp(window.innerHeight - r.bottom < 280 && r.top > 280);
        }
        setIsOpen(next);
    };

    const selectedOption = options.find(o => String(o.value).toLowerCase() === String(value).toLowerCase());

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div
            ref={containerRef}
            className={`custom-select-container ${className || ''}`}
            style={{ position: 'relative', width: '200px', ...style }}
        >
            <div
                ref={triggerRef}
                className="input-field custom-select-trigger"
                onClick={toggleOpen}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    margin: 0,
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: style?.borderRadius || '8px'
                }}
            >
                <span style={{ fontSize: '0.95rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                >
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>

            {isOpen && (
                <div className={`custom-select-dropdown ${dropUp ? 'drop-up' : ''}`}>
                    {options.map((option) => (
                        <div
                            key={option.value}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className={`custom-select-option ${String(option.value) === String(value) ? 'selected' : ''}`}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
