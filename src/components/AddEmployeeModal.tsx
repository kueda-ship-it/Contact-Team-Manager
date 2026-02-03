import { useEffect, useState } from "react";
import type { Column, Employee } from "../db";
import { Modal } from "./Modal";

interface AddEmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Employee>) => void;
    columns: Column[];
    initialData?: Employee | null;
}

export function AddEmployeeModal({ isOpen, onClose, onSubmit, columns, initialData }: AddEmployeeModalProps) {
    const [formData, setFormData] = useState<Record<string, any>>({});
    // Show all columns for editing
    const formColumns = columns;

    useEffect(() => {
        if (isOpen) {
            setFormData(initialData || {});
        }
    }, [isOpen, initialData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData ? "従業員の編集" : "新規従業員の追加"}
        >
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formColumns.map((col) => (
                    <div key={col.id} className="space-y-1">
                        <label className="block text-sm font-medium text-slate-400">
                            {col.label}
                        </label>
                        <input
                            type={col.type === 'number' ? 'number' : 'text'} // Simplified for now
                            className="w-full px-3 py-2 bg-[#2b2d31] border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all text-slate-100 placeholder:text-slate-600"
                            value={formData[col.key] || ''}
                            onChange={(e) => setFormData({ ...formData, [col.key]: e.target.value })}
                        />
                    </div>
                ))}

                <div className="md:col-span-2 flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-slate-400 hover:bg-slate-800 rounded-lg font-medium transition-colors"
                    >
                        キャンセル
                    </button>
                    <button
                        type="submit"
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
                    >
                        {initialData ? "保存する" : "登録する"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
