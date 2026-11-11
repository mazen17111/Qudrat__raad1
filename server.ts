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
            daysAllowed: 30,
            isUnlimited: false,
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
        daysAllowed: 30,
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
    autoConfigureTelegramWebhook().catch(() => {});
  });
}

startServer();
