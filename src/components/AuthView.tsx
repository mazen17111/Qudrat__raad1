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
  Search,
  Check,
} from 'lucide-react';
import { StudentUser, SystemSettings } from '../types';
import { BrandLogo } from './BrandLogo';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  addDoc,
  updateDoc
} from 'firebase/firestore';
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
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedTelegramAccount, setSavedTelegramAccount] = useState<{
    id: string;
    name: string;
    username?: string;
    photoUrl?: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem('raad_last_telegram_account');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  });
  const [showSwitchTelegram, setShowSwitchTelegram] = useState(false);
  const [telegramSearchQuery, setTelegramSearchQuery] = useState('');
  const [telegramSearchLoading, setTelegramSearchLoading] = useState(false);
  const [foundTgUser, setFoundTgUser] = useState<StudentUser | null>(null);
  const [searchedUsername, setSearchedUsername] = useState('');
  const [showNewTgAccountPrompt, setShowNewTgAccountPrompt] = useState(false);
  const telegramContainerRef = useRef<HTMLDivElement>(null);

  // Handle Telegram Authentication Callback
  const handleTelegramAuthSuccess = async (tgUser: any) => {
    if (!tgUser || !tgUser.id) return;
    setTelegramLoading(true);
    setError('');

    try {
      const telegramIdStr = String(tgUser.id);
      const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || `طالب_${tgUser.id}`;

      // Save as remembered Telegram account on this device so the student sees their account
      const tgAccountData = {
        id: telegramIdStr,
        name: fullName,
        username: tgUser.username || '',
        photoUrl: tgUser.photo_url || '',
      };
      try {
        localStorage.setItem('raad_last_telegram_account', JSON.stringify(tgAccountData));
      } catch (e) {}
      setSavedTelegramAccount(tgAccountData);

      // 1. Check if Telegram ID already exists in users collection in Firestore
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('telegramId', '==', telegramIdStr));
      let snap = await getDocs(q);

      let authenticatedUser: StudentUser;

      if (!snap.empty) {
        // User already exists in Firestore!
        const userDoc = snap.docs[0];
        const existingData = { id: userDoc.id, ...userDoc.data() } as StudentUser;

        if (existingData.isDeleted) {
          setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
          setTelegramLoading(false);
          return;
        }

        const updates: Partial<StudentUser> = {
          lastLoginAt: new Date().toISOString(),
        };
        if (tgUser.photo_url && tgUser.photo_url !== existingData.photoUrl) {
          updates.photoUrl = tgUser.photo_url;
        }
        if (tgUser.username && tgUser.username !== existingData.telegramUsername) {
          updates.telegramUsername = tgUser.username;
        }

        try {
          await updateDoc(doc(db, 'users', userDoc.id), updates as any);
        } catch (e) {
          console.warn('Update user last login note:', e);
        }

        authenticatedUser = {
          ...existingData,
          ...updates,
          id: userDoc.id,
        };
      } else {
        // User does not exist -> Create brand new student document with 0 activated courses initially
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
          subscriptionStartDate: '',
          subscriptionEndDate: '',
          isIndividuallyBlocked: false,
          isIndividuallyWhitelisted: false,
          watchedVideoIds: [],
          totalExamsTaken: 0,
          averageScore: 0,
          enrolledCourseIds: [], // Strictly empty: student activates the course themselves!
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };

        await setDoc(newUserRef, newStudent);
        authenticatedUser = newStudent;
      }

      // 4. Save session in localStorage so student stays logged in
      try {
        localStorage.setItem('raad_student_auth_session', JSON.stringify(authenticatedUser));
      } catch (e) {}

      // 5. Automatic redirect: immediately transfer student to Courses Portal!
      onSuccessAuth(authenticatedUser);
    } catch (err: any) {
      console.error('Telegram Auth Error:', err);
      setError('حدث خطأ أثناء ربط بيانات تيليجرام بقاعدة البيانات، يرجى المحاولة ثانية.');
    } finally {
      setTelegramLoading(false);
    }
  };

  // Direct login with remembered Telegram account
  const handleDirectTelegramLogin = async () => {
    if (!savedTelegramAccount) return;
    setTelegramLoading(true);
    setError('');

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('telegramId', '==', savedTelegramAccount.id));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const existingData = { id: userDoc.id, ...userDoc.data() } as StudentUser;

        if (existingData.isDeleted) {
          setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
          setTelegramLoading(false);
          return;
        }

        try {
          await updateDoc(doc(db, 'users', userDoc.id), {
            lastLoginAt: new Date().toISOString(),
          });
        } catch (e) {}

        const userWithUpdate = {
          ...existingData,
          lastLoginAt: new Date().toISOString(),
        };

        try {
          localStorage.setItem('raad_student_auth_session', JSON.stringify(userWithUpdate));
        } catch (e) {}

        onSuccessAuth(userWithUpdate);
      } else {
        // Fallback: create fresh user if previously saved locally but missing in Firestore
        await handleTelegramAuthSuccess({
          id: savedTelegramAccount.id,
          first_name: savedTelegramAccount.name,
          username: savedTelegramAccount.username,
          photo_url: savedTelegramAccount.photoUrl,
        });
      }
    } catch (err) {
      console.error('Direct Telegram Login Error:', err);
      setError('حدث خطأ أثناء تسجيل الدخول بحساب تيليجرام، يرجى المحاولة ثانية.');
    } finally {
      setTelegramLoading(false);
    }
  };

  // Search for Telegram account by @username or Telegram ID in Firestore
  const handleSearchTelegramAccount = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const queryClean = telegramSearchQuery.trim().replace(/^@/, '');
    if (!queryClean) return;

    setTelegramSearchLoading(true);
    setError('');
    setFoundTgUser(null);
    setShowNewTgAccountPrompt(false);
    setSearchedUsername(queryClean);

    try {
      const usersRef = collection(db, 'users');
      // Search by telegramUsername or telegramId
      const qUsername = query(usersRef, where('telegramUsername', '==', queryClean));
      let snap = await getDocs(qUsername);

      if (snap.empty) {
        // Try searching by telegramId
        const qId = query(usersRef, where('telegramId', '==', queryClean));
        snap = await getDocs(qId);
      }

      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const u = { id: docSnap.id, ...docSnap.data() } as StudentUser;
        setFoundTgUser(u);
      } else {
        // Not found: prompt to register new account with this Telegram username
        setShowNewTgAccountPrompt(true);
      }
    } catch (err) {
      console.error('Search Telegram Error:', err);
      setError('حدث خطأ أثناء البحث عن الحساب، يرجى التأكد من الاتصال.');
    } finally {
      setTelegramSearchLoading(false);
    }
  };

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
  }, [isSignUp, showSwitchTelegram]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      if (savedTelegramAccount) {
        setError(`يرجى كتابة البريد وكلمة المرور، أو الضغط على زر تسجيل الدخول بحساب تيليجرام بالأسفل: (${savedTelegramAccount.name})`);
      } else {
        setError('يرجى كتابة البريد الإلكتروني وكلمة المرور أو تسجيل الدخول عبر تيليجرام');
      }
      return;
    }

    setLoading(true);

    try {
      // 1. Check if email is in permanently banned emails
      const bannedQuery = query(collection(db, 'banned_emails'), where('email', '==', cleanEmail));
      const bannedSnap = await getDocs(bannedQuery);

      if (!bannedSnap.empty) {
        setError('هذا الحساب تم حظره نهائياً من قبل الإدارة.');
        setLoading(false);
        return;
      }

      if (isSignUp) {
        // Sign Up Flow
        if (!name.trim()) {
          setError('يرجى إدخال اسمك الكريم');
          setLoading(false);
          return;
        }

        // Check if email already exists
        const userQuery = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const userSnap = await getDocs(userQuery);
        if (!userSnap.empty) {
          setError('هذا البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول');
          setLoading(false);
          return;
        }

        // Create new user in Firestore with 0 enrolled courses initially
        const newUserRef = doc(collection(db, 'users'));
        const newUser: StudentUser = {
          id: newUserRef.id,
          name: name.trim(),
          email: cleanEmail,
          password: password,
          daysAllowed: 0, // No default counter until admin assigns days in Admin Panel
          subscriptionStartDate: '',
          subscriptionEndDate: '',
          isIndividuallyBlocked: false,
          isIndividuallyWhitelisted: false,
          watchedVideoIds: [],
          totalExamsTaken: 0,
          averageScore: 0,
          enrolledCourseIds: [], // Strictly empty: student activates the course themselves!
          createdAt: new Date().toISOString(),
        };

        await setDoc(newUserRef, newUser);

        try {
          localStorage.setItem('raad_student_auth_session', JSON.stringify(newUser));
        } catch (e) {}

        onSuccessAuth(newUser);
      } else {
        // Sign In Flow
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', cleanEmail)
        );
        const userSnap = await getDocs(userQuery);

        if (userSnap.empty) {
          setError('البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب غير موجود');
          setLoading(false);
          return;
        }

        let foundUser: StudentUser | null = null;
        userSnap.forEach((d) => {
          const u = { id: d.id, ...d.data() } as StudentUser;
          if (u.password === password) {
            foundUser = u;
          }
        });

        if (!foundUser) {
          setError('كلمة المرور غير مطابقة للتي قمت بإنشائها');
          setLoading(false);
          return;
        }

        const userDoc = foundUser as StudentUser;
        if (userDoc.isDeleted) {
          setError('هذا الحساب تم حظره أو حذفه من قبل الإدارة.');
          setLoading(false);
          return;
        }

        try {
          localStorage.setItem('raad_student_auth_session', JSON.stringify(userDoc));
        } catch (e) {}

        onSuccessAuth(userDoc);
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      setError('حدث خطأ أثناء الاتصال بقاعدة البيانات، يرجى المحاولة ثانية');
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

          {/* ================= LEFT COLUMN (عاليسار شوية) ================= */}
          {/* "خلي مستطيل تسجيل دخول وانشاء الحساب دخلها عاليسار شوية" */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end w-full">
            <div
              className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border shadow-2xl relative transition-all ${
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

              {/* ================= TELEGRAM LOGIN SECTION ================= */}
              {/* "عندما يضغط الطالب على تسجيل دخول يظهر له الحساب اللي يريد يسجل دخول به في التليجرام" */}
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3.5">
                <div className="flex items-center gap-2 justify-center text-xs font-black text-slate-500 dark:text-slate-400">
                  <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                  <span className="flex items-center gap-1.5 px-2 text-sky-500 dark:text-sky-400">
                    <Send className="w-3.5 h-3.5 fill-current" />
                    <span>الدخول بحساب تيليجرام (Telegram)</span>
                  </span>
                  <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                </div>

                {/* 1. If student already has a remembered Telegram account on this browser, clearly display their account card! */}
                {savedTelegramAccount && !showSwitchTelegram && (
                  <div className="p-3.5 rounded-2xl border-2 border-sky-500/40 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent dark:from-sky-950/40 dark:via-slate-900/60 dark:to-slate-950 text-right space-y-3 shadow-md animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-sky-500 dark:text-sky-300 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 fill-current text-sky-400" />
                        <span>حسابك في تيليجرام المحدد للدخول:</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black">
                        حساب متاح ⚡
                      </span>
                    </div>

                    {/* Account Display Card */}
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-sky-500/30 shadow-xs">
                      {savedTelegramAccount.photoUrl ? (
                        <img
                          src={savedTelegramAccount.photoUrl}
                          alt={savedTelegramAccount.name}
                          className="w-11 h-11 rounded-full object-cover ring-2 ring-sky-400 shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 text-white font-black text-sm flex items-center justify-center ring-2 ring-sky-400/60 shadow-sm shrink-0">
                          {savedTelegramAccount.name ? savedTelegramAccount.name.trim().charAt(0) : 'ط'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                          {savedTelegramAccount.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          {savedTelegramAccount.username ? (
                            <span className="text-[11px] text-sky-500 dark:text-sky-400 font-bold truncate" dir="ltr">
                              @{savedTelegramAccount.username}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {savedTelegramAccount.id}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleDirectTelegramLogin}
                        disabled={telegramLoading}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-sky-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-sky-500/25 transition transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {telegramLoading ? (
                          <>
                            <Sparkles className="w-4 h-4 animate-spin" />
                            <span>جاري تسجيل الدخول...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 fill-current" />
                            <span>الدخول بحساب ({savedTelegramAccount.name}) ⚡</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowSwitchTelegram(true);
                          setFoundTgUser(null);
                          setShowNewTgAccountPrompt(false);
                        }}
                        className="w-full text-center text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-sky-500 dark:hover:text-sky-300 py-1 transition cursor-pointer"
                      >
                        🔄 تسجيل الدخول بحساب تيليجرام آخر أو ربط حساب جديد
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. When switching accounts or no saved account: show widget + interactive account lookup */}
                {(!savedTelegramAccount || showSwitchTelegram) && (
                  <div className="space-y-3">
                    {/* Official Telegram Login Widget button for @Ra3d6_bot */}
                    <div className="flex flex-col items-center justify-center min-h-[46px] w-full">
                      {telegramLoading ? (
                        <div className="flex items-center gap-2 py-2.5 px-5 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-black animate-pulse">
                          <Sparkles className="w-4 h-4 animate-spin text-sky-400" />
                          <span>جاري ربط حساب تيليجرام والدخول للمنصة...</span>
                        </div>
                      ) : (
                        <div
                          ref={telegramContainerRef}
                          className="telegram-login-widget flex items-center justify-center w-full min-h-[46px]"
                        />
                      )}
                    </div>

                    {/* Quick username lookup & account confirmation card */}
                    <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-right space-y-2">
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        أو اكتب معرف حسابك في تيليجرام لتحديده وعرضه:
                      </label>
                      <form onSubmit={handleSearchTelegramAccount} className="flex gap-2">
                        <input
                          type="text"
                          placeholder="مثال: @username أو رقم الـ ID..."
                          value={telegramSearchQuery}
                          onChange={(e) => setTelegramSearchQuery(e.target.value)}
                          className="flex-1 px-3 py-2 text-xs rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="submit"
                          disabled={telegramSearchLoading || !telegramSearchQuery.trim()}
                          className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black transition cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          {telegramSearchLoading ? 'جاري الفحص...' : 'عرض الحساب 🔍'}
                        </button>
                      </form>

                      {/* Display found user account card */}
                      {foundTgUser && (
                        <div className="mt-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-right space-y-2.5 animate-in fade-in duration-200">
                          <div className="flex items-center gap-2.5">
                            {foundTgUser.photoUrl ? (
                              <img
                                src={foundTgUser.photoUrl}
                                alt={foundTgUser.name}
                                className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-400 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center ring-2 ring-emerald-400 shrink-0">
                                {foundTgUser.name ? foundTgUser.name.trim().charAt(0) : 'ط'}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] text-emerald-500 font-bold block">✓ تم العثور على حسابك:</span>
                              <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                                {foundTgUser.name}
                              </h4>
                              {foundTgUser.telegramUsername && (
                                <span className="text-[11px] text-sky-400 font-bold block" dir="ltr">
                                  @{foundTgUser.telegramUsername}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const tgAccountData = {
                                id: foundTgUser.telegramId || foundTgUser.id,
                                name: foundTgUser.name,
                                username: foundTgUser.telegramUsername || '',
                                photoUrl: foundTgUser.photoUrl || '',
                              };
                              try {
                                localStorage.setItem('raad_last_telegram_account', JSON.stringify(tgAccountData));
                                localStorage.setItem('raad_student_auth_session', JSON.stringify(foundTgUser));
                              } catch (e) {}
                              onSuccessAuth(foundTgUser);
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-4 h-4" />
                            <span>تأكيد وتسجيل الدخول بهذا الحساب ⚡</span>
                          </button>
                        </div>
                      )}

                      {/* Display new account creation prompt if not found in Firestore */}
                      {showNewTgAccountPrompt && searchedUsername && (
                        <div className="mt-2.5 p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-right space-y-2 animate-in fade-in duration-200">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-relaxed">
                            سيتم إنشاء حساب جديد بالمعرف: <strong className="text-sky-400" dir="ltr">@{searchedUsername}</strong> بدون أي كورسات مفعلة، لتذهب وتفعّل الكورس بنفسك.
                          </p>
                          <button
                            type="button"
                            onClick={async () => {
                              setTelegramLoading(true);
                              try {
                                const newUserRef = doc(collection(db, 'users'));
                                const dummyId = String(Date.now());
                                const newStudent: StudentUser = {
                                  id: newUserRef.id,
                                  name: `طالب_${searchedUsername}`,
                                  email: `${searchedUsername.toLowerCase()}@telegram.raad`,
                                  password: `tg_${searchedUsername}_pass`,
                                  telegramId: dummyId,
                                  telegramUsername: searchedUsername,
                                  photoUrl: '',
                                  daysAllowed: 0,
                                  isUnlimited: false,
                                  subscriptionStartDate: '',
                                  subscriptionEndDate: '',
                                  isIndividuallyBlocked: false,
                                  isIndividuallyWhitelisted: false,
                                  watchedVideoIds: [],
                                  totalExamsTaken: 0,
                                  averageScore: 0,
                                  enrolledCourseIds: [], // Strictly 0 courses initially!
                                  createdAt: new Date().toISOString(),
                                  lastLoginAt: new Date().toISOString(),
                                };
                                await setDoc(newUserRef, newStudent);
                                const tgAccountData = {
                                  id: dummyId,
                                  name: newStudent.name,
                                  username: searchedUsername,
                                  photoUrl: '',
                                };
                                try {
                                  localStorage.setItem('raad_last_telegram_account', JSON.stringify(tgAccountData));
                                  localStorage.setItem('raad_student_auth_session', JSON.stringify(newStudent));
                                } catch (e) {}
                                onSuccessAuth(newStudent);
                              } catch (err) {
                                console.error(err);
                                setError('حدث خطأ أثناء إنشاء الحساب، يرجى المحاولة ثانية.');
                              } finally {
                                setTelegramLoading(false);
                              }
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5 fill-current" />
                            <span>إنشاء الحساب والدخول للمنصة 🚀</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {savedTelegramAccount && (
                      <button
                        type="button"
                        onClick={() => setShowSwitchTelegram(false)}
                        className="w-full text-center text-[10px] text-slate-400 hover:text-white py-1 transition cursor-pointer"
                      >
                        العودة للحساب المحفوظ ({savedTelegramAccount.name}) ▲
                      </button>
                    )}
                  </div>
                )}

                <p className={`text-[10px] text-center leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                  تسجيل دخول آمن ومباشر عبر بوت تيليجرام <strong className="text-sky-400 font-black" dir="ltr">@Ra3d6_bot</strong>
                </p>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* PLATFORM FOOTER WITH THE 3 SENTENCES, FOUNDING DATE & RIGHTS */}
      <PlatformFooter
        isDarkMode={isDarkMode}
        onSecretTriggerAdmin={onSecretTriggerAdmin}
      />
    </div>
  );
};
