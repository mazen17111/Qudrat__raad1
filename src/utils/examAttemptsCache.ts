import { ExamAttempt } from '../types';

const getAttemptsCacheKey = (userId: string) => `raad_cached_exam_attempts_${userId}`;

function sortAttemptsDesc(list: ExamAttempt[]): ExamAttempt[] {
  return [...list].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });
}

function isSameAttempt(a: ExamAttempt, b: ExamAttempt): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  if (
    a.examId === b.examId &&
    a.score === b.score &&
    a.totalQuestions === b.totalQuestions &&
    a.createdAt &&
    b.createdAt
  ) {
    const diff = Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return diff < 5000;
  }
  return false;
}

export function getCachedExamAttempts(userId?: string): ExamAttempt[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getAttemptsCacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortAttemptsDesc(parsed);
  } catch {
    return [];
  }
}

export function saveLocalExamAttempt(userId: string, attempt: ExamAttempt): ExamAttempt[] {
  if (!userId || typeof window === 'undefined') return [attempt];
  const existing = getCachedExamAttempts(userId);
  const filtered = existing.filter((item) => !isSameAttempt(item, attempt));
  const merged = sortAttemptsDesc([attempt, ...filtered]);
  try {
    localStorage.setItem(getAttemptsCacheKey(userId), JSON.stringify(merged));
  } catch {}
  return merged;
}

export function replaceLocalAttemptId(
  userId: string,
  tempId: string,
  realId: string
): ExamAttempt[] {
  if (!userId || typeof window === 'undefined') return [];
  const existing = getCachedExamAttempts(userId);
  const updated = existing.map((item) => (item.id === tempId ? { ...item, id: realId } : item));
  try {
    localStorage.setItem(getAttemptsCacheKey(userId), JSON.stringify(updated));
  } catch {}
  return updated;
}

export function mergeRemoteExamAttempts(userId: string, remoteAttempts: ExamAttempt[]): ExamAttempt[] {
  if (!userId || typeof window === 'undefined') return sortAttemptsDesc(remoteAttempts);
  const cached = getCachedExamAttempts(userId);
  const merged: ExamAttempt[] = [...remoteAttempts];

  for (const localItem of cached) {
    const alreadyInRemote = merged.some((remoteItem) => isSameAttempt(remoteItem, localItem));
    if (!alreadyInRemote) {
      merged.push(localItem);
    }
  }

  const sorted = sortAttemptsDesc(merged);
  try {
    localStorage.setItem(getAttemptsCacheKey(userId), JSON.stringify(sorted));
  } catch {}
  return sorted;
}

const syncedAttemptUsersInSession = new Set<string>();
const getAttemptsSyncMetaKey = (userId: string) => `raad_exam_attempts_synced_at_${userId}`;

export function hasSyncedExamAttemptsRecently(
  userId?: string,
  maxAgeMs = 6 * 60 * 60 * 1000
): boolean {
  if (!userId || typeof window === 'undefined') return false;
  if (syncedAttemptUsersInSession.has(userId)) return true;
  try {
    const raw = localStorage.getItem(getAttemptsSyncMetaKey(userId));
    if (!raw) return false;
    const ts = Number(raw);
    return ts > 0 && Date.now() - ts < maxAgeMs;
  } catch {
    return false;
  }
}

export function markExamAttemptsSynced(userId?: string): void {
  if (!userId || typeof window === 'undefined') return;
  syncedAttemptUsersInSession.add(userId);
  try {
    localStorage.setItem(getAttemptsSyncMetaKey(userId), String(Date.now()));
  } catch {}
}

