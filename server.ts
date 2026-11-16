import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import http from 'http';
import https from 'https';
import { Readable } from 'stream';
import { exec } from 'child_process';
import crypto from 'crypto';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc
} from 'firebase/firestore';

const app = express();
const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

// Ensure upload directories exist
const uploadBaseDir = path.resolve(process.cwd(), 'uploads');
const videosDir = path.join(uploadBaseDir, 'videos');
const filesDir = path.join(uploadBaseDir, 'files');
const imagesDir = path.join(uploadBaseDir, 'images');
const cachedDir = path.join(uploadBaseDir, 'cached');

[uploadBaseDir, videosDir, filesDir, imagesDir, cachedDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Clean up orphaned temporary download/ffmpeg files in cachedDir/videosDir on boot
try {
  for (const dir of [cachedDir, videosDir]) {
    for (const fname of fs.readdirSync(dir)) {
      if (fname.includes('.tmp_') || fname.includes('.opt_') || fname.endsWith('_webtmp.mp4')) {
        try {
          fs.unlinkSync(path.join(dir, fname));
        } catch {}
      }
    }
  }
} catch {}

const VIDEO_EXT_REGEX = /\.(mp4|mov|mkv|webm|avi|m4v|wmv|flv|3gp|ts|mpeg|mpg)$/i;

function isVideoFile(mimetype?: string, filename?: string): boolean {
  const mime = (mimetype || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  if (filename && VIDEO_EXT_REGEX.test(filename)) return true;
  return false;
}

function normalizeServedMimeType(mimeType?: string, filePathOrName?: string): string {
  const lowerMime = (mimeType || '').toLowerCase().trim();
  const lowerName = (filePathOrName || '').toLowerCase().trim();

  if (
    lowerName.endsWith('.mp4') ||
    lowerName.endsWith('.m4v') ||
    lowerName.endsWith('.mov') ||
    lowerMime === 'video/mp4' ||
    lowerMime === 'video/quicktime' ||
    lowerMime === 'video/x-m4v'
  ) {
    return 'video/mp4';
  }
  if (lowerName.endsWith('.webm') || lowerMime === 'video/webm') {
    return 'video/webm';
  }
  if (lowerName.endsWith('.ogv') || lowerName.endsWith('.ogg') || lowerMime === 'video/ogg') {
    return 'video/ogg';
  }
  if (lowerName.endsWith('.mkv') || lowerMime === 'video/x-matroska') {
    return 'video/x-matroska';
  }
  if (lowerName.endsWith('.pdf') || lowerMime === 'application/pdf') {
    return 'application/pdf';
  }
  if (lowerName.endsWith('.png') || lowerMime === 'image/png') {
    return 'image/png';
  }
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerMime === 'image/jpeg') {
    return 'image/jpeg';
  }
  if (lowerName.endsWith('.webp') || lowerMime === 'image/webp') {
    return 'image/webp';
  }
  if (lowerName.endsWith('.gif') || lowerMime === 'image/gif') {
    return 'image/gif';
  }
  if (lowerName.endsWith('.svg') || lowerMime === 'image/svg+xml') {
    return 'image/svg+xml';
  }

  if (
    !lowerMime ||
    lowerMime === 'application/octet-stream' ||
    lowerMime === 'binary/octet-stream'
  ) {
    if (isVideoFile('', lowerName)) return 'video/mp4';
    return 'application/octet-stream';
  }

  return mimeType || 'application/octet-stream';
}

// Configure Multer Storage with sanitized filenames
const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (isVideoFile(file.mimetype, file.originalname)) {
      cb(null, videosDir);
    } else if ((file.mimetype || '').toLowerCase().startsWith('image/')) {
      cb(null, imagesDir);
    } else {
      cb(null, filesDir);
    }
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname || '').replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
    const base = path
      .basename(file.originalname || 'file', path.extname(file.originalname || ''))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'media';
    cb(null, `${timestamp}_${base}${ext.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB max file upload
  },
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Persistent Local Media Index (avoids Firestore reads after server restarts)
const mediaIndexPath = path.join(uploadBaseDir, '.media-index.json');
const mediaMetadataCache = new Map<string, any>();

function loadLocalMediaIndex() {
  try {
    if (fs.existsSync(mediaIndexPath)) {
      const parsed = JSON.parse(fs.readFileSync(mediaIndexPath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        for (const [key, val] of Object.entries(parsed)) {
          if (val && typeof val === 'object') {
            mediaMetadataCache.set(key, val);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[Media Index] Could not read local index:', err.message);
  }
}

function persistLocalMediaEntry(meta: any) {
  if (!meta || !meta.id) return;
  mediaMetadataCache.set(meta.id, meta);
  try {
    const obj: Record<string, any> = {};
    mediaMetadataCache.forEach((val, key) => {
      obj[key] = val;
    });
    const tmpIndexPath = `${mediaIndexPath}.tmp`;
    fs.writeFileSync(tmpIndexPath, JSON.stringify(obj), 'utf8');
    fs.renameSync(tmpIndexPath, mediaIndexPath);
  } catch (err: any) {
    console.warn('[Media Index] Could not persist local index:', err.message);
  }
}

loadLocalMediaIndex();

// ================= SERVER FIREBASE FIRESTORE INIT =================
let telegramDb: any = null;
let firebaseProjectId = 'euphoric-acre-pcbh2';
let firebaseDatabaseId = 'ai-studio-44eeee5c-699a-48f1-a6e0-19c9b1ea4972';
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (firebaseConfig.projectId) firebaseProjectId = String(firebaseConfig.projectId);
    if (firebaseConfig.firestoreDatabaseId) firebaseDatabaseId = String(firebaseConfig.firestoreDatabaseId);
    const fbApp = initializeApp(firebaseConfig, 'serverTelegramApp');
    telegramDb = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);
    console.log('[Server] Firebase Firestore initialized successfully');
  }
} catch (err: any) {
  console.warn('[Server] Firebase init notice in server.ts:', err.message);
}

// ================= REAL DAILY FIREBASE USAGE LEDGER & CLOUD MONITORING =================
const usageLedgerPath = path.join(uploadBaseDir, '.firebase-usage-daily.json');

interface DailyUsageLedger {
  date: string;
  reads: number;
  writes: number;
  deletes: number;
  cacheHits: number;
  lastOperationLabel: string;
  updatedAt: number;
}

function getFirestoreQuotaDateString(): string {
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

function createEmptyDailyLedger(): DailyUsageLedger {
  return {
    date: getFirestoreQuotaDateString(),
    reads: 0,
    writes: 0,
    deletes: 0,
    cacheHits: 0,
    lastOperationLabel: '',
    updatedAt: Date.now(),
  };
}

let dailyUsageLedger: DailyUsageLedger = (() => {
  const today = getFirestoreQuotaDateString();
  try {
    if (fs.existsSync(usageLedgerPath)) {
      const parsed = JSON.parse(fs.readFileSync(usageLedgerPath, 'utf8')) as Partial<DailyUsageLedger>;
      if (parsed && parsed.date === today) {
        return {
          date: today,
          reads: Math.max(0, Number(parsed.reads) || 0),
          writes: Math.max(0, Number(parsed.writes) || 0),
          deletes: Math.max(0, Number(parsed.deletes) || 0),
          cacheHits: Math.max(0, Number(parsed.cacheHits) || 0),
          lastOperationLabel: String(parsed.lastOperationLabel || ''),
          updatedAt: Number(parsed.updatedAt) || Date.now(),
        };
      }
    }
  } catch {}
  return createEmptyDailyLedger();
})();

let usagePersistTimer: NodeJS.Timeout | null = null;
function schedulePersistDailyLedger() {
  if (usagePersistTimer) return;
  usagePersistTimer = setTimeout(() => {
    usagePersistTimer = null;
    try {
      const tmp = `${usageLedgerPath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(dailyUsageLedger), 'utf8');
      fs.renameSync(tmp, usageLedgerPath);
    } catch {}
  }, 500);
}

function rollDailyLedgerIfNeeded(): DailyUsageLedger {
  const today = getFirestoreQuotaDateString();
  if (dailyUsageLedger.date !== today) {
    dailyUsageLedger = createEmptyDailyLedger();
    schedulePersistDailyLedger();
  }
  return dailyUsageLedger;
}

function recordServerFirestoreOp(
  kind: 'read' | 'write' | 'delete' | 'cacheHit',
  count = 1,
  label?: string
) {
  const safeCount = Math.max(0, Math.round(count));
  if (safeCount <= 0) return;
  const ledger = rollDailyLedgerIfNeeded();
  if (kind === 'read') ledger.reads += safeCount;
  else if (kind === 'write') ledger.writes += safeCount;
  else if (kind === 'delete') ledger.deletes += safeCount;
  else if (kind === 'cacheHit') ledger.cacheHits += safeCount;
  if (label) ledger.lastOperationLabel = label;
  ledger.updatedAt = Date.now();
  schedulePersistDailyLedger();
}

let cachedMonitoringAccessToken: { token: string; expiresAt: number } | null = null;
let cachedMonitoringResult: {
  expiresAt: number;
  payload: any;
} | null = null;
let monitoringForbiddenUntil = 0;

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getMonitoringAccessToken(): Promise<{ token: string | null; mode: 'service_account' | 'env_token' | 'metadata' | 'none' }> {
  if (process.env.GOOGLE_MONITORING_ACCESS_TOKEN) {
    return { token: process.env.GOOGLE_MONITORING_ACCESS_TOKEN, mode: 'env_token' };
  }

  const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (rawSa) {
    if (cachedMonitoringAccessToken && Date.now() < cachedMonitoringAccessToken.expiresAt - 60_000) {
      return { token: cachedMonitoringAccessToken.token, mode: 'service_account' };
    }
    try {
      const sa = JSON.parse(rawSa);
      if (sa.client_email && sa.private_key) {
        const nowSec = Math.floor(Date.now() / 1000);
        const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
        const claims = base64UrlEncode(
          JSON.stringify({
            iss: sa.client_email,
            scope: 'https://www.googleapis.com/auth/monitoring.read',
            aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
            iat: nowSec,
            exp: nowSec + 3600,
          })
        );
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(`${header}.${claims}`);
        const signature = base64UrlEncode(signer.sign(sa.private_key));
        const jwt = `${header}.${claims}.${signature}`;

        const tokenResp = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
          }),
        });
        if (tokenResp.ok) {
          const tokenJson: any = await tokenResp.json();
          if (tokenJson.access_token) {
            cachedMonitoringAccessToken = {
              token: tokenJson.access_token,
              expiresAt: Date.now() + (Number(tokenJson.expires_in) || 3600) * 1000,
            };
            return { token: tokenJson.access_token, mode: 'service_account' };
          }
        }
      }
    } catch (e: any) {
      console.warn('[Monitoring Auth] Service account token notice:', e?.message || e);
    }
  }

  if (Date.now() < monitoringForbiddenUntil) {
    return { token: null, mode: 'none' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const mResp = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' }, signal: controller.signal }
    );
    clearTimeout(timer);
    if (mResp.ok) {
      const mData: any = await mResp.json();
      if (mData?.access_token) {
        return { token: mData.access_token, mode: 'metadata' };
      }
    }
  } catch {}

  return { token: null, mode: 'none' };
}

