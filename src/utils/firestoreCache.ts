import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import {
  db,
  resolveVideoUrl,
  isQuotaExceededError,
  handleFirestoreError,
  OperationType,
  INITIAL_COURSES,
  INITIAL_SECTIONS,
  INITIAL_RESOURCES,
  INITIAL_CONTENT_ITEMS,
} from '../firebase';
import { CourseItem, SectionItem, ResourceItem, ContentItem } from '../types';

export const CACHED_COURSES_KEY = 'raad_cached_courses';
export const CACHED_SECTIONS_KEY = 'raad_cached_sections';
export const CACHED_RESOURCES_KEY = 'raad_cached_resources';
export const CACHED_CONTENT_ITEMS_KEY = 'raad_cached_content_items';
const CATALOG_META_KEY = 'raad_catalog_cache_meta';

// When systemSettings.catalogUpdatedAt matches our cached version, cache stays valid indefinitely (0 reads until real admin update).
// Fallback TTL applies only when no catalogUpdatedAt exists yet on system_settings/global.
const UNVERSIONED_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CATALOG_UPDATED_EVENT = 'raad-catalog-updated';

interface CatalogCacheMeta {
  coursesFetchedAt: number;
  contentFetchedAt: number;
  version: number;
}

export interface CatalogSnapshot {
  courses: CourseItem[];
  sections: SectionItem[];
  resources: ResourceItem[];
  contentItems: ContentItem[];
}

function readMeta(): CatalogCacheMeta {
  if (typeof window === 'undefined') {
    return { coursesFetchedAt: 0, contentFetchedAt: 0, version: 0 };
  }
  try {
    const raw = localStorage.getItem(CATALOG_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        coursesFetchedAt: Number(parsed.coursesFetchedAt) || 0,
        contentFetchedAt: Number(parsed.contentFetchedAt) || 0,
        version: Number(parsed.version) || 0,
      };
    }
  } catch {}
  return { coursesFetchedAt: 0, contentFetchedAt: 0, version: 0 };
}

function writeMeta(meta: Partial<CatalogCacheMeta>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readMeta();
    localStorage.setItem(CATALOG_META_KEY, JSON.stringify({ ...current, ...meta }));
  } catch {}
}

function normalizeContentItems(items: ContentItem[]): ContentItem[] {
  return items.map((i) =>
    i.type === 'video'
      ? {
          ...i,
          url: resolveVideoUrl(i),
          ...(i.backupUrl ? { backupUrl: resolveVideoUrl(i.backupUrl) } : {}),
        }
      : i
  );
}

export function loadCachedCourses(): CourseItem[] {
  if (typeof window === 'undefined') return INITIAL_COURSES;
  try {
    const saved = localStorage.getItem(CACHED_COURSES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return INITIAL_COURSES;
}

export function loadCachedSections(): SectionItem[] {
  if (typeof window === 'undefined') return INITIAL_SECTIONS;
  try {
    const cached = localStorage.getItem(CACHED_SECTIONS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0 && !parsed.some((s: SectionItem) => s.id === 'sec_hamada')) {
        return parsed;
      }
    }
  } catch {}
  return INITIAL_SECTIONS;
}

export function loadCachedResources(): ResourceItem[] {
  if (typeof window === 'undefined') return INITIAL_RESOURCES;
  try {
    const cached = localStorage.getItem(CACHED_RESOURCES_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0 && !parsed.some((r: ResourceItem) => r.id === 'res_hamada_main')) {
        return parsed;
      }
    }
  } catch {}
  return INITIAL_RESOURCES;
}

export function loadCachedContentItems(): ContentItem[] {
  if (typeof window === 'undefined') return INITIAL_CONTENT_ITEMS;
  try {
    const cached = localStorage.getItem(CACHED_CONTENT_ITEMS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        !parsed.some(
          (i: ContentItem) =>
            i.id === 'item_video_1' ||
            i.id === 'item_exam_1' ||
            (i.url && i.url.includes('BigBuckBunny'))
        )
      ) {
        return normalizeContentItems(parsed);
      }
    }
  } catch {}
  return INITIAL_CONTENT_ITEMS;
}

