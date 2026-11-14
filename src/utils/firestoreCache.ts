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

// Long TTL when version matches systemSettings.catalogUpdatedAt; shorter fallback TTL otherwise
const VERSIONED_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const UNVERSIONED_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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

export function isCatalogCacheFresh(remoteVersion?: number, includeContent = true): boolean {
  const meta = readMeta();
  const fetchedAt = includeContent ? meta.contentFetchedAt : meta.coursesFetchedAt;
  if (!fetchedAt) return false;

  if (includeContent && !hasRealCachedContent()) {
    return false;
  }

  const now = Date.now();
  if (remoteVersion && remoteVersion > 0) {
    if (meta.version !== remoteVersion) {
      return false;
    }
    return now - fetchedAt < VERSIONED_CACHE_TTL_MS;
  }

  return now - fetchedAt < UNVERSIONED_CACHE_TTL_MS;
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
    return {
      courses: loadCachedCourses(),
      sections: loadCachedSections(),
      resources: loadCachedResources(),
      contentItems: loadCachedContentItems(),
    };
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

      try {
        localStorage.setItem(CACHED_COURSES_KEY, JSON.stringify(coursesList));
        if (coursesList.length > 0) {
          localStorage.setItem('raad_platform_seeder_initialized', 'true');
        }
        if (sectionsSnap) {
          localStorage.setItem(CACHED_SECTIONS_KEY, JSON.stringify(sectionsList));
        }
        if (resourcesSnap) {
          localStorage.setItem(CACHED_RESOURCES_KEY, JSON.stringify(resourcesList));
        }
        if (itemsSnap) {
          localStorage.setItem(CACHED_CONTENT_ITEMS_KEY, JSON.stringify(itemsList));
        }
      } catch {}

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
      return {
        courses: loadCachedCourses(),
        sections: loadCachedSections(),
        resources: loadCachedResources(),
        contentItems: loadCachedContentItems(),
      };
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

/**
 * Called from AdminPanel whenever admin creates, edits, or deletes
 * a course, section, resource, or content item so connected students
 * refresh their catalog cache immediately via the single system_settings listener.
 */
export async function bumpCatalogVersion(): Promise<void> {
  const version = Date.now();
  writeMeta({ version: 0, coursesFetchedAt: 0, contentFetchedAt: 0 });
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
