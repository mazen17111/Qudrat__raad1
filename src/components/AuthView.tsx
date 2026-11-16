import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Mail,
  Lock,
  User,
  Sun,
  Moon,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Video,
  FileCheck,
  Target,
  RotateCcw,
  Trophy,
  BookOpen,
  Award,
  Send,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import { StudentUser, SystemSettings } from '../types';
import { BrandLogo } from './BrandLogo';
import { TelegramLoginCard, TelegramAccount } from './TelegramLoginCard';
import {
  db,
  OperationType,
  reportFirestoreListenerError,
  isQuotaExceededError,
  isQuotaExceededActive,
  isTransientFirestoreError,
  handleFirestoreError,
} from '../firebase';
import {
  collection,
  query,
  where,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import {
  getCachedTelegramUser,
  saveCachedTelegramUser,
  markTelegramUserPendingSync,
  clearTelegramUserPendingSync,
  removeCachedTelegramUser,
  buildFallbackTelegramUser,
} from '../utils/telegramUserCache';
import { trackLocalRead, trackLocalWrite, trackLocalCacheHit } from '../utils/localUsageTracker';
import { addLocalFolder } from '../utils/studentFoldersStore';
import { PlatformFooter } from './PlatformFooter';

interface AuthViewProps {
  onSuccessAuth: (user: StudentUser) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  systemSettings: SystemSettings;
  onSecretTriggerAdmin: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  onSuccessAuth,
  isDarkMode,
  toggleDarkMode,
  systemSettings,
  onSecretTriggerAdmin,
}) => {
  const [authMode, setAuthMode] = useState<'telegram' | 'email'>('telegram');
  const [isAddingNewTelegram, setIsAddingNewTelegram] = useState(false);
  const [savedTelegramAccounts, setSavedTelegramAccounts] = useState<TelegramAccount[]>(() => {
    try {
      const saved = localStorage.getItem('raad_saved_telegram_accounts');
      if (saved) return JSON.parse(saved);
      const sessionRaw = localStorage.getItem('raad_student_session');
      if (sessionRaw) {
        const sess = JSON.parse(sessionRaw);
        if (sess.telegramId) {
          return [
            {
              id: sess.telegramId,
              name: sess.name,
              username: sess.telegramUsername,
              photoUrl: sess.photoUrl,
            },
          ];
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [error, setError] = useState('');
  const [isWaitingForBotAuth, setIsWaitingForBotAuth] = useState(false);
  const [activeBotSessionId, setActiveBotSessionId] = useState<string>('');
  const [showUnderDevModal, setShowUnderDevModal] = useState(false);
  const telegramContainerRef = useRef<HTMLDivElement>(null);

  // Helper to resolve a Telegram student from IndexedDB cache, localStorage, server cache, or deterministic fallback
  const resolveTelegramFallbackUser = async (params: {
    telegramIdStr: string;
    name?: string;
    username?: string;
    photoUrl?: string;
  }): Promise<StudentUser> => {
    const { telegramIdStr, name, username, photoUrl } = params;

    // 1. Try Firestore IndexedDB local cache first (0 network reads)
    try {
      const q = query(collection(db, 'users'), where('telegramId', '==', telegramIdStr));
      const cachedSnap = await getDocsFromCache(q);
      if (!cachedSnap.empty) {
        const d = cachedSnap.docs[0];
        return buildFallbackTelegramUser({
          telegramId: telegramIdStr,
          name,
          username,
          photoUrl,
          existing: { id: d.id, ...d.data() } as StudentUser,
        });
      }
    } catch {}

    // 2. Try localStorage saved Telegram profiles
    const localCached = getCachedTelegramUser(telegramIdStr);
    if (localCached) {
      return buildFallbackTelegramUser({
        telegramId: telegramIdStr,
        name,
        username,
        photoUrl,
        existing: localCached,
      });
    }

    // 3. Try server's persistent Telegram user cache (/api/telegram/resolve-user)
    try {
      const resp = await fetch('/api/telegram/resolve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: telegramIdStr,
          name,
          username,
          photoUrl,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.ok && data.user) {
          return buildFallbackTelegramUser({
            telegramId: telegramIdStr,
            name,
            username,
            photoUrl,
            existing: data.user as StudentUser,
          });
        }
      }
    } catch {}

    // 4. Deterministic fallback so student enters smoothly
    return buildFallbackTelegramUser({
      telegramId: telegramIdStr,
      name,
      username,
      photoUrl,
      existing: null,
    });
  };

  // Helper to complete Telegram login and update all local + server caches cleanly
  const finalizeTelegramLogin = (authenticatedUser: StudentUser) => {
    try {
      localStorage.setItem('raad_student_auth_session', JSON.stringify(authenticatedUser));
      localStorage.setItem('raad_student_session', JSON.stringify(authenticatedUser));
    } catch (e) {}

    const updatedAccounts = saveCachedTelegramUser(authenticatedUser);
    if (updatedAccounts.length > 0) {
      setSavedTelegramAccounts(updatedAccounts);
    }

    // Warm server's local Telegram cache in background (0 Firestore reads)
    fetch('/api/telegram/resolve-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId: authenticatedUser.telegramId,
        user: authenticatedUser,
      }),
    }).catch(() => {});

    setIsAddingNewTelegram(false);
    onSuccessAuth(authenticatedUser);
  };

  // Handle Telegram Authentication Callback from Widget
  const handleTelegramAuthSuccess = async (tgUser: any) => {
    if (!tgUser || !tgUser.id) return;
    setTelegramLoading(true);
    setError('');

    const telegramIdStr = String(tgUser.id);
    const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || `طالب_${tgUser.id}`;
    const localCached = getCachedTelegramUser(telegramIdStr);

    try {
      // Fast fallback if Firestore quota is already known to be exceeded
      if (isQuotaExceededActive()) {
        if (localCached) {
          trackLocalCacheHit(1, 'دخول تيليجرام من الكاش المحلي');
          if (localCached.isDeleted) {
            setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
            return;
          }
          finalizeTelegramLogin(
            buildFallbackTelegramUser({
              telegramId: telegramIdStr,
              name: fullName,
              username: tgUser.username || '',
              photoUrl: tgUser.photo_url || '',
              existing: localCached,
            })
          );
          return;
        }
        setError('');
        setShowUnderDevModal(true);
        return;
      }

      let existingDocId: string | null = null;
      let existingData: StudentUser | null = null;

      // 1. If we already know the student's real Firestore doc ID from local cache, read 1 doc directly
      if (localCached?.id && !localCached.id.startsWith('tg_')) {
        try {
          const singleSnap = await getDoc(doc(db, 'users', localCached.id));
          trackLocalRead(1, 'فحص حساب تيليجرام');
          if (singleSnap.exists()) {
            existingDocId = singleSnap.id;
            existingData = { id: singleSnap.id, ...singleSnap.data() } as StudentUser;
          }
        } catch (singleErr) {
          if (isQuotaExceededError(singleErr) || isTransientFirestoreError(singleErr)) {
            try {
              const cachedDoc = await getDocFromCache(doc(db, 'users', localCached.id));
              if (cachedDoc.exists()) {
                existingDocId = cachedDoc.id;
                existingData = { id: cachedDoc.id, ...cachedDoc.data() } as StudentUser;
              }
            } catch {}
            if (!existingData) throw singleErr;
          }
        }
      }

      // 2. Otherwise query by telegramId (string, then numeric fallback if needed)
      if (!existingData) {
        const usersRef = collection(db, 'users');
        let snap = await getDocs(query(usersRef, where('telegramId', '==', telegramIdStr)));
        trackLocalRead(Math.max(1, snap.size), 'البحث عن حساب تيليجرام');
        if (snap.empty && /^\d+$/.test(telegramIdStr)) {
          snap = await getDocs(query(usersRef, where('telegramId', '==', Number(telegramIdStr))));
          trackLocalRead(Math.max(1, snap.size), 'البحث عن حساب تيليجرام');
        }
        if (!snap.empty) {
          existingDocId = snap.docs[0].id;
          existingData = { id: snap.docs[0].id, ...snap.docs[0].data() } as StudentUser;
        }
      }

      let authenticatedUser: StudentUser;

      if (existingData && existingDocId) {
        if (existingData.isDeleted) {
          setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
          setTelegramLoading(false);
          return;
        }

        // Auto-update Telegram profile (name, photo, username) strictly ONCE on login when changed
        const sessionSyncKey = `raad_tg_profile_synced_${existingDocId}`;
        let alreadySyncedThisLogin = false;
        try {
          alreadySyncedThisLogin = sessionStorage.getItem(sessionSyncKey) === '1';
        } catch {}

        const updates: Partial<StudentUser> = {};
        const hasTelegramDisplayName = Boolean(tgUser.first_name || tgUser.last_name);
        if (hasTelegramDisplayName && fullName && fullName !== existingData.name) {
          updates.name = fullName;
        }
        if (tgUser.photo_url && tgUser.photo_url !== (existingData.photoUrl || '')) {
          updates.photoUrl = tgUser.photo_url;
        }
        if (tgUser.username && tgUser.username !== (existingData.telegramUsername || '')) {
          updates.telegramUsername = tgUser.username;
        }
        if (!alreadySyncedThisLogin) {
          updates.lastLoginAt = new Date().toISOString();
        }

        if (Object.keys(updates).length > 0) {
          try {
            await updateDoc(doc(db, 'users', existingDocId), updates as any);
            trackLocalWrite(1, 'تحديث بيانات تيليجرام عند الدخول');
          } catch (e) {
            console.warn('Update user last login note:', e);
          }
        }
        try {
          sessionStorage.setItem(sessionSyncKey, '1');
        } catch {}

        authenticatedUser = {
          ...existingData,
          ...updates,
          id: existingDocId,
        };
        clearTelegramUserPendingSync(telegramIdStr);
      } else {
        // User does not exist in Firestore (new visitor or deleted account) -> purge any stale local cache & create fresh account
        if (localCached) {
          const remaining = removeCachedTelegramUser(telegramIdStr, localCached.id);
          setSavedTelegramAccounts(remaining);
        }
        const newUserRef = doc(collection(db, 'users'));
        const newStudent: StudentUser = {
          id: newUserRef.id,
          name: fullName,
          email: tgUser.username ? `${tgUser.username.toLowerCase()}@telegram.raad` : `tg_${tgUser.id}@telegram.raad`,
          password: `tg_${tgUser.id}_pass`,
          telegramId: telegramIdStr,
          telegramUsername: tgUser.username || '',
          photoUrl: tgUser.photo_url || '',
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

        try {
          await setDoc(newUserRef, newStudent);
          trackLocalWrite(1, 'إنشاء حساب تيليجرام جديد');
          // Provision default mistakes folder for this student
          await addDoc(collection(db, 'folders'), {
            userId: newStudent.id,
            courseId: 'course_default_1',
            title: 'مجلد الاخطاء',
            isDefaultMistakesFolder: true,
            createdAt: new Date().toISOString(),
          }).then(() => trackLocalWrite(1, 'إنشاء مجلد الأخطاء')).catch(() => {});
          clearTelegramUserPendingSync(telegramIdStr);
          authenticatedUser = newStudent;
        } catch (writeErr) {
          if (isQuotaExceededError(writeErr) || isTransientFirestoreError(writeErr)) {
            if (isQuotaExceededError(writeErr)) {
              handleFirestoreError(writeErr, OperationType.WRITE, `users/${newUserRef.id}`);
            }
            if (localCached) {
              finalizeTelegramLogin(localCached);
              return;
            }
            setError('');
            setShowUnderDevModal(true);
            return;
          }
          throw writeErr;
        }
      }

      finalizeTelegramLogin(authenticatedUser);
    } catch (err: any) {
      if (isQuotaExceededError(err)) {
        handleFirestoreError(err, OperationType.GET, 'users');
      } else {
        console.warn('Telegram Auth fallback activated:', err);
      }

      // If returning student exists in local/IndexedDB cache, let them in smoothly; otherwise show sleek Under Development modal
      if (localCached) {
        trackLocalCacheHit(1, 'دخول تيليجرام من الكاش المحلي');
        if (localCached.isDeleted) {
          setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
          return;
        }
        finalizeTelegramLogin(
          buildFallbackTelegramUser({
            telegramId: telegramIdStr,
            name: fullName,
            username: tgUser.username || '',
            photoUrl: tgUser.photo_url || '',
            existing: localCached,
          })
        );
        return;
      }

      const cachedOrServerUser = await resolveTelegramFallbackUser({
        telegramIdStr,
        name: fullName,
        username: tgUser.username || '',
        photoUrl: tgUser.photo_url || '',
      });
      if (cachedOrServerUser && !cachedOrServerUser.id.startsWith('tg_')) {
        if (cachedOrServerUser.isDeleted) {
          setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
          return;
        }
        finalizeTelegramLogin(cachedOrServerUser);
        return;
      }

      setError('');
      setShowUnderDevModal(true);
    } finally {
      setTelegramLoading(false);
    }
  };

  // Direct login with one of the saved Telegram accounts
  const handleSavedTelegramLogin = async (account: TelegramAccount) => {
    setTelegramLoading(true);
    setError('');
    const telegramIdStr = String(account.id);
    const localCached = getCachedTelegramUser(telegramIdStr);

    try {
      if (isQuotaExceededActive()) {
        const fallbackUser = await resolveTelegramFallbackUser({
          telegramIdStr,
          name: account.name,
          username: account.username || '',
          photoUrl: account.photoUrl || '',
        });
        if (fallbackUser.isDeleted) {
          setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
          return;
        }
        finalizeTelegramLogin(fallbackUser);
        return;
      }

      let existingDocId: string | null = null;
      let existingData: StudentUser | null = null;

      if (localCached?.id && !localCached.id.startsWith('tg_')) {
        try {
          const singleSnap = await getDoc(doc(db, 'users', localCached.id));
          trackLocalRead(1, 'فحص حساب تيليجرام محفوظ');
          if (singleSnap.exists()) {
            existingDocId = singleSnap.id;
            existingData = { id: singleSnap.id, ...singleSnap.data() } as StudentUser;
          }
        } catch (singleErr) {
          if (isQuotaExceededError(singleErr) || isTransientFirestoreError(singleErr)) {
            try {
              const cachedDoc = await getDocFromCache(doc(db, 'users', localCached.id));
              if (cachedDoc.exists()) {
                trackLocalCacheHit(1, 'قراءة حساب تيليجرام من الكاش');
                existingDocId = cachedDoc.id;
                existingData = { id: cachedDoc.id, ...cachedDoc.data() } as StudentUser;
              }
            } catch {}
            if (!existingData) throw singleErr;
          }
        }
      }

      if (!existingData) {
        const usersRef = collection(db, 'users');
        let snap = await getDocs(query(usersRef, where('telegramId', '==', telegramIdStr)));
        trackLocalRead(Math.max(1, snap.size), 'البحث عن حساب تيليجرام محفوظ');
        if (snap.empty && /^\d+$/.test(telegramIdStr)) {
          snap = await getDocs(query(usersRef, where('telegramId', '==', Number(telegramIdStr))));
          trackLocalRead(Math.max(1, snap.size), 'البحث عن حساب تيليجرام محفوظ');
        }
        if (!snap.empty) {
          existingDocId = snap.docs[0].id;
          existingData = { id: snap.docs[0].id, ...snap.docs[0].data() } as StudentUser;
        }
      }

      if (existingData && existingDocId) {
        if (existingData.isDeleted) {
          setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
          setTelegramLoading(false);
          return;
        }

        const nowIso = new Date().toISOString();
        const sessionSyncKey = `raad_tg_profile_synced_${existingDocId}`;
        let alreadySyncedRecently = false;
        try {
          alreadySyncedRecently = sessionStorage.getItem(sessionSyncKey) === '1';
        } catch {}
        if (!alreadySyncedRecently && existingData.lastLoginAt) {
          const lastMs = new Date(existingData.lastLoginAt).getTime();
          if (lastMs && Date.now() - lastMs < 12 * 60 * 60 * 1000) {
            alreadySyncedRecently = true;
          }
        }

        if (!alreadySyncedRecently) {
          try {
            await updateDoc(doc(db, 'users', existingDocId), {
              lastLoginAt: nowIso,
            });
            trackLocalWrite(1, 'تحديث آخر دخول تيليجرام');
          } catch (e) {}
          try {
            sessionStorage.setItem(sessionSyncKey, '1');
          } catch {}
        }

        const authenticatedUser: StudentUser = {
          ...existingData,
          lastLoginAt: alreadySyncedRecently ? existingData.lastLoginAt || nowIso : nowIso,
          id: existingDocId,
        };
        finalizeTelegramLogin(authenticatedUser);
      } else {
        // Firestore responded and confirmed the account does NOT exist (deleted by admin) -> purge stale saved card & require fresh sign-in
        const remaining = removeCachedTelegramUser(telegramIdStr, localCached?.id || null);
        setSavedTelegramAccounts(remaining);
        fetch('/api/telegram/purge-cached-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: localCached?.id || '',
            telegramId: telegramIdStr,
          }),
        }).catch(() => {});
        setIsAddingNewTelegram(true);
        setError('تم إعادة تعيين الحساب؛ يرجى تسجيل الدخول بتليجرام مجدداً لبدء حساب جديد.');
      }
    } catch (err) {
      if (isQuotaExceededError(err)) {
        handleFirestoreError(err, OperationType.GET, 'users');
      } else {
        console.warn('Saved Telegram login fallback activated:', err);
      }

      if (localCached) {
        trackLocalCacheHit(1, 'دخول تيليجرام من الكاش المحلي');
        if (localCached.isDeleted) {
          setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
          return;
        }
        finalizeTelegramLogin({
          ...localCached,
          lastLoginAt: new Date().toISOString(),
        });
        return;
      }

      setError('');
      setShowUnderDevModal(true);
    } finally {
      setTelegramLoading(false);
    }
  };

  // Handle Telegram login authentication via Bot
  const handleBotLoginClick = () => {
    setError('');
    if (isQuotaExceededActive()) {
      setShowUnderDevModal(true);
      return;
    }

    const sessionId = 'tg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    setActiveBotSessionId(sessionId);
    setIsWaitingForBotAuth(true);

    // 1. Notify server of pending session
    fetch('/api/telegram/register-pending-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});

    // 2. Set pending doc in Firestore
    try {
      setDoc(doc(db, 'telegram_login_sessions', sessionId), {
        sessionId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      })
        .then(() => trackLocalWrite(1, 'بدء جلسة دخول تيليجرام'))
        .catch((err) => {
          if (isQuotaExceededError(err) || isTransientFirestoreError(err)) {
            if (isQuotaExceededError(err)) {
              handleFirestoreError(err, OperationType.WRITE, `telegram_login_sessions/${sessionId}`);
            }
            setIsWaitingForBotAuth(false);
            setShowUnderDevModal(true);
          }
        });
    } catch (e) {}
  };

  // Listen and Poll for Telegram Bot Authentication confirmation
  useEffect(() => {
    if (!isWaitingForBotAuth || !activeBotSessionId) return;

    let isDone = false;

    const handleLoginComplete = (authenticatedUser: any) => {
      if (isDone) return;
      isDone = true;
      setIsWaitingForBotAuth(false);

      try {
        localStorage.setItem('raad_student_auth_session', JSON.stringify(authenticatedUser));
        localStorage.setItem('raad_student_session', JSON.stringify(authenticatedUser));
      } catch (e) {}
      if (authenticatedUser?.telegramId) {
        const updatedAccs = saveCachedTelegramUser(authenticatedUser);
        if (updatedAccs.length > 0) {
          setSavedTelegramAccounts(updatedAccs);
        }
      }

      onSuccessAuth(authenticatedUser);
    };

    // 1. Real-time Firestore snapshot listener on the session document
    const unsubSession = onSnapshot(
      doc(db, 'telegram_login_sessions', activeBotSessionId),
      (snap) => {
        if (isDone) return;
        if (!snap.metadata?.fromCache && snap.exists()) {
          trackLocalRead(1, 'تأكيد جلسة تيليجرام');
        }
        if (snap.exists()) {
          const data = snap.data();
          if (data.status === 'authenticated' && data.user) {
            handleLoginComplete(data.user);
          }
        }
      },
      (err) => {
        reportFirestoreListenerError(err, OperationType.GET, `telegram_login_sessions/${activeBotSessionId}`);
        if (isQuotaExceededError(err) || isTransientFirestoreError(err)) {
          isDone = true;
          setIsWaitingForBotAuth(false);
          setError('');
          setShowUnderDevModal(true);
        }
      }
    );

    // 2. Secondary HTTP polling fallback every 4000ms (server checks memory first, then throttled Firestore)
    const interval = setInterval(async () => {
      if (isDone) return;
      try {
        const resp = await fetch(`/api/telegram/check-session?sessionId=${encodeURIComponent(activeBotSessionId)}`);
        if (resp.ok) {
          const result = await resp.json();
          if (result.authenticated && result.user) {
            handleLoginComplete(result.user);
          } else if (result.quotaExceeded) {
            isDone = true;
            setIsWaitingForBotAuth(false);
            setError('');
            setShowUnderDevModal(true);
          }
        }
      } catch (e) {}
    }, 4000);

    return () => {
      isDone = true;
      clearInterval(interval);
      unsubSession();
    };
  }, [isWaitingForBotAuth, activeBotSessionId, onSuccessAuth]);

  // Mount Telegram Login Widget
  useEffect(() => {
    // Global callback for Telegram Login Widget
    (window as any).onTelegramAuth = (user: any) => {
      handleTelegramAuthSuccess(user);
    };

    if (telegramContainerRef.current) {
      telegramContainerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', 'Ra3d6_bot');
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '14');
      script.setAttribute('data-request-access', 'write');
      script.setAttribute('data-userpic', 'true');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.async = true;
      telegramContainerRef.current.appendChild(script);
    }
  }, [isSignUp, authMode, isAddingNewTelegram]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError('يرجى كتابة البريد الإلكتروني وكلمة المرور');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // Sign Up Flow
        if (!name.trim()) {
          setError('يرجى إدخال اسمك الكريم');
          setLoading(false);
          return;
        }

        // 1. Check if email is in permanently banned emails
        const bannedQuery = query(collection(db, 'banned_emails'), where('email', '==', cleanEmail));
        let bannedSnap;
        try {
          bannedSnap = await getDocs(bannedQuery);
          trackLocalRead(Math.max(1, bannedSnap.size), 'التحقق من البريد المحظور');
        } catch (banErr) {
          if (isQuotaExceededError(banErr) || isTransientFirestoreError(banErr)) {
            bannedSnap = await getDocsFromCache(bannedQuery).catch(() => ({ empty: true } as any));
          } else {
            throw banErr;
          }
        }

        if (!bannedSnap.empty) {
          setError('هذا الحساب تم حظره نهائياً من قبل الإدارة.');
          setLoading(false);
          return;
        }

        // 2. Check if email already exists
        const userQuery = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const userSnap = await getDocs(userQuery);
        trackLocalRead(Math.max(1, userSnap.size), 'التحقق من وجود البريد');
        if (!userSnap.empty) {
          setError('هذا البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول');
          setLoading(false);
          return;
        }

        // 3. Create new user in Firestore
        const newUserRef = doc(collection(db, 'users'));
        const newUser: StudentUser = {
          id: newUserRef.id,
          name: name.trim(),
          email: cleanEmail,
          password: password,
          daysAllowed: 0, // No default counter until admin assigns days in Admin Panel
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
        };

        await setDoc(newUserRef, newUser);
        trackLocalWrite(1, 'إنشاء حساب بريد جديد');

        // Provision default immutable "مجلد الاخطاء" for the student & sync local folder store immediately
        const defaultFolderPayload = {
          userId: newUser.id,
          courseId: 'course_default_1',
          title: 'مجلد الاخطاء',
          isDefaultMistakesFolder: true,
          createdAt: new Date().toISOString(),
        };
        const folderRef = await addDoc(collection(db, 'folders'), defaultFolderPayload);
        trackLocalWrite(1, 'إنشاء مجلد الأخطاء');
        addLocalFolder(newUser.id, { id: folderRef.id, ...defaultFolderPayload });

        onSuccessAuth(newUser);
      } else {
        // Sign In Flow: check `users` FIRST (halves Firestore reads vs reading banned_emails on every login)
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', cleanEmail)
        );
        let userSnap;
        let usedUserCache = false;
        try {
          userSnap = await getDocs(userQuery);
          trackLocalRead(Math.max(1, userSnap.size), 'تسجيل الدخول بالبريد');
        } catch (queryErr) {
          if (isQuotaExceededError(queryErr) || isTransientFirestoreError(queryErr)) {
            userSnap = await getDocsFromCache(userQuery);
            usedUserCache = true;
            trackLocalCacheHit(1, 'تسجيل الدخول بالبريد من الكاش');
          } else {
            throw queryErr;
          }
        }

        if (userSnap.empty) {
          // Only query banned_emails if account wasn't found in users (e.g., permanently deleted & banned)
          if (!usedUserCache) {
            try {
              const bannedQuery = query(collection(db, 'banned_emails'), where('email', '==', cleanEmail));
              const bannedSnap = await getDocs(bannedQuery);
              trackLocalRead(Math.max(1, bannedSnap.size), 'فحص حظر البريد');
              if (!bannedSnap.empty) {
                setError('هذا الحساب تم حظره نهائياً من قبل الإدارة.');
                setLoading(false);
                return;
              }
            } catch {}
          }
          setError('البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب غير موجود');
          setLoading(false);
          return;
        }

        let foundUser: StudentUser | null = null;
        let foundDeleted = false;
        userSnap.forEach((d) => {
          const u = { id: d.id, ...d.data() } as StudentUser;
          if (u.isDeleted) {
            foundDeleted = true;
          } else if (u.password === password) {
            foundUser = u;
          }
        });

        if (foundDeleted) {
          setError('هذا الحساب تم حظره أو حذفه نهائياً من قبل الإدارة.');
          setLoading(false);
          return;
        }

        if (!foundUser) {
          setError('كلمة المرور غير مطابقة للتي قمت بإنشائها');
          setLoading(false);
          return;
        }

        onSuccessAuth(foundUser);
      }
    } catch (err: any) {
      if (isQuotaExceededError(err) || isTransientFirestoreError(err)) {
        if (isQuotaExceededError(err)) {
          handleFirestoreError(err, OperationType.GET, 'users');
        }
        setError('');
        setShowUnderDevModal(true);
      } else {
        console.error('Auth Error:', err);
        setError('');
        setShowUnderDevModal(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const activeTheme = systemSettings.activeTheme;

  return (
    <div
      className={`min-h-screen flex flex-col justify-between transition-colors duration-300 text-right ${
        isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Top Navbar */}
      <header className="p-4 md:px-8 flex items-center justify-between max-w-7xl mx-auto w-full">
        {/* Top-Right Logo & Brand Title */}
        <div className="flex items-center gap-3">
          <BrandLogo
            customLogoUrl={systemSettings.logoUrl}
            size="md"
            primaryColor={activeTheme?.primary || '#2563eb'}
          />
          <div>
            <h1 className="text-lg md:text-xl font-black">منصة أقسام رعد</h1>
            <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500 font-bold'}`}>
              طريقك للوصول إلى 100% في القدرات
            </p>
          </div>
        </div>

        {/* Day/Night Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black transition shadow-xs cursor-pointer ${
            isDarkMode
              ? 'bg-slate-900 border-slate-800 text-amber-300 hover:bg-slate-800'
              : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-xs'
          }`}
          title={isDarkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{isDarkMode ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
        </button>
      </header>

      {/* ================= IMPORTANT TOP NOTICE BANNER ================= */}
      {/* "في واجهة تسجيل الدخول ضيف فوق رسالة مهمة ان من لا يعمل معه تسجيل الدخول للمنصة بحساب تليجرام يذهب لانشاء حساب او تسجيل دخول بالبريد الالكتروني وكلمة المرور" */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-1">
        <div className={`p-3.5 sm:p-4 rounded-2xl md:rounded-3xl border-2 shadow-lg transition-all flex flex-col md:flex-row items-center justify-between gap-3.5 ${
          isDarkMode
            ? 'bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 border-amber-500/50 shadow-amber-500/10'
            : 'bg-gradient-to-r from-amber-50 via-white to-amber-50/60 border-amber-400 shadow-amber-200/50'
        }`}>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md shadow-amber-500/30">
              <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </div>
            <div className="text-right flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-500 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                  تنبيه هام ومباشر ⚠️
                </span>
                <span className="text-[10px] sm:text-xs text-amber-500 dark:text-amber-400 font-bold">لكل الطلاب</span>
              </div>
              <p className={`text-xs sm:text-sm font-black mt-1 leading-relaxed ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                من لا يعمل معه تسجيل الدخول للمنصة بحساب تيليجرام، يرجى التوجه فوراً لإنشاء حساب أو تسجيل الدخول بالبريد الإلكتروني وكلمة المرور.
              </p>
            </div>
          </div>

          <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setAuthMode('email');
                setIsSignUp(true);
                setError('');
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition transform active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>إنشاء حساب بالبريد</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('email');
                setIsSignUp(false);
                setError('');
              }}
              className={`px-4 py-2.5 rounded-xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition transform active:scale-95 cursor-pointer ${
                isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 border-amber-500/50 text-amber-300'
                  : 'bg-white hover:bg-amber-50 border-amber-400 text-amber-800'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>تسجيل الدخول بالبريد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container: 2-Column Responsive Layout */}
      {/* Right Column: Platform Sufficiency + 4-Step Study Method Cards */}
      {/* Left Column: Login / Signup Card */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          
          {/* ================= RIGHT COLUMN (عاليمين) ================= */}
          {/* "وعاليمين حط مستطيلات كتير كده بشكل حلو ان المنصة كافية للتقفيل وتجيب 100 باذن الله وتحتيها طريقة المذاكرة" */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Header Badge & Title */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-black shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>المنظومة التدريبية الشاملة للتقفيل 100% بإذن الله ⚡</span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black leading-tight tracking-tight">
                منصة أقسام رعد كافية للتقفيل وتضمن لك الـ 100% بإذن الله
              </h2>
              <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                كل ما تحتاجه لاجتياز اختبارات القدرات العامة لقياس في مكان واحد، بدون تشتت وبدون الحاجة لأي مصادر أو كتب خارجية.
              </p>
            </div>

            {/* Sufficiency Features: 3 Sleek Rectangles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Feature 1 */}
              <div className={`p-4 rounded-2xl border transition-all ${
                isDarkMode
                  ? 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700'
                  : 'bg-white border-slate-200/90 shadow-xs hover:border-slate-300'
              }`}>
                <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 w-fit mb-2.5">
                  <Trophy className="w-5 h-5" />
                </div>
                <h4 className="text-xs sm:text-sm font-black mb-1">
                  كافية للتقفيل التام 🎯
                </h4>
                <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  نماذج وتجميعات شاملة كافية للتقفيل التام وتكنيكات الحل في أقل من 30 ثانية لكل سؤال.
                </p>
              </div>

              {/* Feature 2 */}
              <div className={`p-4 rounded-2xl border transition-all ${
                isDarkMode
                  ? 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700'
                  : 'bg-white border-slate-200/90 shadow-xs hover:border-slate-300'
              }`}>
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 w-fit mb-2.5">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="text-xs sm:text-sm font-black mb-1">
                  نظام نمر المحاكي 🦁
                </h4>
                <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  تجربة اختبار مطابقة 100% لشاشة وتوقيت مركز قياس بدون أي مفاجآت في القاعة.
                </p>
              </div>

              {/* Feature 3 */}
              <div className={`p-4 rounded-2xl border transition-all ${
                isDarkMode
                  ? 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700'
                  : 'bg-white border-slate-200/90 shadow-xs hover:border-slate-300'
              }`}>
                <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 w-fit mb-2.5">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h4 className="text-xs sm:text-sm font-black mb-1">
                  سبورة ومجلد أخطاء 💡
                </h4>
                <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  حل المسودات مباشرة أثناء الاختبار وحفظ تلقائي للأسئلة لمراجعتها وتثبيتها.
                </p>
              </div>
            </div>

            {/* ================= STUDY METHODOLOGY: 4 DISTINCT COLORED STEPS ================= */}
            {/* "وتحتيها طريقة المذاكرة اللي هيا شاهد الفيديو الخطوة الاولى والخطوة الثانية اختبر الخطوة الثالثة شاهد اخطائك والخطوة الرابعة يعيد الاختبار حتى الحصول على مية وكل خطوة بلون مختلف وبشكل انيق" */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-black">
                    طريقة المذاكرة الذكية المعتمدة للتقفيل (4 خطوات):
                  </h3>
                </div>
                <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                  اتبع الترتيب الذهبي ⚡
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* STEP 1: شاهد الفيديو (لون أزرق سماوي ناصع وأنيق) */}
                <div className={`p-4 rounded-2xl border-2 transition-all transform hover:-translate-y-0.5 shadow-sm ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-sky-950/40 via-slate-900 to-sky-900/20 border-sky-500/40 hover:border-sky-400'
                    : 'bg-gradient-to-br from-sky-50 via-white to-sky-50/40 border-sky-300 hover:border-sky-400'
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-sky-500 text-white shadow-xs">
                      الخطوة 1
                    </span>
                    <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400">
                      <Video className="w-4 h-4" />
                    </div>
                  </div>
                  <h4 className="text-xs sm:text-sm font-black text-sky-500 dark:text-sky-300 mb-1 flex items-center gap-1.5">
                    <span>شاهد الفيديو</span>
                    <span className="text-xs">🎬</span>
                  </h4>
                  <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600 font-medium'}`}>
                    شاهد الشرح بتركيز عالي، واستوعب القوانين والأفكار الأساسية وتكنيكات الحل السريع من أول مرة.
                  </p>
                </div>

                {/* STEP 2: اختبر (لون أخضر زمردي أنيق) */}
                <div className={`p-4 rounded-2xl border-2 transition-all transform hover:-translate-y-0.5 shadow-sm ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-emerald-900/20 border-emerald-500/40 hover:border-emerald-400'
                    : 'bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 border-emerald-300 hover:border-emerald-400'
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs">
                      الخطوة 2
                    </span>
                    <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
                      <FileCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <h4 className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
                    <span>اختبر نفسك</span>
                    <span className="text-xs">📝</span>
                  </h4>
                  <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600 font-medium'}`}>
                    ادخل الاختبار المحاكي المباشر الخاص بالدرس، وطبق ما تعلمته لقياس استيعابك وسرعتك فوراً.
                  </p>
                </div>

                {/* STEP 3: شاهد أخطاءك (لون كهرماني / برتقالي أنيق) */}
                <div className={`p-4 rounded-2xl border-2 transition-all transform hover:-translate-y-0.5 shadow-sm ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-amber-900/20 border-amber-500/40 hover:border-amber-400'
                    : 'bg-gradient-to-br from-amber-50 via-white to-amber-50/40 border-amber-300 hover:border-amber-400'
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 shadow-xs">
                      الخطوة 3
                    </span>
                    <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                      <Target className="w-4 h-4" />
                    </div>
                  </div>
                  <h4 className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-300 mb-1 flex items-center gap-1.5">
                    <span>شاهد أخطاءك</span>
                    <span className="text-xs">🔍</span>
                  </h4>
                  <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600 font-medium'}`}>
                    حلل تقرير نتيجتك، واعرف سبب الخطأ في كل سؤال بدقة، واحفظ الأسئلة الصعبة في مجلدك الخاص.
                  </p>
                </div>

                {/* STEP 4: أعد الاختبار حتى الحصول على 100% (لون بنفسجي / فوشي ملكي أنيق) */}
                <div className={`p-4 rounded-2xl border-2 transition-all transform hover:-translate-y-0.5 shadow-sm ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-purple-950/40 via-slate-900 to-pink-900/20 border-purple-500/40 hover:border-purple-400'
                    : 'bg-gradient-to-br from-purple-50 via-white to-pink-50/40 border-purple-300 hover:border-purple-400'
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-600 text-white shadow-xs">
                      الخطوة 4
                    </span>
                    <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
                      <RotateCcw className="w-4 h-4" />
                    </div>
                  </div>
                  <h4 className="text-xs sm:text-sm font-black text-purple-600 dark:text-purple-300 mb-1 flex items-center gap-1.5">
                    <span>أعِد الاختبار حتى 100%</span>
                    <span className="text-xs">💯</span>
                  </h4>
                  <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600 font-medium'}`}>
                    كرر حل الاختبار مرة أخرى حتى تتقن جميع أفكاره وتصل لنسبة 100%، وبذلك تضمن التقفيل التام بإذن الله.
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* ================= LEFT COLUMN ================= */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end w-full">
            <div className="w-full max-w-md space-y-3.5">
              {/* Method Switcher Tabs (تبديل بين تليجرام السريع والبريد) */}
              <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('telegram');
                    setError('');
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    authMode === 'telegram'
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Send className="w-4 h-4 fill-current" />
                  <span>تسجيل الدخول بتليجرام ✈️</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('email');
                    setError('');
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    authMode === 'email'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span>البريد الإلكتروني ✉️</span>
                </button>
              </div>

              {/* 1. TELEGRAM LOGIN CARD (مكون تسجيل الدخول بتليجرام المطلوب) */}
              {authMode === 'telegram' ? (
                <TelegramLoginCard
                  accounts={savedTelegramAccounts}
                  onLogin={handleSavedTelegramLogin}
                  onUseAnotherAccount={() => setIsAddingNewTelegram((prev) => !prev)}
                  isAddingNew={isAddingNewTelegram}
                  isLoading={telegramLoading}
                  errorMessage={error}
                  onBotLoginClick={handleBotLoginClick}
                  isWaitingForBotAuth={isWaitingForBotAuth}
                  onCancelWaitingBotAuth={() => setIsWaitingForBotAuth(false)}
                  widgetNode={
                    telegramLoading ? (
                      <div className="flex items-center gap-2 py-2 px-4 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-black animate-pulse">
                        <Sparkles className="w-4 h-4 animate-spin text-sky-400" />
                        <span>جاري ربط حساب تليجرام...</span>
                      </div>
                    ) : (
                      <div
                        ref={telegramContainerRef}
                        className="telegram-login-widget flex items-center justify-center w-full min-h-[46px]"
                      />
                    )
                  }
                  onSwitchToEmail={() => {
                    setAuthMode('email');
                    setError('');
                  }}
                />
              ) : (
                /* 2. EMAIL / PASSWORD FORM */
                <div
                  className={`w-full p-6 sm:p-8 rounded-3xl border shadow-2xl relative transition-all ${
                    isDarkMode
                      ? 'bg-slate-900/95 border-slate-800 backdrop-blur-xl shadow-slate-950/50'
                      : 'bg-white border-slate-200 shadow-xl shadow-slate-200/50'
                  }`}
                >
                  {/* Card Header with Brand Logo */}
                  <div className="text-center space-y-3 mb-6">
                    <div className="flex justify-center">
                      <BrandLogo
                        customLogoUrl={systemSettings.logoUrl}
                        size="lg"
                        primaryColor={activeTheme?.primary || '#2563eb'}
                      />
                    </div>
                    <h2 className="text-2xl font-black">
                      {isSignUp ? 'إنشاء حساب جديد' : 'تسجيل الدخول إلى المنصة'}
                    </h2>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>
                      {isSignUp
                        ? 'أدخل بياناتك للانضمام فوراً إلى تدريبات وشروحات رعد'
                        : 'اكتب نفس البريد وكلمة المرور المسجلين لديك'}
                    </p>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {isSignUp && (
                      <div>
                        <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
                          الاسم الكامل:
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-500 absolute top-3.5 right-3.5" />
                          <input
                            type="text"
                            required
                            placeholder="مثال: أحمد عبد الله..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={`w-full pr-10 pl-4 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                              isDarkMode
                                ? 'bg-slate-800/80 border-slate-700 text-white focus:border-blue-500'
                                : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                            }`}
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
                        البريد الإلكتروني:
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-500 absolute top-3.5 right-3.5" />
                        <input
                          type="email"
                          required
                          placeholder="your.email@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`w-full pr-10 pl-4 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                            isDarkMode
                              ? 'bg-slate-800/80 border-slate-700 text-white focus:border-blue-500'
                              : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                          }`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
                        كلمة المرور:
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute top-3.5 right-3.5" />
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={`w-full pr-10 pl-4 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                            isDarkMode
                              ? 'bg-slate-800/80 border-slate-700 text-white focus:border-blue-500'
                              : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                          }`}
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || telegramLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-black text-sm shadow-xl transition transform active:scale-95 disabled:opacity-50 cursor-pointer"
                      style={{ backgroundColor: activeTheme?.primary || '#2563eb' }}
                    >
                      <span>{loading ? 'جاري المعالجة...' : isSignUp ? 'إنشاء حساب والبدء ⚡' : 'تسجيل الدخول'}</span>
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  </form>

                  {/* Toggle between Login and Sign Up */}
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/60 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(!isSignUp);
                        setError('');
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold transition cursor-pointer"
                    >
                      {isSignUp
                        ? 'لديك حساب بالفعل؟ اضغط هنا لتسجيل الدخول'
                        : 'ليس لديك حساب؟ اضغط هنا لإنشاء حساب جديد'}
                    </button>
                  </div>

                  {/* Quick Telegram Shortcut in Email View */}
                  <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800/60 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('telegram');
                        setError('');
                      }}
                      className="text-xs text-sky-500 dark:text-sky-400 hover:text-sky-300 font-bold transition cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
                    >
                      <Send className="w-3.5 h-3.5 fill-current" />
                      <span>أو التبديل إلى تسجيل الدخول بتليجرام ✈️</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* PLATFORM FOOTER WITH THE 3 SENTENCES, FOUNDING DATE & RIGHTS */}
      <PlatformFooter
        isDarkMode={isDarkMode}
        onSecretTriggerAdmin={onSecretTriggerAdmin}
      />

      {/* Sleek "Under Development" Modal when backend limits pause login */}
      {showUnderDevModal && (
        <div
          className="fixed inset-0 z-[150] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowUnderDevModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-3xl border p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden ${
              isDarkMode
                ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-indigo-500/30 text-white shadow-indigo-500/15'
                : 'bg-white border-indigo-200 text-slate-900 shadow-indigo-200/40'
            }`}
          >
            <button
              type="button"
              onClick={() => setShowUnderDevModal(false)}
              className={`absolute top-4 left-4 p-2 rounded-xl transition cursor-pointer ${
                isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-sky-500/20 to-purple-500/20 border border-indigo-400/30 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Wrench className="w-8 h-8 text-indigo-400" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[11px] font-black mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>تحديث وتحسين مستمر</span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black mb-2">
              عذراً، هذه الميزة حالياً تحت التطوير
            </h3>
            <p className={`text-xs sm:text-sm leading-relaxed mb-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-600 font-medium'}`}>
              نعمل حالياً على تطوير وتحسين هذه الخدمة لتقديم تجربة أسرع وأكثر سلاسة لجميع طلاب منصة أقسام رعد. يمكنك المحاولة مرة أخرى بعد قليل أو الدخول بالبريد الإلكتروني.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowUnderDevModal(false);
                  setAuthMode('email');
                  setError('');
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                <span>الدخول بالبريد الإلكتروني</span>
              </button>
              <button
                type="button"
                onClick={() => setShowUnderDevModal(false)}
                className={`py-3 px-5 rounded-xl font-black text-xs sm:text-sm border transition cursor-pointer ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                }`}
              >
                حسناً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
