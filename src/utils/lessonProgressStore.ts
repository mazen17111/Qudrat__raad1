import { ResourceItem, StudentUser } from '../types';

export interface LessonProgressState {
  passedLessonIds: string[];
  unlockedLessonIds: string[];
}

const getProgressStorageKey = (userId: string) => `raad_lesson_progress_${userId}`;

const listenersByUser = new Map<string, Set<() => void>>();

function notifyProgressListeners(userId: string) {
  const set = listenersByUser.get(userId);
  if (!set) return;
  set.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

function uniqueStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item === 'string' && item.trim() !== '' && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function readLocalProgress(userId?: string): LessonProgressState {
  if (!userId || typeof window === 'undefined') {
    return { passedLessonIds: [], unlockedLessonIds: [] };
  }
  try {
    const raw = localStorage.getItem(getProgressStorageKey(userId));
    if (!raw) return { passedLessonIds: [], unlockedLessonIds: [] };
    const parsed = JSON.parse(raw) as Partial<LessonProgressState>;
    return {
      passedLessonIds: uniqueStringArray(parsed?.passedLessonIds),
      unlockedLessonIds: uniqueStringArray(parsed?.unlockedLessonIds),
    };
  } catch {
    return { passedLessonIds: [], unlockedLessonIds: [] };
  }
}

function writeLocalProgress(userId: string, state: LessonProgressState): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getProgressStorageKey(userId), JSON.stringify(state));
  } catch {}
}

/**
 * Deterministic lesson ordering inside a section.
 */
export function sortResourcesOrdered(list: ResourceItem[]): ResourceItem[] {
  return [...list].sort((a, b) => {
    const orderDiff = (a.order || 0) - (b.order || 0);
    if (orderDiff !== 0) return orderDiff;
    const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (tA !== tB) return tA - tB;
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Merges browser-cached progress with any progress stored on the synced StudentUser document
 * without performing any Firestore reads.
 */
export function getLessonProgress(
  userId?: string,
  userDoc?: Partial<StudentUser> | null
): LessonProgressState {
  const local = readLocalProgress(userId);
  const remotePassed = uniqueStringArray(userDoc?.passedLessonIds);
  const remoteUnlocked = uniqueStringArray(userDoc?.unlockedLessonIds);

  return {
    passedLessonIds: uniqueStringArray([...local.passedLessonIds, ...remotePassed]),
    unlockedLessonIds: uniqueStringArray([...local.unlockedLessonIds, ...remoteUnlocked]),
  };
}

/**
 * Syncs remote StudentUser progress fields into localStorage so multi-device
 * unlocks persist across reloads with zero extra Firestore reads.
 */
export function syncLessonProgressFromUser(
  user?: Partial<StudentUser> | null
): LessonProgressState {
  if (!user?.id) return { passedLessonIds: [], unlockedLessonIds: [] };
  const local = readLocalProgress(user.id);
  const merged = getLessonProgress(user.id, user);

  const changed =
    merged.passedLessonIds.length !== local.passedLessonIds.length ||
    merged.unlockedLessonIds.length !== local.unlockedLessonIds.length;

  if (changed) {
    writeLocalProgress(user.id, merged);
  }
  return merged;
}

export function subscribeLessonProgress(userId: string, callback: () => void): () => void {
  if (!userId) return () => {};
  let set = listenersByUser.get(userId);
  if (!set) {
    set = new Set();
    listenersByUser.set(userId, set);
  }
  set.add(callback);
  return () => {
    const current = listenersByUser.get(userId);
    if (current) {
      current.delete(callback);
      if (current.size === 0) listenersByUser.delete(userId);
    }
  };
}

/**
 * First lesson (index === 0) is always unlocked.
 * Each subsequent lesson requires 100% completion of the previous lesson's exam
 * (recorded either in passedLessonIds for prevRes or unlockedLessonIds for res).
 */
export function isLessonUnlocked(
  orderedSectionResources: ResourceItem[],
  index: number,
  progress: LessonProgressState
): boolean {
  if (index <= 0) return true;
  const current = orderedSectionResources[index];
  if (!current) return false;
  if (progress.unlockedLessonIds.includes(current.id)) return true;
  const prev = orderedSectionResources[index - 1];
  if (prev && progress.passedLessonIds.includes(prev.id)) return true;
  return false;
}

export function isLessonPassed(lessonId: string, progress: LessonProgressState): boolean {
  if (!lessonId) return false;
  return progress.passedLessonIds.includes(lessonId);
}

/**
 * Records a 100% exam completion locally immediately and reports whether
 * Firestore needs a one-time arrayUnion update on the student's user document.
 */
export function recordLessonExam100Pass(params: {
  userId: string;
  lessonId: string;
  nextLessonId?: string;
  userDoc?: Partial<StudentUser> | null;
}): {
  shouldWriteFirestore: boolean;
  passedIdsToAdd: string[];
  unlockedIdsToAdd: string[];
  progress: LessonProgressState;
} {
  const { userId, lessonId, nextLessonId, userDoc } = params;
  const current = getLessonProgress(userId, userDoc);

  const passedIdsToAdd: string[] = [];
  const unlockedIdsToAdd: string[] = [];

  if (lessonId && !current.passedLessonIds.includes(lessonId)) {
    passedIdsToAdd.push(lessonId);
  }
  if (nextLessonId && !current.unlockedLessonIds.includes(nextLessonId)) {
    unlockedIdsToAdd.push(nextLessonId);
  }

  if (passedIdsToAdd.length === 0 && unlockedIdsToAdd.length === 0) {
    return {
      shouldWriteFirestore: false,
      passedIdsToAdd: [],
      unlockedIdsToAdd: [],
      progress: current,
    };
  }

  const updated: LessonProgressState = {
    passedLessonIds: uniqueStringArray([...current.passedLessonIds, ...passedIdsToAdd]),
    unlockedLessonIds: uniqueStringArray([...current.unlockedLessonIds, ...unlockedIdsToAdd]),
  };

  writeLocalProgress(userId, updated);
  notifyProgressListeners(userId);

  return {
    shouldWriteFirestore: true,
    passedIdsToAdd,
    unlockedIdsToAdd,
    progress: updated,
  };
}

export function clearLessonProgressLocal(userId?: string): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getProgressStorageKey(userId));
  } catch {}
  notifyProgressListeners(userId);
}
