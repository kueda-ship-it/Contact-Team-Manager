import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useState } from 'react';

export interface SidebarItem {
    id: string;
    label: string;
    icon: LucideIcon | string;
    color?: string;
    bg?: string;
    subItems?: {
        id: string;
        label: string;
        icon?: LucideIcon | string;
        badge?: number;
        onClick?: () => void;
    }[];
}

interface SidebarProps {
    items: SidebarItem[];
    activeItemId: string;
    onItemClick: (itemId: string) => void;
    leftOffset?: number;
    width?: number;
    showLabels?: 'always' | 'hover' | 'never';
    logo?: {
        icon: LucideIcon;
        title: string;
        subtitle: string;
    };
    footer?: React.ReactNode;
    onAddClick?: () => void;
    addButtonLabel?: string;
}

export function Sidebar({
    items,
    activeItemId,
    onItemClick,
    leftOffset = 0,
    width = 280,
    showLabels = 'always',
    logo,
    footer,
    onAddClick,
    addButtonLabel = '新規作成'
}: SidebarProps) {
    const isHoverable = showLabels === 'hover';
    const actualWidth = isHoverable ? 72 : width;

    // Manage hover state locally to control expansion
    const [isHovered, setIsHovered] = useState(false);
    const isExpanded = isHovered || !isHoverable;

    return (
        <aside
            className={cn(
                "fixed top-0 bottom-0 bg-[#1E1F22] border-r border-slate-800 flex flex-col z-50 transition-all duration-300",
                isHoverable && "group"
            )}
            style={{
                left: `${leftOffset}px`,
                width: isHoverable && isHovered ? '260px' : `${actualWidth}px`,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Logo */}
            {logo && (
                <div className={cn(
                    "flex items-center transition-all duration-300",
                    isExpanded ? "px-6 py-6 gap-3" : "justify-center py-6"
                )}>
                    <div className="bg-slate-900 text-white p-2.5 rounded-2xl flex-shrink-0">
                        <logo.icon className="w-6 h-6" />
                    </div>
                    {isExpanded && (
                        <div className="transition-opacity duration-300">
                            <h1 className="font-black text-xl tracking-tighter text-slate-200">{logo.title}</h1>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 -mt-1">{logo.subtitle}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Navigation */}
            <nav className={cn("flex-1 px-3 space-y-2 overflow-y-auto no-scrollbar", logo ? "mt-4" : "mt-8")}>
                {items.map((item) => {
                    const isActive = activeItemId === item.id;
                    const IconComponent = typeof item.icon === 'string' ? null : item.icon;
                    const emoji = typeof item.icon === 'string' ? item.icon : null;

                    return (
                        <div key={item.id} className="space-y-1">
                            <button
                                onClick={() => onItemClick(item.id)}
                                className={cn(
                                    "w-full flex items-center rounded-xl transition-all duration-200 group/item",
                                    isExpanded ? "gap-3 px-3 py-2" : "justify-center p-2",
                                    isActive
                                        ? "bg-indigo-600 text-white"
                                        : "text-slate-400 hover:bg-[#2B2D31] hover:text-indigo-400"
                                )}
                            >
                                <div className={cn(
                                    "flex items-center justify-center transition-colors flex-shrink-0",
                                    isExpanded ? "w-6 h-6" : "w-10 h-10 rounded-full bg-[#2B2D31]"
                                )}>
                                    {IconComponent ? (
                                        <IconComponent className="w-5 h-5" />
                                    ) : (
                                        <span className="text-xl">{emoji}</span>
                                    )}
                                </div>
                                {isExpanded && (
                                    <span className="font-bold tracking-tight text-sm whitespace-nowrap overflow-hidden text-ellipsis flex-1 text-left">
                                        {item.label}
                                    </span>
                                )}
                            </button>

                            {/* Sub Items (Only shown when active and expanded) */}
                            {isActive && isExpanded && item.subItems && (
                                <div className="pl-4 space-y-1 animate-fadeIn">
                                    {item.subItems.map(sub => (
                                        <button
                                            key={sub.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                sub.onClick?.();
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#2B2D31] transition-colors group/sub"
                                        >
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <span className="text-slate-500 group-hover/sub:text-indigo-400">
                                                    {typeof sub.icon === 'string' ? sub.icon : (sub.icon && <sub.icon className="w-4 h-4" />) || '#'}
                                                </span>
                                                <span className="text-sm font-medium truncate">{sub.label}</span>
                                            </div>
                                            {sub.badge !== undefined && (
                                                <span className="text-[10px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">
                                                    {sub.badge}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Add Button */}
                {onAddClick && (
                    <button
                        onClick={onAddClick}
                        className={cn(
                            "w-full flex items-center rounded-xl text-slate-400 hover:bg-[#2B2D31] hover:text-indigo-400 transition-all duration-200 mt-4",
                            isExpanded ? "gap-3 px-3 py-2" : "justify-center p-2"
                        )}
                    >
                        <div className={cn(
                            "flex items-center justify-center flex-shrink-0 border-2 border-dashed border-slate-600 rounded-full transition-colors",
                            isExpanded ? "w-6 h-6 border-none" : "w-10 h-10"
                        )}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        {isExpanded && (
                            <span className="font-bold tracking-tight text-sm whitespace-nowrap">
                                {addButtonLabel}
                            </span>
                        )}
                    </button>
                )}
            </nav>

            {/* Footer */}
            {footer && (
                <div className={cn(
                    "border-t border-slate-800 transition-all duration-300",
                    isExpanded ? "p-4" : "p-2"
                )}>
                    {footer}
                </div>
            )}
        </aside>
    );
}