function getPacificMidnightIso(): string {
  const ptDate = getFirestoreQuotaDateString(); // YYYY-MM-DD in America/Los_Angeles
  // Compute UTC instant corresponding to 00:00:00 in America/Los_Angeles
  const probeUtc = new Date(`${ptDate}T08:00:00.000Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(probeUtc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const ptHourAt08Utc = get('hour') % 24;
  const offsetHours = 8 - ptHourAt08Utc;
  const midnightMs = Date.UTC(
    Number(ptDate.slice(0, 4)),
    Number(ptDate.slice(5, 7)) - 1,
    Number(ptDate.slice(8, 10)),
    offsetHours,
    0,
    0
  );
  return new Date(midnightMs).toISOString();
}

async function queryCloudMonitoringSum(
  accessToken: string,
  metricType: string,
  startIso: string,
  endIso: string
): Promise<{ ok: true; value: number } | { ok: false; status: number }> {
  const url =
    `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(firebaseProjectId)}/timeSeries` +
    `?filter=${encodeURIComponent(`metric.type="${metricType}"`)}` +
    `&interval.startTime=${encodeURIComponent(startIso)}` +
    `&interval.endTime=${encodeURIComponent(endIso)}` +
    `&aggregation.alignmentPeriod=86400s` +
    `&aggregation.perSeriesAligner=ALIGN_SUM` +
    `&aggregation.crossSeriesReducer=REDUCE_SUM`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    return { ok: false, status: resp.status };
  }
  const data: any = await resp.json();
  let sum = 0;
  for (const series of data.timeSeries || []) {
    for (const point of series.points || []) {
      const v = point?.value?.int64Value ?? point?.value?.doubleValue ?? 0;
      sum += Number(v) || 0;
    }
  }
  return { ok: true, value: Math.round(sum) };
}

const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

// Helper to persist uploaded media chunks into Firebase Firestore (up to 20MB)
async function saveMediaToFirebase(
  mediaId: string,
  filePath: string,
  fileName: string,
  mimeType: string,
  relativeUrl: string
): Promise<boolean> {
  if (!telegramDb) return false;
  try {
    const stat = fs.statSync(filePath);
    const maxFirestoreBytes = 20 * 1024 * 1024; // 20 MB limit for chunked Firestore storage
    if (stat.size > maxFirestoreBytes) {
      const meta = {
        id: mediaId,
        fileName,
        mimeType,
        size: stat.size,
        localUrl: relativeUrl,
        storedInFirestore: false,
        createdAt: new Date().toISOString(),
      };
      persistLocalMediaEntry(meta);
      await setDoc(doc(telegramDb, 'media_files', mediaId), meta);
      recordServerFirestoreOp('write', 1, 'حفظ بيانات ملف وسائط');
      return false;
    }

    const buffer = fs.readFileSync(filePath);
    const chunkSize = 480 * 1024; // 480 KB raw bytes (~640 KB base64 < 1 MiB Firestore limit)
    const totalChunks = Math.ceil(buffer.length / chunkSize);

    // Upload chunks in parallel batches of 5 for high speed
    const batchSize = 5;
    for (let i = 0; i < totalChunks; i += batchSize) {
      const promises: Promise<any>[] = [];
      for (let j = i; j < Math.min(i + batchSize, totalChunks); j++) {
        const start = j * chunkSize;
        const end = Math.min(start + chunkSize, buffer.length);
        const chunkBase64 = buffer.subarray(start, end).toString('base64');
        promises.push(
          setDoc(doc(telegramDb, 'media_files', mediaId, 'chunks', String(j)), {
            index: j,
            data: chunkBase64,
          })
        );
      }
      await Promise.all(promises);
      recordServerFirestoreOp('write', promises.length, 'رفع أجزاء وسائط');
    }

    const meta = {
      id: mediaId,
      fileName,
      mimeType,
      size: stat.size,
      localUrl: relativeUrl,
      storedInFirestore: true,
      chunkSize,
      totalChunks,
      createdAt: new Date().toISOString(),
    };
    persistLocalMediaEntry(meta);
    await setDoc(doc(telegramDb, 'media_files', mediaId), meta);
    recordServerFirestoreOp('write', 1, 'حفظ بيانات وسائط');
    console.log(`[Media Upload] Saved "${fileName}" (${totalChunks} chunks, ${stat.size} bytes) to Firebase Firestore!`);
    return true;
  } catch (err: any) {
    console.warn('[Media Upload] Could not persist chunks to Firebase Firestore:', err.message);
    return false;
  }
}

// Helper to stream local file with HTTP 206 Byte-Range support
function streamLocalFile(localFile: string, mimeType: string, req: Request, res: Response) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(localFile);
  } catch {
    if (!res.headersSent) res.status(404).send('File not found');
    return;
  }
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = normalizeServedMimeType(mimeType, localFile);

  const baseHeaders: Record<string, string | number> = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'Content-Disposition': 'inline',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'public, max-age=31536000',
  };

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    let start = parts[0] ? parseInt(parts[0], 10) : 0;
    let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (!parts[0] && parts[1]) {
      // Suffix byte-range: bytes=-N
      const suffixLen = parseInt(parts[1], 10);
      if (!isNaN(suffixLen) && suffixLen > 0) {
        start = Math.max(0, fileSize - suffixLen);
        end = fileSize - 1;
      }
    }
    end = Math.min(fileSize - 1, isNaN(end) ? fileSize - 1 : end);
    if (isNaN(start) || start < 0 || start >= fileSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      });
      res.end();
      return;
    }
    const chunksize = end - start + 1;
    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunksize,
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const fileStream = fs.createReadStream(localFile, { start, end });
    fileStream.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    res.on('close', () => {
      if (!fileStream.destroyed) fileStream.destroy();
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length': fileSize,
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      const fileStream = fs.createReadStream(localFile);
      fileStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      res.on('close', () => {
        if (!fileStream.destroyed) fileStream.destroy();
      });
      fileStream.pipe(res);
    }
  }
}

// Direct byte-range streaming for /uploads/:subfolder/:filename + static fallback (never falls through to SPA HTML)
app.options('/uploads/:subfolder/:filename', (_req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.status(204).end();
});

app.get('/uploads/:subfolder/:filename', (req: Request, res: Response) => {
  const rawSub = Array.isArray(req.params.subfolder) ? req.params.subfolder[0] : req.params.subfolder;
  const rawName = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const allowedSubfolders = new Set(['videos', 'images', 'files', 'cached']);
  if (!rawSub || !rawName || !allowedSubfolders.has(rawSub)) {
    res.status(404).send('Not found');
    return;
  }
  const safeName = path.basename(rawName);
  const targetFile = path.join(uploadBaseDir, rawSub, safeName);
  if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
    streamLocalFile(targetFile, normalizeServedMimeType('', targetFile), req, res);
    return;
  }
  res.status(404).send('Uploaded file not found');
});

app.use(
  '/uploads',
  express.static(uploadBaseDir, {
    setHeaders: (res, filePath) => {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', normalizeServedMimeType('', filePath));
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  })
);

function execCommand(cmd: string, timeoutMs = 300000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function prepareWebPlayableVideo(
  inputPath: string
): Promise<{ filePath: string; filename: string; mimeType: string }> {
  const dir = path.dirname(inputPath);
  const baseNoExt = path.basename(inputPath, path.extname(inputPath));
  const targetMp4Path = path.join(dir, `${baseNoExt}.mp4`);
  const tmpOutPath = path.join(dir, `${baseNoExt}_webtmp.mp4`);

  let vCodec = '';
  let pixFmt = '';
  let aCodec = '';
  let hasAudio = false;

  const probe = await execCommand(
    `ffprobe -v error -show_entries stream=codec_type,codec_name,pix_fmt -of json "${inputPath}"`,
    30000
  );
  if (probe.ok && probe.stdout) {
    try {
      const info = JSON.parse(probe.stdout);
      const streams = Array.isArray(info.streams) ? info.streams : [];
      const vStream = streams.find((s: any) => s.codec_type === 'video');
      const aStream = streams.find((s: any) => s.codec_type === 'audio');
      if (vStream) {
        vCodec = String(vStream.codec_name || '').toLowerCase();
        pixFmt = String(vStream.pix_fmt || '').toLowerCase();
      }
      if (aStream) {
        hasAudio = true;
        aCodec = String(aStream.codec_name || '').toLowerCase();
      }
    } catch {}
  }

  const isWebH264 = vCodec === 'h264' && (!pixFmt || pixFmt === 'yuv420p' || pixFmt === 'yuvj420p');
  const isWebAudio = !hasAudio || aCodec === 'aac' || aCodec === 'mp3';

  let converted = false;

  if (isWebH264) {
    const fastCmd = isWebAudio
      ? `ffmpeg -y -i "${inputPath}" -c copy -movflags +faststart "${tmpOutPath}"`
      : `ffmpeg -y -i "${inputPath}" -c:v copy -c:a aac -b:a 128k -ac 2 -movflags +faststart "${tmpOutPath}"`;
    const res = await execCommand(fastCmd, 180000);
    if (res.ok && fs.existsSync(tmpOutPath) && fs.statSync(tmpOutPath).size > 1024) {
      converted = true;
    } else {
      try { if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath); } catch {}
    }
  }

  // Universal fallback / transcode (HEVC/H.265, 10-bit, yuv444p, MKV, AVI, MOV, WebM, odd screen sizes)
  if (!converted) {
    const transcodeCmd = `ffmpeg -y -i "${inputPath}" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -profile:v main -level 4.1 -c:a aac -b:a 128k -ac 2 -movflags +faststart "${tmpOutPath}"`;
    const res = await execCommand(transcodeCmd, 600000);
    if (res.ok && fs.existsSync(tmpOutPath) && fs.statSync(tmpOutPath).size > 1024) {
      converted = true;
    } else {
      console.warn('[Video Transcode] Full transcode notice:', res.stderr?.slice(-400));
      try { if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath); } catch {}
    }
  }

  if (converted && fs.existsSync(tmpOutPath)) {
    try {
      if (fs.existsSync(inputPath) && inputPath !== tmpOutPath) {
        fs.unlinkSync(inputPath);
      }
      fs.renameSync(tmpOutPath, targetMp4Path);
      return {
        filePath: targetMp4Path,
        filename: path.basename(targetMp4Path),
        mimeType: 'video/mp4',
      };
    } catch {}
  }

  return {
    filePath: inputPath,
    filename: path.basename(inputPath),
    mimeType: normalizeServedMimeType('', inputPath),
  };
}

// 1. Direct Upload Endpoint for Admin (Videos, PDFs, Exam Files, Images)
app.post('/api/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'لم يتم استلام أي ملف' });
      return;
    }

    const file = req.file;
    const isVideo = isVideoFile(file.mimetype, file.originalname);
    const isImage = !isVideo && (file.mimetype || '').toLowerCase().startsWith('image/');
    const subfolder = isVideo ? 'videos' : isImage ? 'images' : 'files';

    let finalFilePath = file.path;
    let finalDiskFilename = file.filename;
    let finalMimeType = normalizeServedMimeType(file.mimetype, file.originalname);

    // Transcode/optimize any uploaded video into web-universal H.264 + AAC +faststart MP4
    if (isVideo) {
      const prepared = await prepareWebPlayableVideo(file.path);
      finalFilePath = prepared.filePath;
      finalDiskFilename = prepared.filename;
      finalMimeType = prepared.mimeType || 'video/mp4';
    }

    const relativeUrl = `/uploads/${subfolder}/${finalDiskFilename}`;
    const updatedSize = fs.existsSync(finalFilePath) ? fs.statSync(finalFilePath).size : file.size;
    const sizeMb = (updatedSize / (1024 * 1024)).toFixed(2);
    const mediaId = `med_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Always index locally BEFORE Firebase attempt so quota exhaustion never breaks local playback
    persistLocalMediaEntry({
      id: mediaId,
      fileName: file.originalname,
      mimeType: finalMimeType,
      size: updatedSize,
      localUrl: relativeUrl,
      storedInFirestore: false,
      createdAt: new Date().toISOString(),
    });

    // Persist file into Firebase Firestore so it survives restarts and plays from anywhere
    const savedInFirebase = await saveMediaToFirebase(
      mediaId,
      finalFilePath,
      file.originalname,
      finalMimeType,
      relativeUrl
    );

    const finalPlayUrl = savedInFirebase ? `/api/media/${mediaId}` : relativeUrl;

    res.json({
      success: true,
      url: finalPlayUrl,
      localUrl: relativeUrl,
      mediaId,
      savedInFirebase,
      fileName: file.originalname,
      fileSize: `${sizeMb} MB`,
      mimeType: finalMimeType,
    });
  } catch (err: any) {
    console.error('Upload Error:', err);
    res.status(500).json({ success: false, error: err.message || 'حدث خطأ أثناء رفع الملف' });
  }
});

