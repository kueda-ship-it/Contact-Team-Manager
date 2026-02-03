import { useState } from 'react';
import type { Column, Employee } from '../db';
import { cn } from '../lib/utils';
import { Trash2, ChevronUp, ChevronDown, Edit3 } from 'lucide-react';

interface DataTableProps {
    columns: Column[];
    data: Employee[];
    onEdit: (employee: Employee) => void;
    onDelete: (id: number) => void;
    onInlineEdit: (id: number, key: string, value: any) => void;
    sortConfig: { key: string, direction: 'asc' | 'desc' } | null;
    onSort: (key: string) => void;
}

export function DataTable({ columns, data, onEdit, onDelete, onInlineEdit, sortConfig, onSort }: DataTableProps) {
    const visibleColumns = columns.filter(c => c.isVisible).sort((a, b) => a.order - b.order);
    const [editingCell, setEditingCell] = useState<{ id: number, key: string } | null>(null);

    return (
        <div className="relative overflow-hidden bg-[#1a1b1e]">
            <div className="overflow-x-auto overflow-y-auto max-h-[75vh] custom-scrollbar border-t border-slate-800">
                <table className="w-full text-sm text-left text-slate-400 border-separate border-spacing-0">
                    <thead className="sticky top-0 z-30">
                        <tr className="bg-[#2b2d31]/90 backdrop-blur-xl">
                            {visibleColumns.map((col, index) => {
                                const isSticky = index < 2;
                                const isSorted = sortConfig?.key === col.key;
                                return (
                                    <th
                                        key={col.id || col.key}
                                        onClick={() => onSort(col.key)}
                                        className={cn(
                                            "px-6 py-5 font-bold text-slate-200 uppercase tracking-tighter border-b border-slate-800 cursor-pointer select-none transition-colors hover:bg-slate-800/50",
                                            isSticky && "sticky left-0 z-40 bg-[#2b2d31]/95 shadow-[1px_0_0_0_rgba(255,255,255,0.06)]",
                                            index === 1 && "left-[80px]"
                                        )}
                                        style={index === 1 ? { left: '72px' } : {}}
                                    >
                                        <div className="flex items-center gap-2">
                                            {col.label}
                                            <div className="flex flex-col">
                                                <ChevronUp className={cn("w-3 h-3 -mb-1", isSorted && sortConfig.direction === 'asc' ? "text-blue-500" : "text-slate-600")} />
                                                <ChevronDown className={cn("w-3 h-3", isSorted && sortConfig.direction === 'desc' ? "text-blue-500" : "text-slate-600")} />
                                            </div>
                                        </div>
                                    </th>
                                );
                            })}
                            <th className="px-6 py-5 sticky right-0 z-40 bg-[#2b2d31]/95 backdrop-blur-md font-bold text-slate-200 border-b border-slate-800 shadow-[-1px_0_0_0_rgba(255,255,255,0.06)] text-center">
                                操作
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {data.map((row) => (
                            <tr
                                key={row.id}
                                className="group hover:bg-blue-500/5 transition-all duration-200"
                            >
                                {visibleColumns.map((col, index) => {
                                    const isSticky = index < 2;
                                    const isEditing = editingCell?.id === row.id && editingCell?.key === col.key;

                                    return (
                                        <td
                                            key={`${row.id}-${col.key}`}
                                            className={cn(
                                                "px-6 py-4 whitespace-nowrap transition-colors",
                                                isSticky && "sticky left-0 z-20 bg-[#1a1b1e] group-hover:bg-[#1e2024] shadow-[1px_0_0_0_rgba(255,255,255,0.04)]",
                                                index === 1 && "left-[80px]"
                                            )}
                                            style={index === 1 ? { left: '72px' } : {}}
                                            onClick={() => setEditingCell({ id: row.id!, key: col.key })}
                                        >
                                            {isEditing ? (
                                                <input
                                                    autoFocus
                                                    className="w-full px-2 py-1 bg-[#2b2d31] border-2 border-blue-500 rounded outline-none shadow-sm text-slate-100"
                                                    value={row[col.key] || ""}
                                                    onChange={(e) => onInlineEdit(row.id!, col.key, e.target.value)}
                                                    onBlur={() => setEditingCell(null)}
                                                    onKeyDown={(e) => e.key === 'Enter' && setEditingCell(null)}
                                                />
                                            ) : (
                                                <div className="flex items-center gap-2 group/cell">
                                                    <span className={cn(
                                                        "text-slate-300 font-medium",
                                                        col.key === 'Leader' && row[col.key] && "px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 text-[10px] font-black",
                                                        col.key === 'Group' && row[col.key] && "px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-black"
                                                    )}>
                                                        {row[col.key] || "-"}
                                                    </span>
                                                    <Edit3 className="w-3 h-3 text-slate-600 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                                <td className="px-6 py-4 sticky right-0 z-20 bg-[#1a1b1e] group-hover:bg-[#1e2024] transition-colors shadow-[-1px_0_0_0_rgba(255,255,255,0.04)]">
                                    <div className="flex items-center justify-center gap-4">
                                        <button
                                            onClick={() => onEdit(row)}
                                            className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all"
                                            title="詳しく編集"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => row.id && onDelete(row.id)}
                                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                            title="削除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.length === 0 && (
                <div className="py-24 text-center bg-slate-900/10">
                    <div className="inline-block p-6 bg-[#2b2d31] rounded-3xl shadow-sm border border-slate-800">
                        <p className="text-xl font-black text-slate-200">名簿データがありません</p>
                        <p className="text-slate-500 mt-2 text-sm">右上のインポートボタンからCSVを読み込みましょう</p>
                    </div>
                </div>
            )}
        </div>
    );
}
