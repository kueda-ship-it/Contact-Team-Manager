import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthContext';

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';
export type PresenceChoice = PresenceStatus | 'auto';

export interface PresenceRecord {
    status: PresenceStatus;
    manual: boolean;
    lastSeenAt: string | null;
}

interface PresenceContextType {
    getPresence: (userId: string | null | undefined) => PresenceRecord;
    myPresence: PresenceRecord;
    setMyPresence: (choice: PresenceChoice) => Promise<void>;
}

const DEFAULT_RECORD: PresenceRecord = { status: 'offline', manual: false, lastSeenAt: null };
const STALE_MS = 2 * 60 * 1000; // 2 min — any "online" heartbeat older than this is treated as offline
const IDLE_MS = 5 * 60 * 1000;  // 5 min of inactivity → auto away
const HEARTBEAT_MS = 45 * 1000; // 45s — refresh last_seen_at so others see us as live

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

/** Apply client-side staleness to auto-online rows — if their last heartbeat
 *  is old, demote to offline so the UI doesn't show ghosts. Manual statuses
 *  are trusted as-is (user explicitly set them). */
function applyStaleness(record: PresenceRecord): PresenceRecord {
    if (record.manual) return record;
    if (record.status === 'offline') return record;
    if (!record.lastSeenAt) return record;
    const age = Date.now() - new Date(record.lastSeenAt).getTime();
    if (age > STALE_MS) return { ...record, status: 'offline' };
    return record;
}

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuthContext();
    const [records, setRecords] = useState<Map<string, PresenceRecord>>(new Map());
    const recordsRef = useRef(records);
    recordsRef.current = records;

    const lastActivityRef = useRef<number>(Date.now());
    const currentAutoStatusRef = useRef<PresenceStatus>('offline');
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Helper: write status for my user. Only runs an UPDATE when values change
    // to avoid unnecessary row updates + realtime echo storms.
    const writeMyStatus = useCallback(async (
        status: PresenceStatus,
        manual: boolean,
        opts: { touchLastSeen?: boolean } = {}
    ) => {
        if (!user) return;
        const existing = recordsRef.current.get(user.id) || DEFAULT_RECORD;
        const nowIso = new Date().toISOString();
        const needsStatusUpdate = existing.status !== status || existing.manual !== manual;
        const needsHeartbeat = opts.touchLastSeen && status !== 'offline';
        if (!needsStatusUpdate && !needsHeartbeat) return;

        const payload: Record<string, any> = {};
        if (needsStatusUpdate) {
            payload.presence_status = status;
            payload.presence_manual = manual;
        }
        if (needsHeartbeat || needsStatusUpdate) {
            payload.last_seen_at = nowIso;
        }

        // Optimistic local update — Realtime echo will confirm, but we don't
        // want the UI to lag behind a manual click.
        setRecords(prev => {
            const next = new Map(prev);
            next.set(user.id, {
                status,
                manual,
                lastSeenAt: payload.last_seen_at ?? existing.lastSeenAt,
            });
            return next;
        });

        const { error } = await supabase
            .from('profiles')
            .update(payload)
            .eq('id', user.id);
        if (error) {
            console.warn('[Presence] Failed to update presence:', error);
        }
    }, [user]);

    // Initial hydrate — fetch everyone once so avatars have a status before
    // any realtime event arrives.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, presence_status, presence_manual, last_seen_at');
            if (cancelled) return;
            if (error) {
                console.warn('[Presence] Failed to hydrate:', error);
                return;
            }
            const map = new Map<string, PresenceRecord>();
            (data || []).forEach((row: any) => {
                map.set(row.id, {
                    status: (row.presence_status as PresenceStatus) || 'offline',
                    manual: !!row.presence_manual,
                    lastSeenAt: row.last_seen_at,
                });
            });
            setRecords(map);
        })();
        return () => { cancelled = true; };
    }, []);

    // Realtime — other people's status changes stream in here.
    useEffect(() => {
        const channel = supabase
            .channel('presence-profiles')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
            }, (payload) => {
                const row: any = payload.new;
                if (!row?.id) return;
                setRecords(prev => {
                    const next = new Map(prev);
                    next.set(row.id, {
                        status: (row.presence_status as PresenceStatus) || 'offline',
                        manual: !!row.presence_manual,
                        lastSeenAt: row.last_seen_at ?? null,
                    });
                    return next;
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // My activity tracking — on mount, set online. Listen for input events to
    // reset the idle timer. A tick every 30s evaluates: idle > IDLE_MS → away.
    useEffect(() => {
        if (!user) return;

        const bumpActivity = () => { lastActivityRef.current = Date.now(); };
        const events: (keyof DocumentEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'focus'];
        events.forEach(ev => document.addEventListener(ev, bumpActivity, { passive: true }));

        // Seed: we're here, mark online (respecting manual).
        (async () => {
            // Fetch current manual flag — if user had set manual in a prior
            // session, don't clobber it on reload.
            const { data } = await supabase
                .from('profiles')
                .select('presence_manual, presence_status')
                .eq('id', user.id)
                .single();
            const manual = !!data?.presence_manual;
            if (manual) {
                // Leave the manual status alone; just refresh heartbeat.
                currentAutoStatusRef.current = (data?.presence_status as PresenceStatus) || 'online';
                await writeMyStatus((data?.presence_status as PresenceStatus) || 'online', true, { touchLastSeen: true });
            } else {
                currentAutoStatusRef.current = 'online';
                await writeMyStatus('online', false, { touchLastSeen: true });
            }
        })();

        const tick = async () => {
            const me = recordsRef.current.get(user.id);
            // If the user has a manual override, we still send a heartbeat so
            // other clients don't stale-out their avatar — but we don't touch
            // status or manual flag.
            if (me?.manual) {
                if (me.status !== 'offline') {
                    await writeMyStatus(me.status, true, { touchLastSeen: true });
                }
                return;
            }
            const idleFor = Date.now() - lastActivityRef.current;
            const nextStatus: PresenceStatus = idleFor > IDLE_MS ? 'away' : 'online';
            currentAutoStatusRef.current = nextStatus;
            await writeMyStatus(nextStatus, false, { touchLastSeen: true });
        };
        tickRef.current = setInterval(tick, HEARTBEAT_MS);

        // Best-effort: mark offline when the tab closes. navigator.sendBeacon
        // would be ideal but Supabase's JS client uses fetch with auth headers
        // that sendBeacon can't carry — so we fire an async update and hope
        // it flushes. Not guaranteed, which is why we also do client-side
        // staleness fallback (STALE_MS).
        const handleUnload = () => {
            const me = recordsRef.current.get(user.id);
            if (me?.manual) return; // honor explicit manual status across sessions
            supabase.from('profiles').update({ presence_status: 'offline' }).eq('id', user.id);
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            events.forEach(ev => document.removeEventListener(ev, bumpActivity));
            window.removeEventListener('beforeunload', handleUnload);
            if (tickRef.current) clearInterval(tickRef.current);
            handleUnload();
        };
    }, [user, writeMyStatus]);

    const setMyPresence = useCallback(async (choice: PresenceChoice) => {
        if (!user) return;
        if (choice === 'auto') {
            // Drop manual flag, snap to current auto status (online if user is active).
            const idleFor = Date.now() - lastActivityRef.current;
            const autoStatus: PresenceStatus = idleFor > IDLE_MS ? 'away' : 'online';
            currentAutoStatusRef.current = autoStatus;
            await writeMyStatus(autoStatus, false, { touchLastSeen: true });
        } else {
            await writeMyStatus(choice, true, { touchLastSeen: true });
        }
    }, [user, writeMyStatus]);

    const getPresence = useCallback((userId: string | null | undefined): PresenceRecord => {
        if (!userId) return DEFAULT_RECORD;
        const raw = records.get(userId) || DEFAULT_RECORD;
        return applyStaleness(raw);
    }, [records]);

    const myPresence = useMemo<PresenceRecord>(() => {
        if (!user) return DEFAULT_RECORD;
        return applyStaleness(records.get(user.id) || DEFAULT_RECORD);
    }, [records, user]);

    const value = useMemo(() => ({ getPresence, myPresence, setMyPresence }),
        [getPresence, myPresence, setMyPresence]);

    return (
        <PresenceContext.Provider value={value}>
            {children}
        </PresenceContext.Provider>
    );
};

export const usePresence = () => {
    const ctx = useContext(PresenceContext);
    if (!ctx) throw new Error('usePresence must be used within a PresenceProvider');
    return ctx;
};