// Track active disk cache jobs so simultaneous byte-range requests don't re-read Firestore chunks
const inFlightFirestoreDiskCaches = new Map<string, Promise<string | null>>();

function getCachedMediaDiskPath(meta: any): string {
  const mime = normalizeServedMimeType(meta?.mimeType, meta?.fileName);
  const ext = mime === 'video/webm' ? '.webm' : mime === 'video/ogg' ? '.ogv' : '.mp4';
  return path.join(cachedDir, `${meta.id}${ext}`);
}

async function cacheFirestoreMediaToDisk(meta: any): Promise<string | null> {
  if (!meta?.id || !meta?.totalChunks || !telegramDb) return null;
  const targetPath = getCachedMediaDiskPath(meta);
  if (fs.existsSync(targetPath)) {
    try {
      if (fs.statSync(targetPath).size >= Math.min(1024, meta.size || 1024)) {
        return targetPath;
      }
    } catch {}
  }

  const existing = inFlightFirestoreDiskCaches.get(meta.id);
  if (existing) return existing;

  const job = (async (): Promise<string | null> => {
    const tmpPath = `${targetPath}.tmp_${Date.now()}`;
    try {
      const fd = fs.openSync(tmpPath, 'w');
      try {
        const batchSize = 6;
        for (let i = 0; i < meta.totalChunks; i += batchSize) {
          const indices = [];
          for (let j = i; j < Math.min(i + batchSize, meta.totalChunks); j++) {
            indices.push(j);
          }
          const snaps = await Promise.all(
            indices.map((idx) => getDoc(doc(telegramDb, 'media_files', meta.id, 'chunks', String(idx))))
          );
          recordServerFirestoreOp('read', indices.length, 'قراءة أجزاء فيديو للكاش');
          for (const snap of snaps) {
            if (!snap.exists()) {
              throw new Error('Missing chunk');
            }
            const buf = Buffer.from(snap.data().data, 'base64');
            fs.writeSync(fd, buf);
          }
        }
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmpPath, targetPath);
      const localUrl = `/uploads/cached/${path.basename(targetPath)}`;
      persistLocalMediaEntry({
        ...meta,
        mimeType: normalizeServedMimeType(meta.mimeType, targetPath),
        localUrl,
      });
      return targetPath;
    } catch (err: any) {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
      console.warn(`[Media Cache] Could not cache ${meta.id} to disk:`, err.message);
      return null;
    } finally {
      inFlightFirestoreDiskCaches.delete(meta.id);
    }
  })();

  inFlightFirestoreDiskCaches.set(meta.id, job);
  return job;
}

// Helper to stream media metadata/chunks stored in Firebase Firestore
async function streamMediaDocFromFirestore(meta: any, req: Request, res: Response) {
  // Prefer local cached disk file whenever available (0 Firestore chunk reads & full range support)
  const diskTarget = getCachedMediaDiskPath(meta);
  if (fs.existsSync(diskTarget) && fs.statSync(diskTarget).size > 0) {
    streamLocalFile(diskTarget, normalizeServedMimeType(meta.mimeType, diskTarget), req, res);
    return;
  }

  // Trigger background disk cache so subsequent seeks/plays use SSD instead of Firestore reads
  void cacheFirestoreMediaToDisk(meta);

  const totalSize: number = meta.size;
  const chunkSize: number = meta.chunkSize;
  const mimeType: string = normalizeServedMimeType(meta.mimeType, meta.fileName);
  const range = req.headers.range;

  let start = 0;
  let end = totalSize - 1;
  let statusCode = 200;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    start = parts[0] ? parseInt(parts[0], 10) : 0;
    end = parts[1] ? Math.min(totalSize - 1, parseInt(parts[1], 10)) : totalSize - 1;
    if (isNaN(start) || start < 0 || start >= totalSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
        'Access-Control-Allow-Origin': '*',
      });
      res.end();
      return;
    }
    statusCode = 206;
  }

  const headers: Record<string, string | number> = {
    'Accept-Ranges': 'bytes',
    'Content-Type': mimeType,
    'Content-Disposition': 'inline',
    'Content-Length': end - start + 1,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'public, max-age=31536000',
  };
  if (statusCode === 206) {
    headers['Content-Range'] = `bytes ${start}-${end}/${totalSize}`;
  }

  res.writeHead(statusCode, headers);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const startChunk = Math.floor(start / chunkSize);
  const endChunk = Math.floor(end / chunkSize);

  let aborted = false;
  res.on('close', () => {
    aborted = true;
  });

  for (let cIdx = startChunk; cIdx <= endChunk; cIdx++) {
    if (aborted) break;
    const chunkSnap = await getDoc(doc(telegramDb, 'media_files', meta.id, 'chunks', String(cIdx)));
    recordServerFirestoreOp('read', 1, 'بث جزء وسائط');
    if (!chunkSnap.exists()) {
      res.end();
      return;
    }
    const buf = Buffer.from(chunkSnap.data().data, 'base64');
    const chunkByteStart = cIdx * chunkSize;
    const sliceStart = Math.max(0, start - chunkByteStart);
    const sliceEnd = Math.min(buf.length, end - chunkByteStart + 1);
    const outSlice = buf.subarray(sliceStart, sliceEnd);

    const ok = res.write(outSlice);
    if (!ok) {
      await new Promise<void>((resolve) => res.once('drain', resolve));
    }
  }
  if (!res.writableEnded) res.end();
}

// 1.5 Stream Media Stored in Firebase Firestore (with Local Disk Cache + HTTP 206 Range Support)
app.options('/api/media/:mediaId', (_req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.status(204).end();
});

app.get('/api/media/:mediaId', async (req: Request, res: Response) => {
  try {
    const rawMediaId = req.params.mediaId;
    const mediaId = Array.isArray(rawMediaId) ? rawMediaId[0] : rawMediaId;
    if (!mediaId) {
      res.status(400).send('Missing mediaId');
      return;
    }

    // 0-read fast path: check cached/local file directly on disk by mediaId
    for (const ext of ['.mp4', '.webm', '.ogv']) {
      const cachedDirect = path.join(cachedDir, `${mediaId}${ext}`);
      if (fs.existsSync(cachedDirect) && fs.statSync(cachedDirect).size > 0) {
        streamLocalFile(cachedDirect, normalizeServedMimeType('', cachedDirect), req, res);
        return;
      }
    }

    let meta = mediaMetadataCache.get(mediaId);
    const missingTs = missingMediaCache.get(mediaId);
    const isNegativelyCached = Boolean(missingTs && Date.now() - missingTs < MISSING_MEDIA_TTL_MS);
    if (!meta && !isNegativelyCached && telegramDb) {
      try {
        const snap = await getDoc(doc(telegramDb, 'media_files', mediaId));
        recordServerFirestoreOp('read', 1, 'فحص بيانات وسائط');
        if (snap.exists()) {
          meta = snap.data();
          persistLocalMediaEntry(meta);
        } else {
          missingMediaCache.set(mediaId, Date.now());
        }
      } catch (fsErr: any) {
        console.warn(`[Media Lookup] Firestore lookup warning for ${mediaId}:`, fsErr.message);
      }
    }

    if (!meta) {
      res.status(404).send('Media not found');
      return;
    }

    // Fast path: check if file exists on local disk cache
    if (meta.localUrl && meta.localUrl.startsWith('/uploads/')) {
      const localRel = meta.localUrl.replace(/^\/uploads\//, '');
      const localFile = path.join(uploadBaseDir, localRel);
      if (fs.existsSync(localFile) && fs.statSync(localFile).isFile()) {
        streamLocalFile(localFile, normalizeServedMimeType(meta.mimeType, localFile), req, res);
        return;
      }
    }

    // Read chunks directly from Firebase Firestore
    if (!meta.storedInFirestore || !telegramDb) {
      res.status(404).send('Media file data unavailable');
      return;
    }

    await streamMediaDocFromFirestore(meta, req, res);
  } catch (err: any) {
    console.error('[Firebase Media Stream Error]:', err);
    if (!res.headersSent) {
      res.status(500).send('Error streaming Firebase media');
    }
  }
});

// Helper for streaming external HTTP/HTTPS URLs with full redirect following & expired-SSL tolerance
function normalizeExternalVideoUrl(rawUrl: string): string {
  let clean = rawUrl.trim();
  if (clean.includes('dropbox.com')) {
    clean = clean.replace(/[?&]dl=0/, '?raw=1');
    if (!clean.includes('raw=1') && !clean.includes('dl=1')) {
      clean += clean.includes('?') ? '&raw=1' : '?raw=1';
    }
  }
  return clean;
}

function isNormalAbortError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '').toUpperCase();
  return (
    msg === 'aborted' ||
    msg.includes('aborted') ||
    code === 'ECONNRESET' ||
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    code === 'EPIPE'
  );
}

