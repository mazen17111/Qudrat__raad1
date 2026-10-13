import React, { useState } from 'react';
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
  Sparkles
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
  addDoc
} from 'firebase/firestore';

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
  const [error, setError] = useState('');

  // 7 clicks on footer sentence 2
  const [secretClickCount, setSecretClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleFooterSentenceClick = () => {
    const now = Date.now();
    if (now - lastClickTime > 2500) {
      setSecretClickCount(1);
    } else {
      const nextCount = secretClickCount + 1;
      setSecretClickCount(nextCount);
      if (nextCount >= 7) {
        setSecretClickCount(0);
        onSecretTriggerAdmin();
      }
    }
    setLastClickTime(now);
  };

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
      // 1. Check if email is in permanently banned emails
      const cleanEmailId = cleanEmail.replace(/[@.]/g, '_');
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

        // Create new user in Firestore
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
          createdAt: new Date().toISOString(),
        };

        await setDoc(newUserRef, newUser);

        // Provision default immutable "مجلد الاخطاء" for the student
        await addDoc(collection(db, 'folders'), {
          userId: newUser.id,
          title: 'مجلد الاخطاء',
          isDefaultMistakesFolder: true,
          createdAt: new Date().toISOString(),
        });

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

        onSuccessAuth(foundUser);
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
        isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900'
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
              طريقك للوصول إلى 100% في القدرات والتحصيلي
            </p>
          </div>
        </div>

        {/* Day/Night Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black transition shadow-sm ${
            isDarkMode
              ? 'bg-slate-900 border-slate-800 text-amber-300 hover:bg-slate-800'
              : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-sm'
          }`}
          title={isDarkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{isDarkMode ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
        </button>
      </header>

      {/* Main Authentication Card */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div
          className={`w-full max-w-md p-6 md:p-8 rounded-3xl border shadow-2xl relative transition-all ${
            isDarkMode
              ? 'bg-slate-900/90 border-slate-800 backdrop-blur-xl'
              : 'bg-white border-slate-200 shadow-xl'
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
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-black text-sm shadow-xl transition transform active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: activeTheme?.primary || '#2563eb' }}
            >
              <span>{loading ? 'جاري المعالجة...' : isSignUp ? 'إنشاء حساب والبدء ⚡' : 'تسجيل الدخول'}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </form>

          {/* Toggle between Login and Sign Up */}
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/60 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold transition"
            >
              {isSignUp
                ? 'لديك حساب بالفعل؟ اضغط هنا لتسجيل الدخول'
                : 'ليس لديك حساب؟ اضغط هنا لإنشاء حساب جديد'}
            </button>
          </div>
        </div>
      </main>

      {/* FOOTER WITH THE 3 EXACT SENTENCES (RIGHT, CENTER, LEFT) */}
      <footer
        className={`py-6 px-6 md:px-12 border-t select-none transition-colors ${
          isDarkMode ? 'bg-slate-950 border-slate-800/80 text-slate-400' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        <div className="max-w-[1700px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs md:text-sm font-bold">
          {/* Sentence 1: ON THE RIGHT (عاليمين) */}
          <div className={`text-right w-full md:w-1/3 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
            المصمم مازن محمد محروس
          </div>

          {/* Sentence 2: IN THE CENTER (فالنص - 7 clicks triggers admin password!) */}
          <div
            onClick={handleFooterSentenceClick}
            className={`text-center w-full md:w-1/3 cursor-pointer hover:text-amber-500 transition-colors py-1 ${
              isDarkMode ? 'text-slate-300' : 'text-slate-900 font-bold'
            }`}
          >
            جميع محتويات المنصة محفوظة لمنصة اقسام رعد
          </div>

          {/* Sentence 3: ON THE LEFT (عاليسار) */}
          <div className="text-left w-full md:w-1/3 text-amber-500 font-black">
            منصة اقسام رعد تضمن لك المئوية باذن الله
          </div>
        </div>
      </footer>
    </div>
  );
};
