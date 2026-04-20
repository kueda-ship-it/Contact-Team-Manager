// 完了タスクとそのサブツリーを除外（未完了のみ表示）
export const stripCompleted = (items) => items
  .filter(it => it.status !== 'completed')
  .map(it => ({ ...it, children: it.children ? stripCompleted(it.children) : [] }));

// 完了タスクだけ残す（祖先はコンテキスト維持のため、完了した子孫を持つ場合のみ残す）
export const keepOnlyCompleted = (items) => items
  .map(it => ({ ...it, children: it.children ? keepOnlyCompleted(it.children) : [] }))
  .filter(it => it.status === 'completed' || it.children.length > 0);

// mode: 'all' | 'active' | 'completed'
export const filterByCompletion = (items, mode) => {
  if (mode === 'active')    return stripCompleted(items);
  if (mode === 'completed') return keepOnlyCompleted(items);
  return items;
};
