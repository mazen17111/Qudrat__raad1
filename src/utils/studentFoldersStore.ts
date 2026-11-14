import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, isQuotaExceededError, handleFirestoreError, OperationType } from '../firebase';
import { FolderItem, FolderQuestionItem } from '../types';

export interface LocalDeletedSignature {
  courseId: string;
  folderId: string;
  originalQuestionId: string;
  alternateOriginalQuestionId?: string;
  questionText: string;
  imageUrl: string;
}

interface UserFoldersBucket {
  userId: string;
  folders: FolderItem[];
  folderQuestions: FolderQuestionItem[];
  deletedSignatures: LocalDeletedSignature[];
  foldersFetchedAt: number;
  deletedFetchedAt: number;
  foldersSyncedThisSession: boolean;
  deletedSyncedThisSession: boolean;
}

const FOLDERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours (local store stays synced on every mutation)

const getFoldersKey = (userId: string) => `raad_cached_folders_${userId}`;
const getFolderQuestionsKey = (userId: string) => `raad_cached_folder_questions_${userId}`;
const getDeletedKey = (userId: string) => `raad_deleted_folder_questions_${userId}`;
const getMetaKey = (userId: string) => `raad_folders_meta_${userId}`;

const buckets = new Map<string, UserFoldersBucket>();
const listeners = new Map<string, Set<() => void>>();
const inFlightFoldersSync = new Map<string, Promise<void>>();
const inFlightDeletedSync = new Map<string, Promise<void>>();

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function getOrInitBucket(userId: string): UserFoldersBucket {
  const existing = buckets.get(userId);
  if (existing) return existing;

  const meta = loadFromStorage<{ foldersFetchedAt?: number; deletedFetchedAt?: number }>(
    getMetaKey(userId),
    {}
  );

  const bucket: UserFoldersBucket = {
    userId,
    folders: loadFromStorage<FolderItem[]>(getFoldersKey(userId), []),
    folderQuestions: loadFromStorage<FolderQuestionItem[]>(getFolderQuestionsKey(userId), []),
    deletedSignatures: loadFromStorage<LocalDeletedSignature[]>(getDeletedKey(userId), []),
    foldersFetchedAt: Number(meta.foldersFetchedAt) || 0,
    deletedFetchedAt: Number(meta.deletedFetchedAt) || 0,
    foldersSyncedThisSession: false,
    deletedSyncedThisSession: false,
  };
  buckets.set(userId, bucket);
  return bucket;
}

function persistBucketMeta(bucket: UserFoldersBucket): void {
  saveToStorage(getMetaKey(bucket.userId), {
    foldersFetchedAt: bucket.foldersFetchedAt,
    deletedFetchedAt: bucket.deletedFetchedAt,
  });
}

function emit(userId: string): void {
  const set = listeners.get(userId);
  if (!set) return;
  set.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function subscribeStudentFolders(userId: string, listener: () => void): () => void {
  if (!userId) return () => {};
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

export function getStudentFoldersSnapshot(userId?: string): {
  folders: FolderItem[];
  folderQuestions: FolderQuestionItem[];
  deletedSignatures: LocalDeletedSignature[];
  hasLoadedOnce: boolean;
} {
  if (!userId) {
    return { folders: [], folderQuestions: [], deletedSignatures: [], hasLoadedOnce: false };
  }
  const bucket = getOrInitBucket(userId);
  return {
    folders: bucket.folders,
    folderQuestions: bucket.folderQuestions,
    deletedSignatures: bucket.deletedSignatures,
    hasLoadedOnce: bucket.foldersSyncedThisSession || bucket.foldersFetchedAt > 0,
  };
}

export async function ensureStudentFoldersLoaded(userId: string, force = false): Promise<{
  folders: FolderItem[];
  folderQuestions: FolderQuestionItem[];
}> {
  if (!userId) return { folders: [], folderQuestions: [] };
  const bucket = getOrInitBucket(userId);
  const isFresh =
    bucket.foldersSyncedThisSession ||
    (bucket.foldersFetchedAt > 0 && Date.now() - bucket.foldersFetchedAt < FOLDERS_CACHE_TTL_MS);

  if (!force && isFresh) {
    return { folders: bucket.folders, folderQuestions: bucket.folderQuestions };
  }

  const pending = inFlightFoldersSync.get(userId);
  if (pending && !force) {
    await pending;
    return { folders: bucket.folders, folderQuestions: bucket.folderQuestions };
  }

  const run = (async () => {
    try {
      const [foldersSnap, fqSnap] = await Promise.all([
        getDocs(query(collection(db, 'folders'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'folder_questions'), where('userId', '==', userId))),
      ]);

      const nextFolders: FolderItem[] = [];
      foldersSnap.forEach((d) => nextFolders.push({ id: d.id, ...d.data() } as FolderItem));

      const nextQuestions: FolderQuestionItem[] = [];
      fqSnap.forEach((d) => nextQuestions.push({ id: d.id, ...d.data() } as FolderQuestionItem));

      bucket.folders = nextFolders;
      bucket.folderQuestions = nextQuestions;
      bucket.foldersFetchedAt = Date.now();
      bucket.foldersSyncedThisSession = true;

      saveToStorage(getFoldersKey(userId), nextFolders);
      saveToStorage(getFolderQuestionsKey(userId), nextQuestions);
      persistBucketMeta(bucket);
      emit(userId);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'folders');
      } else {
        console.warn('Error loading student folders, using cache:', err);
      }
    } finally {
      inFlightFoldersSync.delete(userId);
    }
  })();

  inFlightFoldersSync.set(userId, run);
  await run;
  return { folders: bucket.folders, folderQuestions: bucket.folderQuestions };
}