function detectVideoFormat(rawUrl: string, upstreamContentType = ''): { ext: string; mimeType: string; isMp4Muxable: boolean } {
  let pathname = rawUrl.toLowerCase();
  try {
    pathname = new URL(rawUrl).pathname.toLowerCase();
  } catch {}
  const cType = upstreamContentType.toLowerCase();

  if (pathname.endsWith('.webm') || cType.includes('video/webm')) {
    return { ext: '.webm', mimeType: 'video/webm', isMp4Muxable: false };
  }
  if (pathname.endsWith('.ogv') || pathname.endsWith('.ogg') || cType.includes('video/ogg')) {
    return { ext: '.ogv', mimeType: 'video/ogg', isMp4Muxable: false };
  }
  if (pathname.endsWith('.mkv') || cType.includes('x-matroska')) {
    return { ext: '.mkv', mimeType: 'video/x-matroska', isMp4Muxable: true };
  }
  if (pathname.endsWith('.mov') || cType.includes('video/quicktime')) {
    return { ext: '.mov', mimeType: 'video/mp4', isMp4Muxable: true };
  }
  if (pathname.endsWith('.m4v') || cType.includes('video/x-m4v')) {
    return { ext: '.mp4', mimeType: 'video/mp4', isMp4Muxable: true };
  }
  return { ext: '.mp4', mimeType: 'video/mp4', isMp4Muxable: true };
}

function streamExternalUrl(
  rawUrl: string,
  req: Request,
  res: Response,
  redirectCount = 0,
  ignoreRange = false,
  retryAttempt = 0
) {
  if (res.writableEnded || res.destroyed) return;

  if (redirectCount > 10) {
    if (!res.headersSent) res.status(502).send('Too many redirects');
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    if (!res.headersSent) res.status(400).send('Invalid URL');
    return;
  }

  const isHttps = parsedUrl.protocol === 'https:';
  const clientLib = isHttps ? https : http;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Encoding': 'identity',
  };

  if (req.headers.range && !ignoreRange) {
    headers['Range'] = req.headers.range;
  }

  let clientAborted = false;
  let activeUpstreamRes: http.IncomingMessage | null = null;

  const options: https.RequestOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    timeout: 30000,
    ...(isHttps ? { agent: insecureHttpsAgent, rejectUnauthorized: false } : {}),
  };

  const cleanupCloseListener = () => {
    res.off('close', onClientClose);
  };

  const upstreamReq = clientLib.request(options, (upstreamRes) => {
    activeUpstreamRes = upstreamRes;
    const status = upstreamRes.statusCode || 200;

    if (clientAborted || res.destroyed) {
      cleanupCloseListener();
      upstreamRes.destroy();
      return;
    }

    // Follow 301/302/303/307/308 redirects
    if ([301, 302, 303, 307, 308].includes(status) && upstreamRes.headers.location) {
      cleanupCloseListener();
      upstreamRes.resume();
      const nextUrl = new URL(upstreamRes.headers.location, parsedUrl).toString();
      streamExternalUrl(nextUrl, req, res, redirectCount + 1, ignoreRange, retryAttempt);
      return;
    }

    // Handle 416 Range Not Satisfiable by retrying without Range header
    if (status === 416 && req.headers.range && !ignoreRange) {
      cleanupCloseListener();
      upstreamRes.resume();
      streamExternalUrl(rawUrl, req, res, redirectCount, true, retryAttempt);
      return;
    }

    // Retry once on transient upstream 5xx / 429 before headers are sent
    if ([429, 500, 502, 503, 504].includes(status) && retryAttempt < 1) {
      cleanupCloseListener();
      upstreamRes.resume();
      setTimeout(() => {
        streamExternalUrl(rawUrl, req, res, redirectCount, ignoreRange, retryAttempt + 1);
      }, 350);
      return;
    }

    const upstreamContentType = (upstreamRes.headers['content-type'] || '').toLowerCase();
    if (upstreamContentType.includes('text/html') || status >= 400) {
      cleanupCloseListener();
      upstreamRes.resume();
      if (!res.headersSent) {
        res.status(status >= 400 ? status : 502).send('Upstream returned non-media response');
      }
      return;
    }

    const detected = detectVideoFormat(rawUrl, upstreamContentType);
    let finalContentType = upstreamRes.headers['content-type'] || detected.mimeType;
    if (
      !upstreamContentType ||
      upstreamContentType === 'application/octet-stream' ||
      upstreamContentType === 'binary/octet-stream' ||
      upstreamContentType === 'video/quicktime'
    ) {
      finalContentType = detected.mimeType;
    }

    const responseHeaders: Record<string, string | string[]> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Accept-Ranges': upstreamRes.headers['accept-ranges'] || 'bytes',
      'Content-Type': finalContentType,
    };

    if (upstreamRes.headers['content-range']) {
      responseHeaders['Content-Range'] = upstreamRes.headers['content-range'];
    }
    const upstreamLen = upstreamRes.headers['content-length'];
    if (upstreamLen && !(req.method === 'HEAD' && upstreamLen === '0')) {
      responseHeaders['Content-Length'] = upstreamLen;
    }

    if (!res.headersSent) {
      res.writeHead(status, responseHeaders);
    }

    if (req.method === 'HEAD') {
      cleanupCloseListener();
      upstreamRes.destroy();
      if (!res.writableEnded) res.end();
      return;
    }

    upstreamRes.on('error', (err) => {
      cleanupCloseListener();
      if (!clientAborted && !isNormalAbortError(err)) {
        console.warn('[Stream Proxy] Upstream stream error:', err.message);
      }
      if (!res.writableEnded) res.end();
    });

    upstreamRes.on('end', () => {
      cleanupCloseListener();
    });

    upstreamRes.pipe(res);
  });

  function onClientClose() {
    if (!res.writableFinished) {
      clientAborted = true;
      if (activeUpstreamRes && !activeUpstreamRes.destroyed) {
        activeUpstreamRes.unpipe(res);
        activeUpstreamRes.destroy();
      }
      if (!upstreamReq.destroyed) {
        upstreamReq.destroy();
      }
    }
  }

  res.on('close', onClientClose);

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy(new Error('Upstream timeout'));
  });

  upstreamReq.on('error', (err) => {
    cleanupCloseListener();
    if (clientAborted || isNormalAbortError(err)) {
      if (!res.writableEnded) res.end();
      return;
    }
    if (!res.headersSent && retryAttempt < 1) {
      setTimeout(() => {
        streamExternalUrl(rawUrl, req, res, redirectCount, ignoreRange, retryAttempt + 1);
      }, 350);
      return;
    }
    console.error('[Stream Proxy] Request error for', rawUrl, ':', err.message);
    if (!res.headersSent) {
      res.status(502).send(`Error streaming media: ${err.message}`);
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  upstreamReq.end();
}

// External video caching + ffmpeg +faststart + Firebase persistence helpers
const validatedExternalCacheFiles = new Set<string>();

async function isValidPlayableVideoFile(filePath: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false;
  try {
    if (fs.statSync(filePath).size < 1024) return false;
  } catch {
    return false;
  }
  const probe = await execCommand(
    `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${filePath}"`,
    15000
  );
  return probe.ok && probe.stdout.trim().length > 0;
}

function getExternalCacheKey(cleanUrl: string): string {
  return 'ext_' + crypto.createHash('sha256').update(cleanUrl).digest('hex').slice(0, 24);
}

async function findCachedExternalVideo(
  cacheKey: string
): Promise<{ filePath: string; mimeType: string; ext: string } | null> {
  const candidates: Array<{ ext: string; mimeType: string }> = [
    { ext: '.mp4', mimeType: 'video/mp4' },
    { ext: '.webm', mimeType: 'video/webm' },
    { ext: '.ogv', mimeType: 'video/ogg' },
    { ext: '.mkv', mimeType: 'video/x-matroska' },
  ];
  for (const c of candidates) {
    const p = path.join(cachedDir, `${cacheKey}${c.ext}`);
    if (fs.existsSync(p)) {
      try {
        if (fs.statSync(p).size <= 1024) {
          fs.unlinkSync(p);
          continue;
        }
        if (validatedExternalCacheFiles.has(p)) {
          return { filePath: p, mimeType: c.mimeType, ext: c.ext };
        }
        const valid = await isValidPlayableVideoFile(p);
        if (valid) {
          validatedExternalCacheFiles.add(p);
          return { filePath: p, mimeType: c.mimeType, ext: c.ext };
        }
        console.warn(`[Mirror Cache] Evicting corrupted cached video: ${p}`);
        fs.unlinkSync(p);
      } catch {}
    }
  }
  return null;
}

const inFlightMirrors = new Map<
  string,
  Promise<{ cachedFile?: string; cachedUrl?: string; mediaId?: string; savedInFirebase?: boolean }>
>();

function downloadExternalVideoToFile(
  rawUrl: string,
  destPath: string,
  redirectCount = 0
): Promise<{ ok: boolean; mimeType: string }> {
  return new Promise((resolve) => {
    if (redirectCount > 10) {
      resolve({ ok: false, mimeType: '' });
      return;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      resolve({ ok: false, mimeType: '' });
      return;
    }

    let settled = false;
    const finish = (ok: boolean, mimeType = '') => {
      if (settled) return;
      settled = true;
      if (!ok) {
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
      }
      resolve({ ok, mimeType });
    };

    const isHttps = parsedUrl.protocol === 'https:';
    const clientLib = isHttps ? https : http;
    const req = clientLib.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
        timeout: 300000,
        ...(isHttps ? { agent: insecureHttpsAgent, rejectUnauthorized: false } : {}),
      },
      (resp) => {
        const status = resp.statusCode || 200;
        if ([301, 302, 303, 307, 308].includes(status) && resp.headers.location) {
          resp.resume();
          const nextUrl = new URL(resp.headers.location, parsedUrl).toString();
          settled = true;
          downloadExternalVideoToFile(nextUrl, destPath, redirectCount + 1).then(resolve);
          return;
        }
        const cType = (resp.headers['content-type'] || '').toLowerCase();
        if (status >= 400 || cType.includes('text/html')) {
          resp.resume();
          finish(false, cType);
          return;
        }
        const contentLen = parseInt(resp.headers['content-length'] || '0', 10);
        // Cap server background mirroring at 512MB to support larger lessons safely
        if (contentLen > 512 * 1024 * 1024) {
          resp.resume();
          finish(false, cType);
          return;
        }

        const outStream = fs.createWriteStream(destPath);
        let writtenBytes = 0;
        let streamAborted = false;

        resp.on('aborted', () => {
          streamAborted = true;
          outStream.destroy();
          finish(false, cType);
        });
        resp.on('data', (chunk: Buffer) => {
          writtenBytes += chunk.length;
          if (writtenBytes > 512 * 1024 * 1024) {
            streamAborted = true;
            resp.destroy();
            outStream.destroy();
            finish(false, cType);
          }
        });
        resp.on('error', () => {
          streamAborted = true;
          outStream.destroy();
          finish(false, cType);
        });
        outStream.on('finish', () => {
          const isComplete =
            !streamAborted &&
            resp.complete !== false &&
            (contentLen <= 0 || writtenBytes >= contentLen);
          finish(isComplete, cType || 'video/mp4');
        });
        outStream.on('error', () => {
          finish(false, cType);
        });
        resp.pipe(outStream);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      finish(false, '');
    });
    req.on('error', () => {
      finish(false, '');
    });
    req.end();
  });
}

