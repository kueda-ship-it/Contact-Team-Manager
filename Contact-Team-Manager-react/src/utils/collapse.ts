/** 折り返し（詳細を表示）の判定。
 *  CSS の max-height（スレッド 200px / 返信 100px）を少し超えただけでは折り返さない。
 *  隠れるのが 3 行未満なら、そのまま全文を見せたほうが読みやすいため。 */
export const COLLAPSE_MAX_HEIGHT = { thread: 200, reply: 100 } as const;

/** これ未満のはみ出しは折り返さない（約 3 行ぶん） */
const SLACK_PX = 60;

export const shouldCollapse = (scrollHeight: number, maxHeight: number) =>
    scrollHeight > maxHeight + SLACK_PX;