export async function ensureDeletedQuestionsLoaded(
  userId: string,
  force = false
): Promise<LocalDeletedSignature[]> {
  if (!userId) return [];
  const bucket = getOrInitBucket(userId);
  const isFresh =
    bucket.deletedSyncedThisSession ||
    (bucket.deletedFetchedAt > 0 && Date.now() - bucket.deletedFetchedAt < FOLDERS_CACHE_TTL_MS);

  if (!force && isFresh) {
    return bucket.deletedSignatures;
  }

  const pending = inFlightDeletedSync.get(userId);
  if (pending && !force) {
    await pending;
    return bucket.deletedSignatures;
  }

  const run = (async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'deleted_folder_questions'), where('userId', '==', userId))
      );

      const merged = [...bucket.deletedSignatures];
      snap.forEach((d) => {
        const data = d.data();
        const entry: LocalDeletedSignature = {
          courseId: String(data.courseId || 'course_default_1'),
          folderId: String(data.folderId || ''),
          originalQuestionId: String(data.originalQuestionId || '').trim(),
          ...(data.alternateOriginalQuestionId
            ? { alternateOriginalQuestionId: String(data.alternateOriginalQuestionId).trim() }
            : {}),
          questionText: String(data.questionText || '').trim(),
          imageUrl: String(data.imageUrl || '').trim(),
        };
        const exists = merged.some(
          (e) =>
            e.courseId === entry.courseId &&
            e.folderId === entry.folderId &&
            ((entry.originalQuestionId && e.originalQuestionId === entry.originalQuestionId) ||
              (entry.questionText &&
                e.questionText === entry.questionText &&
                e.imageUrl === entry.imageUrl))
        );
        if (!exists) {
          merged.push(entry);
        }
      });

      bucket.deletedSignatures = merged;
      bucket.deletedFetchedAt = Date.now();
      bucket.deletedSyncedThisSession = true;

      saveToStorage(getDeletedKey(userId), merged);
      persistBucketMeta(bucket);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'deleted_folder_questions');
      }
    } finally {
      inFlightDeletedSync.delete(userId);
    }
  })();

  inFlightDeletedSync.set(userId, run);
  await run;
  return bucket.deletedSignatures;
}

export function addLocalFolder(userId: string, folder: FolderItem): void {
  if (!userId || !folder?.id) return;
  const bucket = getOrInitBucket(userId);
  if (!bucket.folders.some((f) => f.id === folder.id)) {
    bucket.folders = [...bucket.folders, folder];
    saveToStorage(getFoldersKey(userId), bucket.folders);
    emit(userId);
  }
}

export function removeLocalFolder(userId: string, folderId: string): void {
  if (!userId || !folderId) return;
  const bucket = getOrInitBucket(userId);
  bucket.folders = bucket.folders.filter((f) => f.id !== folderId);
  bucket.folderQuestions = bucket.folderQuestions.filter((q) => q.folderId !== folderId);
  saveToStorage(getFoldersKey(userId), bucket.folders);
  saveToStorage(getFolderQuestionsKey(userId), bucket.folderQuestions);
  emit(userId);
}

export function addLocalFolderQuestion(userId: string, item: FolderQuestionItem): void {
  if (!userId || !item?.id) return;
  const bucket = getOrInitBucket(userId);
  if (!bucket.folderQuestions.some((q) => q.id === item.id)) {
    bucket.folderQuestions = [item, ...bucket.folderQuestions];
    saveToStorage(getFolderQuestionsKey(userId), bucket.folderQuestions);
    emit(userId);
  }
}

export function removeLocalFolderQuestions(userId: string, questionIds: string[]): void {
  if (!userId || !questionIds.length) return;
  const idSet = new Set(questionIds);
  const bucket = getOrInitBucket(userId);
  bucket.folderQuestions = bucket.folderQuestions.filter((q) => !idSet.has(q.id));
  saveToStorage(getFolderQuestionsKey(userId), bucket.folderQuestions);
  emit(userId);
}

export function removeLocalFolderQuestionsByFolder(userId: string, folderId: string): void {
  if (!userId || !folderId) return;
  const bucket = getOrInitBucket(userId);
  bucket.folderQuestions = bucket.folderQuestions.filter((q) => q.folderId !== folderId);
  saveToStorage(getFolderQuestionsKey(userId), bucket.folderQuestions);
  emit(userId);
}

export function addLocalDeletedSignature(userId: string, entry: LocalDeletedSignature): void {
  if (!userId) return;
  const bucket = getOrInitBucket(userId);
  const exists = bucket.deletedSignatures.some(
    (e) =>
      e.courseId === entry.courseId &&
      e.folderId === entry.folderId &&
      ((entry.originalQuestionId && e.originalQuestionId === entry.originalQuestionId) ||
        (entry.questionText &&
          e.questionText === entry.questionText &&
          e.imageUrl === entry.imageUrl))
  );
  if (!exists) {
    bucket.deletedSignatures = [...bucket.deletedSignatures, entry];
    saveToStorage(getDeletedKey(userId), bucket.deletedSignatures);
  }
}