function mirrorAndOptimizeExternalUrl(
  rawUrl: string
): Promise<{ cachedFile?: string; cachedUrl?: string; mediaId?: string; savedInFirebase?: boolean }> {
  const cleanUrl = normalizeExternalVideoUrl(rawUrl);
  const cacheKey = getExternalCacheKey(cleanUrl);

  const existing = inFlightMirrors.get(cacheKey);
  if (existing) return existing;

  const job = (async () => {
    const alreadyCached = await findCachedExternalVideo(cacheKey);
    if (alreadyCached) {
      const cachedMeta = mediaMetadataCache.get(cacheKey);
      return {
        cachedFile: alreadyCached.filePath,
        cachedUrl: `/uploads/cached/${cacheKey}${alreadyCached.ext}`,
        mediaId: cacheKey,
        savedInFirebase: Boolean(cachedMeta?.storedInFirestore),
      };
    }

    const preDetected = detectVideoFormat(cleanUrl);
    const rawExt = preDetected.ext || '.mp4';
    const tmpPath = path.join(cachedDir, `${cacheKey}.tmp_${Date.now()}${rawExt}`);
    try {
      const dl = await downloadExternalVideoToFile(cleanUrl, tmpPath);
      if (!dl.ok || !fs.existsSync(tmpPath)) {
        return {};
      }
      const stat = fs.statSync(tmpPath);
      if (stat.size < 1024) {
        try { fs.unlinkSync(tmpPath); } catch {}
        return {};
      }
      // Verify file is not an HTML error document
      const fd = fs.openSync(tmpPath, 'r');
      const headBuf = Buffer.alloc(64);
      fs.readSync(fd, headBuf, 0, 64, 0);
      fs.closeSync(fd);
      const headText = headBuf.toString('utf8').trimStart().toLowerCase();
      if (headText.startsWith('<!doctype') || headText.startsWith('<html') || headText.startsWith('<head')) {
        try { fs.unlinkSync(tmpPath); } catch {}
        return {};
      }

      // Normalize/transcode to universal web-playable H.264/AAC +faststart MP4
      const prepared = await prepareWebPlayableVideo(tmpPath);
      const valid = await isValidPlayableVideoFile(prepared.filePath);
      if (!valid) {
        try { if (fs.existsSync(prepared.filePath)) fs.unlinkSync(prepared.filePath); } catch {}
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
        console.warn(`[Mirror Cache] Discarding invalid video download for ${cleanUrl}`);
        return {};
      }

      const finalExt = path.extname(prepared.filePath) || '.mp4';
      const finalMime = prepared.mimeType || 'video/mp4';
      const finalPath = path.join(cachedDir, `${cacheKey}${finalExt}`);
      if (prepared.filePath !== finalPath) {
        fs.renameSync(prepared.filePath, finalPath);
      }
      validatedExternalCacheFiles.add(finalPath);

      const relativeUrl = `/uploads/cached/${cacheKey}${finalExt}`;
      const finalStat = fs.statSync(finalPath);
      persistLocalMediaEntry({
        id: cacheKey,
        fileName: `${cacheKey}${finalExt}`,
        mimeType: finalMime,
        size: finalStat.size,
        localUrl: relativeUrl,
        storedInFirestore: false,
        createdAt: new Date().toISOString(),
      });

      const savedInFirebase = await saveMediaToFirebase(
        cacheKey,
        finalPath,
        `${cacheKey}${finalExt}`,
        finalMime,
        relativeUrl
      );

      console.log(`[Mirror Cache] Ready "${cacheKey}${finalExt}" (Firebase=${savedInFirebase}) for ${cleanUrl}`);
      return { cachedFile: finalPath, cachedUrl: relativeUrl, mediaId: cacheKey, savedInFirebase };
    } catch {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
      return {};
    } finally {
      inFlightMirrors.delete(cacheKey);
    }
  })();

  inFlightMirrors.set(cacheKey, job);
  return job;
}

// 1.8 Mirror & Optimize Direct External Video URL into Fast Cache + Firebase Firestore
app.post('/api/mirror-video', async (req: Request, res: Response) => {
  try {
    const rawUrl = String(req.body?.url || '').trim();
    if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
      res.json({ success: true, playUrl: rawUrl, savedInFirebase: false, skipped: true });
      return;
    }

    const lower = rawUrl.toLowerCase();
    // Skip YouTube / Google Drive / Vimeo iframe links
    if (
      lower.includes('youtube.com') ||
      lower.includes('youtu.be') ||
      lower.includes('drive.google.com') ||
      lower.includes('vimeo.com')
    ) {
      res.json({ success: true, playUrl: rawUrl, savedInFirebase: false, skipped: true });
      return;
    }

    const cleanUrl = normalizeExternalVideoUrl(rawUrl);
    const mirrorPromise = mirrorAndOptimizeExternalUrl(cleanUrl);
    const result = await Promise.race([
      mirrorPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4500)),
    ]);

    if (result && result.mediaId) {
      res.json({
        success: true,
        savedInFirebase: Boolean(result.savedInFirebase),
        playUrl: result.savedInFirebase ? `/api/media/${result.mediaId}` : cleanUrl,
        cachedLocalUrl: result.cachedUrl || `/uploads/cached/${result.mediaId}.mp4`,
        originalUrl: cleanUrl,
      });
      return;
    }

    // Large video continues caching + faststart optimization in background
    mirrorPromise.catch(() => {});
    res.json({
      success: true,
      savedInFirebase: false,
      backgroundCaching: true,
      playUrl: cleanUrl,
      originalUrl: cleanUrl,
    });
  } catch (err: any) {
    res.json({
      success: true,
      savedInFirebase: false,
      playUrl: String(req.body?.url || ''),
    });
  }
});

// 2. High-Performance Stream Proxy Route
// Supports Byte-Ranges (HTTP 206) for ANY external or local video URL (including Catbox .mp4, .mov, .webm, .mkv)
// Uses +faststart local disk cache or Firebase Firestore chunks if cached, otherwise streams directly & caches in background
app.options('/api/stream', (_req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.status(204).end();
});

app.get('/api/stream', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }

  // If local upload path
  if (targetUrl.startsWith('/uploads/')) {
    const localRel = targetUrl.replace(/^\/uploads\//, '');
    const localFile = path.join(uploadBaseDir, localRel);
    if (fs.existsSync(localFile)) {
      const detected = detectVideoFormat(localFile);
      streamLocalFile(localFile, detected.mimeType, req, res);
      return;
    }
    res.status(404).send('Local file not found');
    return;
  }

  const normalizedUrl = normalizeExternalVideoUrl(targetUrl);
  const cacheKey = getExternalCacheKey(normalizedUrl);

  // 1. Instant SSD +faststart stream if already cached (validates integrity first)
  const cachedEntry = await findCachedExternalVideo(cacheKey);
  if (cachedEntry) {
    streamLocalFile(cachedEntry.filePath, cachedEntry.mimeType, req, res);
    return;
  }

  // 2. Check Firebase Firestore chunks if previously mirrored (with negative cache to avoid repeated Range request reads)
  if (telegramDb) {
    try {
      let meta = mediaMetadataCache.get(cacheKey);
      const missingTs = missingMediaCache.get(cacheKey);
      const isNegativelyCached = Boolean(missingTs && Date.now() - missingTs < MISSING_MEDIA_TTL_MS);
      if (!meta && !isNegativelyCached) {
        const snap = await getDoc(doc(telegramDb, 'media_files', cacheKey));
        recordServerFirestoreOp('read', 1, 'فحص كاش بث خارجي');
        if (snap.exists()) {
          meta = snap.data();
          mediaMetadataCache.set(cacheKey, meta);
        } else {
          missingMediaCache.set(cacheKey, Date.now());
        }
      }
      if (meta && meta.storedInFirestore) {
        await streamMediaDocFromFirestore(meta, req, res);
        return;
      }
    } catch {}
  }

  // 3. Kick off background mirror + faststart optimization while streaming live immediately
  mirrorAndOptimizeExternalUrl(normalizedUrl).catch(() => {});
  streamExternalUrl(normalizedUrl, req, res);
});

// ================= TELEGRAM BOT & WEBHOOK INTEGRATION (@Ra3d6_bot) =================

interface TelegramSessionData {
  sessionId: string;
  status: 'pending' | 'authenticated';
  user?: any;
  telegramId?: number | string;
  telegramChatId?: number | string;
  authenticatedAt?: string;
  createdAt: string;
}

const activeTelegramSessions = new Map<string, TelegramSessionData>();
const missingMediaCache = new Map<string, number>();
const MISSING_MEDIA_TTL_MS = 10 * 60 * 1000; // 10 minutes
const sessionFirestoreCheckAt = new Map<string, number>();
const SESSION_FIRESTORE_THROTTLE_MS = 10 * 1000; // Check Firestore at most every 10s per pending session
let latestPendingSessionId: string | null = null;
let cachedBotToken: string | null = process.env.TELEGRAM_BOT_TOKEN || null;
let lastBotTokenLookupAt = 0;
const BOT_TOKEN_NEGATIVE_TTL_MS = 5 * 60 * 1000;

