const USAGE_STORAGE_KEY = 'raad_local_firestore_usage_v2';
const USAGE_UPDATED_EVENT = 'raad-local-usage-updated';

export const FREE_DAILY_READS_LIMIT = 50000;
export const FREE_DAILY_WRITES_LIMIT = 20000;
export const FREE_DAILY_DELETES_LIMIT = 20000;

export interface LocalUsageStats {
  date: string;
  reads: number;
  writes: number;
  deletes: number;
  cacheHits: number;
  lastOperationLabel?: string;
  updatedAt: number;
}

/**
 * Firebase Firestore Spark daily quota resets at 00:00 Pacific Time (America/Los_Angeles).
 */
export function getFirestoreQuotaDateString(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function createEmptyStats(): LocalUsageStats {
  return {
    date: getFirestoreQuotaDateString(),
    reads: 0,
    writes: 0,
    deletes: 0,
    cacheHits: 0,
    updatedAt: Date.now(),
  };
}

let memoryStats: LocalUsageStats | null = null;
const pendingDelta = {
  reads: 0,
  writes: 0,
  deletes: 0,
  cacheHits: 0,
  lastOperationLabel: '',
};
let flushTimer: number | null = null;
let unloadBound = false;

function readStatsFromStorage(): LocalUsageStats {
  const today = getFirestoreQuotaDateString();
  if (memoryStats && memoryStats.date === today) {
    return memoryStats;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(USAGE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalUsageStats>;
        if (parsed && parsed.date === today) {
          memoryStats = {
            date: today,
            reads: Math.max(0, Number(parsed.reads) || 0),
            writes: Math.max(0, Number(parsed.writes) || 0),
            deletes: Math.max(0, Number(parsed.deletes) || 0),
            cacheHits: Math.max(0, Number(parsed.cacheHits) || 0),
            lastOperationLabel: parsed.lastOperationLabel,
            updatedAt: Number(parsed.updatedAt) || Date.now(),
          };
          return memoryStats;
        }
      }
    } catch {}
  }
  memoryStats = createEmptyStats();
  return memoryStats;
}

function flushPendingDelta(useBeacon = false): void {
  if (typeof window === 'undefined') return;
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (
    pendingDelta.reads <= 0 &&
    pendingDelta.writes <= 0 &&
    pendingDelta.deletes <= 0 &&
    pendingDelta.cacheHits <= 0
  ) {
    return;
  }

  const payload = {
    date: getFirestoreQuotaDateString(),
    reads: pendingDelta.reads,
    writes: pendingDelta.writes,
    deletes: pendingDelta.deletes,
    cacheHits: pendingDelta.cacheHits,
    label: pendingDelta.lastOperationLabel || undefined,
  };

  pendingDelta.reads = 0;
  pendingDelta.writes = 0;
  pendingDelta.deletes = 0;
  pendingDelta.cacheHits = 0;
  pendingDelta.lastOperationLabel = '';

  const body = JSON.stringify(payload);
  if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/firebase-usage/report', blob)) {
        return;
      }
    } catch {}
  }

  fetch('/api/firebase-usage/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

function scheduleServerDeltaSync(
  kind: 'reads' | 'writes' | 'deletes' | 'cacheHits',
  count: number,
  label?: string
): void {
  if (typeof window === 'undefined' || count <= 0) return;

  pendingDelta[kind] += count;
  if (label) pendingDelta.lastOperationLabel = label;

  if (!unloadBound) {
    unloadBound = true;
    window.addEventListener('pagehide', () => flushPendingDelta(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushPendingDelta(true);
      }
    });
  }

  if (flushTimer === null) {
    flushTimer = window.setTimeout(() => {
      flushPendingDelta(false);
    }, 2500);
  }
}

function writeStats(next: LocalUsageStats): void {
  memoryStats = next;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent(USAGE_UPDATED_EVENT, { detail: next }));
    } catch {}
  }
}

export function getLocalUsageStats(): LocalUsageStats {
  return { ...readStatsFromStorage() };
}

export function trackLocalRead(count = 1, label?: string): void {
  const safeCount = Math.max(0, Math.round(count));
  if (safeCount <= 0) return;
  const current = readStatsFromStorage();
  writeStats({
    ...current,
    reads: current.reads + safeCount,
    ...(label ? { lastOperationLabel: label } : {}),
    updatedAt: Date.now(),
  });
  scheduleServerDeltaSync('reads', safeCount, label);
}

export function trackLocalWrite(count = 1, label?: string): void {
  const safeCount = Math.max(0, Math.round(count));
  if (safeCount <= 0) return;
  const current = readStatsFromStorage();
  writeStats({
    ...current,
    writes: current.writes + safeCount,
    ...(label ? { lastOperationLabel: label } : {}),
    updatedAt: Date.now(),
  });
  scheduleServerDeltaSync('writes', safeCount, label);
}

export function trackLocalDelete(count = 1, label?: string): void {
  const safeCount = Math.max(0, Math.round(count));
  if (safeCount <= 0) return;
  const current = readStatsFromStorage();
  writeStats({
    ...current,
    deletes: current.deletes + safeCount,
    ...(label ? { lastOperationLabel: label } : {}),
    updatedAt: Date.now(),
  });
  scheduleServerDeltaSync('deletes', safeCount, label);
}

export function trackLocalCacheHit(savedCount = 1, label?: string): void {
  const safeCount = Math.max(0, Math.round(savedCount));
  if (safeCount <= 0) return;
  const current = readStatsFromStorage();
  writeStats({
    ...current,
    cacheHits: current.cacheHits + safeCount,
    ...(label ? { lastOperationLabel: label } : {}),
    updatedAt: Date.now(),
  });
  scheduleServerDeltaSync('cacheHits', safeCount, label);
}

export function flushUsageReportsNow(): void {
  flushPendingDelta(false);
}

export function subscribeLocalUsageStats(listener: (stats: LocalUsageStats) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<LocalUsageStats>).detail;
    listener(detail || getLocalUsageStats());
  };
  const storageHandler = (event: StorageEvent) => {
    if (event.key === USAGE_STORAGE_KEY) {
      memoryStats = null;
      listener(getLocalUsageStats());
    }
  };
  window.addEventListener(USAGE_UPDATED_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(USAGE_UPDATED_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
