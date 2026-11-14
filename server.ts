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
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const fbApp = initializeApp(firebaseConfig, 'serverTelegramApp');
    telegramDb = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);
    console.log('[Server] Firebase Firestore initialized successfully');
  }
} catch (err: any) {
  console.warn('[Server] Firebase init notice in server.ts:', err.message);
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
    if (!meta && telegramDb) {
      try {
        const snap = await getDoc(doc(telegramDb, 'media_files', mediaId));
        if (snap.exists()) {
          meta = snap.data();
          persistLocalMediaEntry(meta);
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

  // 2. Check Firebase Firestore chunks if previously mirrored
  if (telegramDb) {
    try {
      let meta = mediaMetadataCache.get(cacheKey);
      if (!meta) {
        const snap = await getDoc(doc(telegramDb, 'media_files', cacheKey));
        if (snap.exists()) {
          meta = snap.data();
          mediaMetadataCache.set(cacheKey, meta);
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
let latestPendingSessionId: string | null = null;
let cachedBotToken: string | null = process.env.TELEGRAM_BOT_TOKEN || null;

// Helper to resolve bot token from env or Firestore
async function getTelegramBotToken(): Promise<string | null> {
  if (cachedBotToken) return cachedBotToken;
  if (telegramDb) {
    try {
      const snap = await getDoc(doc(telegramDb, 'system_settings', 'telegram_bot'));
      if (snap.exists() && snap.data().token) {
        cachedBotToken = snap.data().token;
        return cachedBotToken;
      }
      const globSnap = await getDoc(doc(telegramDb, 'system_settings', 'global'));
      if (globSnap.exists() && globSnap.data().telegramBotToken) {
        cachedBotToken = globSnap.data().telegramBotToken;
        return cachedBotToken;
      }
    } catch (e) {
      // Ignore read errors
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

  // 1. In-memory check (instant)
  const memSession = activeTelegramSessions.get(sessionId) || activeTelegramSessions.get('global_latest') || activeTelegramSessions.get('default');
  if (memSession && memSession.status === 'authenticated' && memSession.user) {
    res.json({ authenticated: true, user: memSession.user });
    return;
  }

  // 2. Check Firestore session document
  if (telegramDb) {
    try {
      // Check requested sessionId
      const snap = await getDoc(doc(telegramDb, 'telegram_login_sessions', sessionId));
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'authenticated' && data.user) {
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
      if (globalSnap.exists()) {
        const data = globalSnap.data();
        if (data.status === 'authenticated' && data.user) {
          // If authenticated within the last 2 minutes
          const authTime = data.authenticatedAt ? new Date(data.authenticatedAt).getTime() : 0;
          if (Date.now() - authTime < 120000) {
            res.json({ authenticated: true, user: data.user });
            return;
          }
        }
      }
    } catch (e) {
      // Ignore read errors
    }
  }

  res.json({ authenticated: false });
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

    // 1. Firestore persistence: update/create user and save chat ID
    if (telegramDb) {
      try {
        // Search by numeric ID OR string ID to guarantee finding existing student
        const qNum = query(collection(telegramDb, 'users'), where('telegramId', '==', Number(telegramId)));
        let userSnap = await getDocs(qNum);
        if (userSnap.empty) {
          const qStr = query(collection(telegramDb, 'users'), where('telegramId', '==', String(telegramId)));
          userSnap = await getDocs(qStr);
        }

        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          const existingData = userDoc.data();
          authenticatedUser = {
            ...existingData,
            id: userDoc.id,
            name: existingData.name || fullName,
            telegramUsername: username || existingData.telegramUsername || '',
            telegramChatId: String(chatId),
            lastLoginAt: new Date().toISOString(),
          };
          await updateDoc(doc(telegramDb, 'users', userDoc.id), {
            lastLoginAt: new Date().toISOString(),
            telegramUsername: username || existingData.telegramUsername || '',
            telegramChatId: String(chatId),
          });
          console.log(`[Telegram Webhook] Updated existing student ${userDoc.id} with chatId ${chatId}`);
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

          // Default mistakes folder
          try {
            await addDoc(collection(telegramDb, 'folders'), {
              userId: newDocRef.id,
              courseId: 'course_default_1',
              title: 'مجلد الاخطاء',
              isDefaultMistakesFolder: true,
              createdAt: new Date().toISOString(),
            });
          } catch (fErr) {}

          authenticatedUser = {
            ...newUserData,
            id: newDocRef.id,
          };
          console.log(`[Telegram Webhook] Created new student profile ${newDocRef.id} with chatId ${chatId}`);
        }

        // 2. Broadcast authenticated session across Firestore documents
        const sessionPayload = {
          sessionId: targetSessionId || 'default',
          status: 'authenticated',
          telegramId: String(telegramId),
          telegramChatId: String(chatId),
          user: authenticatedUser,
          createdAt: new Date().toISOString(),
          authenticatedAt: new Date().toISOString(),
        };

        // Save target session, global_latest, and default
        await Promise.all([
          targetSessionId ? setDoc(doc(telegramDb, 'telegram_login_sessions', targetSessionId), sessionPayload) : Promise.resolve(),
          setDoc(doc(telegramDb, 'telegram_login_sessions', 'global_latest'), sessionPayload),
          setDoc(doc(telegramDb, 'telegram_login_sessions', 'default'), sessionPayload),
        ]);

        // Also update any other pending sessions created within the last 30 minutes
        try {
          const pendingQuery = query(
            collection(telegramDb, 'telegram_login_sessions'),
            where('status', '==', 'pending')
          );
          const pendingSnap = await getDocs(pendingQuery);
          for (const pDoc of pendingSnap.docs) {
            await updateDoc(doc(telegramDb, 'telegram_login_sessions', pDoc.id), {
              status: 'authenticated',
              user: authenticatedUser,
              telegramId: String(telegramId),
              telegramChatId: String(chatId),
              authenticatedAt: new Date().toISOString(),
            });
          }
        } catch (penErr) {
          console.warn('[Telegram Webhook] Notice updating pending docs:', penErr);
        }
      } catch (dbErr) {
        console.error('[Telegram Webhook] Firestore error:', dbErr);
      }
    }

    if (!authenticatedUser) {
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
        telegramId: String(telegramId),
        telegramChatId: String(chatId),
        telegramUsername: username,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
    }

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
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    autoConfigureTelegramWebhook().catch(() => {});
  });
  server.requestTimeout = 15 * 60 * 1000;
}

startServer();
