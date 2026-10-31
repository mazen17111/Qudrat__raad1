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
  Phone,
  AlertTriangle,
} from 'lucide-react';
import { StudentUser, CourseItem, SystemSettings } from '../types';
import { BrandLogo } from './BrandLogo';
import { CertificateModal } from './CertificateModal';

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
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  // Secret Admin 20-clicks trigger strictly on the word "محفوظة" in the footer
  const [secretClicks, setSecretClicks] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleSecretWordClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastClickTime < 4000) {
      const nextCount = secretClicks + 1;
      setSecretClicks(nextCount);
      if (nextCount >= 20) {
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
    setSelectedCourseId(course.id);
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
      className={`min-h-screen flex flex-col justify-between transition-colors duration-200 select-none ${
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
        {/* Brand: Completely normal text, no pointer or button hover */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 cursor-default select-none">
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

          {/* Certificate Header Button if issued */}
          {currentUser.certificateIssued && (
            <button
              type="button"
              onClick={() => setShowCertificateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-400 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 text-xs font-black shadow-md transition hover:scale-105 cursor-pointer"
              title="عرض وطباعة شهادتي المعتمدة"
            >
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>شهادتي 🎓</span>
            </button>
          )}

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
      <main className="flex-1 max-w-[1750px] w-full mx-auto p-3 sm:p-4 md:p-5 flex flex-col gap-3 sm:gap-4">
        {/* ================= CUSTOM RED MESSAGE FOR THIS STUDENT ================= */}
        {/* "ويمكنني كتابة رسالة مخصصة لكل طالب تظهر له باللون الاحمر" */}
        {currentUser.customRedMessage && currentUser.customRedMessage.trim() !== '' && currentUser.isRedMessageActive !== false && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-xl shadow-red-600/30 border-2 border-red-400/80 flex items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shrink-0 shadow-inner">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-xs sm:text-sm tracking-wide">
                    🚨 تنبيه مخصص من إدارة المنصة:
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/25 font-bold">
                    رسالة هامة لك
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-red-50 mt-1 leading-relaxed">
                  {currentUser.customRedMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================= OFFICIAL CERTIFICATE ANNOUNCEMENT BANNER ================= */}
        {/* "ويمكنني اصدار شهادة لكل طالب بالاسم المسجل في المنصة ويكون تصميم الشهادة شيك جدا وفيه شعاري المرفوع وتوقيه باسمي وباسم المنصة" */}
        {currentUser.certificateIssued && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 text-white shadow-xl shadow-amber-600/25 border-2 border-yellow-300/80 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-black/25 backdrop-blur-sm flex items-center justify-center text-amber-200 shrink-0 text-xl shadow-inner">
                🎓
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-black text-xs sm:text-sm">
                    تهانينا يا {currentUser.name}! تم إصدار شهادة تفوق معتمدة لك 📜
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/30 text-amber-200 font-mono font-bold">
                    رقم: {currentUser.certificateIssued.serialNumber}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-amber-100 font-medium mt-0.5">
                  دورة: {currentUser.certificateIssued.courseTitle} | التقدير: {currentUser.certificateIssued.gradeText}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCertificateModal(true)}
              className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-amber-300 hover:text-amber-200 font-black text-xs border border-amber-400/60 shadow-lg shadow-black/40 transition flex items-center gap-2 cursor-pointer transform hover:scale-105"
            >
              <Award className="w-4 h-4 text-amber-400" />
              <span>عرض وطباعة شهادتي 🖨️</span>
            </button>
          </div>
        )}

        {/* WhatsApp & Telegram buttons on the left only ("شيل جملة الاستفسارات والمساعدة السريعة خلي المستطيلين الواتس والتليجرام بس عاليسار") */}
        <div className="flex items-center justify-end gap-2.5 sm:gap-3 w-full -mb-1">
          <a
            href={whatsappInquiryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition cursor-pointer hover:scale-[1.02] active:scale-95"
          >
            <MessageCircle className="w-4 h-4" />
            <span>الاستفسارات عبر الواتس 📱</span>
          </a>
          <a
            href={telegramInquiryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs shadow-md transition cursor-pointer hover:scale-[1.02] active:scale-95"
          >
            <Send className="w-4 h-4" />
            <span>الاستفسارات عبر التليجرام ✈️</span>
          </a>
        </div>

        {/* ================= 2-COLUMN PORTAL LAYOUT =================
            - On the Right (in RTL): Menu buttons strictly stacked vertically inside a full-height black box.
            - On the Left (in RTL): The actual content (courses as small rectangles, registration steps, contact cards).
        */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 flex-1 items-start">
          {/* ================= RIGHT COLUMN (in RTL): قائمة الخانات الـ 4 تحت بعض في مستطيل فخم بملء الشاشة بالعرض المريح ================= */}
          <div className={`lg:col-span-5 xl:col-span-4 order-1 lg:order-1 border-2 rounded-3xl p-3.5 sm:p-4.5 flex flex-col justify-start gap-3.5 shadow-2xl transition-colors ${
            isDarkMode
              ? 'bg-slate-950 border-slate-800/90 text-white'
              : 'bg-white border-slate-200 text-slate-900 shadow-xl'
          }`}>
            <div className="space-y-2.5">
              {/* الشعار مرفوع للأعلى وظاهر بحجم كبير وواضح وبلا أي مربع أزرق ("ارفع الشعار فوق شوية كمان وارفع قائمة المنصة الرئيسية فوق شوية كمان خليها ظاهرة للطلاب") */}
              <div className="flex flex-col items-center justify-center text-center -mt-1 sm:-mt-1.5 pb-0.5">
                {systemSettings.logoUrl ? (
                  <img
                    src={systemSettings.logoUrl}
                    alt="شعار منصة أقسام رعد"
                    className="w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48 object-contain drop-shadow-[0_12px_24px_rgba(37,99,235,0.35)] transition-transform duration-300 hover:scale-105"
                    loading="eager"
                    decoding="sync"
                  />
                ) : (
                  <BrandLogo
                    customLogoUrl={systemSettings.logoUrl}
                    size="xl"
                    primaryColor={activeTheme?.primary || '#2563eb'}
                  />
                )}
                <div className="mt-1 space-y-0.5">
                  <h3 className={`text-base sm:text-lg font-black tracking-wide ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                    منصة أقسام رعد ⚡
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold">
                    طريقك الأمثل لتحقيق الـ 100% في القدرات
                  </p>
                </div>
              </div>

              {/* Header: عنوان القائمة اليمينية */}
              <div className={`pb-2 border-b flex items-center justify-between ${
                isDarkMode ? 'border-slate-800/80 text-slate-300' : 'border-slate-200 text-slate-700'
              }`}>
                <span className="text-xs font-black flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>قائمة المنصة الرئيسية</span>
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  isDarkMode
                    ? 'text-slate-400 bg-slate-900 border-slate-800'
                    : 'text-slate-600 bg-slate-100 border-slate-200'
                }`}>
                  أقسام رعد
                </span>
              </div>

              {/* القائمة الرأسية - الخانات الـ 4 تحت بعض بالترتيب المحدد من المستخدم وبشكل عريض ومريح ومرفوع للأعلى */}
              <div className="flex flex-col gap-2.5">
                {/* 1. الكورسات المتفعلة (تتصدر القائمة دائماً) */}
                <button
                  type="button"
                  onClick={() => setActiveListView('paid')}
                  className={`w-full p-3 sm:p-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border-2 ${
                    activeListView === 'paid'
                      ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white border-emerald-400 shadow-xl shadow-emerald-600/30 ring-2 ring-emerald-500/30'
                      : isDarkMode
                      ? 'bg-slate-900/95 hover:bg-slate-800/90 text-slate-200 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      activeListView === 'paid'
                        ? 'bg-white/20 text-white'
                        : isDarkMode
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      <Award className="w-5 h-5" />
                    </div>
                    <div className="text-right space-y-0.5 min-w-0">
                      <span className={`block font-black text-xs sm:text-sm ${
                        activeListView === 'paid'
                          ? 'text-white'
                          : isDarkMode
                          ? 'text-slate-100'
                          : 'text-slate-900'
                      }`}>
                        الكورسات المتفعلة
                      </span>
                      <span className={`block text-[11px] font-medium leading-tight ${
                        activeListView === 'paid'
                          ? 'text-white/85'
                          : isDarkMode
                          ? 'text-slate-400'
                          : 'text-slate-500'
                      }`}>
                        دوراتك المفعلة وجاهزة للدخول الفوري
                      </span>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black shrink-0 mr-2 ${
                    activeListView === 'paid'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : isDarkMode
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {paidCourses.length}
                  </span>
                </button>

                {/* 2. الكورسات المتاحة */}
                <button
                  type="button"
                  onClick={() => setActiveListView('available')}
                  className={`w-full p-3 sm:p-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border-2 ${
                    activeListView === 'available'
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 text-white border-blue-400 shadow-xl shadow-blue-600/30 ring-2 ring-blue-500/30'
                      : isDarkMode
                      ? 'bg-slate-900/95 hover:bg-slate-800/90 text-slate-200 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      activeListView === 'available'
                        ? 'bg-white/20 text-white'
                        : isDarkMode
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="text-right space-y-0.5 min-w-0">
                      <span className={`block font-black text-xs sm:text-sm ${
                        activeListView === 'available'
                          ? 'text-white'
                          : isDarkMode
                          ? 'text-slate-100'
                          : 'text-slate-900'
                      }`}>
                        الكورسات المتاحة
                      </span>
                      <span className={`block text-[11px] font-medium leading-tight ${
                        activeListView === 'available'
                          ? 'text-white/85'
                          : isDarkMode
                          ? 'text-slate-400'
                          : 'text-slate-500'
                      }`}>
                        جميع الدورات المفتوحة والمدفوعة
                      </span>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black shrink-0 mr-2 ${
                    activeListView === 'available'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : isDarkMode
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {sortedCourses.length}
                  </span>
                </button>

                {/* 3. خطوات التسجيل */}
                <button
                  type="button"
                  onClick={() => setActiveListView('steps')}
                  className={`w-full p-3 sm:p-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border-2 ${
                    activeListView === 'steps'
                      ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white border-purple-400 shadow-xl shadow-purple-600/30 ring-2 ring-purple-500/30'
                      : isDarkMode
                      ? 'bg-slate-900/95 hover:bg-slate-800/90 text-slate-200 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      activeListView === 'steps'
                        ? 'bg-white/20 text-white'
                        : isDarkMode
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="text-right space-y-0.5 min-w-0">
                      <span className={`block font-black text-xs sm:text-sm ${
                        activeListView === 'steps'
                          ? 'text-white'
                          : isDarkMode
                          ? 'text-slate-100'
                          : 'text-slate-900'
                      }`}>
                        خطوات التسجيل والتفعيل
                      </span>
                      <span className={`block text-[11px] font-medium leading-tight ${
                        activeListView === 'steps'
                          ? 'text-white/85'
                          : isDarkMode
                          ? 'text-slate-400'
                          : 'text-slate-500'
                      }`}>
                        طريقة تفعيل المجاني والمدفوع
                      </span>
                    </div>
                  </div>
                  <ChevronLeft className={`w-5 h-5 transition-transform shrink-0 mr-2 ${
                    activeListView === 'steps'
                      ? '-translate-x-1 text-white'
                      : isDarkMode
                      ? 'text-slate-500'
                      : 'text-slate-400'
                  }`} />
                </button>

                {/* 4. تواصل معنا */}
                <button
                  type="button"
                  onClick={() => setActiveListView('contact')}
                  className={`w-full p-3 sm:p-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border-2 ${
                    activeListView === 'contact'
                      ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 text-white border-amber-400 shadow-xl shadow-amber-600/30 ring-2 ring-amber-500/30'
                      : isDarkMode
                      ? 'bg-slate-900/95 hover:bg-slate-800/90 text-slate-200 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      activeListView === 'contact'
                        ? 'bg-white/20 text-white'
                        : isDarkMode
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      <Phone className="w-5 h-5" />
                    </div>
                    <div className="text-right space-y-0.5 min-w-0">
                      <span className={`block font-black text-xs sm:text-sm ${
                        activeListView === 'contact'
                          ? 'text-white'
                          : isDarkMode
                          ? 'text-slate-100'
                          : 'text-slate-900'
                      }`}>
                        تواصل معنا
                      </span>
                      <span className={`block text-[11px] font-medium leading-tight ${
                        activeListView === 'contact'
                          ? 'text-white/85'
                          : isDarkMode
                          ? 'text-slate-400'
                          : 'text-slate-500'
                      }`}>
                        واتساب وتليجرام المشرف المباشر
                      </span>
                    </div>
                  </div>
                  <ChevronLeft className={`w-5 h-5 transition-transform shrink-0 mr-2 ${
                    activeListView === 'contact'
                      ? '-translate-x-1 text-white'
                      : isDarkMode
                      ? 'text-slate-500'
                      : 'text-slate-400'
                  }`} />
                </button>
              </div>
            </div>

            {/* Bottom info callout inside right container */}
            <div className={`p-2.5 rounded-xl border text-center space-y-0.5 ${
              isDarkMode
                ? 'bg-slate-900/90 border-slate-800 text-slate-300'
                : 'bg-slate-50 border-slate-200 text-slate-700 shadow-xs'
            }`}>
              <span className={`text-[11px] font-bold block ${
                isDarkMode ? 'text-slate-300' : 'text-slate-800'
              }`}>
                ⚡ منصة أقسام رعد للقدرات
              </span>
              <p className={`text-[10px] ${
                isDarkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                اختر أي قسم من القائمة أعلاه لعرض التفاصيل فوراً على اليسار.
              </p>
            </div>
          </div>

          {/* ================= LEFT COLUMN (in RTL): محتوى الخانة المختارة يعرض بالكامل على اليسار ================= */}
          <div className="lg:col-span-7 xl:col-span-8 order-2 lg:order-2 space-y-6">
            {/* ================= 1. محتوى: الكورسات المتفعلة (مستطيلات كبيرة وأنيقة بجانب بعضهما) ================= */}
            {activeListView === 'paid' && (
              <div className="space-y-4">
                {/* Title Bar */}
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-sm sm:text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                        الكورسات المتفعلة لديك ({paidCourses.length})
                      </h3>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>
                        الدورات المفعلة والمربوطة بحسابك؛ انقر على "دخول لمحتوى المنصة" للبدء الفوري
                      </p>
                    </div>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black">
                    متاحة للدخول ⚡
                  </span>
                </div>

                {paidCourses.length === 0 ? (
                  <div
                    className={`p-10 rounded-3xl border-2 text-center space-y-4 ${
                      isDarkMode ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600 shadow-sm'
                    }`}
                  >
                    <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                      <Lock className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5 max-w-md mx-auto">
                      <h4 className={`font-black text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        لم تقم بتفعيل أي كورس بعد
                      </h4>
                      <p className="text-xs leading-relaxed">
                        اختر أي كورس ترغب بدراسته من خانة "الكورسات المتاحة" واضغط على تفعيل الآن للبدء الفوري بدراسة المحاضرات والاختبارات!
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveListView('available')}
                      className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs sm:text-sm transition cursor-pointer shadow-lg shadow-blue-600/25"
                    >
                      تصفح الكورسات المتاحة الآن 📚
                    </button>
                  </div>
                ) : (
                  /* مستطيلات دورات عريضة وأنيقة بالصورة بنسبة العرض الصحيحة وزر دخول للمنصة */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-7">
                    {paidCourses.map((course) => (
                      <div
                        key={course.id}
                        className={`rounded-3xl p-5 sm:p-6 border-2 transition-all duration-200 flex flex-col justify-between gap-5 shadow-lg hover:shadow-2xl hover:-translate-y-1 ${
                          isDarkMode
                            ? 'bg-slate-900/90 border-emerald-500/40 hover:border-emerald-400'
                            : 'bg-white border-emerald-500/40 hover:border-emerald-500 shadow-sm'
                        }`}
                      >
                        {/* Course Thumbnail Image - Wide & Properly Proportioned 16:9 Aspect Ratio */}
                        <div className="w-full aspect-video rounded-2xl overflow-hidden bg-slate-800 border border-slate-700/80 shrink-0 relative group shadow-inner">
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
                              <Award className="w-16 h-16" />
                            </div>
                          )}

                          <span className="absolute top-3 right-3 px-3 py-1 rounded-xl bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 text-xs font-black backdrop-blur-sm shadow-md">
                            مفعل لديك ✓
                          </span>
                        </div>

                        {/* Title & Info */}
                        <div className="space-y-2 min-w-0 flex-1">
                          <h4 className={`text-base sm:text-lg md:text-xl font-black line-clamp-1 ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                            {course.title}
                          </h4>
                          {course.description && (
                            <p className="text-xs sm:text-sm text-slate-400 line-clamp-2 leading-relaxed">
                              {course.description}
                            </p>
                          )}
                        </div>

                        {/* زر دخول لمحتوى المنصة */}
                        <button
                          type="button"
                          onClick={() => onSelectCourse(course)}
                          className="w-full py-3.5 sm:py-4 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/25 transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Zap className="w-4 h-4" />
                          <span>دخول لمحتوى المنصة ⚡</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ================= 2. محتوى: الكورسات المتاحة (مستطيلات كبيرة وأنيقة بجانب بعضهما) ================= */}
            {activeListView === 'available' && (
              <div className="space-y-4">
                {/* Title Bar */}
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-sm sm:text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                        الكورسات المتاحة بالمنصة ({sortedCourses.length})
                      </h3>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>
                        استعرض جميع الدورات المتاحة؛ يمكنك تفعيل الدورات المفتوحة فوراً أو تفعيل الدورات المدفوعة
                      </p>
                    </div>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-black">
                    بوابة الكورسات 📚
                  </span>
                </div>

                {sortedCourses.length === 0 ? (
                  <div
                    className={`p-10 rounded-3xl border text-center space-y-2 ${
                      isDarkMode ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <BookOpen className="w-12 h-12 mx-auto text-slate-500 mb-2 opacity-50" />
                    <p className="font-bold text-sm">لا توجد كورسات مضافة حالياً</p>
                    <p className="text-xs">سيقوم المشرف بإضافة وتحديث الدورات التعليمية قريباً.</p>
                  </div>
                ) : (
                  /* مستطيلات دورات عريضة وأنيقة بالصورة بنسبة العرض الصحيحة بجانب بعضهما */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-7">
                    {sortedCourses.map((course, idx) => {
                      const isEnrolled = (currentUser.enrolledCourseIds || []).includes(course.id);

                      return (
                        <div
                          key={course.id}
                          onClick={() => setSelectedCourseId(course.id)}
                          className={`rounded-3xl p-5 sm:p-6 border-2 transition-all duration-200 flex flex-col justify-between gap-5 shadow-lg hover:shadow-2xl hover:-translate-y-1 ${
                            isEnrolled
                              ? isDarkMode
                                ? 'bg-slate-900/90 border-emerald-500/50 hover:border-emerald-400'
                                : 'bg-white border-emerald-500/50 hover:border-emerald-600'
                              : course.isLocked
                              ? isDarkMode
                                ? 'bg-slate-900/90 border-slate-800 hover:border-amber-500/50'
                                : 'bg-white border-slate-200 hover:border-amber-400 shadow-sm'
                              : isDarkMode
                              ? 'bg-slate-900/90 border-slate-800 hover:border-blue-500/50'
                              : 'bg-white border-slate-200 hover:border-blue-400 shadow-sm'
                          }`}
                        >
                          {/* Course Thumbnail Image - Wide & Properly Proportioned 16:9 Aspect Ratio */}
                          <div className="w-full aspect-video rounded-2xl overflow-hidden bg-slate-800 border border-slate-700/80 shrink-0 relative group shadow-inner">
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
                                <BookOpen className="w-16 h-16" />
                              </div>
                            )}

                            {/* Lock / Unlock Price Badge */}
                            <div
                              className={`absolute top-3 right-3 px-3 py-1 rounded-xl backdrop-blur-md text-xs font-black flex items-center gap-1.5 shadow-md ${
                                course.isLocked
                                  ? 'bg-amber-950/85 text-amber-300 border border-amber-500/40'
                                  : 'bg-emerald-950/85 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              {course.isLocked ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>{course.price || 'مدفوع'}</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>مجاني</span>
                                </>
                              )}
                            </div>

                            {isEnrolled && (
                              <span className="absolute bottom-3 right-3 px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black shadow-md">
                                مفعل لديك ✓
                              </span>
                            )}
                          </div>

                          {/* Course Info */}
                          <div className="space-y-2 min-w-0 flex-1">
                            <span className="text-xs font-black text-blue-400 block">دورة #{idx + 1}</span>
                            <h4 className={`text-base sm:text-lg md:text-xl font-black line-clamp-1 ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                              {course.title}
                            </h4>
                            {course.description && (
                              <p className="text-xs sm:text-sm text-slate-400 line-clamp-2 leading-relaxed">
                                {course.description}
                              </p>
                            )}
                          </div>

                          {/* Action Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleActivateClick(course);
                            }}
                            className={`w-full py-3.5 sm:py-4 px-4 rounded-2xl text-white font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
                              isEnrolled
                                ? 'bg-emerald-600 hover:bg-emerald-500'
                                : course.isLocked
                                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/25'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/25'
                            }`}
                          >
                            {isEnrolled ? (
                              <>
                                <Zap className="w-4 h-4" />
                                <span>دخول للمنصة 🚀</span>
                              </>
                            ) : course.isLocked ? (
                              <>
                                <Lock className="w-4 h-4" />
                                <span>تفعيل والدفع 💳</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                <span>تفعيل مجاني ✨</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ================= 3. محتوى: خطوات التسجيل والتفعيل على اليسار ================= */}
            {activeListView === 'steps' && (
              <div className="space-y-5">
                {/* Title Bar */}
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-sm sm:text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                        خطوات التسجيل والتفعيل داخل منصة أقسام رعد 📝
                      </h3>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>
                        دليل توضيحي شامل لطريقة تفعيل الكورس المجاني والكورس المدفوع
                      </p>
                    </div>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-black">
                    دليل الطالب 🎯
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* طريقة تفعيل الكورس المجاني */}
                  <div className={`p-5 sm:p-6 rounded-3xl border-2 space-y-4 shadow-xl ${
                    isDarkMode ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100' : 'bg-white border-emerald-400 shadow-sm text-slate-900'
                  }`}>
                    <div className="flex items-center gap-3 pb-3 border-b border-emerald-500/20">
                      <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-emerald-400">
                          1. طريقة تفعيل الكورس المجاني (المفتوح) ✨
                        </h4>
                        <p className="text-xs text-slate-400">بدء فوري وبدون أي رسوم مالية</p>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs sm:text-sm font-bold leading-relaxed">
                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs shrink-0 font-black mt-0.5">
                          1
                        </span>
                        <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                          اختر الكورس المجاني من قائمة <strong>"الكورسات المتاحة"</strong> على اليمين.
                        </p>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs shrink-0 font-black mt-0.5">
                          2
                        </span>
                        <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                          اضغط على زر <strong>"تفعيل مجاني ✨"</strong> في بطاقة الكورس.
                        </p>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs shrink-0 font-black mt-0.5">
                          3
                        </span>
                        <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                          يتم فتح محتوى الكورس بالكامل فوراً والبدء بمشاهدة الدروس والاختبارات التفاعلية بنظام نمر.
                        </p>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs shrink-0 font-black mt-0.5">
                          4
                        </span>
                        <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                          ستجد الكورس دائماً في خانة <strong>"الكورسات المتفعلة"</strong> لتتمكن من الدخول إليه في أي وقت.
                        </p>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveListView('available')}
                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition cursor-pointer shadow-md"
                      >
                        تصفح الكورسات المتاحة الآن 📚
                      </button>
                    </div>
                  </div>

                  {/* طريقة تفعيل الكورس المدفوع */}
                  <div className={`p-5 sm:p-6 rounded-3xl border-2 space-y-4 shadow-xl ${
                    isDarkMode ? 'bg-slate-900/95 border-amber-500/40 text-slate-100' : 'bg-white border-amber-400 shadow-sm text-slate-900'
                  }`}>
                    <div className="flex items-center gap-3 pb-3 border-b border-amber-500/20">
                      <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400">
                        <CreditCard className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-amber-400">
                          2. طريقة تفعيل الكورس المدفوع (VIP) 💳
                        </h4>
                        <p className="text-xs text-slate-400">خطوات التحويل وتأكيد التفعيل مع المشرف</p>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs sm:text-sm font-bold leading-relaxed">
                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs shrink-0 font-black mt-0.5">
                          1
                        </span>
                        <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                          اختر الكورس المطلوب واضغط على <strong>"تفعيل والدفع 💳"</strong> لعرض تفاصيل الرسوم.
                        </p>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs shrink-0 font-black mt-0.5">
                          2
                        </span>
                        <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                          اضغط على <strong>"الدفع الآن 💳"</strong> لمعاينة وتكبير صور الحساب البنكي والآيبان.
                        </p>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs shrink-0 font-black mt-0.5">
                          3
                        </span>
                        <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                          قم بالتحويل عبر تطبيق البنك واحفظ صورة إشعار التحويل البنكي على جهازك.
                        </p>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs shrink-0 font-black mt-0.5">
                          4
                        </span>
                        <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                          اضغط على زر <strong>"إرسال إشعار التحويل عبر الواتساب"</strong> أو <strong>"عبر التليجرام"</strong> لإرسال الإشعار للمشرف فوراً.
                        </p>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs shrink-0 font-black mt-0.5">
                          5
                        </span>
                        <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                          يقوم المشرف بمراجعة التحويل وتفعيل الكورس لحسابك فوراً لتجده في قائمة <strong>"الكورسات المتفعلة"</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveListView('available')}
                        className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs transition cursor-pointer shadow-md"
                      >
                        تصفح الكورسات والتفعيل الآن 💳
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================= 4. محتوى: تواصل معنا على اليسار (مستطيلين الواتساب والتليجرام) ================= */}
            {activeListView === 'contact' && (
              <div className="space-y-5">
                {/* Title Bar */}
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-sm sm:text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                        قنوات التواصل المباشرة مع المشرف 📞
                      </h3>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>
                        للاستفسار، المساعدة، وتأكيد تفعيل اشتراكات المنصة
                      </p>
                    </div>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-black">
                    دعم سريع ⚡
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* مستطيل الواتساب */}
                  <div className={`p-5 sm:p-6 rounded-3xl border-2 space-y-4 shadow-xl flex flex-col justify-between ${
                    isDarkMode ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100' : 'bg-white border-emerald-400 shadow-sm text-slate-900'
                  }`}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-3.5 rounded-2xl bg-emerald-500/20 text-emerald-400 shrink-0">
                          <MessageCircle className="w-7 h-7" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                            واتساب المشرف الرسمي
                          </span>
                          <h4 className="text-sm sm:text-base font-black truncate mt-1">
                            تواصل عبر تطبيق الواتساب
                          </h4>
                          <p className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">
                            +{whatsappNum}
                          </p>
                        </div>
                      </div>

                      <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        للمساعدة الفورية، الاستفسار عن المناهج، وتأكيد تفعيل الكورسات بعد التحويل البنكي.
                      </p>
                    </div>

                    <div className="space-y-2 pt-2">
                      <a
                        href={whatsappInquiryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/25 transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>فتح محادثة الواتساب الآن 📱</span>
                      </a>

                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          isDarkMode
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 text-emerald-500" />
                        <span>إرسال إشعار تحويل عبر الواتساب</span>
                      </a>
                    </div>
                  </div>

                  {/* مستطيل التليجرام */}
                  <div className={`p-5 sm:p-6 rounded-3xl border-2 space-y-4 shadow-xl flex flex-col justify-between ${
                    isDarkMode ? 'bg-slate-900/95 border-sky-500/40 text-slate-100' : 'bg-white border-sky-400 shadow-sm text-slate-900'
                  }`}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-3.5 rounded-2xl bg-sky-500/20 text-sky-400 shrink-0">
                          <Send className="w-7 h-7" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400">
                            تليجرام المشرف الرسمي
                          </span>
                          <h4 className="text-sm sm:text-base font-black truncate mt-1">
                            تواصل عبر تطبيق التليجرام
                          </h4>
                          <p className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">
                            @{cleanTelegram}
                          </p>
                        </div>
                      </div>

                      <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        للاستفسارات السريعة، إرسال إشعارات التحويل، ومتابعة آخر مستجدات وتحديثات المنصة.
                      </p>
                    </div>

                    <div className="space-y-2 pt-2">
                      <a
                        href={telegramInquiryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-sky-600/25 transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        <span>فتح محادثة التليجرام الآن ✈️</span>
                      </a>

                      <a
                        href={telegramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          isDarkMode
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 text-sky-400" />
                        <span>إرسال إشعار تحويل عبر التليجرام</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ================= FOOTER WITH THE 3 EXACT SENTENCES ================= */}
      {/* "واجعل لما الماوس يجي على الجملة اللي بتدخل قسم التحكم يكون عادي وطبيعي ولا يتحول كأنه زر واجعل الجملة اللتي تدخل لقسم التحكم يلزم الضغط على كلمة محفوظة 20 مرة" */}
      <footer
        className={`mt-auto py-6 px-6 md:px-12 border-t select-none transition-colors ${
          isDarkMode ? 'bg-slate-950 border-slate-800/80 text-slate-400' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        <div className="max-w-[1700px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs md:text-sm font-bold">
          {/* Sentence 1: ON THE RIGHT (عاليمين) */}
          <div className={`text-right w-full md:w-1/3 ${isDarkMode ? 'text-slate-300' : 'text-slate-800 font-bold'}`}>
            المصمم مازن محمد محروس
          </div>

          {/* Sentence 2: IN THE CENTER (فالنص - 20 clicks strictly on 'محفوظة' without pointer or hover effect) */}
          <div
            className={`text-center w-full md:w-1/3 cursor-default select-none py-1 ${
              isDarkMode ? 'text-slate-300' : 'text-slate-900 font-black'
            }`}
          >
            جميع محتويات المنصة <span onClick={handleSecretWordClick} className="cursor-default select-none">محفوظة</span> لمنصة أقسام رعد
          </div>

          {/* Sentence 3: ON THE LEFT (عاليسار) */}
          <div className="text-left w-full md:w-1/3 text-amber-500 font-black">
            منصة أقسام رعد تضمن لك المئوية بإذن الله
          </div>
        </div>
      </footer>

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

      {/* ================= MODAL: VIEW & PRINT OFFICIAL CERTIFICATE ================= */}
      {currentUser.certificateIssued && (
        <CertificateModal
          isOpen={showCertificateModal}
          onClose={() => setShowCertificateModal(false)}
          certificate={currentUser.certificateIssued}
          logoUrl={systemSettings.logoUrl}
          primaryColor={systemSettings.activeTheme?.primary || '#2563eb'}
        />
      )}
    </div>
  );
};

