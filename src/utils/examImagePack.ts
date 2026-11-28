import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { trackLocalRead, trackLocalWrite } from './localUsageTracker';

const PACK_PREFIX = 'fbpack://';
const CACHE_STORAGE_PREFIX = 'raad_img_pack_v1_';

const memoryPackCache = new Map<string, string[]>();
const inFlightPackLoads = new Map<string, Promise<string[] | null>>();

export function isExamImagePackUrl(url?: string | null): boolean {
  return typeof url === 'string' && url.startsWith(PACK_PREFIX);
}

export function parseExamImagePackUrl(url: string): { packId: string; index: number } | null {
  if (!isExamImagePackUrl(url)) return null;
  const rest = url.slice(PACK_PREFIX.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx <= 0) return null;
  const packId = rest.slice(0, slashIdx);
  const index = parseInt(rest.slice(slashIdx + 1), 10);
  if (!packId || isNaN(index) || index < 0) return null;
  return { packId, index };
}

function loadPackFromLocalStorage(packId: string): string[] | null {
  try {
    const raw = localStorage.getItem(`${CACHE_STORAGE_PREFIX}${packId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function savePackToLocalStorage(packId: string, images: string[]) {
  try {
    localStorage.setItem(`${CACHE_STORAGE_PREFIX}${packId}`, JSON.stringify(images));
  } catch {
    // Ignore localStorage quota exceeded; memoryPackCache still holds it for this session
  }
}

export async function loadExamImagePack(packId: string): Promise<string[] | null> {
  const memHit = memoryPackCache.get(packId);
  if (memHit) return memHit;

  const lsHit = loadPackFromLocalStorage(packId);
  if (lsHit) {
    memoryPackCache.set(packId, lsHit);
    return lsHit;
  }

  const existingPromise = inFlightPackLoads.get(packId);
  if (existingPromise) return existingPromise;

  const promise = (async (): Promise<string[] | null> => {
    try {
      const snap = await getDoc(doc(db, 'exam_image_packs', packId));
      trackLocalRead(1, 'تحميل حزمة صور اختبار');
      if (!snap.exists()) return null;
      const data = snap.data();
      const images = Array.isArray(data?.images) ? data.images.map((s: any) => String(s || '')) : [];
      if (images.length > 0) {
        memoryPackCache.set(packId, images);
        savePackToLocalStorage(packId, images);
      }
      return images;
    } catch (err) {
      console.warn('Could not load exam image pack:', packId, err);
      return null;
    } finally {
      inFlightPackLoads.delete(packId);
    }
  })();

  inFlightPackLoads.set(packId, promise);
  return promise;
}

export async function resolveExamImageUrl(url?: string | null): Promise<string> {
  if (!url) return '';
  const parsed = parseExamImagePackUrl(url);
  if (!parsed) return url;

  const images = await loadExamImagePack(parsed.packId);
  if (!images || parsed.index >= images.length) return '';
  return images[parsed.index] || '';
}

/**
 * Packs an array of base64 DataURLs into minimal Firestore docs (~600 KB per doc)
 * so even 100+ questions only consume 2-4 Firestore writes total instead of hundreds.
 */
export async function saveCompressedExamImagePacks(
  dataUrls: string[],
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const MAX_DOC_BYTES = 580 * 1024; // well under Firestore 1 MiB limit
  const MAX_ITEMS_PER_PACK = 35;

  const chunks: string[][] = [];
  let current: string[] = [];
  let currentBytes = 0;

  for (const dataUrl of dataUrls) {
    const itemBytes = dataUrl.length + 32;
    if (
      current.length > 0 &&
      (current.length >= MAX_ITEMS_PER_PACK || currentBytes + itemBytes > MAX_DOC_BYTES)
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(dataUrl);
    currentBytes += itemBytes;
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  const resolvedUrls: string[] = [];
  const baseStamp = Date.now();
  let uploadedCount = 0;

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const packImages = chunks[cIdx];
    const packId = `pack_${baseStamp}_${cIdx}_${Math.random().toString(36).slice(2, 7)}`;

    await setDoc(doc(db, 'exam_image_packs', packId), {
      id: packId,
      images: packImages,
      count: packImages.length,
      createdAt: new Date().toISOString(),
    });
    trackLocalWrite(1, 'حفظ حزمة صور اختبار مضغوطة');

    memoryPackCache.set(packId, packImages);
    savePackToLocalStorage(packId, packImages);

    packImages.forEach((_, itemIdx) => {
      resolvedUrls.push(`${PACK_PREFIX}${packId}/${itemIdx}`);
    });

    uploadedCount += packImages.length;
    onProgress?.(uploadedCount, dataUrls.length);
  }

  return resolvedUrls;
}

export function useResolvedExamImageUrl(rawUrl?: string | null): string {
  const [resolved, setResolved] = useState<string>(() => {
    if (!rawUrl) return '';
    const parsed = parseExamImagePackUrl(rawUrl);
    if (!parsed) return rawUrl;
    const mem = memoryPackCache.get(parsed.packId);
    if (mem && mem[parsed.index]) return mem[parsed.index];
    const ls = loadPackFromLocalStorage(parsed.packId);
    if (ls && ls[parsed.index]) {
      memoryPackCache.set(parsed.packId, ls);
      return ls[parsed.index];
    }
    return '';
  });

  useEffect(() => {
    let active = true;
    if (!rawUrl) {
      setResolved('');
      return;
    }
    const parsed = parseExamImagePackUrl(rawUrl);
    if (!parsed) {
      setResolved(rawUrl);
      return;
    }

    const mem = memoryPackCache.get(parsed.packId);
    if (mem && mem[parsed.index]) {
      setResolved(mem[parsed.index]);
      return;
    }

    resolveExamImageUrl(rawUrl).then((val) => {
      if (active) setResolved(val);
    });

    return () => {
      active = false;
    };
  }, [rawUrl]);

  return resolved;
}

interface ExamQuestionImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
}

export const ExamQuestionImage: React.FC<ExamQuestionImageProps> = ({ src, alt = '', ...rest }) => {
  const resolvedSrc = useResolvedExamImageUrl(src);
  if (!resolvedSrc) return null;
  return React.createElement('img', { src: resolvedSrc, alt, ...rest });
};
