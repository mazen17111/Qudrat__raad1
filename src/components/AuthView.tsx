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
  Sparkles,
  Video,
  FileCheck,
  Target,
  RotateCcw,
  Trophy,
  BookOpen,
  Award,
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
  const [error, setError] = useState('');

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
              طريقك للوصول إلى 100% في القدرات والتحصيلي
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
                كل ما تحتاجه لاجتياز اختبارات القدرات العامة والتحصيلي لقياس في مكان واحد، بدون تشتت وبدون الحاجة لأي مصادر أو كتب خارجية.
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
                  تفكيك شامل لتجميعات الـ 120 نموذج وتكنيكات الحل في أقل من 30 ثانية لكل سؤال.
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
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-black text-sm shadow-xl transition transform active:scale-95 disabled:opacity-50 cursor-pointer"
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
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold transition cursor-pointer"
                >
                  {isSignUp
                    ? 'لديك حساب بالفعل؟ اضغط هنا لتسجيل الدخول'
                    : 'ليس لديك حساب؟ اضغط هنا لإنشاء حساب جديد'}
                </button>
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
