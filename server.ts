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
  authenticatedAt?: string;
  createdAt: string;
}

const activeTelegramSessions = new Map<string, TelegramSessionData>();
let latestPendingSessionId: string | null = null;

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
  const memSession = activeTelegramSessions.get(sessionId);
  if (memSession && memSession.status === 'authenticated' && memSession.user) {
    res.json({ authenticated: true, user: memSession.user });
    return;
  }

  // 2. Check Firestore session document
  if (telegramDb) {
    try {
      const snap = await getDoc(doc(telegramDb, 'telegram_login_sessions', sessionId));
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'authenticated' && data.user) {
          activeTelegramSessions.set(sessionId, {
            sessionId,
            status: 'authenticated',
            user: data.user,
            telegramId: data.telegramId,
            createdAt: data.createdAt,
            authenticatedAt: data.authenticatedAt,
          });
          res.json({ authenticated: true, user: data.user });
          return;
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
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.log(`[Telegram Bot (token not set in env)] Message to chat ${chatId}: "${text}"`);
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
    const result = await resp.json();
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

    const message = update?.message || update?.edited_message;
    if (!message) {
      res.json({ ok: true, ignored: 'No message object' });
      return;
    }

    const text = (message.text || '').trim();
    const chatId = message.chat?.id;
    const from = message.from;

    if (!from || !chatId) {
      res.json({ ok: true, ignored: 'No from/chat' });
      return;
    }

    // Process /start command
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const startParam = parts[1] || ''; // e.g. "login" or "login_tg_12345"

      let targetSessionId = '';
      if (startParam.startsWith('login_')) {
        targetSessionId = startParam.replace('login_', '').trim();
      } else if (startParam === 'login' || !startParam) {
        targetSessionId = latestPendingSessionId || 'default';
      }

      const telegramId = from.id;
      const firstName = from.first_name || 'طالب';
      const lastName = from.last_name || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'طالب رعد';
      const username = from.username || '';

      let authenticatedUser: any = null;

      // Firestore persistence
      if (telegramDb) {
        try {
          const userQuery = query(collection(telegramDb, 'users'), where('telegramId', '==', telegramId));
          const userSnap = await getDocs(userQuery);

          if (!userSnap.empty) {
            const userDoc = userSnap.docs[0];
            const existingData = userDoc.data();
            authenticatedUser = {
              ...existingData,
              id: userDoc.id,
              name: existingData.name || fullName,
              telegramUsername: username || existingData.telegramUsername || '',
              lastLoginAt: new Date().toISOString(),
            };
            await updateDoc(doc(telegramDb, 'users', userDoc.id), {
              lastLoginAt: new Date().toISOString(),
              telegramUsername: username || existingData.telegramUsername || '',
            });
          } else {
            const newUserData = {
              name: fullName,
              email: username ? `${username}@telegram.user` : `tg_${telegramId}@raad.platform`,
              password: `auto_tg_${telegramId}`,
              daysAllowed: 30,
              isUnlimited: false,
              enrolledCourseIds: [],
              telegramId: telegramId,
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
          }

          // Save session in Firestore
          const sessionPayload = {
            sessionId: targetSessionId,
            status: 'authenticated',
            telegramId: telegramId,
            user: authenticatedUser,
            createdAt: new Date().toISOString(),
            authenticatedAt: new Date().toISOString(),
          };

          if (targetSessionId) {
            await setDoc(doc(telegramDb, 'telegram_login_sessions', targetSessionId), sessionPayload);
          }
          if (latestPendingSessionId && latestPendingSessionId !== targetSessionId) {
            await setDoc(doc(telegramDb, 'telegram_login_sessions', latestPendingSessionId), sessionPayload);
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
          daysAllowed: 30,
          telegramId: telegramId,
          telegramUsername: username,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
      }

      // Save in memory
      const sessionRecord: TelegramSessionData = {
        sessionId: targetSessionId,
        status: 'authenticated',
        user: authenticatedUser,
        telegramId: telegramId,
        createdAt: new Date().toISOString(),
        authenticatedAt: new Date().toISOString(),
      };
      if (targetSessionId) {
        activeTelegramSessions.set(targetSessionId, sessionRecord);
      }
      if (latestPendingSessionId) {
        activeTelegramSessions.set(latestPendingSessionId, sessionRecord);
      }

      // Send the exact confirmation message requested by user:
      // "تم تسجيل دخولك بنجاح! يمكنك العودة للموقع الآن."
      await sendTelegramMessage(chatId, 'تم تسجيل دخولك بنجاح! يمكنك العودة للموقع الآن.');

      res.json({ ok: true, authenticated: true, sessionId: targetSessionId });
      return;
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[Telegram Webhook] Uncaught error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Setup webhook helper endpoint
app.post('/api/telegram/setup-webhook', async (req: Request, res: Response) => {
  const token = req.body.token || process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = (req.body.appUrl || process.env.APP_URL || '').replace(/\/$/, '');

  if (!token) {
    res.status(400).json({ success: false, error: 'TELEGRAM_BOT_TOKEN is required' });
    return;
  }
  if (!appUrl) {
    res.status(400).json({ success: false, error: 'appUrl or APP_URL is required' });
    return;
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const data = await resp.json();
    res.json({ success: true, webhookUrl, result: data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Status of Telegram Webhook
app.get('/api/telegram/status', (req: Request, res: Response) => {
  res.json({
    botName: 'Ra3d6_bot',
    botUsername: '@Ra3d6_bot',
    hasToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    appUrl: process.env.APP_URL || null,
    activeSessionsCount: activeTelegramSessions.size,
    latestPendingSessionId,
  });
});

async function autoConfigureTelegramWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (token && appUrl) {
    try {
      const webhookUrl = `${appUrl}/api/telegram/webhook`;
      const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const data = await resp.json();
      console.log(`[Telegram Auto-Webhook] Configured webhook for @Ra3d6_bot:`, data);
    } catch (e: any) {
      console.warn(`[Telegram Auto-Webhook] Failed to configure webhook:`, e.message);
    }
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
    autoConfigureTelegramWebhook().catch(() => {});
  });
}

startServer();
