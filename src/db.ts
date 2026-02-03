import Dexie, { type EntityTable } from 'dexie';

export type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export interface Column {
    id?: number;
    key: string;
    label: string;
    type: ColumnType;
    order: number;
    isVisible: boolean;
}

export interface Employee {
    id?: number;
    [key: string]: any;
}

class DepartmentDatabase extends Dexie {
    columns!: EntityTable<Column, 'id'>;
    employees!: EntityTable<Employee, 'id'>;

    constructor() {
        super('DepartmentDirectoryDB_v2'); // Database name changed or version bumped to ensure clean start
        this.version(1).stores({
            columns: '++id, &key, order, isVisible',
            employees: '++id'
        });
    }
}

export const db = new DepartmentDatabase();

export const INITIAL_COLUMNS_MAP: { key: string; label: string; type: ColumnType }[] = [
    { key: "No.", label: "No.", type: "text" },
    { key: "Name", label: "名前", type: "text" },
    { key: "Employee Identification", label: "従業員識別", type: "text" },
    { key: "Mail", label: "メールアドレス", type: "text" },
    { key: "Telephone", label: "電話番号", type: "text" },
    { key: "Group", label: "グループ", type: "text" },
    { key: "Leader", label: "リーダー", type: "text" },
    { key: "New year holiday season", label: "年末年始休暇", type: "text" },
    { key: "check2", label: "check2", type: "text" },
    { key: "Agreement", label: "協定", type: "text" },
    { key: "Vaccine", label: "ワクチン", type: "text" },
    { key: "Reason for not Receiving", label: "未接種理由", type: "text" },
    { key: "Meeting Schedule(2021/12)", label: "面会スケジュール(2021/12)", type: "text" },
    { key: "Meeting Implement", label: "面会実施", type: "text" },
    { key: "joining date", label: "入社日", type: "text" },
    { key: "Length of service", label: "勤続年数", type: "text" },
    { key: "retirement date", label: "退職日", type: "text" },
    { key: "Training Time(join)", label: "研修時間(入)", type: "text" },
    { key: "Training Time(out)", label: "研修時間(出)", type: "text" },
    { key: "Find of iPhone", label: "iPhoneの検索", type: "text" },
    { key: "Google Account", label: "Googleアカウント", type: "text" },
    { key: "FS040U USBバンドル", label: "FS040U USBバンドル", type: "text" },
    { key: "FS040U IMEI：(15)", label: "FS040U IMEI：(15)", type: "text" },
    { key: "貸与日", label: "貸与日", type: "text" },
    { key: "Surface", label: "Surface", type: "text" },
    { key: "After update", label: "更新後", type: "text" },
    { key: "alcohol check", label: "アルコールチェック", type: "text" },
    { key: "Special publication", label: "特別掲載", type: "text" },
    { key: "FAP", label: "FAP", type: "text" }
];

export async function clearAndSeed(newData: any[] = []) {
    await db.transaction('rw', db.columns, db.employees, async () => {
        await db.columns.clear();
        await db.employees.clear();

        await db.columns.bulkAdd(
            INITIAL_COLUMNS_MAP.map((col, index) => ({
                ...col,
                order: index,
                isVisible: true
            }))
        );

        if (newData.length > 0) {
            await db.employees.bulkAdd(newData);
        }
    });
}

// Atomic seed function to prevent race conditions during StrictMode double-mount
let isSeeding = false;
export async function seedDatabase() {
    if (isSeeding) return;
    isSeeding = true;
    try {
        await db.transaction('rw', db.columns, async () => {
            const count = await db.columns.count();
            if (count === 0) {
                await db.columns.bulkAdd(
                    INITIAL_COLUMNS_MAP.map((col, index) => ({
                        ...col,
                        order: index,
                        isVisible: true
                    }))
                );
            }
        });
    } finally {
        isSeeding = false;
    }
}