// Persistent Local Telegram User Cache (keeps Telegram login seamless even during Firestore quota limits)
const telegramUsersCachePath = path.join(uploadBaseDir, '.telegram-users-cache.json');
const telegramUsersCache = new Map<string, any>();
let firestoreQuotaBackoffUntil = 0;
const FIRESTORE_QUOTA_BACKOFF_MS = 5 * 60 * 1000;

function isServerQuotaError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err || '');
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('Quota exceeded') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Free daily read units per project')
  );
}

function isServerFirestoreQuotaBackedOff(): boolean {
  return Date.now() < firestoreQuotaBackoffUntil;
}

function noteServerFirestoreError(err: any) {
  if (isServerQuotaError(err)) {
    firestoreQuotaBackoffUntil = Date.now() + FIRESTORE_QUOTA_BACKOFF_MS;
  }
}

function loadLocalTelegramUsersCache() {
  try {
    if (fs.existsSync(telegramUsersCachePath)) {
      const parsed = JSON.parse(fs.readFileSync(telegramUsersCachePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (v && typeof v === 'object') {
            telegramUsersCache.set(String(k), v);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[Telegram Cache] Could not load local cache:', err.message);
  }
}

function persistTelegramUserEntry(user: any) {
  if (!user || !user.telegramId) return;
  const key = String(user.telegramId).trim();
  if (!key) return;
  telegramUsersCache.set(key, user);
  try {
    const obj: Record<string, any> = {};
    telegramUsersCache.forEach((val, k) => {
      obj[k] = val;
    });
    const tmpPath = `${telegramUsersCachePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(obj), 'utf8');
    fs.renameSync(tmpPath, telegramUsersCachePath);
  } catch (err: any) {
    console.warn('[Telegram Cache] Could not persist local cache:', err.message);
  }
}

loadLocalTelegramUsersCache();

// Helper to resolve bot token from env or Firestore
async function getTelegramBotToken(): Promise<string | null> {
  if (cachedBotToken) return cachedBotToken;
  if (isServerFirestoreQuotaBackedOff()) return null;
  if (Date.now() - lastBotTokenLookupAt < BOT_TOKEN_NEGATIVE_TTL_MS) {
    return null;
  }
  lastBotTokenLookupAt = Date.now();
  if (telegramDb) {
    try {
      const snap = await getDoc(doc(telegramDb, 'system_settings', 'telegram_bot'));
      recordServerFirestoreOp('read', 1, 'قراءة توكن البوت');
      if (snap.exists() && snap.data().token) {
        cachedBotToken = snap.data().token;
        return cachedBotToken;
      }
      const globSnap = await getDoc(doc(telegramDb, 'system_settings', 'global'));
      recordServerFirestoreOp('read', 1, 'قراءة الإعدادات العامة للبوت');
      if (globSnap.exists() && globSnap.data().telegramBotToken) {
        cachedBotToken = globSnap.data().telegramBotToken;
        return cachedBotToken;
      }
    } catch (e) {
      noteServerFirestoreError(e);
    }
  }
  return null;
}

// Helper to save bot token to Firestore
async function saveTelegramBotToken(token: string): Promise<void> {
  cachedBotToken = token;
  if (telegramDb) {
    try {
      await setDoc(doc(telegramDb, 'system_settings', 'telegram_bot'), {
        token,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      await setDoc(doc(telegramDb, 'system_settings', 'global'), {
        telegramBotToken: token,
      }, { merge: true });
      recordServerFirestoreOp('write', 2, 'حفظ توكن البوت');
      console.log('[Telegram Server] Saved bot token to Firestore system_settings');
    } catch (e: any) {
      console.warn('[Telegram Server] Could not save token to Firestore:', e.message);
    }
  }
}

// Register pending session when student clicks "تسجيل الدخول عبر التليجرام (عبر البوت)"
app.post('/api/telegram/register-pending-session', (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    res.status(400).json({ success: false, error: 'Missing sessionId' });
    return;
  }
  latestPendingSessionId = sessionId;
  activeTelegramSessions.set(sessionId, {
    sessionId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  console.log(`[Telegram Server] Registered pending session: ${sessionId}`);
  res.json({ success: true, sessionId });
});

// Check session status (polled by student browser while waiting for bot start)
app.get('/api/telegram/check-session', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).json({ error: 'Missing sessionId' });
    return;
  }

  // 1. In-memory check (instant, 0 Firestore reads)
  const memSession = activeTelegramSessions.get(sessionId) || activeTelegramSessions.get('global_latest') || activeTelegramSessions.get('default');
  if (memSession && memSession.status === 'authenticated' && memSession.user) {
    res.json({ authenticated: true, user: memSession.user });
    return;
  }

  if (isServerFirestoreQuotaBackedOff()) {
    res.json({ authenticated: false, quotaExceeded: true });
    return;
  }

  // 2. Throttled Firestore fallback check (max once every 10s per sessionId, skipped if quota backed off)
  const now = Date.now();
  const lastCheck = sessionFirestoreCheckAt.get(sessionId) || 0;
  if (telegramDb && now - lastCheck >= SESSION_FIRESTORE_THROTTLE_MS) {
    sessionFirestoreCheckAt.set(sessionId, now);
    try {
      // Check requested sessionId
      const snap = await getDoc(doc(telegramDb, 'telegram_login_sessions', sessionId));
      recordServerFirestoreOp('read', 1, 'فحص جلسة دخول تيليجرام');
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'authenticated' && data.user) {
          persistTelegramUserEntry(data.user);
          activeTelegramSessions.set(sessionId, {
            sessionId,
            status: 'authenticated',
            user: data.user,
            telegramId: data.telegramId,
            telegramChatId: data.telegramChatId,
            createdAt: data.createdAt,
            authenticatedAt: data.authenticatedAt,
          });
          res.json({ authenticated: true, user: data.user });
          return;
        }
      }

      // Fallback check global_latest
      const globalSnap = await getDoc(doc(telegramDb, 'telegram_login_sessions', 'global_latest'));
      recordServerFirestoreOp('read', 1, 'فحص آخر جلسة تيليجرام');
      if (globalSnap.exists()) {
        const data = globalSnap.data();
        if (data.status === 'authenticated' && data.user) {
          // If authenticated within the last 2 minutes and not purged after authentication
          const authTime = data.authenticatedAt ? new Date(data.authenticatedAt).getTime() : 0;
          const purgedTs =
            Math.max(
              data.user?.id ? purgedUserTimestamps.get(String(data.user.id)) || 0 : 0,
              data.telegramId ? purgedUserTimestamps.get(`tg:${String(data.telegramId)}`) || 0 : 0
            );
          if (Date.now() - authTime < 120000 && authTime > purgedTs) {
            persistTelegramUserEntry(data.user);
            res.json({ authenticated: true, user: data.user });
            return;
          }
        }
      }
    } catch (e) {
      noteServerFirestoreError(e);
      if (isServerQuotaError(e)) {
        res.json({ authenticated: false, quotaExceeded: true });
        return;
      }
    }
  }

  res.json({ authenticated: false });
});

// Resolve or cache Telegram student profile smoothly even when Firestore quota is temporarily reached
app.post('/api/telegram/resolve-user', async (req: Request, res: Response) => {
  const { telegramId, name, username, photoUrl, user } = req.body || {};
  const tgIdStr = String(telegramId || user?.telegramId || '').trim();
  if (!tgIdStr) {
    res.status(400).json({ ok: false, error: 'Missing telegramId' });
    return;
  }

  // If client passed a freshly authenticated/synced user, cache it locally
  if (user && typeof user === 'object' && user.id) {
    persistTelegramUserEntry({ ...user, telegramId: tgIdStr });
    res.json({ ok: true, user: telegramUsersCache.get(tgIdStr), source: 'cached' });
    return;
  }

  // Check server's persistent cache first
  const cached = telegramUsersCache.get(tgIdStr);
  if (cached) {
    res.json({
      ok: true,
      user: {
        ...cached,
        telegramUsername: username || cached.telegramUsername || '',
        photoUrl: photoUrl || cached.photoUrl || '',
        lastLoginAt: new Date().toISOString(),
      },
      source: 'server-cache',
    });
    return;
  }

  // Try Firestore only if not quota backed off
  if (telegramDb && !isServerFirestoreQuotaBackedOff()) {
    try {
      let snap = await getDocs(query(collection(telegramDb, 'users'), where('telegramId', '==', tgIdStr)));
      recordServerFirestoreOp('read', Math.max(1, snap.size), 'استرجاع حساب تيليجرام');
      if (snap.empty && /^\d+$/.test(tgIdStr)) {
        snap = await getDocs(query(collection(telegramDb, 'users'), where('telegramId', '==', Number(tgIdStr))));
        recordServerFirestoreOp('read', Math.max(1, snap.size), 'استرجاع حساب تيليجرام');
      }
      if (!snap.empty) {
        const d = snap.docs[0];
        const resolved = { id: d.id, ...d.data(), telegramId: tgIdStr, lastLoginAt: new Date().toISOString() };
        persistTelegramUserEntry(resolved);
        res.json({ ok: true, user: resolved, source: 'firestore' });
        return;
      }
    } catch (err) {
      noteServerFirestoreError(err);
    }
  }

  const fallbackUser = {
    id: `tg_${tgIdStr}`,
    name: name || username || `طالب_${tgIdStr}`,
    email: username ? `${String(username).toLowerCase()}@telegram.raad` : `tg_${tgIdStr}@telegram.raad`,
    password: `tg_${tgIdStr}_pass`,
    telegramId: tgIdStr,
    telegramUsername: username || '',
    photoUrl: photoUrl || '',
    daysAllowed: 0,
    isUnlimited: false,
    isVip: false,
    subscriptionStatus: 'unspecified',
    subscriptionStartDate: '',
    subscriptionEndDate: '',
    isCounterPaused: false,
    pausedRemainingDays: 0,
    isIndividuallyBlocked: false,
    isIndividuallyWhitelisted: false,
    watchedVideoIds: [],
    totalExamsTaken: 0,
    averageScore: 0,
    enrolledCourseIds: [],
    preferredThemeColor: 'default',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };
  persistTelegramUserEntry(fallbackUser);
  res.json({ ok: true, user: fallbackUser, source: 'fallback' });
});

const purgedUserTimestamps = new Map<string, number>();

// Purge server-side cached Telegram user & session when admin deletes a student (0 Firestore ops)
app.post('/api/telegram/purge-cached-user', (req: Request, res: Response) => {
  const { telegramId, userId } = req.body || {};
  const tgIdStr = telegramId ? String(telegramId).trim() : '';
  const targetUserId = userId ? String(userId).trim() : '';
  const now = Date.now();
  if (targetUserId) purgedUserTimestamps.set(targetUserId, now);
  if (tgIdStr) purgedUserTimestamps.set(`tg:${tgIdStr}`, now);
  let changed = false;

  if (tgIdStr && telegramUsersCache.has(tgIdStr)) {
    telegramUsersCache.delete(tgIdStr);
    changed = true;
  }

  if (targetUserId) {
    for (const [k, val] of telegramUsersCache.entries()) {
      if (val && val.id === targetUserId) {
        telegramUsersCache.delete(k);
        changed = true;
      }
    }
  }

  if (changed) {
    try {
      const obj: Record<string, any> = {};
      telegramUsersCache.forEach((val, k) => {
        obj[k] = val;
      });
      const tmpPath = `${telegramUsersCachePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(obj), 'utf8');
      fs.renameSync(tmpPath, telegramUsersCachePath);
    } catch (err: any) {
      console.warn('[Telegram Cache] Could not update cache after purge:', err.message);
    }
  }

  // Clear any in-memory session referencing the deleted user
  for (const [sessId, sess] of activeTelegramSessions.entries()) {
    const sessUid = sess?.user?.id ? String(sess.user.id) : '';
    const sessTg = sess?.telegramId ? String(sess.telegramId) : '';
    if ((targetUserId && sessUid === targetUserId) || (tgIdStr && sessTg === tgIdStr)) {
      activeTelegramSessions.delete(sessId);
    }
  }

  res.json({ ok: true, purged: changed });
});

// Helper to send Telegram message to student chat
async function sendTelegramMessage(chatId: number | string, text: string) {
  const botToken = await getTelegramBotToken();
  if (!botToken) {
    console.log(`[Telegram Bot (token not set)] Message to chat ${chatId}: "${text}"`);
    return;
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });
    const result: any = await resp.json();
    console.log(`[Telegram Bot] Message sent to chat ${chatId}:`, result?.ok ? 'SUCCESS' : result);
  } catch (err: any) {
    console.warn(`[Telegram Bot] Failed to send message to chat ${chatId}:`, err.message);
  }
}

