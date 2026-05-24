import { useEffect } from 'react';

// realtime 撤去された hook (useTeams / useProfiles / useTags / useReactions /
// useAllTagMembers) の即時反映を、ウィンドウ復帰時 / タブ visible 時の refetch
// で代替する。React Query / SWR の revalidateOnFocus と同等。
//
// refetch がレンダリングごとに新しい参照になっても useEffect は何度も走るが、
// 呼ぶ側 (各 hook) が useCallback で安定参照を渡している前提。
export function useRefetchOnFocus(refetch: () => void) {
    useEffect(() => {
        const handler = () => {
            if (document.visibilityState === 'visible') refetch();
        };
        window.addEventListener('focus', handler);
        document.addEventListener('visibilitychange', handler);
        return () => {
            window.removeEventListener('focus', handler);
            document.removeEventListener('visibilitychange', handler);
        };
    }, [refetch]);
}
