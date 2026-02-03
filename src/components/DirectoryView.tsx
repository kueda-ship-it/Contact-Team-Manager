import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Employee, Column } from '../db';
import { DataTable } from './DataTable';
import { AddEmployeeModal } from './AddEmployeeModal';
import { ColumnSettings } from './ColumnSettings';
import { Settings, UserPlus, Upload, RotateCcw, Search, Download, Cloud } from 'lucide-react';
import Papa from 'papaparse';
import { calculateLengthOfService } from '../lib/dateUtils';

export function DirectoryView() {
    const [columns, setColumns] = useState<Column[]>([]);
    const [employeesData, setEmployeesData] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    // Fetch data from Supabase
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data: cols, error: colError } = await supabase.from('directory_columns').select('*').order('order');
            const { data: emps, error: empError } = await supabase.from('directory_employees').select('*');

            if (colError || empError) {
                console.error("Error fetching data:", colError, empError);
                return;
            }

            if (cols) {
                setColumns(cols.map(c => ({
                    id: c.id,
                    key: c.key,
                    label: c.label,
                    type: c.type,
                    order: c.order,
                    isVisible: c.is_visible
                })));
            }

            if (emps) {
                setEmployeesData(emps.map(e => ({
                    id: e.id,
                    ...e.data
                })));
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Subscribe to changes
        const subscription = supabase
            .channel('directory_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'directory_employees' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'directory_columns' }, fetchData)
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Handlers
    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rawHeaders = results.meta.fields || [];
                const headers = Array.from(new Set(rawHeaders));

                if (headers.length === 0) {
                    alert("CSVにヘッダーが見つかりませんでした。");
                    return;
                }

                if (confirm("既存のデータをすべて削除して、CSVのカラム構成とデータで初期化しますか？")) {
                    setIsLoading(true);
                    // Clear and rebuild
                    await supabase.from('directory_columns').delete().neq('id', 0);
                    await supabase.from('directory_employees').delete().neq('id', 0);

                    const { error: colError } = await supabase.from('directory_columns').insert(
                        headers.map((header, index) => ({
                            key: header,
                            label: header,
                            type: 'text',
                            order: index,
                            is_visible: true
                        }))
                    );

                    if (colError) {
                        alert("カラムの作成に失敗しました: " + colError.message);
                        setIsLoading(false);
                        return;
                    }

                    const processedData = (results.data as any[]).map(row => {
                        const rowData = { ...row };
                        if (rowData["joining date"] && (!rowData["Length of service"] || rowData["Length of service"] === "-")) {
                            rowData["Length of service"] = calculateLengthOfService(rowData["joining date"]);
                        }
                        return { data: rowData };
                    });

                    const { error: dataError } = await supabase.from('directory_employees').insert(processedData);

                    if (dataError) {
                        alert("データのインポートに失敗しました: " + dataError.message);
                    }

                    setIsLoading(false);
                    fetchData();
                }
            }
        });
        e.target.value = ''; // Reset input
    };

    const handleReset = async () => {
        if (confirm("全てのデータを削除し、クラウド上のデータをリセットしますか？")) {
            setIsLoading(true);
            await supabase.from('directory_columns').delete().neq('id', 0);
            await supabase.from('directory_employees').delete().neq('id', 0);
            setIsLoading(false);
            fetchData();
        }
    };

    const handleAddEmployee = async (dataRow: Partial<Employee>) => {
        const rowContent = { ...dataRow };
        if (rowContent["joining date"]) {
            rowContent["Length of service"] = calculateLengthOfService(rowContent["joining date"] as string);
        }

        if (editingEmployee) {
            const { id, ...rest } = rowContent;
            await supabase.from('directory_employees').update({ data: rest }).eq('id', editingEmployee.id);
        } else {
            await supabase.from('directory_employees').insert([{ data: rowContent }]);
        }
        setEditingEmployee(null);
        fetchData();
    };

    const handleDeleteEmployee = async (id: number) => {
        if (confirm("この従業員データを削除しますか？")) {
            await supabase.from('directory_employees').delete().eq('id', id);
            fetchData();
        }
    };

    const handleInlineEdit = async (id: number, key: string, value: any) => {
        const emp = employeesData.find(e => e.id === id);
        if (!emp) return;

        // Create new data object excluding id
        const { id: _, ...currentData } = emp;
        const updatedData = { ...currentData, [key]: value };

        if (key === "joining date") {
            updatedData["Length of service"] = calculateLengthOfService(value);
        }

        await supabase.from('directory_employees').update({ data: updatedData }).eq('id', id);
        // Optimistic update
        setEmployeesData(prev => prev.map(e => e.id === id ? { id, ...updatedData } as any : e));
    };

    const handleAddColumn = async (name: string) => {
        const nextOrder = columns.length;
        await supabase.from('directory_columns').insert([{
            key: name,
            label: name,
            type: 'text',
            is_visible: true,
            order: nextOrder
        }]);
        fetchData();
    };

    const handleUpdateColumn = async (id: number, updates: Partial<Column>) => {
        const mappedUpdates: any = {};
        if (updates.label !== undefined) mappedUpdates.label = updates.label;
        if (updates.isVisible !== undefined) mappedUpdates.is_visible = updates.isVisible;
        if (updates.order !== undefined) mappedUpdates.order = updates.order;

        await supabase.from('directory_columns').update(mappedUpdates).eq('id', id);
        fetchData();
    };

    const handleToggleColumn = async (col: Column) => {
        if (!col.id) return;
        await supabase.from('directory_columns').update({ is_visible: !col.isVisible }).eq('id', col.id);
        fetchData();
    };

    const handleDeleteColumn = async (id: number) => {
        await supabase.from('directory_columns').delete().eq('id', id);
        fetchData();
    };

    const handleExportCSV = () => {
        if (employeesData.length === 0 || columns.length === 0) return;
        const visibleCols = columns.filter(c => c.isVisible).sort((a, b) => a.order - b.order);
        const exportData = employeesData.map(emp => {
            const row: any = {};
            visibleCols.forEach(col => {
                row[col.label] = (emp as any)[col.key] || "";
            });
            return row;
        });

        const csv = Papa.unparse(exportData);
        const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Employee_Directory_Cloud_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const filteredEmployees = useMemo(() => {
        if (!employeesData) return [];
        let result = [...employeesData];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(emp =>
                Object.values(emp).some(val => String(val).toLowerCase().includes(q))
            );
        }
        if (sortConfig) {
            result.sort((a, b) => {
                const valA = (a as any)[sortConfig.key] || "";
                const valB = (b as any)[sortConfig.key] || "";
                if (typeof valA === 'string' && typeof valB === 'string') {
                    return sortConfig.direction === 'asc' ? valA.localeCompare(valB, 'ja') : valB.localeCompare(valA, 'ja');
                }
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [employeesData, searchQuery, sortConfig]);

    if (isLoading) return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 font-bold animate-pulse">
            <Cloud className="w-12 h-12 mb-4" />
            クラウドデータを取得中...
        </div>
    );

    return (
        <div translate="no" className="flex flex-col gap-6 animate-in fade-in duration-500">
            {/* Header Area */}
            <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 bg-[#1a1b1e] p-8 rounded-[2.5rem] shadow-xl border border-slate-800 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                <div className="flex items-center gap-6 z-10">
                    <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg shadow-blue-500/20">
                        <Cloud className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black tracking-tighter text-slate-100">Cloud Directory</h2>
                        <p className="text-slate-500 font-bold text-xs mt-1 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Synchronized with Supabase
                        </p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-3 flex-1 max-w-4xl justify-end z-10">
                    <div className="relative flex-1 group w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="名簿を検索..."
                            className="w-full pl-12 pr-4 py-3 bg-[#2b2d31] border-2 border-transparent rounded-2xl focus:border-blue-500 focus:bg-[#2b2d31] outline-none font-bold transition-all placeholder:text-slate-600 text-slate-200"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportCSV}
                            className="p-3 bg-[#2b2d31] border-2 border-transparent text-slate-400 hover:text-emerald-400 hover:border-emerald-900/30 rounded-2xl transition-all shadow-sm"
                            title="CSV出力"
                        >
                            <Download className="w-5 h-5" />
                        </button>
                        <div className="relative">
                            <input type="file" accept=".csv" className="hidden" id="csv-import" onChange={handleImportCSV} />
                            <label htmlFor="csv-import" className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 font-black cursor-pointer shadow-lg shadow-emerald-600/10 text-sm active:scale-95">
                                <Upload className="w-4 h-4" />
                                インポート
                            </label>
                        </div>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="p-3 bg-[#2b2d31] border-2 border-transparent text-slate-400 hover:text-blue-400 hover:border-blue-900/30 rounded-2xl transition-all shadow-sm"
                            title="列設定"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => { setEditingEmployee(null); setIsAddModalOpen(true); }}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 font-black transition-all transform active:scale-95 text-sm"
                        >
                            <UserPlus className="w-4 h-4" />
                            登録
                        </button>
                        <button
                            onClick={handleReset}
                            className="p-3 bg-red-950/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 rounded-2xl transition-all"
                            title="リセット"
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Table Area */}
            <div className="bg-[#1a1b1e] rounded-[2rem] shadow-2xl border border-slate-800 overflow-hidden">
                <DataTable
                    columns={columns}
                    data={filteredEmployees}
                    onEdit={(emp) => { setEditingEmployee(emp); setIsAddModalOpen(true); }}
                    onDelete={handleDeleteEmployee}
                    onInlineEdit={handleInlineEdit}
                    sortConfig={sortConfig}
                    onSort={(key) => {
                        setSortConfig(prev => {
                            if (prev?.key === key) {
                                return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
                            }
                            return { key, direction: 'asc' };
                        });
                    }}
                />
            </div>

            <AddEmployeeModal
                isOpen={isAddModalOpen}
                onClose={() => { setIsAddModalOpen(false); setEditingEmployee(null); }}
                onSubmit={handleAddEmployee}
                columns={columns}
                initialData={editingEmployee}
            />

            <ColumnSettings
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                columns={columns}
                onAddColumn={handleAddColumn}
                onUpdateColumn={handleUpdateColumn}
                onToggleVisibility={handleToggleColumn}
                onDeleteColumn={handleDeleteColumn}
            />
        </div>
    );
}
