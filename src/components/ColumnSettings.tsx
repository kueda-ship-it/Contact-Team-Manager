import { useState } from 'react';
import type { Column } from '../db';
import { Modal } from './Modal';
import { Plus, Trash2, Eye, EyeOff, Edit2, Check, X } from 'lucide-react';

interface ColumnSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    columns: Column[];
    onAddColumn: (name: string) => void;
    onUpdateColumn: (id: number, updates: Partial<Column>) => void;
    onToggleVisibility: (col: Column) => void;
    onDeleteColumn: (id: number) => void;
}

export function ColumnSettings({
    isOpen,
    onClose,
    columns,
    onAddColumn,
    onUpdateColumn,
    onToggleVisibility,
    onDeleteColumn
}: ColumnSettingsProps) {
    const [newColumnName, setNewColumnName] = useState('');
    const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
    const [editLabel, setEditLabel] = useState('');

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (newColumnName.trim()) {
            onAddColumn(newColumnName.trim());
            setNewColumnName('');
        }
    };

    const startEditing = (col: Column) => {
        if (!col.id) return;
        setEditingColumnId(col.id);
        setEditLabel(col.label);
    };

    const saveEdit = (id: number) => {
        onUpdateColumn(id, { label: editLabel });
        setEditingColumnId(null);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="表示項目の管理設定">
            <div className="space-y-8 p-1">

                {/* Add New Column */}
                <div className="space-y-3">
                    <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">新しい項目を追加</h3>
                    <form onSubmit={handleAdd} className="flex gap-3">
                        <input
                            type="text"
                            placeholder="項目名を入力 (例: 部署, 役職...)"
                            className="flex-1 px-4 py-3 bg-[#2b2d31] border-2 border-transparent rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-bold placeholder:text-slate-600 text-slate-100 shadow-inner"
                            value={newColumnName}
                            onChange={(e) => setNewColumnName(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={!newColumnName.trim()}
                            className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-900 rounded-xl hover:bg-white disabled:opacity-40 transition-all font-black shadow-lg shadow-slate-900/20 active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            追加
                        </button>
                    </form>
                </div>

                {/* Visible Columns List */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">現在の項目一覧</h3>
                        <span className="text-[10px] font-black px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full tracking-tighter">
                            TOTAL: {columns.length}
                        </span>
                    </div>

                    <div className="space-y-2 max-h-[450px] overflow-y-auto pr-3 custom-scrollbar">
                        {columns.sort((a, b) => a.order - b.order).map((col) => (
                            <div
                                key={col.id}
                                className="group flex items-center justify-between p-4 bg-[#1a1b1e] border-2 border-slate-800 rounded-2xl hover:border-blue-900/50 hover:shadow-xl transition-all duration-300"
                            >
                                <div className="flex items-center gap-4 flex-1">
                                    <button
                                        onClick={() => onToggleVisibility(col)}
                                        className={cn(
                                            "p-2 rounded-xl transition-all shadow-sm",
                                            col.isVisible
                                                ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                                                : "bg-slate-800 text-slate-600 hover:bg-slate-700"
                                        )}
                                        title={col.isVisible ? "非表示にする" : "表示する"}
                                    >
                                        {col.isVisible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                                    </button>

                                    {editingColumnId === col.id ? (
                                        <div className="flex items-center gap-2 flex-1 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <input
                                                autoFocus
                                                type="text"
                                                className="flex-1 px-3 py-1.5 bg-[#2b2d31] border-2 border-blue-500 rounded-lg outline-none font-black text-slate-100"
                                                value={editLabel}
                                                onChange={(e) => setEditLabel(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit(col.id!)}
                                            />
                                            <button onClick={() => saveEdit(col.id!)} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                                                <Check className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => setEditingColumnId(null)} className="p-1.5 text-slate-500 hover:bg-slate-800 rounded-lg transition-colors">
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <span className={cn(
                                                "font-black tracking-tight truncate",
                                                col.isVisible ? "text-slate-200" : "text-slate-600 italic"
                                            )}>
                                                {col.label}
                                            </span>
                                            <button
                                                onClick={() => startEditing(col)}
                                                className="p-1.5 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                                    <button
                                        onClick={() => {
                                            if (col.id && confirm(`項目 "${col.label}" を完全に削除してもよろしいですか？\nこの項目に入力された全てのデータが失われます。`)) {
                                                onDeleteColumn(col.id);
                                            }
                                        }}
                                        className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                        title="削除"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-blue-950/20 p-5 rounded-[1.5rem] border border-blue-900/30">
                    <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest text-center leading-relaxed">
                        項目の名前をクリックして編集したり、<br />
                        目のアイコンで表示・非表示を切り替えられます
                    </p>
                </div>
            </div>
        </Modal>
    );
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
