import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Lock,
  Unlock,
  CheckCircle2,
  Sparkles,
  CreditCard,
  MessageCircle,
  ArrowRight,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ShieldCheck,
  Zap,
  ExternalLink,
  ZoomIn,
  X,
  Copy,
  Check,
  Award,
  Send,
  Phone
} from 'lucide-react';
import { StudentUser, CourseItem, SystemSettings } from '../types';
import { BrandLogo } from './BrandLogo';

interface CoursesPortalProps {
  currentUser: StudentUser;
  courses: CourseItem[];
  systemSettings: SystemSettings;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onSelectCourse: (course: CourseItem) => void;
  onLogout: () => void;
  onSecretTriggerAdmin: () => void;
  onActivateCourse: (courseId: string) => Promise<void>;
}

export const CoursesPortal: React.FC<CoursesPortalProps> = ({
  currentUser,
  courses,
  systemSettings,
  isDarkMode,
  toggleDarkMode,
  onSelectCourse,
  onLogout,
  onSecretTriggerAdmin,
  onActivateCourse,
}) => {
  // Sort courses by order
  const sortedCourses = useMemo(() => {
    return [...courses].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [courses]);

  // Enrolled / Paid courses for this student
  const paidCourses = useMemo(() => {
    const enrolledIds = currentUser.enrolledCourseIds || [];
    return sortedCourses.filter((c) => enrolledIds.includes(c.id));
  }, [sortedCourses, currentUser.enrolledCourseIds]);

  // Selected course for preview (defaults to first course)
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => {
    if (sortedCourses.length > 0) return sortedCourses[0].id;
    return '';
  });

  // Track active list filter view on mobile/desktop: 4 sections (الكورسات المتفعلة | الكورسات المتاحة | خطوات التسجيل | تواصل معنا)
  const [activeListView, setActiveListView] = useState<'paid' | 'available' | 'steps' | 'contact'>('paid');

  const selectedCourse = useMemo(() => {
    return sortedCourses.find((c) => c.id === selectedCourseId) || sortedCourses[0] || null;
  }, [sortedCourses, selectedCourseId]);

  // Modal states for locked course payment flow
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isPaymentStepOpen, setIsPaymentStepOpen] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Secret Admin 7-clicks trigger
  const [secretClicks, setSecretClicks] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleHeaderSecretClick = () => {
    const now = Date.now();
    if (now - lastClickTime < 1000) {
      const nextCount = secretClicks + 1;
      setSecretClicks(nextCount);
      if (nextCount >= 7) {
        setSecretClicks(0);
        onSecretTriggerAdmin();
      }
    } else {
      setSecretClicks(1);
    }
    setLastClickTime(now);
  };

  const isSelectedEnrolled = useMemo(() => {
    if (!selectedCourse) return false;
    return (currentUser.enrolledCourseIds || []).includes(selectedCourse.id);
  }, [selectedCourse, currentUser.enrolledCourseIds]);

  // Handle "تفعيل الآن" click on any course
  const handleActivateClick = (course: CourseItem) => {
    const isEnrolled = (currentUser.enrolledCourseIds || []).includes(course.id);
    if (isEnrolled) {
      onSelectCourse(course);
      return;
    }

    if (!course.isLocked) {
      // Free / Open Course -> Immediate activation & enter!
      setIsActivating(true);
      onActivateCourse(course.id).then(() => {
        setIsActivating(false);
        onSelectCourse(course);
      }).catch(() => {
        setIsActivating(false);
        onSelectCourse(course);
      });
    } else {
      // Locked Course -> Show Price Details Modal first
      setIsPriceModalOpen(true);
      setIsPaymentStepOpen(false);
    }
  };

  const handleConfirmPayAndActivate = async () => {
    if (!selectedCourse) return;
    setIsActivating(true);
    try {
      await onActivateCourse(selectedCourse.id);
      setIsPriceModalOpen(false);
      setIsPaymentStepOpen(false);
      onSelectCourse(selectedCourse);
    } catch (e) {
      console.error('Error activating course:', e);
    } finally {
      setIsActivating(false);
    }
  };

  const activeTheme = systemSettings.activeTheme;
  const whatsappNum = (systemSettings.whatsappNumber || '966500000000').trim();
  const cleanTelegram = (systemSettings.telegramUsername || '@raad_aksam').replace(/^@/, '').trim();

  // Supervisor direct links
  const whatsappInquiryUrl = `https://wa.me/${whatsappNum}?text=${encodeURIComponent(
    `السلام عليكم ورحمة الله، أستفسر بخصوص التسجيل في دورات منصة أقسام رعد التعليمية - الطالب: ${currentUser.name}`
  )}`;
  const telegramInquiryUrl = `https://t.me/${cleanTelegram}`;

  // Course payment / transfer confirmation links
  const whatsappUrl = selectedCourse
    ? `https://wa.me/${whatsappNum}?text=${encodeURIComponent(
        `السلام عليكم ورحمة الله، أرغب في تأكيد تحويل رسوم الاشتراك في ${selectedCourse.title} - الطالب: ${currentUser.name} - الإيميل: ${currentUser.email}`
      )}`
    : `https://wa.me/${whatsappNum}`;

  const telegramUrl = `https://t.me/${cleanTelegram}`;

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 select-none ${
        isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
      dir="rtl"
    >
      {/* ================= TOP HEADER ================= */}
      <header
        className={`sticky top-0 z-40 px-3 sm:px-6 md:px-8 py-2.5 sm:py-3.5 border-b backdrop-blur-xl flex items-center justify-between gap-3 shadow-md ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/95 border-slate-200'
        }`}
      >
        {/* Brand & Secret Clicks (completely normal text without pointer or button hover) */}
        <div
          onClick={handleHeaderSecretClick}
          className="flex items-center gap-2.5 sm:gap-3.5 cursor-default select-none"
        >
          <BrandLogo
            customLogoUrl={systemSettings.logoUrl}
            size="md"
            primaryColor={activeTheme?.primary || '#2563eb'}
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-sm sm:text-base md:text-lg font-black tracking-tight cursor-default ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                واجهة الكورسات
              </h1>
              <span
                className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-black uppercase tracking-wider"
                style={{
                  backgroundColor: `${activeTheme?.primary || '#2563eb'}20`,
                  color: activeTheme?.accent || '#38bdf8',
                }}
              >
                بوابة الدورات 🎓
              </span>
            </div>
            <p className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              مرحباً بك: <strong className={isDarkMode ? 'text-white' : 'text-slate-950'}>{currentUser.name}</strong>
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Quick Enrolled Courses Counter Badge */}
          <div
            onClick={() => setActiveListView('paid')}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black cursor-pointer transition ${
              paidCourses.length > 0
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25'
                : isDarkMode
                ? 'bg-slate-800/60 border-slate-700 text-slate-400'
                : 'bg-slate-100 border-slate-300 text-slate-700'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            <span>كورساتي المفعلة: {paidCourses.length}</span>
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleDarkMode}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              isDarkMode
                ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700'
                : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100 shadow-sm'
            }`}
            title={isDarkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-black transition cursor-pointer"
            title="تسجيل الخروج من الحساب"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      {/* ================= MAIN VIEWPORT CONTAINER ================= */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-3 sm:p-5 md:p-6 lg:p-8 flex flex-col gap-6">
        {/* Welcome & Instructions Banner */}
        <div
          className={`p-4 sm:p-6 rounded-3xl border shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
            isDarkMode
              ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-slate-800'
              : 'bg-gradient-to-r from-blue-50/70 via-white to-indigo-50/50 border-slate-200'
          }`}
        >
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-black">
                ✨ خطوتك الأولى للتميز
              </span>
              <span className="text-xs text-slate-400 font-bold">منصة أقسام رعد للقدرات</span>
            </div>
            <h2 className={`text-lg sm:text-2xl md:text-3xl font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
              اختر الكورس التعليمي المناسب لك وابدأ دراستك الآن
            </h2>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              استعرض قائمة الكورسات المتاحة بالأسفل؛ يمكنك تفعيل الكورسات المفتوحة مجاناً فوراً، أو تفعيل الكورسات المدفوعة والمقفلة بكل سهولة.
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
            <a
              href={whatsappInquiryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/25 transition cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>مساعدة المشرف عبر الواتساب 📱</span>
            </a>
            <a
              href={telegramInquiryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-sky-600/25 transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>استفسار ومساعدة المشرف عبر التليجرام ✈️</span>
            </a>
          </div>
        </div>

        {/* ================= 2-COLUMN COURSES LAYOUT =================
            - On the Right (in RTL): List of Available Courses & Paid Courses Button/Section
            - On the Left (in RTL): Selected Course Display, Cover Image, Lock status & "تفعيل الآن"
        */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 flex-1 items-start">
          {/* ================= RIGHT COLUMN (in RTL): قائمة الخانات الـ 4 تحت بعض في مستطيل أسود بملء الشاشة ================= */}
          <div className="lg:col-span-5 xl:col-span-4 order-2 lg:order-1 bg-black border-2 border-slate-800/90 rounded-3xl p-4 sm:p-5 flex flex-col gap-4 shadow-2xl min-h-[calc(100vh-140px)] text-white">
            {/* Header: عنوان القائمة اليمينية */}
            <div className="pb-2 border-b border-slate-800/80 flex items-center justify-between">
              <span className="text-xs font-black text-slate-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>قائمة المنصة الرئيسية</span>
              </span>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                أقسام رعد
              </span>
            </div>

            {/* القائمة الرأسية - الخانات الـ 4 تحت بعض بالترتيب الدقيق */}
            <div className="flex flex-col gap-2.5">
              {/* 1. الكورسات المتفعلة (تتصدر القائمة دائماً) */}
              <button
                type="button"
                onClick={() => setActiveListView('paid')}
                className={`w-full p-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border-2 ${
                  activeListView === 'paid'
                    ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white border-emerald-400 shadow-xl shadow-emerald-600/30 ring-2 ring-emerald-500/30'
                    : 'bg-slate-900/90 hover:bg-slate-800/90 text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${activeListView === 'paid' ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <span className="block font-black text-sm">الكورسات المتفعلة</span>
                    <span className="text-[11px] text-slate-400 font-bold">الدورات المفعلة وجاهزة للدخول الفوري</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                  activeListView === 'paid' ? 'bg-white text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {paidCourses.length}
                </span>
              </button>

              {/* 2. الكورسات المتاحة */}
              <button
                type="button"
                onClick={() => setActiveListView('available')}
                className={`w-full p-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border-2 ${
                  activeListView === 'available'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 text-white border-blue-400 shadow-xl shadow-blue-600/30 ring-2 ring-blue-500/30'
                    : 'bg-slate-900/90 hover:bg-slate-800/90 text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${activeListView === 'available' ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-400'}`}>
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <span className="block font-black text-sm">الكورسات المتاحة</span>
                    <span className="text-[11px] text-slate-400 font-bold">تصفح وتفعيل الدورات المفتوحة والمدفوعة</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                  activeListView === 'available' ? 'bg-white text-blue-700' : 'bg-blue-500/20 text-blue-300'
                }`}>
                  {sortedCourses.length}
                </span>
              </button>

              {/* 3. خطوات التسجيل */}
              <button
                type="button"
                onClick={() => setActiveListView('steps')}
                className={`w-full p-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border-2 ${
                  activeListView === 'steps'
                    ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white border-purple-400 shadow-xl shadow-purple-600/30 ring-2 ring-purple-500/30'
                    : 'bg-slate-900/90 hover:bg-slate-800/90 text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${activeListView === 'steps' ? 'bg-white/20 text-white' : 'bg-purple-500/20 text-purple-400'}`}>
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <span className="block font-black text-sm">خطوات التسجيل والتفعيل</span>
                    <span className="text-[11px] text-slate-400 font-bold">طريقة تفعيل الكورس المجاني والمدفوع</span>
                  </div>
                </div>
                <ChevronLeft className={`w-4 h-4 transition-transform ${activeListView === 'steps' ? '-translate-x-1 text-white' : 'text-slate-500'}`} />
              </button>

              {/* 4. تواصل معنا */}
              <button
                type="button"
                onClick={() => setActiveListView('contact')}
                className={`w-full p-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border-2 ${
                  activeListView === 'contact'
                    ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 text-white border-amber-400 shadow-xl shadow-amber-600/30 ring-2 ring-amber-500/30'
                    : 'bg-slate-900/90 hover:bg-slate-800/90 text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${activeListView === 'contact' ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
                    <Phone className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <span className="block font-black text-sm">تواصل معنا</span>
                    <span className="text-[11px] text-slate-400 font-bold">واتساب وتليجرام المشرف المباشر</span>
                  </div>
                </div>
                <ChevronLeft className={`w-4 h-4 transition-transform ${activeListView === 'contact' ? '-translate-x-1 text-white' : 'text-slate-500'}`} />
              </button>
            </div>

            {/* خط فاصل أنيق وعنوان المحتوى المختار */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-bold px-1">
              <span>
                {activeListView === 'paid'
                  ? '⚡ محتوى الكورسات المتفعلة لديك:'
                  : activeListView === 'available'
                  ? '📚 قائمة الكورسات المتاحة بالمنصة:'
                  : activeListView === 'steps'
                  ? '📝 خطوات تفعيل الكورسات داخل المنصة:'
                  : '📞 قنوات التواصل المباشرة مع المشرف:'}
              </span>
            </div>

            {/* Content Container based on selected tab */}
            <div className="space-y-3">
              {/* ================= 1. الخانة الأولى: الكورسات المتفعلة ================= */}
              {activeListView === 'paid' && (
                paidCourses.length === 0 ? (
                  <div
                    className={`p-8 rounded-3xl border text-center space-y-3 ${
                      isDarkMode ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className={`font-black text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>لم تقم بتفعيل أي كورس بعد</h4>
                      <p className="text-xs max-w-xs mx-auto leading-relaxed">
                        اختر أحد الكورسات من خانة "الكورسات المتاحة" واضغط على تفعيل الآن للبدء الفوري!
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveListView('available')}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-xs transition cursor-pointer shadow-md"
                    >
                      تصفح الكورسات المتاحة 📚
                    </button>
                  </div>
                ) : (
                  /* إذا مفعل أكثر من كورس يأتوا بجانب بعض كمستطيلات صغيرة بالصورة وزر دخول */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {paidCourses.map((course) => {
                      const isSelected = selectedCourse?.id === course.id;

                      return (
                        <div
                          key={course.id}
                          onClick={() => setSelectedCourseId(course.id)}
                          className={`group relative rounded-2xl p-3 border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between gap-2.5 ${
                            isSelected
                              ? isDarkMode
                                ? 'bg-slate-800/95 border-emerald-500 shadow-xl shadow-emerald-500/15 ring-2 ring-emerald-500/30'
                                : 'bg-white border-emerald-500 shadow-xl shadow-emerald-500/15 ring-2 ring-emerald-400/30'
                              : isDarkMode
                              ? 'bg-slate-900/80 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700'
                              : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Course Thumbnail Image */}
                          <div className="w-full h-24 sm:h-28 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0 relative">
                            {course.imageUrl ? (
                              <img
                                src={course.imageUrl}
                                alt={course.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="eager"
                                decoding="sync"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 text-emerald-400">
                                <Award className="w-8 h-8" />
                              </div>
                            )}

                            <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-lg bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 text-[9px] font-black backdrop-blur-sm">
                              مفعل لديك ✓
                            </span>
                          </div>

                          {/* Title */}
                          <div className="space-y-0.5 min-w-0">
                            <h4 className={`text-xs font-black line-clamp-1 ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                              {course.title}
                            </h4>
                            {course.description && (
                              <p className="text-[10px] text-slate-400 line-clamp-1">
                                {course.description}
                              </p>
                            )}
                          </div>

                          {/* زر دخول لمحتوى المنصة */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectCourse(course);
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>دخول لمحتوى المنصة ⚡</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* ================= 2. الخانة الثانية: الكورسات المتاحة ================= */}
              {activeListView === 'available' && (
                sortedCourses.length === 0 ? (
                  <div
                    className={`p-8 rounded-3xl border text-center space-y-2 ${
                      isDarkMode ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <BookOpen className="w-10 h-10 mx-auto text-slate-500 mb-2 opacity-50" />
                    <p className="font-bold text-sm">لا توجد كورسات متاحة حالياً</p>
                    <p className="text-xs">سيقوم المشرف بإضافة وتحديث الدورات التعليمية قريباً.</p>
                  </div>
                ) : (
                  /* الكورسات المتاحة عبارة عن مستطيلات صغيرة أيضا بالصورة بجانب بعضهما */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sortedCourses.map((course, idx) => {
                      const isSelected = selectedCourse?.id === course.id;
                      const isEnrolled = (currentUser.enrolledCourseIds || []).includes(course.id);

                      return (
                        <div
                          key={course.id}
                          onClick={() => setSelectedCourseId(course.id)}
                          className={`group relative rounded-2xl p-3 border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between gap-2.5 ${
                            isSelected
                              ? isDarkMode
                                ? 'bg-slate-800/95 border-blue-500 shadow-xl shadow-blue-500/15 ring-2 ring-blue-500/30'
                                : 'bg-white border-blue-500 shadow-xl shadow-blue-500/15 ring-2 ring-blue-400/30'
                              : isDarkMode
                              ? 'bg-slate-900/80 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700'
                              : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Course Thumbnail Image */}
                          <div className="w-full h-24 sm:h-28 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0 relative">
                            {course.imageUrl ? (
                              <img
                                src={course.imageUrl}
                                alt={course.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="eager"
                                decoding="sync"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-indigo-400">
                                <BookOpen className="w-8 h-8" />
                              </div>
                            )}

                            {/* Lock / Unlock Price Badge */}
                            <div
                              className={`absolute top-1.5 right-1.5 px-2 py-0.5 rounded-lg backdrop-blur-md text-[9px] font-black flex items-center gap-1 ${
                                course.isLocked
                                  ? 'bg-amber-950/85 text-amber-300 border border-amber-500/40'
                                  : 'bg-emerald-950/85 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              {course.isLocked ? (
                                <>
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>{course.price || 'مدفوع'}</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-2.5 h-2.5" />
                                  <span>مجاني</span>
                                </>
                              )}
                            </div>

                            {isEnrolled && (
                              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[8px] font-black">
                                مفعل لديك ✓
                              </span>
                            )}
                          </div>

                          {/* Course Info */}
                          <div className="space-y-0.5 min-w-0">
                            <span className="text-[9px] font-black text-blue-400 block">دورة #{idx + 1}</span>
                            <h4 className={`text-xs font-black line-clamp-1 ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                              {course.title}
                            </h4>
                          </div>

                          {/* Action Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleActivateClick(course);
                            }}
                            className={`w-full py-2 px-3 rounded-xl text-white font-black text-xs shadow-md transition flex items-center justify-center gap-1 cursor-pointer ${
                              isEnrolled
                                ? 'bg-emerald-600 hover:bg-emerald-500'
                                : course.isLocked
                                ? 'bg-amber-600 hover:bg-amber-500'
                                : 'bg-blue-600 hover:bg-blue-500'
                            }`}
                          >
                            {isEnrolled ? (
                              <>
                                <Zap className="w-3.5 h-3.5" />
                                <span>دخول للمنصة 🚀</span>
                              </>
                            ) : course.isLocked ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>تفعيل والدفع 💳</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>تفعيل مجاني ✨</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* ================= 3. الخانة الثالثة: خطوات التسجيل ================= */}
              {activeListView === 'steps' && (
                <div className="space-y-3.5">
                  {/* طريقة تفعيل الكورس المجاني */}
                  <div className="p-4 rounded-3xl border-2 border-emerald-500/30 bg-slate-900/95 space-y-3">
                    <div className="flex items-center gap-2.5 pb-2 border-b border-emerald-500/20">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-emerald-400">
                          1. طريقة تفعيل الكورس المجاني (المفتوح) ✨
                        </h4>
                        <p className="text-[10px] text-slate-400">بدء فوري بدون أي رسوم مالية</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs font-bold leading-relaxed">
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] shrink-0 font-black mt-0.5">
                          1
                        </span>
                        <p className="text-slate-300">
                          اختر الكورس المجاني من خانة <strong>"الكورسات المتاحة"</strong>.
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] shrink-0 font-black mt-0.5">
                          2
                        </span>
                        <p className="text-slate-300">
                          اضغط على زر <strong>"تفعيل الآن للبدء الفوري (مفتوح مجاناً ✨)"</strong>.
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] shrink-0 font-black mt-0.5">
                          3
                        </span>
                        <p className="text-slate-300">
                          يتم فتح محتوى الكورس بالكامل فوراً والبدء بمشاهدة الدروس والاختبارات.
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] shrink-0 font-black mt-0.5">
                          4
                        </span>
                        <p className="text-slate-300">
                          ستجد الكورس دائماً في خانة <strong>"الكورسات المتفعلة"</strong> للدخول المباشر.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* طريقة تفعيل الكورس المدفوع */}
                  <div className="p-4 rounded-3xl border-2 border-amber-500/30 bg-slate-900/95 space-y-3">
                    <div className="flex items-center gap-2.5 pb-2 border-b border-amber-500/20">
                      <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-amber-400">
                          2. طريقة تفعيل الكورس المدفوع (VIP) داخل منصة رعد 💳
                        </h4>
                        <p className="text-[10px] text-slate-400">خطوات التحويل وتأكيد التفعيل مع المشرف</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs font-bold leading-relaxed">
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] shrink-0 font-black mt-0.5">
                          1
                        </span>
                        <p className="text-slate-300">
                          اختر الكورس المطلوب واضغط على <strong>"تفعيل الآن"</strong> لعرض تفاصيل الرسوم.
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] shrink-0 font-black mt-0.5">
                          2
                        </span>
                        <p className="text-slate-300">
                          اضغط على <strong>"الدفع الآن 💳"</strong> لمعاينة وتكبير صور الحساب البنكي والآيبان.
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] shrink-0 font-black mt-0.5">
                          3
                        </span>
                        <p className="text-slate-300">
                          قم بالتحويل عبر تطبيق البنك واحفظ صورة إشعار التحويل البنكي.
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] shrink-0 font-black mt-0.5">
                          4
                        </span>
                        <p className="text-slate-300">
                          اضغط على زر <strong>"إرسال إشعار التحويل عبر الواتساب"</strong> أو <strong>"عبر التليجرام"</strong> لإرسال الإشعار للمشرف فوراً.
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] shrink-0 font-black mt-0.5">
                          5
                        </span>
                        <p className="text-slate-300">
                          يقوم المشرف بمراجعة التحويل وتفعيل الكورس لحسابك فوراً لتجده في قائمة <strong>"الكورسات المتفعلة"</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= 4. الخانة الرابعة: تواصل معنا ================= */}
              {activeListView === 'contact' && (
                <div className="space-y-3.5">
                  <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <h4 className="text-xs font-black text-blue-400">
                      📞 قنوات التواصل المباشرة مع المشرف
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      للاستفسار، المساعدة، وتأكيد تفعيل اشتراكات المنصة
                    </p>
                  </div>

                  {/* مستطيل الواتساب */}
                  <div className="p-4 rounded-3xl border-2 border-emerald-500/40 bg-slate-900/95 space-y-3 shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 shrink-0">
                        <MessageCircle className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                          واتساب المشرف الرسمي
                        </span>
                        <h4 className="text-xs sm:text-sm font-black truncate mt-0.5 text-white">
                          تواصل عبر تطبيق الواتساب
                        </h4>
                        <p className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">
                          +{whatsappNum}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      للمساعدة الفورية، الاستفسار عن المناهج، وتأكيد تفعيل الكورسات بعد التحويل.
                    </p>

                    <a
                      href={whatsappInquiryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-600/25 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>فتح محادثة الواتساب الآن 📱</span>
                    </a>
                  </div>

                  {/* مستطيل التليجرام */}
                  <div className="p-4 rounded-3xl border-2 border-sky-500/40 bg-slate-900/95 space-y-3 shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-2xl bg-sky-500/20 text-sky-400 shrink-0">
                        <Send className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400">
                          تليجرام المشرف الرسمي
                        </span>
                        <h4 className="text-xs sm:text-sm font-black truncate mt-0.5 text-white">
                          تواصل عبر تطبيق التليجرام
                        </h4>
                        <p className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">
                          @{cleanTelegram}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      للاستفسارات السريعة، إرسال إشعارات التحويل، ومتابعة المستجدات.
                    </p>

                    <a
                      href={telegramInquiryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-black text-xs shadow-lg shadow-sky-600/25 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>فتح محادثة التليجرام الآن ✈️</span>
                    </a>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-center">
                    <span className="text-[10px] text-slate-400">
                      ⚙️ يمكن للمدير تعديل رقم الواتساب ورابط التليجرام من قسم التحكم في أي وقت.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ================= LEFT COLUMN (in RTL): SELECTED COURSE DETAILED DISPLAY & ACTIONS ================= */}
          <div className="lg:col-span-7 xl:col-span-8 order-1 lg:order-2">
            {selectedCourse ? (
              <div
                className={`rounded-3xl border-2 shadow-2xl overflow-hidden transition-all duration-200 ${
                  isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                {/* Hero Cover Image */}
                <div className="relative w-full h-56 sm:h-72 md:h-80 bg-slate-800 overflow-hidden group">
                  {selectedCourse.imageUrl ? (
                    <img
                      src={selectedCourse.imageUrl}
                      alt={selectedCourse.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="eager"
                      decoding="sync"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-indigo-400">
                      <BookOpen className="w-16 h-16 stroke-1 mb-2" />
                      <span className="text-sm font-black">غلاف الكورس التعليمي</span>
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

                  {/* Top Badges over image */}
                  <div className="absolute top-4 inset-x-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-black backdrop-blur-md flex items-center gap-1.5 shadow-lg ${
                          selectedCourse.isLocked
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                        }`}
                      >
                        {selectedCourse.isLocked ? (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>كورس مقفول 🔒</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>كورس مفتوح مجاناً ✨</span>
                          </>
                        )}
                      </span>

                      {selectedCourse.price && selectedCourse.isLocked && (
                        <span className="px-3 py-1 rounded-xl text-xs font-black bg-blue-950/80 text-blue-300 border border-blue-500/40 backdrop-blur-md shadow-lg">
                          السعر: {selectedCourse.price}
                        </span>
                      )}
                    </div>

                    {isSelectedEnrolled && (
                      <span className="px-3 py-1 rounded-xl text-xs font-black bg-emerald-600 text-white shadow-lg flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>مفعل لديك</span>
                      </span>
                    )}
                  </div>

                  {/* Bottom title over image */}
                  <div className="absolute bottom-4 inset-x-4 sm:inset-x-6 space-y-1">
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white drop-shadow-md">
                      {selectedCourse.title}
                    </h2>
                  </div>
                </div>

                {/* Course Details Body */}
                <div className="p-5 sm:p-7 md:p-8 space-y-6">
                  {/* Description */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-black uppercase text-slate-400">وصف ومحتوى الدورة:</h4>
                    <p
                      className={`text-sm sm:text-base leading-relaxed ${
                        isDarkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      {selectedCourse.description ||
                        'كورس شامل يضم محاضرات تأسيسية مصورة، تدريبات مكثفة على نماذج قياس، وبنوك أسئلة واختبارات تفاعلية محاكية لنظام نمر.'}
                    </p>
                  </div>

                  {/* Status Indicator Callout */}
                  <div
                    className={`p-4 sm:p-5 rounded-2xl border flex items-start gap-3.5 ${
                      selectedCourse.isLocked
                        ? isDarkMode
                          ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                          : 'bg-amber-50 border-amber-300 text-amber-900'
                        : isDarkMode
                        ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        selectedCourse.isLocked
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {selectedCourse.isLocked ? <Lock className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                    </div>

                    <div className="space-y-1">
                      <h4 className="font-black text-sm">
                        {selectedCourse.isLocked
                          ? 'هذا الكورس مميز ومقفول (VIP)'
                          : 'هذا الكورس متاح ومفتوح لجميع الطلاب'}
                      </h4>
                      <p className="text-xs leading-relaxed opacity-90 font-medium">
                        {selectedCourse.isLocked
                          ? `عند الضغط على "تفعيل الآن"، ستظهر لك تفاصيل السعر (${selectedCourse.price || 'المحدد'})، وعند الضغط على "الدفع الآن" ستظهر لك صور الحساب البنكي لتحويل الرسوم وتفعيل الكورس فوراً.`
                          : 'يمكنك البدء مباشرة بالنقر على "تفعيل الآن للبدء الفوري" للانتقال إلى محتوى الكورس والأقسام والمصادر الخاصة به.'}
                      </p>
                    </div>
                  </div>

                  {/* Big Action Buttons */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                    {isSelectedEnrolled ? (
                      /* Enrolled: Direct Enter */
                      <button
                        type="button"
                        onClick={() => onSelectCourse(selectedCourse)}
                        className="w-full sm:flex-1 py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm sm:text-base shadow-xl shadow-emerald-600/30 transition flex items-center justify-center gap-2.5 cursor-pointer"
                      >
                        <Zap className="w-5 h-5" />
                        <span>الدخول إلى محتوى الكورس الآن 🚀</span>
                      </button>
                    ) : (
                      /* Not Enrolled: Activate Now */
                      <button
                        type="button"
                        disabled={isActivating}
                        onClick={() => handleActivateClick(selectedCourse)}
                        className={`w-full sm:flex-1 py-4 px-6 rounded-2xl text-white font-black text-sm sm:text-base shadow-xl transition flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 ${
                          selectedCourse.isLocked
                            ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-500 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/30'
                            : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/30'
                        }`}
                      >
                        {selectedCourse.isLocked ? (
                          <>
                            <Lock className="w-5 h-5" />
                            <span>تفعيل الآن (عرض تفاصيل السعر والدفع 🔒)</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5" />
                            <span>{isActivating ? 'جاري التفعيل...' : 'تفعيل الآن للبدء الفوري (مفتوح مجاناً ✨)'}</span>
                          </>
                        )}
                      </button>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`py-3.5 px-4 rounded-2xl border text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                          isDarkMode
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                        }`}
                      >
                        <MessageCircle className="w-4 h-4 text-emerald-500" />
                        <span>استفسار واتساب</span>
                      </a>

                      <a
                        href={telegramInquiryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`py-3.5 px-4 rounded-2xl border text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                          isDarkMode
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                        }`}
                      >
                        <Send className="w-4 h-4 text-sky-400" />
                        <span>استفسار تليجرام</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`p-12 rounded-3xl border text-center space-y-3 ${
                  isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <BookOpen className="w-12 h-12 mx-auto text-slate-500 opacity-50" />
                <p className="font-bold text-base">الرجاء اختيار كورس من القائمة لعرض تفاصيله وتفعيله</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ================= MODAL: تفاصيل سعر الكورس (STEP 1) & الدفع الآن (STEP 2) ================= */}
      {isPriceModalOpen && selectedCourse && (
        <div
          onClick={() => {
            setIsPriceModalOpen(false);
            setIsPaymentStepOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-2xl max-h-[92vh] rounded-3xl border-2 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 ${
              isDarkMode
                ? 'bg-slate-900 border-amber-500/40 text-white'
                : 'bg-white border-amber-500/50 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div
              className={`p-4 sm:p-6 border-b flex items-center justify-between gap-3 ${
                isDarkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-amber-50/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-500">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                      {isPaymentStepOpen ? 'الخطوة 2: الدفع والتحويل' : 'الخطوة 1: تفاصيل السعر والتفعيل'}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black truncate max-w-xs sm:max-w-md">
                    {selectedCourse.title}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsPriceModalOpen(false);
                  setIsPaymentStepOpen(false);
                }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {!isPaymentStepOpen ? (
                /* ================= STEP 1: تفاصيل سعر الكورس ================= */
                <div className="space-y-5">
                  {/* Big Price Card */}
                  <div
                    className={`p-6 rounded-3xl border-2 text-center space-y-3 ${
                      isDarkMode
                        ? 'bg-gradient-to-b from-amber-950/40 to-slate-900 border-amber-500/40'
                        : 'bg-gradient-to-b from-amber-50 to-white border-amber-300 shadow-sm'
                    }`}
                  >
                    <span className="text-xs font-black text-amber-500 uppercase">
                      قيمة ورسوم اشتراك الكورس:
                    </span>
                    <div className="text-3xl sm:text-5xl font-black text-amber-400 font-mono tracking-tight">
                      {selectedCourse.price || '150 ريال سعودي'}
                    </div>
                    <p className="text-xs text-slate-400 font-bold max-w-md mx-auto">
                      اشتراك كامل يشمل جميع المحاضرات المصورة وبنوك الأسئلة والاختبارات المحاكية ومتابعة النتائج.
                    </p>
                  </div>

                  {/* Course Highlights */}
                  <div
                    className={`p-4 rounded-2xl border space-y-2 text-xs sm:text-sm font-bold ${
                      isDarkMode ? 'bg-slate-800/60 border-slate-700/80 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <h5 className="font-black text-amber-400 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>ماذا ستحصل عليه بعد التفعيل؟</span>
                    </h5>
                    <ul className="space-y-1.5 list-disc list-inside text-xs leading-relaxed text-slate-300">
                      <li>فتح فوري لجميع أقسام ومصادر هذا الكورس التأسيسية والمتقدمة.</li>
                      <li>إتاحة جميع الاختبارات بنظام نمر ونظام المنصة مع حفظ محاولاتك.</li>
                      <li>ربط دائم بحسابك الحالي؛ سيظهر الكورس دائماً في قسم "الكورسات المدفوعة".</li>
                    </ul>
                  </div>

                  {/* "الدفع الآن" Button -> moves to Step 2 */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsPaymentStepOpen(true)}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-500 hover:from-amber-500 hover:to-orange-500 text-white font-black text-sm sm:text-base shadow-xl shadow-amber-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CreditCard className="w-5 h-5" />
                      <span>الدفع الآن 💳 (عرض صور الحساب وطرق التحويل)</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* ================= STEP 2: صور رقم الحساب والرسالة ================= */
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <h4 className="text-sm sm:text-base font-black text-amber-400">
                        بيانات التحويل ورقم الحساب البنكي 🏦
                      </h4>
                      <p className="text-xs text-slate-400">
                        قم بالتحويل عبر أحد الحسابين أدناه ثم أرسل الإشعار لتفعيل اشتراكك فوراً
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsPaymentStepOpen(false)}
                      className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>الرجوع للسعر</span>
                    </button>
                  </div>

                  {/* الصورتين لرقم الحساب */}
                  <div className="space-y-2">
                    <span className="text-xs font-black text-slate-300 block">
                      صور الحساب البنكي ورقم الآيبان (اضغط على الصورة للتكبير):
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* صورة الحساب 1 */}
                      <div
                        onClick={() => {
                          if (selectedCourse.bankAccountImage1) {
                            setZoomedImage(selectedCourse.bankAccountImage1);
                          }
                        }}
                        className="group relative rounded-2xl overflow-hidden border-2 border-amber-500/40 bg-slate-800 aspect-video flex items-center justify-center cursor-pointer hover:border-amber-400 transition"
                      >
                        {selectedCourse.bankAccountImage1 ? (
                          <img
                            src={selectedCourse.bankAccountImage1}
                            alt="صورة رقم الحساب 1"
                            className="w-full h-full object-contain group-hover:scale-105 transition"
                          />
                        ) : (
                          <div className="text-center p-4 space-y-1 text-slate-400">
                            <CreditCard className="w-8 h-8 mx-auto text-amber-500" />
                            <span className="text-xs font-bold block">صورة الحساب البنكي 1</span>
                          </div>
                        )}
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/75 text-[10px] text-amber-300 font-bold flex items-center gap-1">
                          <ZoomIn className="w-3 h-3" />
                          <span>تكبير</span>
                        </span>
                      </div>

                      {/* صورة الحساب 2 */}
                      <div
                        onClick={() => {
                          if (selectedCourse.bankAccountImage2) {
                            setZoomedImage(selectedCourse.bankAccountImage2);
                          }
                        }}
                        className="group relative rounded-2xl overflow-hidden border-2 border-amber-500/40 bg-slate-800 aspect-video flex items-center justify-center cursor-pointer hover:border-amber-400 transition"
                      >
                        {selectedCourse.bankAccountImage2 ? (
                          <img
                            src={selectedCourse.bankAccountImage2}
                            alt="صورة رقم الحساب 2"
                            className="w-full h-full object-contain group-hover:scale-105 transition"
                          />
                        ) : (
                          <div className="text-center p-4 space-y-1 text-slate-400">
                            <CreditCard className="w-8 h-8 mx-auto text-amber-500" />
                            <span className="text-xs font-bold block">صورة الحساب البنكي 2</span>
                          </div>
                        )}
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/75 text-[10px] text-amber-300 font-bold flex items-center gap-1">
                          <ZoomIn className="w-3 h-3" />
                          <span>تكبير</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* رسالة تحت صور الحساب */}
                  <div
                    className={`p-4 rounded-2xl border-2 space-y-1.5 ${
                      isDarkMode
                        ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                        : 'bg-amber-50 border-amber-300 text-amber-950'
                    }`}
                  >
                    <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4" />
                      <span>تعليمات ورسالة التحويل:</span>
                    </span>
                    <p className="text-xs sm:text-sm font-bold leading-relaxed">
                      {selectedCourse.paymentMessage ||
                        'الرجاء التحويل إلى أحد الحسابين الموضحين في الصورتين أعلاه، ثم إرسال إشعار التحويل عبر الواتساب لتفعيل الكورس فوراً.'}
                    </p>
                  </div>

                  {/* WhatsApp confirmation & Instant activation buttons */}
                  <div className="space-y-2.5 pt-2">
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>إرسال إشعار التحويل عبر الواتساب لتأكيد التفعيل 📱</span>
                    </a>

                    <a
                      href={telegramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-sky-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>إرسال إشعار التحويل عبر التليجرام لتأكيد التفعيل ✈️</span>
                    </a>

                    <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-center space-y-1">
                      <p className="text-xs sm:text-sm font-black text-indigo-300">
                        ✨ بعد إرسال إشعار التحويل عبر الواتساب أو التليجرام للمشرف
                      </p>
                      <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                        سيقوم المشرف بمراجعة التحويل وتفعيل هذا الكورس لحسابك فوراً لتجده في قائمة "الكورسات المتفعلة".
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= LIGHTBOX MODAL: تكبير صورة الحساب ================= */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute top-3 left-3 z-10 p-2 rounded-xl bg-black/70 hover:bg-black text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={zoomedImage} alt="صورة الحساب المكبرة" className="max-w-full max-h-[85vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};