// Main Telegram Webhook endpoint for @Ra3d6_bot
app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;
    console.log('[Telegram Webhook] Received update:', JSON.stringify(update));

    const message = update?.message || update?.edited_message || update?.callback_query?.message;
    if (!message) {
      res.json({ ok: true, ignored: 'No message object' });
      return;
    }

    const text = (message.text || update?.callback_query?.data || '').trim();
    const chatId = message.chat?.id || update?.callback_query?.from?.id;
    const from = update?.callback_query?.from || message.from;

    if (!from || !chatId) {
      res.json({ ok: true, ignored: 'No from/chat' });
      return;
    }

    // Process /start command or any interaction from the student
    const isStartCommand = text.startsWith('/start') || text.toLowerCase().includes('start') || text === 'ابدأ' || text === 'بدء';
    const parts = text.split(' ');
    const startParam = parts[1] || ''; // e.g. "login" or "login_tg_12345"

    let targetSessionId = '';
    if (startParam.startsWith('login_')) {
      targetSessionId = startParam.replace('login_', '').trim();
    } else if (startParam === 'login' || !startParam || isStartCommand) {
      targetSessionId = latestPendingSessionId || 'default';
    }

    const telegramId = from.id;
    const firstName = from.first_name || 'طالب';
    const lastName = from.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'طالب رعد';
    const username = from.username || '';

    let authenticatedUser: any = null;

    // 1. Firestore persistence: update/create user and save chat ID (unless quota backed off)
    const cachedExistingTgUser = telegramUsersCache.get(String(telegramId));
    if (telegramDb && !isServerFirestoreQuotaBackedOff()) {
      try {
        // Look up student cleanly (string first, then numeric fallback)
        let userDoc: any = null;
        if (cachedExistingTgUser?.id && !String(cachedExistingTgUser.id).startsWith('tg_')) {
          try {
            const directSnap = await getDoc(doc(telegramDb, 'users', String(cachedExistingTgUser.id)));
            recordServerFirestoreOp('read', 1, 'فحص حساب تيليجرام بالمعرف');
            if (directSnap.exists()) {
              userDoc = directSnap;
            }
          } catch {}
        }

        if (!userDoc) {
          const qStr = query(collection(telegramDb, 'users'), where('telegramId', '==', String(telegramId)));
          let userSnap = await getDocs(qStr);
          recordServerFirestoreOp('read', Math.max(1, userSnap.size), 'بحث طالب تيليجرام بالبوت');
          if (userSnap.empty) {
            const qNum = query(collection(telegramDb, 'users'), where('telegramId', '==', Number(telegramId)));
            userSnap = await getDocs(qNum);
            recordServerFirestoreOp('read', Math.max(1, userSnap.size), 'بحث طالب تيليجرام بالبوت');
          }
          if (!userSnap.empty) {
            userDoc = userSnap.docs[0];
          }
        }

        if (userDoc) {
          const existingData = userDoc.data();
          const resolvedName = (from.first_name || from.last_name)
            ? fullName
            : (existingData.name || fullName);
          const resolvedUsername = username || existingData.telegramUsername || '';
          const resolvedChatId = String(chatId);
          const nowIso = new Date().toISOString();

          authenticatedUser = {
            ...existingData,
            id: userDoc.id,
            name: resolvedName,
            telegramUsername: resolvedUsername,
            telegramChatId: resolvedChatId,
            lastLoginAt: nowIso,
          };

          const updatePayload: Record<string, any> = {};
          if (resolvedName && resolvedName !== (existingData.name || '')) {
            updatePayload.name = resolvedName;
          }
          if (resolvedUsername && resolvedUsername !== (existingData.telegramUsername || '')) {
            updatePayload.telegramUsername = resolvedUsername;
          }
          if (resolvedChatId !== String(existingData.telegramChatId || '')) {
            updatePayload.telegramChatId = resolvedChatId;
          }

          if (Object.keys(updatePayload).length > 0) {
            updatePayload.lastLoginAt = nowIso;
            await updateDoc(doc(telegramDb, 'users', userDoc.id), updatePayload);
            recordServerFirestoreOp('write', 1, 'تحديث بيانات تيليجرام عند الدخول');
            console.log(`[Telegram Webhook] Synced changed profile fields for ${userDoc.id}:`, Object.keys(updatePayload));
          } else {
            console.log(`[Telegram Webhook] Profile unchanged for ${userDoc.id} — skipped redundant write`);
          }
        } else {
          const newUserData = {
            name: fullName,
            email: username ? `${username.toLowerCase()}@telegram.user` : `tg_${telegramId}@raad.platform`,
            password: `auto_tg_${telegramId}`,
            daysAllowed: 0,
            isUnlimited: false,
            isVip: false,
            subscriptionStatus: 'unspecified',
            subscriptionStartDate: '',
            subscriptionEndDate: '',
            isCounterPaused: false,
            pausedRemainingDays: 0,
            enrolledCourseIds: [],
            telegramId: String(telegramId),
            telegramChatId: String(chatId),
            telegramUsername: username,
            photoUrl: '',
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          };
          const newDocRef = doc(collection(telegramDb, 'users'));
          await setDoc(newDocRef, newUserData);
          recordServerFirestoreOp('write', 1, 'إنشاء طالب جديد عبر البوت');

          // Default mistakes folder
          try {
            await addDoc(collection(telegramDb, 'folders'), {
              userId: newDocRef.id,
              courseId: 'course_default_1',
              title: 'مجلد الاخطاء',
              isDefaultMistakesFolder: true,
              createdAt: new Date().toISOString(),
            });
            recordServerFirestoreOp('write', 1, 'إنشاء مجلد الأخطاء');
          } catch (fErr) {}

          authenticatedUser = {
            ...newUserData,
            id: newDocRef.id,
          };
          console.log(`[Telegram Webhook] Created new student profile ${newDocRef.id} with chatId ${chatId}`);
        }

        // 2. Broadcast authenticated session cleanly (at most 2 writes, no broad pending query scan)
        const sessionPayload = {
          sessionId: targetSessionId || 'default',
          status: 'authenticated',
          telegramId: String(telegramId),
          telegramChatId: String(chatId),
          user: authenticatedUser,
          createdAt: new Date().toISOString(),
          authenticatedAt: new Date().toISOString(),
        };

        const sessionWrites: Promise<any>[] = [
          setDoc(doc(telegramDb, 'telegram_login_sessions', 'global_latest'), sessionPayload),
        ];
        if (targetSessionId && targetSessionId !== 'global_latest') {
          sessionWrites.push(setDoc(doc(telegramDb, 'telegram_login_sessions', targetSessionId), sessionPayload));
        } else if (!targetSessionId) {
          sessionWrites.push(setDoc(doc(telegramDb, 'telegram_login_sessions', 'default'), sessionPayload));
        }
        await Promise.all(sessionWrites);
        recordServerFirestoreOp('write', sessionWrites.length, 'حفظ جلسة تيليجرام');
      } catch (dbErr) {
        noteServerFirestoreError(dbErr);
        console.warn('[Telegram Webhook] Firestore quota/fallback notice:', (dbErr as any)?.message || dbErr);
      }
    }

    if (!authenticatedUser) {
      if (cachedExistingTgUser) {
        authenticatedUser = {
          ...cachedExistingTgUser,
          telegramId: String(telegramId),
          telegramChatId: String(chatId),
          telegramUsername: username || cachedExistingTgUser.telegramUsername || '',
          lastLoginAt: new Date().toISOString(),
        };
      } else {
        authenticatedUser = {
          id: `tg_${telegramId}`,
          name: fullName,
          email: `tg_${telegramId}@raad.platform`,
          daysAllowed: 0,
          isUnlimited: false,
          isVip: false,
          subscriptionStatus: 'unspecified',
          subscriptionStartDate: '',
          subscriptionEndDate: '',
          isCounterPaused: false,
          pausedRemainingDays: 0,
          enrolledCourseIds: [],
          telegramId: String(telegramId),
          telegramChatId: String(chatId),
          telegramUsername: username,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
      }
    }

    persistTelegramUserEntry(authenticatedUser);

    // 3. Save in memory for instant local polling
    const sessionRecord: TelegramSessionData = {
      sessionId: targetSessionId || 'default',
      status: 'authenticated',
      user: authenticatedUser,
      telegramId: telegramId,
      telegramChatId: chatId,
      createdAt: new Date().toISOString(),
      authenticatedAt: new Date().toISOString(),
    };
    if (targetSessionId) {
      activeTelegramSessions.set(targetSessionId, sessionRecord);
    }
    if (latestPendingSessionId) {
      activeTelegramSessions.set(latestPendingSessionId, sessionRecord);
    }
    activeTelegramSessions.set('global_latest', sessionRecord);
    activeTelegramSessions.set('default', sessionRecord);

    // 4. Send exact confirmation message requested by user:
    // "تم تسجيل دخولك بنجاح! يمكنك العودة للموقع الآن."
    await sendTelegramMessage(chatId, 'تم تسجيل دخولك بنجاح! يمكنك العودة للموقع الآن.');

    res.json({ ok: true, authenticated: true, sessionId: targetSessionId, chatId });
    return;
  } catch (err: any) {
    console.error('[Telegram Webhook] Uncaught error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Setup webhook helper endpoint: sets token, calls Telegram API, saves to Firestore
app.all('/api/telegram/setup-webhook', async (req: Request, res: Response) => {
  const token = req.body?.token || req.query?.token || (await getTelegramBotToken());
  const appUrl = (req.body?.appUrl || req.query?.appUrl || process.env.APP_URL || '').replace(/\/$/, '');

  if (!token) {
    res.status(400).json({
      success: false,
      error: 'TELEGRAM_BOT_TOKEN is required. Please provide it via body { token: "..." } or query ?token=...',
      manualLinkTemplate: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=${encodeURIComponent(`${appUrl || 'https://YOUR_DOMAIN'}/api/telegram/webhook`)}`,
    });
    return;
  }

  if (!appUrl) {
    res.status(400).json({ success: false, error: 'appUrl or APP_URL is required' });
    return;
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  try {
    // 1. Verify token with Telegram getMe
    const meResp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData: any = await meResp.json();
    if (!meData?.ok) {
      res.status(400).json({
        success: false,
        error: 'Invalid bot token or Telegram rejected token',
        telegramError: meData,
      });
      return;
    }

    // 2. Set webhook on Telegram
    const setResp = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`
    );
    const setData: any = await setResp.json();

    // 3. Save token to Firestore & memory cache
    await saveTelegramBotToken(token);

    // 4. Get webhook info
    const infoResp = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const infoData: any = await infoResp.json();

    res.json({
      success: true,
      bot: meData.result,
      webhookUrl,
      setWebhookResult: setData,
      webhookInfo: infoData.result,
      manualActivationUrl: `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Set token via simple GET: /api/telegram/set-token?token=...
app.get('/api/telegram/set-token', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).send('Please provide ?token=YOUR_BOT_TOKEN');
    return;
  }
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  try {
    await saveTelegramBotToken(token);
    const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`);
    const data = await resp.json();
    res.json({ success: true, tokenSaved: true, setWebhookResult: data, webhookUrl });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Simulate webhook login for testing: /api/telegram/simulate-login
app.all('/api/telegram/simulate-login', async (req: Request, res: Response) => {
  const telegramId = req.query.telegramId || req.body?.telegramId || '99887766';
  const name = req.query.name || req.body?.name || 'طالب تجريبي';
  const username = req.query.username || req.body?.username || 'student_test';
  const sessionId = (req.query.sessionId as string) || (req.body?.sessionId as string) || latestPendingSessionId || 'default';

  const simulatedUser = {
    id: `tg_${telegramId}`,
    name: String(name),
    email: `${username}@telegram.user`,
    telegramId: String(telegramId),
    telegramChatId: String(telegramId),
    telegramUsername: String(username),
    daysAllowed: 0,
    isUnlimited: false,
    isVip: false,
    subscriptionStatus: 'unspecified',
    subscriptionStartDate: '',
    subscriptionEndDate: '',
    isCounterPaused: false,
    pausedRemainingDays: 0,
    enrolledCourseIds: [],
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  const sessionPayload = {
    sessionId,
    status: 'authenticated',
    telegramId: String(telegramId),
    telegramChatId: String(telegramId),
    user: simulatedUser,
    createdAt: new Date().toISOString(),
    authenticatedAt: new Date().toISOString(),
  };

  if (telegramDb) {
    try {
      await setDoc(doc(telegramDb, 'telegram_login_sessions', sessionId), sessionPayload);
      await setDoc(doc(telegramDb, 'telegram_login_sessions', 'global_latest'), sessionPayload);
      await setDoc(doc(telegramDb, 'telegram_login_sessions', 'default'), sessionPayload);
      recordServerFirestoreOp('write', 3, 'جلسة دخول تجريبية');
    } catch (e) {}
  }

  activeTelegramSessions.set(sessionId, sessionPayload as any);
  activeTelegramSessions.set('global_latest', sessionPayload as any);
  activeTelegramSessions.set('default', sessionPayload as any);

  res.json({
    success: true,
    message: 'Simulated login successful! Any open browser tab waiting for bot login will now log in.',
    user: simulatedUser,
    sessionId,
  });
});

// ================= REAL FIREBASE USAGE ENDPOINTS (0 EXTRA FIRESTORE READS) =================
app.post('/api/firebase-usage/report', (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const reads = Math.max(0, Math.min(50000, Math.round(Number(body.reads) || 0)));
    const writes = Math.max(0, Math.min(50000, Math.round(Number(body.writes) || 0)));
    const deletes = Math.max(0, Math.min(50000, Math.round(Number(body.deletes) || 0)));
    const cacheHits = Math.max(0, Math.min(50000, Math.round(Number(body.cacheHits) || 0)));
    const label = typeof body.label === 'string' ? body.label.slice(0, 80) : undefined;

    if (reads > 0) recordServerFirestoreOp('read', reads, label);
    if (writes > 0) recordServerFirestoreOp('write', writes, label);
    if (deletes > 0) recordServerFirestoreOp('delete', deletes, label);
    if (cacheHits > 0) recordServerFirestoreOp('cacheHit', cacheHits);

    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

app.get('/api/firebase-usage', async (_req: Request, res: Response) => {
  const ledger = rollDailyLedgerIfNeeded();

  // 1. Return cached Cloud Monitoring response if fresh (60s TTL)
  if (cachedMonitoringResult && Date.now() < cachedMonitoringResult.expiresAt) {
    res.json({
      ...cachedMonitoringResult.payload,
      cacheHits: ledger.cacheHits,
      lastOperationLabel: ledger.lastOperationLabel,
    });
    return;
  }

  // 2. Attempt direct Google Cloud Monitoring API query on firebaseProjectId
  try {
    const auth = await getMonitoringAccessToken();
    if (auth.token) {
      const startIso = getPacificMidnightIso();
      const endIso = new Date().toISOString();
      const [readsRes, writesRes, deletesRes] = await Promise.all([
        queryCloudMonitoringSum(auth.token, 'firestore.googleapis.com/document/read_ops_count', startIso, endIso),
        queryCloudMonitoringSum(auth.token, 'firestore.googleapis.com/document/write_ops_count', startIso, endIso),
        queryCloudMonitoringSum(auth.token, 'firestore.googleapis.com/document/delete_ops_count', startIso, endIso),
      ]);

      if (readsRes.ok && writesRes.ok && deletesRes.ok) {
        const payload = {
          ok: true,
          source: 'cloud_monitoring' as const,
          monitoringConnected: true,
          date: ledger.date,
          projectId: firebaseProjectId,
          databaseId: firebaseDatabaseId,
          reads: readsRes.value,
          writes: writesRes.value,
          deletes: deletesRes.value,
          totalOps: readsRes.value + writesRes.value + deletesRes.value,
          cacheHits: ledger.cacheHits,
          lastOperationLabel: ledger.lastOperationLabel,
          updatedAt: Date.now(),
        };
        cachedMonitoringResult = {
          expiresAt: Date.now() + 60_000,
          payload,
        };
        res.json(payload);
        return;
      }

      if (
        (!readsRes.ok && (readsRes.status === 401 || readsRes.status === 403)) &&
        auth.mode === 'metadata'
      ) {
        monitoringForbiddenUntil = Date.now() + 10 * 60_000;
      }
    }
  } catch (e: any) {
    console.warn('[Monitoring API] Notice:', e?.message || e);
  }

  // 3. Honest fallback: return exact server-wide + all-clients real operation ledger (0 fake numbers)
  res.json({
    ok: true,
    source: 'platform_ledger' as const,
    monitoringConnected: false,
    monitoringReason: 'missing_iam_credentials',
    date: ledger.date,
    projectId: firebaseProjectId,
    databaseId: firebaseDatabaseId,
    reads: ledger.reads,
    writes: ledger.writes,
    deletes: ledger.deletes,
    totalOps: ledger.reads + ledger.writes + ledger.deletes,
    cacheHits: ledger.cacheHits,
    lastOperationLabel: ledger.lastOperationLabel,
    updatedAt: ledger.updatedAt,
  });
});

// Status of Telegram Webhook
app.get('/api/telegram/status', async (req: Request, res: Response) => {
  const token = await getTelegramBotToken();
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const webhookUrl = appUrl ? `${appUrl}/api/telegram/webhook` : null;

  let webhookInfo: any = null;
  if (token) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      webhookInfo = await resp.json();
    } catch (e) {}
  }

  res.json({
    botName: 'Ra3d6_bot',
    botUsername: '@Ra3d6_bot',
    hasToken: Boolean(token),
    appUrl: appUrl || null,
    webhookUrl,
    manualWebhookUrl: token && webhookUrl ? `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}` : null,
    manualWebhookTemplate: webhookUrl ? `https://api.telegram.org/bot<TOKEN>/setWebhook?url=${encodeURIComponent(webhookUrl)}` : null,
    webhookInfo: webhookInfo?.result || null,
    activeSessionsCount: activeTelegramSessions.size,
    latestPendingSessionId,
  });
});

async function autoConfigureTelegramWebhook() {
  const token = await getTelegramBotToken();
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (token && appUrl) {
    try {
      const webhookUrl = `${appUrl}/api/telegram/webhook`;
      const resp = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`
      );
      const data = await resp.json();
      console.log(`[Telegram Auto-Webhook] Configured webhook for @Ra3d6_bot:`, data);
    } catch (e: any) {
      console.warn(`[Telegram Auto-Webhook] Failed to configure webhook:`, e.message);
    }
  } else {
    console.log('[Telegram Auto-Webhook] Waiting for bot token to register webhook');
  }
}

async function startServer() {
  const httpServer = http.createServer(app);
  httpServer.requestTimeout = 15 * 60 * 1000;

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    autoConfigureTelegramWebhook().catch(() => {});
  });
}

startServer();
