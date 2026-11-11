import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import http from 'http';
import https from 'https';
import { exec } from 'child_process';
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

[uploadBaseDir, videosDir, filesDir, imagesDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure Multer Storage with sanitized filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, videosDir);
    } else if (file.mimetype.startsWith('image/')) {
      cb(null, imagesDir);
    } else {
      cb(null, filesDir);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB max file upload
  },
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
  res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files statically with byte-range headers
app.use(
  '/uploads',
  express.static(uploadBaseDir, {
    setHeaders: (res) => {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  })
);

// 1. Direct Upload Endpoint for Admin (Videos, PDFs, Exam Files, Images)
app.post('/api/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'لم يتم استلام أي ملف' });
      return;
    }

    const file = req.file;
    const subfolder = file.mimetype.startsWith('video/')
      ? 'videos'
      : file.mimetype.startsWith('image/')
      ? 'images'
      : 'files';
    const relativeUrl = `/uploads/${subfolder}/${file.filename}`;
    const filePath = file.path;

    // For MP4 videos: optimize with ffmpeg +faststart so seek headers (moov atom) are at the front
    if (file.mimetype.startsWith('video/') && file.filename.endsWith('.mp4')) {
      const optimizedPath = filePath.replace('.mp4', '_opt.mp4');
      await new Promise<void>((resolve) => {
        exec(
          `ffmpeg -i "${filePath}" -c copy -movflags +faststart "${optimizedPath}" -y`,
          (err) => {
            if (!err && fs.existsSync(optimizedPath)) {
              try {
                fs.unlinkSync(filePath);
                fs.renameSync(optimizedPath, filePath);
              } catch (e) {}
            }
            resolve();
          }
        );
      });
    }

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    res.json({
      success: true,
      url: relativeUrl,
      fileName: file.originalname,
      fileSize: `${sizeMb} MB`,
      mimeType: file.mimetype,
    });
  } catch (err: any) {
    console.error('Upload Error:', err);
    res.status(500).json({ success: false, error: err.message || 'حدث خطأ أثناء رفع الملف' });
  }
});

// 2. High-Performance Stream Proxy Route
// Supports Byte-Ranges (HTTP 206) for ANY external or local video URL
// This guarantees smooth seeking even if external hosts have CORS or Range issues
app.get('/api/stream', (req: Request, res: Response) => {
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
      const stat = fs.statSync(localFile);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(localFile, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
          'Access-Control-Allow-Origin': '*',
        };
        res.writeHead(206, head);
        fileStream.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        };
        res.writeHead(200, head);
        fs.createReadStream(localFile).pipe(res);
      }
      return;
    }
  }

  // If external HTTP/HTTPS URL
  try {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const clientHeaders: Record<string, any> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
    };

    if (req.headers.range) {
      clientHeaders['Range'] = req.headers.range;
    }

    const proxyReq = client.request(
      targetUrl,
      {
        method: 'GET',
        headers: clientHeaders,
      },
      (upstreamRes) => {
        const statusCode = upstreamRes.statusCode || 200;
        const responseHeaders: Record<string, any> = {
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'bytes',
          'Content-Type': upstreamRes.headers['content-type'] || 'video/mp4',
        };

        if (upstreamRes.headers['content-range']) {
          responseHeaders['Content-Range'] = upstreamRes.headers['content-range'];
        }
        if (upstreamRes.headers['content-length']) {
          responseHeaders['Content-Length'] = upstreamRes.headers['content-length'];
        }

        res.writeHead(statusCode, responseHeaders);
        upstreamRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.warn('Proxy stream error:', err.message);
      if (!res.headersSent) {
        res.status(502).send('Error streaming media');
      }
    });

    proxyReq.end();
  } catch (err: any) {
    res.status(400).send(`Invalid URL: ${err.message}`);
  }
});

