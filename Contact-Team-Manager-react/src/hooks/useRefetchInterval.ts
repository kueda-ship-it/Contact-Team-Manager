import { useEffect } from 'react';

// 定期 polling で refetch を呼ぶ。Realtime 撤去された hook の「タブ開きっぱなし
// 時の遅延」を埋める。タブが非表示の間は visibilitychange でも止める
// (背景タブで Egress を焼かない)。
//
// 既定: 60_000ms (60秒)。reactions のように大きい payload を吐く hook は
// 呼び出し側で長めの interval を渡すこと。
//
// enabled=false で動的に無効化できる。React の hook ルール上、呼び出し自体を
// 条件分岐できないので、フラグで切り替える。
export function useRefetchInterval(refetch: () => void, intervalMs: number = 60_000, enabled: boolean = true) {
    useEffect(() => {
        if (!enabled) return;

        let timer: ReturnType<typeof setInterval> | null = null;

        const start = () => {
            if (timer !== null) return;
            timer = setInterval(refetch, intervalMs);
        };
        const stop = () => {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                start();
            } else {
                stop();
            }
        };

        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            stop();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [refetch, intervalMs, enabled]);
}
