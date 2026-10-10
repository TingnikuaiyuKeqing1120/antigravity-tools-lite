import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { DashboardSnapshot } from '../utils/accountDashboard';
import { request } from '../utils/request';
import { isTauri } from '../utils/env';

interface DashboardOverviewCache {
    snapshot: DashboardSnapshot | null;
    reserve: number | null;
}

const getOverviewCache = (): DashboardOverviewCache => {
    const g = globalThis as unknown as { __toAgyOverviewCache?: DashboardOverviewCache };
    if (!g.__toAgyOverviewCache) {
        g.__toAgyOverviewCache = { snapshot: null, reserve: null };
    }
    return g.__toAgyOverviewCache;
};

/** Reads saved observations and policy only. Never refreshes remote quotas or
 * credentials, probes the running client's identity, or triggers switching. */
export function useDashboardOverview(enabled: boolean) {
    const cache = getOverviewCache();
    const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(() => cache.snapshot);
    const [reserve, setReserve] = useState<number | null>(() => cache.reserve);
    const [loading, setLoading] = useState(() => !cache.snapshot);
    const [failed, setFailed] = useState(false);
    const [now, setNow] = useState(Date.now());
    const read = useRef<(() => Promise<void>) | null>(null);
    const refresh = useCallback(() => read.current?.(), []);
    useEffect(() => {
        if (!enabled) return;
        let active = true, busy = false, queued = false;
        const fetch = async () => {
            if (!active) return;
            if (busy) { queued = true; return; }
            busy = true;
            const [data, policy] = await Promise.allSettled([
                request<DashboardSnapshot>('get_account_dashboard_snapshot'),
                request<{ reserve_percentage: number }>('get_auto_switch_config'),
            ]);
            if (active) {
                if (data.status === 'fulfilled') {
                    cache.snapshot = data.value;
                    setSnapshot(data.value);
                } else {
                    cache.snapshot = null;
                    setSnapshot(null);
                }
                if (policy.status === 'fulfilled') {
                    cache.reserve = policy.value.reserve_percentage;
                    setReserve(policy.value.reserve_percentage);
                }
                setFailed(data.status === 'rejected');
                setLoading(false);
                setNow(Date.now());
            }
            busy = false;
            if (queued && active) { queued = false; void fetch(); }
        };
        if (!cache.snapshot) {
            setSnapshot(null);
            setLoading(true);
        }
        setFailed(false);
        setNow(Date.now());
        read.current = fetch;
        void fetch();
        const timer = window.setInterval(() => {
            if (document.visibilityState !== 'hidden') void fetch();
        }, 60_000);
        const clock = window.setInterval(() => setNow(Date.now()), 15_000);
        const listeners = isTauri() ? ['menubar://data-updated', 'tray://account-switched', 'accounts://refreshed']
            .map(event => listen(event, () => void fetch())) : [];
        return () => {
            active = false;
            read.current = null;
            window.clearInterval(timer);
            window.clearInterval(clock);
            listeners.forEach(listener => { void listener.then(stop => stop()).catch(() => {}); });
        };
    }, [enabled]);
    return { snapshot, reserve, loading, failed, now, refresh };
}