// ================= TELEGRAM BOT & WEBHOOK INTEGRATION (@Ra3d6_bot) =================
let telegramDb: any = null;
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const fbApp = initializeApp(firebaseConfig, 'serverTelegramApp');
    telegramDb = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);
    console.log('[Telegram Server] Firebase Firestore initialized successfully');
  }
} catch (err: any) {
  console.warn('[Telegram Server] Firebase init notice in server.ts:', err.message);
}

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
async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: any, parseMode: 'HTML' | 'Markdown' | '' = 'HTML'): Promise<boolean> {
  const botToken = await getTelegramBotToken();
  if (!botToken) {
    console.log(`[Telegram Bot (token not set)] Message to chat ${chatId}: "${text}"`);
    return false;
  }
  try {
    const payload: any = {
      chat_id: chatId,
      text: text,
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result: any = await resp.json();
    console.log(`[Telegram Bot] Message sent to chat ${chatId}:`, result?.ok ? 'SUCCESS' : result);
    return Boolean(result?.ok);
  } catch (err: any) {
    console.warn(`[Telegram Bot] Failed to send message to chat ${chatId}:`, err.message);
    return false;
  }
}

// Helper to fetch user profile photo from Telegram Bot API and save it locally
async function fetchAndSaveTelegramAvatar(telegramUserId: string | number): Promise<string> {
  const token = await getTelegramBotToken();
  if (!token || !telegramUserId) return '';

  try {
    const photosResp = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${telegramUserId}&limit=1`
    );
    const photosData: any = await photosResp.json();
    if (!photosData?.ok || !photosData.result?.photos?.length) return '';

    const photoSizes = photosData.result.photos[0];
    if (!photoSizes || !photoSizes.length) return '';
    const bestSize = photoSizes[photoSizes.length - 1];

    const fileResp = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${bestSize.file_id}`
    );
    const fileData: any = await fileResp.json();
    if (!fileData?.ok || !fileData.result?.file_path) return '';

    const downloadUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    const imgResp = await fetch(downloadUrl);
    if (!imgResp.ok) return '';

    const arrayBuffer = await imgResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const avatarFilename = `tg_${telegramUserId}.jpg`;
    const avatarPath = path.join(imagesDir, avatarFilename);
    fs.writeFileSync(avatarPath, buffer);

    const relativeUrl = `/uploads/images/${avatarFilename}`;
    console.log(`[Telegram Avatar] Successfully saved avatar for user ${telegramUserId} to ${relativeUrl}`);
    return relativeUrl;
  } catch (err: any) {
    console.warn(`[Telegram Avatar] Notice fetching avatar for user ${telegramUserId}:`, err.message);
    return '';
  }
}

// ================= PHONE-TO-CHAT_ID & OTP SYSTEM =================
function normalizePhoneNumber(rawPhone: string): { normalized: string; cleanDigits: string; aliases: string[] } {
  if (!rawPhone) return { normalized: '', cleanDigits: '', aliases: [] };

  const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  let str = rawPhone.toString().trim();
  arabicDigits.forEach((char, idx) => {
    str = str.split(char).join(idx.toString());
  });

  str = str.replace(/[^\d+]/g, '');

  if (str.startsWith('00')) {
    str = '+' + str.slice(2);
  }

  const digits = str.replace(/^\+/, '');
  let normalized = str;

  if (digits.startsWith('966')) {
    normalized = '+' + digits;
  } else if (digits.startsWith('05') && digits.length === 10) {
    normalized = '+966' + digits.slice(1);
  } else if (digits.startsWith('5') && digits.length === 9) {
    normalized = '+966' + digits;
  } else if (digits.startsWith('01') && (digits.length === 11 || digits.length === 10)) {
    normalized = '+20' + digits.slice(1);
  } else if (!str.startsWith('+')) {
    normalized = '+' + digits;
  }

  const cleanDigits = normalized.replace(/[^\d]/g, '');
  const aliasesSet = new Set<string>();
  aliasesSet.add(normalized);
  aliasesSet.add(cleanDigits);
  aliasesSet.add('+' + cleanDigits);

  if (cleanDigits.startsWith('966')) {
    const local = '0' + cleanDigits.slice(3);
    aliasesSet.add(local);
    aliasesSet.add(cleanDigits.slice(3));
  }
  if (cleanDigits.startsWith('20')) {
    const local = '0' + cleanDigits.slice(2);
    aliasesSet.add(local);
    aliasesSet.add(cleanDigits.slice(2));
  }
  aliasesSet.add(rawPhone.toString().trim());

  return {
    normalized,
    cleanDigits,
    aliases: Array.from(aliasesSet).filter(Boolean),
  };
}

interface PhoneLinkRecord {
  phone: string;
  cleanDigits: string;
  chatId: string | number;
  telegramId?: string | number;
  username?: string;
  name?: string;
  linkedAt: string;
}

const phoneToChatIdMap = new Map<string, PhoneLinkRecord>();
const chatIdToPhoneMap = new Map<string, string>();