export function hasRealCachedContent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(
      localStorage.getItem(CACHED_COURSES_KEY) &&
        localStorage.getItem(CACHED_SECTIONS_KEY) &&
        localStorage.getItem(CACHED_RESOURCES_KEY) &&
        localStorage.getItem(CACHED_CONTENT_ITEMS_KEY)
    );
  } catch {
    return false;
  }
}

let catalogSyncedThisSession = false;

export function hasCatalogSyncedInSession(): boolean {
  return catalogSyncedThisSession;
}

export function isCatalogCacheFresh(remoteVersion?: number, includeContent = true): boolean {
  const meta = readMeta();
  const fetchedAt = includeContent ? meta.contentFetchedAt : meta.coursesFetchedAt;
  if (!fetchedAt) return false;

  if (includeContent && !hasRealCachedContent()) {
    return false;
  }

  // If systemSettings has a catalogUpdatedAt version and our local cache already matches it,
  // NEVER re-fetch from Firestore until an admin makes a real update and bumps the version!
  if (remoteVersion && remoteVersion > 0) {
    return meta.version === remoteVersion;
  }

  // When no remoteVersion is set yet, reuse session cache or 24-hour localStorage cache
  if (catalogSyncedThisSession) {
    return true;
  }

  return Date.now() - fetchedAt < UNVERSIONED_CACHE_TTL_MS;
}

export function getCachedCatalogSnapshot(): CatalogSnapshot {
  return {
    courses: loadCachedCourses(),
    sections: loadCachedSections(),
    resources: loadCachedResources(),
    contentItems: loadCachedContentItems(),
  };
}

export function saveCatalogToCache(
  partial: Partial<CatalogSnapshot>,
  options: { version?: number; emit?: boolean; markSynced?: boolean } = {}
): CatalogSnapshot {
  const { version, emit = true, markSynced = true } = options;

  if (typeof window !== 'undefined') {
    try {
      if (partial.courses) {
        localStorage.setItem(CACHED_COURSES_KEY, JSON.stringify(partial.courses));
        if (partial.courses.length > 0) {
          localStorage.setItem('raad_platform_seeder_initialized', 'true');
        }
      }
      if (partial.sections) {
        localStorage.setItem(CACHED_SECTIONS_KEY, JSON.stringify(partial.sections));
        localStorage.setItem('raad_cached_admin_sections', JSON.stringify(partial.sections));
      }
      if (partial.resources) {
        localStorage.setItem(CACHED_RESOURCES_KEY, JSON.stringify(partial.resources));
        localStorage.setItem('raad_cached_admin_resources', JSON.stringify(partial.resources));
      }
      if (partial.contentItems) {
        const normalized = normalizeContentItems(partial.contentItems);
        localStorage.setItem(CACHED_CONTENT_ITEMS_KEY, JSON.stringify(normalized));
        localStorage.setItem('raad_cached_admin_items', JSON.stringify(normalized));
      }
    } catch {}
  }

  if (markSynced) {
    const now = Date.now();
    catalogSyncedThisSession = true;
    writeMeta({
      coursesFetchedAt: now,
      contentFetchedAt: now,
      ...(version ? { version } : {}),
    });
  }

  const snapshot = getCachedCatalogSnapshot();

  if (emit && typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT, { detail: snapshot }));
    } catch {}
  }

  return snapshot;
}

export function subscribeCatalogUpdated(listener: (snapshot: CatalogSnapshot) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CatalogSnapshot>).detail;
    listener(detail || getCachedCatalogSnapshot());
  };
  window.addEventListener(CATALOG_UPDATED_EVENT, handler);
  return () => window.removeEventListener(CATALOG_UPDATED_EVENT, handler);
}

let inFlightSync: Promise<CatalogSnapshot> | null = null;
let lastSyncedVersionInMemory = 0;

