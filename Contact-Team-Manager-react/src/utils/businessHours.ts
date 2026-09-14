const HOUR_MS = 60 * 60 * 1000;
const OPEN_MS = 9 * HOUR_MS;
const CLOSE_MS = 17.5 * HOUR_MS;

const dayKey = (month: number, day: number) => `${month}-${day}`;

const nthMonday = (year: number, month: number, n: number) => {
    const firstDow = new Date(year, month - 1, 1).getDay();
    return 1 + ((8 - firstDow) % 7) + (n - 1) * 7;
};

// 春分・秋分の近似式は 1980〜2099 年で有効
const equinoxDay = (year: number, base: number) =>
    Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

const holidayCache = new Map<number, Set<string>>();

// 2020年以降の祝日法ベース（振替休日・国民の休日を含む）
const holidaysOf = (year: number) => {
    const cached = holidayCache.get(year);
    if (cached) return cached;

    let umi = nthMonday(year, 7, 3);
    let sports: [number, number] = [10, nthMonday(year, 10, 2)];
    let yama: [number, number] = [8, 11];
    if (year === 2020) { umi = 23; sports = [7, 24]; yama = [8, 10]; }
    if (year === 2021) { umi = 22; sports = [7, 23]; yama = [8, 8]; }

    const base: [number, number][] = [
        [1, 1], [1, nthMonday(year, 1, 2)], [2, 11], [2, 23], [3, equinoxDay(year, 20.8431)],
        [4, 29], [5, 3], [5, 4], [5, 5], [7, umi], yama,
        [9, nthMonday(year, 9, 3)], [9, equinoxDay(year, 23.2488)], sports, [11, 3], [11, 23],
    ];
    const set = new Set(base.map(([m, d]) => dayKey(m, d)));
    const baseTimes = base.map(([m, d]) => new Date(year, m - 1, d).getTime()).sort((a, b) => a - b);

    for (let i = 0; i + 1 < baseTimes.length; i++) {
        const mid = new Date(baseTimes[i]);
        mid.setDate(mid.getDate() + 1);
        const next = new Date(mid);
        next.setDate(next.getDate() + 1);
        if (next.getTime() === baseTimes[i + 1]) set.add(dayKey(mid.getMonth() + 1, mid.getDate()));
    }

    baseTimes.forEach(t => {
        const d = new Date(t);
        if (d.getDay() !== 0) return;
        do { d.setDate(d.getDate() + 1); } while (set.has(dayKey(d.getMonth() + 1, d.getDate())));
        set.add(dayKey(d.getMonth() + 1, d.getDate()));
    });

    holidayCache.set(year, set);
    return set;
};

// 年末年始（12/31〜1/3）は会社休み。振替休日の判定に混ぜないよう祝日とは別に見る
const isYearEndBreak = (month: number, day: number) =>
    (month === 12 && day === 31) || (month === 1 && day <= 3);

export const isNonWorkingDay = (date: Date) => {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return true;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    if (isYearEndBreak(month, day)) return true;
    return holidaysOf(date.getFullYear()).has(dayKey(month, day));
};

// start〜end のうち、土日祝・年末年始を除く日の 9:00〜17:30 に重なる時間
export const businessMsBetween = (start: Date, end: Date) => {
    const s = start.getTime();
    const e = end.getTime();
    if (isNaN(s) || isNaN(e) || e <= s) return 0;
    let total = 0;
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (day.getTime() <= e) {
        if (!isNonWorkingDay(day)) {
            const dayStart = day.getTime();
            total += Math.max(0, Math.min(dayStart + CLOSE_MS, e) - Math.max(dayStart + OPEN_MS, s));
        }
        day.setDate(day.getDate() + 1);
    }
    return total;
};

const durationCache = new Map<string, number>();

// 完了までの時間。当日中に完了したものは実時間（夜間・土日祝でもそのまま）、
// 日をまたいだものは土日祝を除く日の 9:00〜17:30 に重なる時間だけを数える
export const completionDurationMs = (createdAt: string, completedAt: string) => {
    const cacheKey = `${createdAt}|${completedAt}`;
    const cached = durationCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const start = new Date(createdAt);
    const end = new Date(completedAt);
    const s = start.getTime();
    const e = end.getTime();
    let total: number;

    if (isNaN(s) || isNaN(e)) {
        total = NaN;
    } else if (start.toDateString() === end.toDateString()) {
        total = e - s;
    } else {
        total = businessMsBetween(start, end);
    }

    durationCache.set(cacheKey, total);
    return total;
};