async function savePhoneLink(
  phoneRaw: string,
  chatId: string | number,
  extra?: { telegramId?: string | number; username?: string; name?: string }
): Promise<PhoneLinkRecord> {
  const { normalized, cleanDigits, aliases } = normalizePhoneNumber(phoneRaw);
  const record: PhoneLinkRecord = {
    phone: normalized,
    cleanDigits,
    chatId: String(chatId),
    telegramId: extra?.telegramId ? String(extra.telegramId) : undefined,
    username: extra?.username || '',
    name: extra?.name || '',
    linkedAt: new Date().toISOString(),
  };

  aliases.forEach((alias) => phoneToChatIdMap.set(alias.toLowerCase(), record));
  phoneToChatIdMap.set(cleanDigits, record);
  chatIdToPhoneMap.set(String(chatId), normalized);

  if (telegramDb) {
    try {
      const docId = `phone_${cleanDigits}`;
      await setDoc(
        doc(telegramDb, 'telegram_phone_links', docId),
        {
          ...record,
          aliases,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // If user document exists with this telegramId, update phone and chatId
      if (extra?.telegramId) {
        const q = query(collection(telegramDb, 'users'), where('telegramId', '==', String(extra.telegramId)));
        const snap = await getDocs(q);
        for (const uDoc of snap.docs) {
          await updateDoc(doc(telegramDb, 'users', uDoc.id), {
            phone: normalized,
            telegramChatId: String(chatId),
          });
        }
      }
      console.log(`[Telegram Server] Saved phone link: ${normalized} -> chatId ${chatId}`);
    } catch (err: any) {
      console.warn('[Telegram Server] Error saving phone link to Firestore:', err.message);
    }
  }

  return record;
}

async function findChatIdByPhone(phoneRaw: string): Promise<PhoneLinkRecord | null> {
  const { normalized, cleanDigits, aliases } = normalizePhoneNumber(phoneRaw);

  // 1. In-memory check
  for (const alias of aliases) {
    const mem = phoneToChatIdMap.get(alias.toLowerCase());
    if (mem) return mem;
  }
  const byDigits = phoneToChatIdMap.get(cleanDigits);
  if (byDigits) return byDigits;

  // 2. Firestore telegram_phone_links
  if (telegramDb) {
    try {
      const directDoc = await getDoc(doc(telegramDb, 'telegram_phone_links', `phone_${cleanDigits}`));
      if (directDoc.exists()) {
        const data = directDoc.data() as PhoneLinkRecord;
        aliases.forEach((alias) => phoneToChatIdMap.set(alias.toLowerCase(), data));
        return data;
      }

      for (const alias of aliases) {
        const qLink = query(collection(telegramDb, 'telegram_phone_links'), where('aliases', 'array-contains', alias));
        const snapLink = await getDocs(qLink);
        if (!snapLink.empty) {
          const data = snapLink.docs[0].data() as PhoneLinkRecord;
          aliases.forEach((a) => phoneToChatIdMap.set(a.toLowerCase(), data));
          return data;
        }
      }

      // 3. Firestore users collection
      for (const alias of aliases) {
        const qUser = query(collection(telegramDb, 'users'), where('phone', '==', alias));
        const userSnap = await getDocs(qUser);
        if (!userSnap.empty) {
          const uData = userSnap.docs[0].data();
          const resolvedChatId = uData.telegramChatId || uData.telegramId;
          if (resolvedChatId) {
            const rec: PhoneLinkRecord = {
              phone: normalized,
              cleanDigits,
              chatId: String(resolvedChatId),
              telegramId: uData.telegramId ? String(uData.telegramId) : undefined,
              username: uData.telegramUsername || '',
              name: uData.name || '',
              linkedAt: new Date().toISOString(),
            };
            aliases.forEach((a) => phoneToChatIdMap.set(a.toLowerCase(), rec));
            return rec;
          }
        }
      }
    } catch (err: any) {
      console.warn('[Telegram Server] Error searching phone in Firestore:', err.message);
    }
  }

  return null;
}

interface OtpRecord {
  phone: string;
  cleanDigits: string;
  code: string;
  chatId: string | number;
  expiresAt: number;
  createdAt: string;
}

const activeOtps = new Map<string, OtpRecord>();
const directBotCodes = new Map<
  string,
  {
    code: string;
    chatId: string | number;
    telegramId?: string | number;
    username?: string;
    name?: string;
    expiresAt: number;
  }
>();

// Endpoint: Send OTP to user's Telegram (supports both POST and GET)
app.all('/api/telegram/send-otp', async (req: Request, res: Response) => {
  try {
    const rawInputPhone = req.body?.phone || req.query?.phone;
    if (!rawInputPhone) {
      res.status(400).json({ success: false, error: 'الرجاء إدخال رقم الهاتف' });
      return;
    }

    const { normalized, cleanDigits, aliases } = normalizePhoneNumber(String(rawInputPhone));
    if (!cleanDigits || cleanDigits.length < 8) {
      res.status(400).json({ success: false, error: 'رقم الهاتف المدخل غير مكتمل أو غير صحيح' });
      return;
    }

    console.log(`[Send OTP] Request for phone: ${rawInputPhone} (normalized: ${normalized}, cleanDigits: ${cleanDigits})`);
    const linked = await findChatIdByPhone(String(rawInputPhone));

    if (!linked || !linked.chatId) {
      const botUrl = `https://t.me/Ra3d6_bot?start=link_${cleanDigits}`;
      console.log(`[Send OTP] Phone ${normalized} not linked yet. Returning bot deep-link: ${botUrl}`);
      res.json({
        success: false,
        notLinked: true,
        phone: normalized,
        cleanDigits,
        botUsername: '@Ra3d6_bot',
        botUrl,
        message: 'رقم هاتفك غير مربوط بحساب التليجرام بعد. اضغط على الزر أدناه لفتح البوت والربط بنقرة واحدة.',
      });
      return;
    }

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    const otpData: OtpRecord = {
      phone: normalized,
      cleanDigits,
      code,
      chatId: linked.chatId,
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    activeOtps.set(cleanDigits, otpData);
    activeOtps.set(normalized, otpData);
    aliases.forEach((a) => activeOtps.set(a.toLowerCase(), otpData));

    // Save direct code as well so both verification routes work
    directBotCodes.set(code, {
      code,
      chatId: linked.chatId,
      telegramId: linked.telegramId,
      username: linked.username,
      name: linked.name,
      expiresAt,
    });

    if (telegramDb) {
      try {
        await setDoc(doc(telegramDb, 'telegram_otp_codes', `otp_${cleanDigits}`), otpData);
        await setDoc(doc(telegramDb, 'telegram_direct_codes', code), {
          code,
          phone: normalized,
          chatId: String(linked.chatId),
          telegramId: linked.telegramId ? String(linked.telegramId) : '',
          expiresAt,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {}
    }

    // Send formatted Telegram message directly to chat_id
    const msg = `🔐 <b>كود تسجيل الدخول إلى منصة أقسام رعد</b>\n\nرمز التحقق الخاص بك هو:\n<code>${code}</code>\n\n⏱ هذا الرمز صالح لمدة 10 دقائق فقط.\n⚠️ لا تشارك هذا الرمز مع أي شخص لحماية حسابك.`;
    const sent = await sendTelegramMessage(linked.chatId, msg);

    console.log(`[Send OTP] OTP ${code} sent to chatId ${linked.chatId} for phone ${normalized}: ${sent ? 'SUCCESS' : 'FAILED'}`);

    res.json({
      success: true,
      linked: true,
      phone: normalized,
      message: 'تم إرسال كود التحقق إلى حسابك في تليجرام بنجاح! تفقد رسائل البوت.',
    });
  } catch (err: any) {
    console.error('[Send OTP Error]', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء إرسال كود التحقق: ' + err.message });
  }
});

// Endpoint: Verify OTP and log in student (supports both POST and GET)
app.all('/api/telegram/verify-otp', async (req: Request, res: Response) => {
  try {
    const rawPhone = req.body?.phone || req.query?.phone;
    const rawCode = req.body?.code || req.query?.code;

    if (!rawPhone || !rawCode) {
      res.status(400).json({ success: false, error: 'الرجاء إدخال رقم الهاتف وكود التحقق' });
      return;
    }

    const { normalized, cleanDigits, aliases } = normalizePhoneNumber(String(rawPhone));
    const trimmedCode = String(rawCode).trim();

    // 1. Check in-memory
    let otpRecord = activeOtps.get(cleanDigits) || activeOtps.get(normalized);
    if (!otpRecord) {
      for (const a of aliases) {
        if (activeOtps.has(a.toLowerCase())) {
          otpRecord = activeOtps.get(a.toLowerCase());
          break;
        }
      }
    }

    // 2. Check Firestore
    if (!otpRecord && telegramDb) {
      try {
        const snap = await getDoc(doc(telegramDb, 'telegram_otp_codes', `otp_${cleanDigits}`));
        if (snap.exists()) {
          otpRecord = snap.data() as OtpRecord;
        }
      } catch (e) {}
    }

    // Also check directBotCodes
    if (!otpRecord && directBotCodes.has(trimmedCode)) {
      const d = directBotCodes.get(trimmedCode)!;
      if (Date.now() < d.expiresAt) {
        otpRecord = {
          phone: normalized,
          cleanDigits,
          code: trimmedCode,
          chatId: d.chatId,
          expiresAt: d.expiresAt,
          createdAt: new Date().toISOString(),
        };
      }
    }

    if (!otpRecord) {
      res.status(400).json({ success: false, error: 'لم يتم العثور على طلب كود لهذا الرقم أو انتهت صلاحيته. يرجى طلب كود جديد.' });
      return;
    }

    if (Date.now() > otpRecord.expiresAt) {
      activeOtps.delete(cleanDigits);
      res.status(400).json({ success: false, error: 'انتهت صلاحية كود التحقق (صالح لمدة 10 دقائق فقط). يرجى طلب كود جديد.' });
      return;
    }

    if (otpRecord.code !== trimmedCode) {
      res.status(400).json({ success: false, error: 'كود التحقق غير صحيح، يرجى التأكد من الأرقام وإعادة المحاولة.' });
      return;
    }

    // Clear used OTP
    activeOtps.delete(cleanDigits);
    activeOtps.delete(normalized);

    let authenticatedUser: any = null;
    const linkedChatId = otpRecord.chatId;

    if (telegramDb) {
      try {
        for (const a of aliases) {
          const q = query(collection(telegramDb, 'users'), where('phone', '==', a));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const uDoc = snap.docs[0];
            authenticatedUser = { id: uDoc.id, ...uDoc.data() };
            await updateDoc(doc(telegramDb, 'users', uDoc.id), {
              lastLoginAt: new Date().toISOString(),
              phone: normalized,
              telegramChatId: String(linkedChatId),
            });
            break;
          }
        }

        if (!authenticatedUser && linkedChatId) {
          const qChat = query(collection(telegramDb, 'users'), where('telegramChatId', '==', String(linkedChatId)));
          const snapChat = await getDocs(qChat);
          if (!snapChat.empty) {
            const uDoc = snapChat.docs[0];
            authenticatedUser = { id: uDoc.id, ...uDoc.data() };
            await updateDoc(doc(telegramDb, 'users', uDoc.id), {
              lastLoginAt: new Date().toISOString(),
              phone: normalized,
            });
          }
        }

        if (!authenticatedUser) {
          const newUserData = {
            name: `طالب رعد (${normalized})`,
            phone: normalized,
            email: `tg_${cleanDigits}@raad.platform`,
            password: `auto_tg_${cleanDigits}`,
            daysAllowed: 30,
            isUnlimited: false,
            enrolledCourseIds: [],
            telegramChatId: String(linkedChatId),
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          };
          const newDocRef = doc(collection(telegramDb, 'users'));
          await setDoc(newDocRef, newUserData);

          try {
            await addDoc(collection(telegramDb, 'folders'), {
              userId: newDocRef.id,
              courseId: 'course_default_1',
              title: 'مجلد الاخطاء',
              isDefaultMistakesFolder: true,
              createdAt: new Date().toISOString(),
            });
          } catch (e) {}

          authenticatedUser = { id: newDocRef.id, ...newUserData };
        }
      } catch (e) {
        console.warn('Firestore error during verify-otp:', e);
      }
    }

    if (!authenticatedUser) {
      authenticatedUser = {
        id: `user_${cleanDigits}`,
        name: `طالب رعد`,
        phone: normalized,
        email: `tg_${cleanDigits}@raad.platform`,
        daysAllowed: 30,
        telegramChatId: String(linkedChatId),
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
    }

    // Confirmation message to Telegram
    await sendTelegramMessage(
      linkedChatId,
      '✅ <b>تم تسجيل دخولك بنجاح إلى منصة أقسام رعد!</b>\n\nنتمنى لك دراسة موفقة وتحقيق نسبة 100% بإذن الله 🎯'
    );

    res.json({
      success: true,
      user: authenticatedUser,
      message: 'تم تسجيل الدخول بنجاح!',
    });
  } catch (err: any) {
    console.error('[Verify OTP Error]', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء التحقق: ' + err.message });
  }
});

// Endpoint: Verify direct bot code (supports both POST and GET)
app.all('/api/telegram/verify-direct-code', async (req: Request, res: Response) => {
  try {
    const rawCode = req.body?.code || req.query?.code;
    if (!rawCode) {
      res.status(400).json({ success: false, error: 'الرجاء إدخال كود الدخول' });
      return;
    }
    const cleanCode = String(rawCode).trim();

    let record = directBotCodes.get(cleanCode);
    if (!record && telegramDb) {
      try {
        const snap = await getDoc(doc(telegramDb, 'telegram_direct_codes', cleanCode));
        if (snap.exists()) {
          record = snap.data() as any;
        }
      } catch (e) {}
    }

    // Also search activeOtps by code value
    if (!record) {
      for (const [, val] of activeOtps.entries()) {
        if (val.code === cleanCode && Date.now() < val.expiresAt) {
          record = {
            code: cleanCode,
            chatId: val.chatId,
            expiresAt: val.expiresAt,
          };
          break;
        }
      }
    }

    if (!record || Date.now() > record.expiresAt) {
      res.status(400).json({ success: false, error: 'كود الدخول غير صحيح أو منتهي الصلاحية' });
      return;
    }

    directBotCodes.delete(cleanCode);

    let authenticatedUser: any = null;
    const chatId = record.chatId;
    const telegramId = (record as any).telegramId || chatId;

    // Check / fetch user's real Telegram avatar if not present
    let resolvedAvatar = (record as any).photoUrl || '';
    if (!resolvedAvatar && telegramId) {
      resolvedAvatar = await fetchAndSaveTelegramAvatar(telegramId);
    }

    if (telegramDb) {
      try {
        let snap = await getDocs(query(collection(telegramDb, 'users'), where('telegramChatId', '==', String(chatId))));
        if (snap.empty && telegramId) {
          snap = await getDocs(query(collection(telegramDb, 'users'), where('telegramId', '==', String(telegramId))));
        }

        if (!snap.empty) {
          const uDoc = snap.docs[0];
          const existingData = uDoc.data();
          const finalPhoto = resolvedAvatar || existingData.photoUrl || '';

          const updates: any = {
            lastLoginAt: new Date().toISOString(),
          };
          if (finalPhoto && (!existingData.photoUrl || existingData.photoUrl !== finalPhoto)) {
            updates.photoUrl = finalPhoto;
            updates.avatarUrl = finalPhoto;
          }

          await updateDoc(doc(telegramDb, 'users', uDoc.id), updates);

          authenticatedUser = {
            id: uDoc.id,
            ...existingData,
            ...updates,
            photoUrl: finalPhoto,
            avatarUrl: finalPhoto,
          };
        } else {
          const newDocRef = doc(collection(telegramDb, 'users'));
          const newUserData = {
            name: (record as any).name || 'طالب رعد',
            email: (record as any).username ? `${(record as any).username.toLowerCase()}@telegram.user` : `tg_${chatId}@raad.platform`,
            password: `auto_tg_${chatId}`,
            daysAllowed: 30,
            isUnlimited: false,
            enrolledCourseIds: [],
            watchedVideoIds: [],
            telegramChatId: String(chatId),
            telegramId: telegramId ? String(telegramId) : '',
            telegramUsername: (record as any).username || '',
            photoUrl: resolvedAvatar || '',
            avatarUrl: resolvedAvatar || '',
            preferredThemeColor: 'default',
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          };
          await setDoc(newDocRef, newUserData);

          try {
            await addDoc(collection(telegramDb, 'folders'), {
              userId: newDocRef.id,
              courseId: 'course_default_1',
              title: 'مجلد الاخطاء',
              isDefaultMistakesFolder: true,
              createdAt: new Date().toISOString(),
            });
          } catch (e) {}

          authenticatedUser = { id: newDocRef.id, ...newUserData };
        }
      } catch (e: any) {
        console.warn('Firestore verify direct code error:', e.message);
      }
    }

    if (!authenticatedUser) {
      authenticatedUser = {
        id: `user_${chatId}`,
        name: (record as any).name || 'طالب رعد',
        email: `tg_${chatId}@raad.platform`,
        daysAllowed: 30,
        isUnlimited: false,
        enrolledCourseIds: [],
        watchedVideoIds: [],
        preferredThemeColor: 'default',
        photoUrl: resolvedAvatar || '',
        avatarUrl: resolvedAvatar || '',
        telegramChatId: String(chatId),
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
    }

    // Complete StudentUser object guarantees no undefined fields that could crash the React dashboard
    const safeUser: any = {
      id: authenticatedUser.id,
      name: authenticatedUser.name || 'طالب رعد',
      email: authenticatedUser.email || `tg_${chatId}@raad.platform`,
      password: authenticatedUser.password || `auto_${chatId}`,
      daysAllowed: authenticatedUser.daysAllowed ?? 30,
      isUnlimited: Boolean(authenticatedUser.isUnlimited),
      enrolledCourseIds: Array.isArray(authenticatedUser.enrolledCourseIds) ? authenticatedUser.enrolledCourseIds : [],
      watchedVideoIds: Array.isArray(authenticatedUser.watchedVideoIds) ? authenticatedUser.watchedVideoIds : [],
      preferredThemeColor: authenticatedUser.preferredThemeColor || 'default',
      photoUrl: authenticatedUser.photoUrl || resolvedAvatar || '',
      avatarUrl: authenticatedUser.avatarUrl || authenticatedUser.photoUrl || resolvedAvatar || '',
      telegramChatId: String(chatId),
      telegramId: authenticatedUser.telegramId || (record as any)?.telegramId,
      telegramUsername: authenticatedUser.telegramUsername || (record as any)?.username || '',
      createdAt: authenticatedUser.createdAt || new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    // Send confirmation in background
    sendTelegramMessage(
      chatId,
      `✅ <b>تم تسجيل دخولك بنجاح إلى منصة أقسام رعد!</b>\nنتمنى لك دراسة موفقة وتحقيق نسبة 100% بإذن الله يا ${safeUser.name} 🎯`
    ).catch(() => {});

    res.json({
      success: true,
      user: safeUser,
      message: 'تم تسجيل الدخول بنجاح!',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'حدث خطأ: ' + err.message });
  }
});

// Avatar proxy endpoint
app.get('/api/telegram/avatar/:userId', async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  const avatarPath = path.join(imagesDir, `tg_${userId}.jpg`);
  if (fs.existsSync(avatarPath)) {
    res.sendFile(avatarPath);
    return;
  }
  const freshUrl = await fetchAndSaveTelegramAvatar(userId);
  if (freshUrl && fs.existsSync(path.join(process.cwd(), freshUrl))) {
    res.sendFile(path.join(process.cwd(), freshUrl));
    return;
  }
  res.status(404).send('Avatar not found');
});

// Centralized Telegram update handler (used by both Long Polling and Webhook)
async function handleTelegramUpdate(update: any): Promise<void> {
  try {
    const message = update?.message || update?.edited_message || update?.callback_query?.message;
    if (!message) return;

    const rawText = (message.text || update?.callback_query?.data || '').trim();
    const text = rawText.toLowerCase();
    const chatId = message.chat?.id || update?.callback_query?.from?.id;
    const from = update?.callback_query?.from || message.from;

    if (!from || !chatId) return;

    const telegramId = from.id;
    const firstName = from.first_name || 'طالب';
    const lastName = from.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'طالب رعد';
    const username = from.username || '';

    console.log(`[Telegram Bot] Message from ${fullName} (@${username || 'no_user'}, chat: ${chatId}): "${rawText}"`);

    const botKeyboard = {
      keyboard: [
        [{ text: '🔑 كود تسجيل الدخول السريع (OTP)' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };

    // 1. /code or code or quick login requested (Handles /code, code, \code, /otp, كود, etc.)
    const isCodeCommand =
      rawText === '🔑 كود تسجيل الدخول السريع (OTP)' ||
      text === '/code' ||
      text.startsWith('/code') ||
      text === 'code' ||
      text === '\\code' ||
      text === '/otp' ||
      text.startsWith('/otp') ||
      text === 'otp' ||
      text === 'كود' ||
      text === 'كود الدخول' ||
      text === 'الرمز' ||
      text === 'رمز الدخول' ||
      text.includes('كود') ||
      text.includes('رمز');

    if (isCodeCommand) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000;

      // FIRST: Reply IMMEDIATELY to Telegram user in <100ms! Zero delay!
      const reply = `🔐 <b>كود تسجيل الدخول الخاص بك في منصة رعد:</b>\n\n<code>${code}</code>\n\n⏱ <b>صالح لمدة 10 دقائق.</b>\n📌 انسخ الكود أعلاه واكتبه في خانة كود تليجرام في شاشة تسجيل الدخول بالموقع وسيتم تسجيل دخولك فوراً! ⚡`;
      sendTelegramMessage(chatId, reply, botKeyboard).catch((e) => console.warn('Send code msg error:', e));

      // SECOND: Asynchronously in background: fetch avatar & persist user + code in Firestore
      (async () => {
        let avatarUrl = '';
        if (telegramId) {
          avatarUrl = await fetchAndSaveTelegramAvatar(telegramId);
        }

        directBotCodes.set(code, {
          code,
          chatId,
          telegramId,
          username,
          name: fullName,
          expiresAt,
          photoUrl: avatarUrl,
        } as any);

        if (telegramDb) {
          try {
            await setDoc(doc(telegramDb, 'telegram_direct_codes', code), {
              code,
              chatId: String(chatId),
              telegramId: String(telegramId),
              name: fullName,
              username,
              photoUrl: avatarUrl,
              expiresAt,
              createdAt: new Date().toISOString(),
            });

            await setDoc(doc(telegramDb, 'telegram_otp_codes', `code_${code}`), {
              code,
              chatId: String(chatId),
              telegramId: String(telegramId),
              expiresAt,
              createdAt: new Date().toISOString(),
            });

            const qChat = query(collection(telegramDb, 'users'), where('telegramChatId', '==', String(chatId)));
            const snapChat = await getDocs(qChat);
            if (!snapChat.empty) {
              const uDoc = snapChat.docs[0];
              const existingData = uDoc.data();
              const updates: any = {
                lastLoginAt: new Date().toISOString(),
              };
              if (avatarUrl && existingData.photoUrl !== avatarUrl) {
                updates.photoUrl = avatarUrl;
                updates.avatarUrl = avatarUrl;
              }
              await updateDoc(doc(telegramDb, 'users', uDoc.id), updates);
            } else {
              const newUserData = {
                name: fullName,
                email: username ? `${username.toLowerCase()}@telegram.user` : `tg_${telegramId}@raad.platform`,
                password: `auto_tg_${telegramId}`,
                daysAllowed: 30,
                isUnlimited: false,
                enrolledCourseIds: [],
                watchedVideoIds: [],
                telegramId: String(telegramId),
                telegramChatId: String(chatId),
                telegramUsername: username,
                photoUrl: avatarUrl,
                avatarUrl: avatarUrl,
                preferredThemeColor: 'default',
                createdAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
              };
              const newDocRef = doc(collection(telegramDb, 'users'));
              await setDoc(newDocRef, newUserData);

              try {
                await addDoc(collection(telegramDb, 'folders'), {
                  userId: newDocRef.id,
                  courseId: 'course_default_1',
                  title: 'مجلد الاخطاء',
                  isDefaultMistakesFolder: true,
                  createdAt: new Date().toISOString(),
                });
              } catch (e) {}
            }
          } catch (dbErr: any) {
            console.warn('[Telegram Bot] Firestore save error for /code:', dbErr.message);
          }
        }
      })().catch(console.error);

      console.log(`[Telegram Bot] Instant code ${code} dispatched for ${fullName} (chat: ${chatId})`);
      return;
    }

    // 2. Standard /start or general greeting
    const isStart = text.startsWith('/start') || text === 'ابدأ' || text === 'بدء' || text === 'مرحبا' || text === 'السلام عليكم';
    if (isStart) {
      // Automatically generate code on start too!
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000;

      const welcomeMsg = `👋 <b>أهلاً بك يا ${fullName} في بوت منصة أقسام رعد التعليمية! ⚡</b>\n\n🔐 <b>كود تسجيل الدخول السريع الخاص بك:</b>\n<code>${code}</code>\n\n⏱ <b>صالح لمدة 10 دقائق.</b>\n📌 انسخ الكود أعلاه وأدخله في صفحة تسجيل الدخول بالموقع!\n💡 يمكنك أيضاً إرسال <b>/code</b> في أي وقت لتوليد كود جديد فوراً.`;
      sendTelegramMessage(chatId, welcomeMsg, botKeyboard).catch((e) => console.warn('Send start msg error:', e));

      // Asynchronously fetch avatar & save code
      (async () => {
        let avatarUrl = '';
        if (telegramId) {
          avatarUrl = await fetchAndSaveTelegramAvatar(telegramId);
        }

        directBotCodes.set(code, {
          code,
          chatId,
          telegramId,
          username,
          name: fullName,
          expiresAt,
          photoUrl: avatarUrl,
        } as any);

        if (telegramDb) {
          try {
            await setDoc(doc(telegramDb, 'telegram_direct_codes', code), {
              code,
              chatId: String(chatId),
              telegramId: String(telegramId),
              name: fullName,
              username,
              photoUrl: avatarUrl,
              expiresAt,
              createdAt: new Date().toISOString(),
            });
          } catch (e) {}
        }
      })().catch(console.error);

      return;
    }

    // Default reply if any other text sent: give them a code right away!
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const fallbackMsg = `مرحباً يا ${fullName} ⚡\n\n🔐 <b>كود الدخول السريع الخاص بك:</b>\n<code>${code}</code>\n\nأدخله في الموقع للدخول فوراً!`;
    sendTelegramMessage(chatId, fallbackMsg, botKeyboard).catch((e) => console.warn('Send fallback msg error:', e));

    (async () => {
      let avatarUrl = '';
      if (telegramId) {
        avatarUrl = await fetchAndSaveTelegramAvatar(telegramId);
      }
      directBotCodes.set(code, {
        code,
        chatId,
        telegramId,
        username,
        name: fullName,
        expiresAt,
        photoUrl: avatarUrl,
      } as any);
    })().catch(console.error);
  } catch (err: any) {
    console.error('[Telegram Bot] Error in handleTelegramUpdate:', err);
  }
}

// Webhook endpoint (still available if called)
app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;
    handleTelegramUpdate(update).catch((e) => console.warn('Webhook handle error:', e));
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[Telegram Webhook] Uncaught error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Telegram Long Polling Engine (instant response with 1-second timeout & non-blocking dispatch)
let isTelegramPolling = false;
let lastUpdateId = 0;

async function startTelegramPolling() {
  if (isTelegramPolling) return;
  isTelegramPolling = true;

  const botToken = await getTelegramBotToken();
  if (!botToken) {
    console.log('[Telegram Polling] Bot token not set. Poller will retry in 5s.');
    isTelegramPolling = false;
    setTimeout(startTelegramPolling, 5000);
    return;
  }

  // Remove webhook so getUpdates works smoothly
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`);
    console.log('[Telegram Polling] Webhook disabled. Ultra-fast Long-Polling active for @Ra3d6_bot.');
  } catch (e: any) {
    console.warn('[Telegram Polling] Notice removing webhook:', e.message);
  }

  const pollLoop = async () => {
    while (isTelegramPolling) {
      try {
        const token = await getTelegramBotToken();
        if (!token) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }

        // Fast 1-second long-poll
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=1&limit=30`;
        const res = await fetch(url);
        const data: any = await res.json();

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            // Non-blocking invocation: execute immediately without waiting!
            handleTelegramUpdate(update).catch((err) => console.warn('[Telegram Polling] Update handling error:', err));
          }
        } else if (!data.ok) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err: any) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  };

  pollLoop().catch((err) => {
    console.error('[Telegram Polling] Poller crashed, restarting in 2s:', err);
    isTelegramPolling = false;
    setTimeout(startTelegramPolling, 2000);
  });
}

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
    daysAllowed: 30,
    isUnlimited: false,
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    startTelegramPolling().catch((e) => {
      console.warn('Error starting telegram polling:', e);
    });
  });
}

startServer();