export async function syncCatalogFromFirestore({
  force = false,
  remoteVersion,
  includeContent = true,
}: {
  force?: boolean;
  remoteVersion?: number;
  includeContent?: boolean;
} = {}): Promise<CatalogSnapshot> {
  if (!force && isCatalogCacheFresh(remoteVersion, includeContent)) {
    catalogSyncedThisSession = true;
    return getCachedCatalogSnapshot();
  }

  // Deduplicate concurrent calls within the same tick/render cycle
  if (inFlightSync && (!remoteVersion || remoteVersion === lastSyncedVersionInMemory)) {
    return inFlightSync;
  }

  lastSyncedVersionInMemory = remoteVersion || 0;

  inFlightSync = (async () => {
    try {
      const coursesSnapPromise = getDocs(collection(db, 'courses'));
      const [coursesSnap, sectionsSnap, resourcesSnap, itemsSnap] = await Promise.all([
        coursesSnapPromise,
        includeContent ? getDocs(collection(db, 'sections')) : Promise.resolve(null),
        includeContent ? getDocs(collection(db, 'resources')) : Promise.resolve(null),
        includeContent ? getDocs(collection(db, 'content_items')) : Promise.resolve(null),
      ]);

      const coursesList: CourseItem[] = [];
      coursesSnap.forEach((d) => coursesList.push({ id: d.id, ...d.data() } as CourseItem));
      coursesList.sort((a, b) => (a.order || 0) - (b.order || 0));

      let sectionsList = loadCachedSections();
      let resourcesList = loadCachedResources();
      let itemsList = loadCachedContentItems();

      if (sectionsSnap) {
        const list: SectionItem[] = [];
        sectionsSnap.forEach((d) => list.push({ id: d.id, ...d.data() } as SectionItem));
        list.sort((a, b) => (a.order || 0) - (b.order || 0));
        sectionsList = list;
      }

      if (resourcesSnap) {
        const list: ResourceItem[] = [];
        resourcesSnap.forEach((d) => list.push({ id: d.id, ...d.data() } as ResourceItem));
        list.sort((a, b) => (a.order || 0) - (b.order || 0));
        resourcesList = list;
      }

      if (itemsSnap) {
        const list: ContentItem[] = [];
        itemsSnap.forEach((d) => {
          const raw = { id: d.id, ...d.data() } as ContentItem;
          if (raw.type === 'video') {
            raw.url = resolveVideoUrl(raw);
            if (raw.backupUrl) {
              raw.backupUrl = resolveVideoUrl(raw.backupUrl);
            }
          }
          list.push(raw);
        });
        list.sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (tA !== tB) return tA - tB;
          return (a.id || '').localeCompare(b.id || '');
        });
        itemsList = list;
      }

      saveCatalogToCache(
        {
          courses: coursesList,
          ...(sectionsSnap ? { sections: sectionsList } : {}),
          ...(resourcesSnap ? { resources: resourcesList } : {}),
          ...(itemsSnap ? { contentItems: itemsList } : {}),
        },
        { version: remoteVersion, emit: false, markSynced: false }
      );

      catalogSyncedThisSession = true;
      const now = Date.now();
      writeMeta({
        coursesFetchedAt: now,
        ...(includeContent ? { contentFetchedAt: now } : {}),
        ...(remoteVersion ? { version: remoteVersion } : {}),
      });

      return {
        courses: coursesList,
        sections: sectionsList,
        resources: resourcesList,
        contentItems: itemsList,
      };
    } catch (err) {
      if (isQuotaExceededError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'courses/catalog');
      } else {
        console.warn('Catalog sync fallback to cache:', err);
      }
      return getCachedCatalogSnapshot();
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

/**
 * Called from AdminPanel whenever admin creates, edits, or deletes
 * a course, section, resource, or content item.
 * Keeps the admin's own local cache up-to-date (0 self re-reads!) while bumping
 * system_settings/global.catalogUpdatedAt so remote students sync only on real updates.
 */
export async function bumpCatalogVersion(updatedSnapshot?: Partial<CatalogSnapshot>): Promise<void> {
  const version = Date.now();
  if (updatedSnapshot) {
    saveCatalogToCache(updatedSnapshot, { version, emit: true, markSynced: true });
  } else {
    const now = Date.now();
    catalogSyncedThisSession = true;
    writeMeta({ version, coursesFetchedAt: now, contentFetchedAt: now });
  }
  try {
    await setDoc(
      doc(db, 'system_settings', 'global'),
      { catalogUpdatedAt: version },
      { merge: true }
    );
  } catch (err) {
    console.warn('Non-blocking catalog version bump error:', err);
  }
}
