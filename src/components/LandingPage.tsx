import React from 'react';
import {
  Sun,
  Moon,
  ArrowLeft,
  Video,
  FileCheck2,
  Cpu,
  FolderKanban,
} from 'lucide-react';
import { SystemSettings } from '../types';
import { BrandLogo } from './BrandLogo';
import { PlatformFooter } from './PlatformFooter';

interface LandingPageProps {
  systemSettings: SystemSettings;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onGoToLogin: () => void;
  onSecretTriggerAdmin: () => void;
}

/* ==================== Custom Expressive Illustrations for the 4 Tech Cards ==================== */

const FriendsChallengeIllustration: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
  <svg
    viewBox="0 0 320 150"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-full h-36 select-none"
    aria-hidden="true"
  >
    <rect
      x="12"
      y="14"
      width="296"
      height="122"
      rx="10"
      fill={isDarkMode ? '#0F172A' : '#F8FAFC'}
      stroke={isDarkMode ? '#1E293B' : '#E2E8F0'}
    />
    {/* Right Player Card */}
    <rect
      x="196"
      y="30"
      width="96"
      height="90"
      rx="8"
      fill={isDarkMode ? '#1E293B' : '#FFFFFF'}
      stroke="#10B981"
      strokeWidth="1.5"
    />
    <circle cx="244" cy="56" r="14" fill="#10B981" fillOpacity="0.18" stroke="#10B981" strokeWidth="1.5" />
    <circle cx="244" cy="53" r="5" fill="#10B981" />
    <path d="M234 66C236 61 252 61 254 66" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
    <rect x="218" y="79" width="52" height="7" rx="3.5" fill={isDarkMode ? '#334155' : '#E2E8F0'} />
    <text x="244" y="106" textAnchor="middle" fill="#10B981" fontSize="14" fontWeight="900">
      100%
    </text>

    {/* Left Player Card */}
    <rect
      x="28"
      y="30"
      width="96"
      height="90"
      rx="8"
      fill={isDarkMode ? '#1E293B' : '#FFFFFF'}
      stroke="#3B82F6"
      strokeWidth="1.5"
    />
    <circle cx="76" cy="56" r="14" fill="#3B82F6" fillOpacity="0.18" stroke="#3B82F6" strokeWidth="1.5" />
    <circle cx="76" cy="53" r="5" fill="#3B82F6" />
    <path d="M66 66C68 61 84 61 86 66" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
    <rect x="50" y="79" width="52" height="7" rx="3.5" fill={isDarkMode ? '#334155' : '#E2E8F0'} />
    <text x="76" y="106" textAnchor="middle" fill="#3B82F6" fontSize="14" fontWeight="900">
      95%
    </text>

    {/* Center Trophy & VS Medallion */}
    <circle
      cx="160"
      cy="75"
      r="24"
      fill={isDarkMode ? '#1E293B' : '#FFFBEB'}
      stroke="#F59E0B"
      strokeWidth="2"
    />
    {/* Trophy */}
    <path d="M150 64H170V72C170 77.5 165.5 82 160 82C154.5 82 150 77.5 150 72V64Z" fill="#F59E0B" />
    <path d="M150 66H145C145 71 147 74 150 74" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M170 66H175C175 71 173 74 170 74" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="157" y="82" width="6" height="5" fill="#D97706" />
    <rect x="152" y="87" width="16" height="3.5" rx="1.5" fill="#D97706" />
    {/* Connection lines */}
    <path d="M124 75H136" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="3 3" />
    <path d="M184 75H196" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="3 3" />
  </svg>
);

const DualExamSystemsIllustration: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
  <svg
    viewBox="0 0 320 150"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-full h-36 select-none"
    aria-hidden="true"
  >
    {/* Computer Frame */}
    <rect
      x="20"
      y="14"
      width="280"
      height="112"
      rx="10"
      fill={isDarkMode ? '#0F172A' : '#FFFFFF'}
      stroke={isDarkMode ? '#334155' : '#CBD5E1'}
      strokeWidth="2"
    />
    {/* Stand */}
    <rect x="142" y="126" width="36" height="8" fill={isDarkMode ? '#334155' : '#94A3B8'} />
    <rect x="120" y="134" width="80" height="5" rx="2.5" fill={isDarkMode ? '#475569' : '#64748B'} />

    {/* Right Half: Nimr Teal System (#00a59a) */}
    <rect x="163" y="22" width="129" height="96" rx="6" fill={isDarkMode ? '#0B2828' : '#F0FDFA'} stroke="#00A59A" strokeWidth="1.5" />
    <rect x="163" y="22" width="129" height="18" rx="4" fill="#00A59A" />
    <text x="227" y="34" textAnchor="middle" fill="#FFFFFF" fontSize="9.5" fontWeight="800">
      نظام نمر (قياس)
    </text>
    {/* Question Grid Tiles */}
    <rect x="172" y="48" width="16" height="14" rx="2" fill="#2E7D32" />
    <rect x="192" y="48" width="16" height="14" rx="2" fill="#2E7D32" />
    <rect x="212" y="48" width="16" height="14" rx="2" fill="#4A90E2" />
    <rect x="232" y="48" width="16" height="14" rx="2" fill="#FF5722" />
    <rect x="252" y="48" width="32" height="14" rx="2" fill={isDarkMode ? '#134E4A' : '#CCFBF1'} />
    <rect x="172" y="70" width="112" height="8" rx="3" fill={isDarkMode ? '#134E4A' : '#99F6E4'} />
    <rect x="172" y="84" width="90" height="8" rx="3" fill={isDarkMode ? '#115E59' : '#CCFBF1'} />
    <rect x="172" y="99" width="54" height="12" rx="3" fill="#00A59A" />

    {/* Left Half: Blue System (#005A8C) */}
    <rect x="28" y="22" width="129" height="96" rx="6" fill={isDarkMode ? '#0B1E33' : '#F0F9FF'} stroke="#005A8C" strokeWidth="1.5" />
    <rect x="28" y="22" width="129" height="18" rx="4" fill="#005A8C" />
    <text x="92" y="34" textAnchor="middle" fill="#FFFFFF" fontSize="9.5" fontWeight="800">
      النظام الأزرق المحوسب
    </text>
    <rect x="37" y="48" width="110" height="10" rx="3" fill="#4A148C" fillOpacity="0.22" />
    <circle cx="46" cy="70" r="4.5" stroke="#005A8C" strokeWidth="1.5" fill="#005A8C" />
    <rect x="56" y="66" width="84" height="7" rx="3" fill={isDarkMode ? '#1E3A5F' : '#BAE6FD'} />
    <circle cx="46" cy="86" r="4.5" stroke="#005A8C" strokeWidth="1.5" />
    <rect x="56" y="82" width="72" height="7" rx="3" fill={isDarkMode ? '#1E293B' : '#E2E8F0'} />
    <rect x="37" y="99" width="54" height="12" rx="3" fill="#005A8C" />
  </svg>
);

const LevelAssessmentIllustration: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
  <svg
    viewBox="0 0 320 150"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-full h-36 select-none"
    aria-hidden="true"
  >
    <rect
      x="14"
      y="14"
      width="292"
      height="122"
      rx="10"
      fill={isDarkMode ? '#0F172A' : '#F8FAFC'}
      stroke={isDarkMode ? '#1E293B' : '#E2E8F0'}
    />
    {/* Left Trajectory Chart */}
    <line x1="36" y1="112" x2="180" y2="112" stroke={isDarkMode ? '#334155' : '#CBD5E1'} strokeWidth="1.5" />
    <line x1="36" y1="34" x2="36" y2="112" stroke={isDarkMode ? '#334155' : '#CBD5E1'} strokeWidth="1.5" />
    <rect x="48" y="86" width="18" height="26" rx="3" fill="#3B82F6" fillOpacity="0.45" />
    <rect x="76" y="72" width="18" height="40" rx="3" fill="#3B82F6" fillOpacity="0.65" />
    <rect x="104" y="56" width="18" height="56" rx="3" fill="#10B981" fillOpacity="0.8" />
    <rect x="132" y="38" width="18" height="74" rx="3" fill="#10B981" />
    <path
      d="M57 82 L85 68 L113 52 L141 34 L168 28"
      stroke="#F59E0B"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="141" cy="34" r="4" fill="#F59E0B" />
    <circle cx="168" cy="28" r="4.5" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />

    {/* Right Circular Score Gauge */}
    <circle
      cx="244"
      cy="75"
      r="36"
      stroke={isDarkMode ? '#1E293B' : '#E2E8F0'}
      strokeWidth="8"
    />
    <circle
      cx="244"
      cy="75"
      r="36"
      stroke="#10B981"
      strokeWidth="8"
      strokeLinecap="round"
      strokeDasharray="226"
      strokeDashoffset="22"
      transform="rotate(-90 244 75)"
    />
    <text
      x="244"
      y="74"
      textAnchor="middle"
      fill={isDarkMode ? '#FFFFFF' : '#0F172A'}
      fontSize="17"
      fontWeight="900"
    >
      96%
    </text>
    <text
      x="244"
      y="90"
      textAnchor="middle"
      fill="#10B981"
      fontSize="9"
      fontWeight="800"
    >
      ممتاز
    </text>
  </svg>
);

const QuestionFoldersIllustration: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
  <svg
    viewBox="0 0 320 150"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-full h-36 select-none"
    aria-hidden="true"
  >
    <rect
      x="14"
      y="14"
      width="292"
      height="122"
      rx="10"
      fill={isDarkMode ? '#0F172A' : '#F8FAFC'}
      stroke={isDarkMode ? '#1E293B' : '#E2E8F0'}
    />
    {/* Folder 1: Custom Folder (Blue) */}
    <path
      d="M32 42C32 38.5 34.5 36 38 36H76L84 44H136C139.5 44 142 46.5 142 50V110C142 113.5 139.5 116 136 116H38C34.5 116 32 113.5 32 110V42Z"
      fill={isDarkMode ? '#1E3A8A' : '#DBEAFE'}
      stroke="#3B82F6"
      strokeWidth="1.5"
    />
    <rect x="44" y="60" width="84" height="12" rx="3" fill={isDarkMode ? '#1E293B' : '#FFFFFF'} />
    <rect x="44" y="78" width="64" height="8" rx="3" fill="#3B82F6" fillOpacity="0.65" />
    <text x="87" y="104" textAnchor="middle" fill={isDarkMode ? '#93C5FD' : '#1E40AF'} fontSize="10" fontWeight="800">
      مجلداتي الخاصة
    </text>

    {/* Folder 2: Mistakes Folder (Amber / Rose) */}
    <path
      d="M178 42C178 38.5 180.5 36 184 36H222L230 44H282C285.5 44 288 46.5 288 50V110C288 113.5 285.5 116 282 116H184C180.5 116 178 113.5 178 110V42Z"
      fill={isDarkMode ? '#451A03' : '#FEF3C7'}
      stroke="#F59E0B"
      strokeWidth="1.5"
    />
    <rect x="190" y="60" width="84" height="12" rx="3" fill={isDarkMode ? '#1E293B' : '#FFFFFF'} />
    <rect x="190" y="78" width="60" height="8" rx="3" fill="#F59E0B" fillOpacity="0.75" />
    <text x="233" y="104" textAnchor="middle" fill={isDarkMode ? '#FCD34D' : '#92400E'} fontSize="10" fontWeight="800">
      مجلد الأخطاء التراكمي
    </text>

    {/* Bookmark Connector Badge in Center */}
    <circle cx="160" cy="76" r="14" fill="#10B981" />
    <path d="M155 71H165V83L160 79.5L155 83V71Z" fill="#FFFFFF" />
  </svg>
);

export const LandingPage: React.FC<LandingPageProps> = ({
  systemSettings,
  isDarkMode,
  toggleDarkMode,
  onGoToLogin,
  onSecretTriggerAdmin,
}) => {
  const activeTheme = systemSettings.activeTheme;

  // Clean WhatsApp & Telegram contact links from cached/default settings (0 Firestore reads)
  const rawWhatsapp = systemSettings.whatsappNumber || '966500000000';
  const cleanWhatsapp = rawWhatsapp.replace(/[^0-9]/g, '') || '966500000000';
  const whatsappUrl = `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
    'السلام عليكم، أتواصل معكم بخصوص منصة أقسام رعد'
  )}`;

  const rawTelegram = systemSettings.telegramUsername || '@raad_aksam';
  const cleanTelegram = rawTelegram.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').trim() || 'raad_aksam';
  const telegramUrl = `https://t.me/${cleanTelegram}`;

  const excellenceBoxes = [
    {
      num: '01',
      title: 'شرح أقسام رعد',
      desc: 'شروحات تأسيسية مركزة تبسط القوانين وتكشف لك أسرع طرق الحل في القدرات.',
      icon: Video,
      accentClass: isDarkMode ? 'text-sky-400 bg-sky-500/10 border-sky-500/25' : 'text-sky-700 bg-sky-50 border-sky-200',
    },
    {
      num: '02',
      title: 'اختبار أقسام رعد',
      desc: 'اختبارات تفاعلية شاملة ومحدثة بتوقيت حقيقي وتصحيح فوري مع التوضيح.',
      icon: FileCheck2,
      accentClass: isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' : 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    {
      num: '03',
      title: 'نظام أقسام رعد',
      desc: 'أنظمة اختبار محاكية لبيئة الاختبار الفعلية تضمن جاهزيتك الكاملة بدون مفاجآت.',
      icon: Cpu,
      accentClass: isDarkMode ? 'text-amber-400 bg-amber-500/10 border-amber-500/25' : 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      num: '04',
      title: 'مجلدات أقسام رعد',
      desc: 'تجميع ذكي وتراكمي للأخطاء مع حفظ الأسئلة المهمة وتصديرها بصيغة PDF.',
      icon: FolderKanban,
      accentClass: isDarkMode ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25' : 'text-indigo-700 bg-indigo-50 border-indigo-200',
    },
  ];

  const techCards = [
    {
      num: '01',
      title: 'تحدي الأصدقاء',
      desc: 'نافس أصدقاءك في اختبارات مباشرة، قارن نتائجك وسرعتك، وعزّز حماسك للوصول إلى القمة.',
      illustration: <FriendsChallengeIllustration isDarkMode={isDarkMode} />,
    },
    {
      num: '02',
      title: 'الاختبار بالنظام الأزرق ونظام نمر',
      desc: 'تجربة محوسبة مطابقة لأنظمة الاختبار الرسمية بتصميم النظام الأزرق ونظام نمر مع مراجعة كاملة قبل التسليم.',
      illustration: <DualExamSystemsIllustration isDarkMode={isDarkMode} />,
    },
    {
      num: '03',
      title: 'تحديد مستوى الطالب',
      desc: 'تحليل فوري ودقيق لنسبتك ومستواك في كل قسم لترصد نقاط قوتك وترفع درجتك خطوة بخطوة.',
      illustration: <LevelAssessmentIllustration isDarkMode={isDarkMode} />,
    },
    {
      num: '04',
      title: 'مجلدات لحفظ الأسئلة',
      desc: 'مجلد أخطاء تراكمي ومجلدات مخصصة تحفظ فيها الأسئلة الصعبة وتعيد التدرب عليها أو تطبعها كملف PDF.',
      illustration: <QuestionFoldersIllustration isDarkMode={isDarkMode} />,
    },
  ];

  return (
    <div
      dir="rtl"
      className={`min-h-screen flex flex-col justify-between transition-colors ${
        isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* ================= TOP NAVIGATION BAR (Clean 3-Zone Contract) ================= */}
      <header
        className={`border-b backdrop-blur-md sticky top-0 z-40 ${
          isDarkMode
            ? 'bg-slate-950/90 border-slate-800/80 text-white'
            : 'bg-white/95 border-slate-200 text-slate-900'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <a
            href="#hero"
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0"
          >
            <BrandLogo
              customLogoUrl={systemSettings.logoUrl}
              size="sm"
              primaryColor={activeTheme?.primary || '#059669'}
            />
            <span className="text-base sm:text-lg font-black tracking-tight">
              منصة أقسام رعد
            </span>
          </a>

          {/* Zone 2: Clean Text Nav Links */}
          <nav
            className={`hidden md:flex items-center gap-6 text-sm font-bold ${
              isDarkMode ? 'text-slate-300' : 'text-slate-700'
            }`}
          >
            <a
              href="#hero"
              className="hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition"
            >
              الرئيسية
            </a>
            <a
              href="#excellence-100"
              className="hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition"
            >
              محور الـ 100%
            </a>
            <a
              href="#platform-tech"
              className="hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition"
            >
              تقنيات المنصة
            </a>
            <a
              href="#contact-us"
              className="hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition"
            >
              تواصل معنا
            </a>
          </nav>

          {/* Zone 3: Dark / Light Mode Switch */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleDarkMode}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-black transition cursor-pointer whitespace-nowrap shrink-0 ${
                isDarkMode
                  ? 'bg-slate-900 border-slate-800 text-amber-300 hover:bg-slate-800'
                  : 'bg-slate-100 border-slate-200 text-slate-900 hover:bg-slate-200'
              }`}
              title={isDarkMode ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الليلي'}
            >
              {isDarkMode ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
              <span>{isDarkMode ? 'الوضع الفاتح' : 'الوضع الليلي'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ================= 1. HERO SECTION ================= */}
        <section
          id="hero"
          className={`relative overflow-hidden border-b ${
            isDarkMode
              ? 'bg-gradient-to-b from-slate-950 via-slate-900/70 to-slate-950 border-slate-800/80'
              : 'bg-gradient-to-b from-white via-slate-50 to-white border-slate-200'
          }`}
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 lg:py-24 flex flex-col items-center text-center">
            {/* Large Prominent Uploaded Platform Logo */}
            <div
              className={`p-3 sm:p-4 rounded-2xl border shadow-xl mb-7 ${
                isDarkMode
                  ? 'bg-slate-900/90 border-slate-800 shadow-black/40'
                  : 'bg-white border-slate-200 shadow-slate-200/70'
              }`}
            >
              <BrandLogo
                customLogoUrl={systemSettings.logoUrl}
                size="3xl"
                primaryColor={activeTheme?.primary || '#059669'}
              />
            </div>

            {/* Bold Main Platform Headline */}
            <h1
              className={`text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-balance leading-tight ${
                isDarkMode ? 'text-white' : 'text-slate-950'
              }`}
            >
              منصة أقسام رعد
            </h1>

            <p
              className={`mt-4 max-w-2xl text-sm sm:text-base lg:text-lg leading-relaxed font-semibold ${
                isDarkMode ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              منظومة تعليمية وتدريبية متكاملة تجمع بين الشروحات الواضحة، الاختبارات المحاكية لأنظمة قياس، ومتابعة الأخطاء حتى الوصول إلى الدرجة الكاملة.
            </p>

            {/* Single Prominent Primary CTA Button */}
            <div className="mt-8 sm:mt-10">
              <button
                type="button"
                data-preserve-colors="true"
                onClick={onGoToLogin}
                className="inline-flex items-center justify-center gap-3 px-8 sm:px-10 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-base sm:text-lg shadow-xl shadow-emerald-600/25 transition cursor-pointer whitespace-nowrap"
              >
                <span>سجل دخولك للمنصة الآن</span>
                <ArrowLeft className="w-5 h-5 shrink-0" />
              </button>
            </div>
          </div>
        </section>

        {/* ================= 2. 100% EXCELLENCE SECTION (قسم التميز والـ 100%) ================= */}
        <section
          id="excellence-100"
          className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6 sm:pt-14 sm:pb-8"
        >
          <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
            <h2
              className={`text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-balance ${
                isDarkMode ? 'text-white' : 'text-slate-950'
              }`}
            >
              محور التميز والوصول إلى 100%
            </h2>
            <p
              className={`mt-2.5 text-sm sm:text-base font-medium ${
                isDarkMode ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              أربعة أركان مترابطة صُممت بعناية لتقودك بثبات نحو التقفيل التام
            </p>
          </div>

          {/* Hub Layout: 2 Boxes on Right + Central "100" Symbol + 2 Boxes on Left */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-center">
            {/* Right Side Boxes (01 & 02 in RTL) */}
            <div className="lg:col-span-4 space-y-5 order-2 lg:order-1">
              {excellenceBoxes.slice(0, 2).map((box) => {
                const IconComp = box.icon;
                return (
                  <div
                    key={box.num}
                    className={`p-5 sm:p-6 rounded-2xl border transition ${
                      isDarkMode
                        ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span
                        className={`text-xs font-mono font-black tabular-nums ${
                          isDarkMode ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {box.num}
                      </span>
                      <div className={`p-2.5 rounded-xl border ${box.accentClass}`}>
                        <IconComp className="w-5 h-5" />
                      </div>
                    </div>
                    <h3
                      className={`text-lg font-black mb-1.5 ${
                        isDarkMode ? 'text-white' : 'text-slate-950'
                      }`}
                    >
                      {box.title}
                    </h3>
                    <p
                      className={`text-xs sm:text-sm leading-relaxed ${
                        isDarkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {box.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Centerpiece: Prominent "100" Visual Hub */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center py-4 order-1 lg:order-2">
              <div
                className={`relative w-56 h-56 sm:w-64 sm:h-64 rounded-full border-2 flex items-center justify-center p-4 ${
                  isDarkMode
                    ? 'bg-slate-900/60 border-emerald-500/35 shadow-2xl shadow-emerald-950/50'
                    : 'bg-white border-emerald-500/40 shadow-xl shadow-emerald-100'
                }`}
              >
                {/* Inner Structural Ring */}
                <div
                  data-preserve-colors="true"
                  className="w-full h-full rounded-full bg-gradient-to-br from-emerald-600 via-teal-600 to-blue-700 flex flex-col items-center justify-center text-white text-center shadow-inner p-4"
                >
                  <div
                    className="text-6xl sm:text-7xl font-black tabular-nums tracking-tight leading-none"
                    dir="ltr"
                  >
                    100
                  </div>
                  <div className="mt-2 text-xs sm:text-sm font-black text-white/95">
                    هدفنا الدرجة الكاملة
                  </div>
                </div>
              </div>
            </div>

            {/* Left Side Boxes (03 & 04 in RTL) */}
            <div className="lg:col-span-4 space-y-5 order-3">
              {excellenceBoxes.slice(2, 4).map((box) => {
                const IconComp = box.icon;
                return (
                  <div
                    key={box.num}
                    className={`p-5 sm:p-6 rounded-2xl border transition ${
                      isDarkMode
                        ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span
                        className={`text-xs font-mono font-black tabular-nums ${
                          isDarkMode ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {box.num}
                      </span>
                      <div className={`p-2.5 rounded-xl border ${box.accentClass}`}>
                        <IconComp className="w-5 h-5" />
                      </div>
                    </div>
                    <h3
                      className={`text-lg font-black mb-1.5 ${
                        isDarkMode ? 'text-white' : 'text-slate-950'
                      }`}
                    >
                      {box.title}
                    </h3>
                    <p
                      className={`text-xs sm:text-sm leading-relaxed ${
                        isDarkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {box.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================= 3. PLATFORM TECHNOLOGIES SECTION (قسم تقنيات منصة أقسام رعد) ================= */}
        <section
          id="platform-tech"
          className={`border-y ${
            isDarkMode ? 'bg-slate-900/40 border-slate-800/80' : 'bg-white border-slate-200'
          }`}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:pt-10 sm:pb-14">
            <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
              <h2
                className={`text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-balance ${
                  isDarkMode ? 'text-white' : 'text-slate-950'
                }`}
              >
                تقنيات منصة أقسام رعد
              </h2>
              <p
                className={`mt-2.5 text-sm sm:text-base font-medium ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                أدوات متطورة تمنحك تجربة تدريب ومراجعة احترافية داخل المنصة
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
              {techCards.map((card) => (
                <article
                  key={card.num}
                  className={`rounded-2xl border p-5 sm:p-6 flex flex-col gap-4 transition ${
                    isDarkMode
                      ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="overflow-hidden rounded-xl">
                    {card.illustration}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        className={`text-lg sm:text-xl font-black ${
                          isDarkMode ? 'text-white' : 'text-slate-950'
                        }`}
                      >
                        {card.title}
                      </h3>
                      <span
                        className={`text-xs font-mono font-bold tabular-nums ${
                          isDarkMode ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        {card.num}
                      </span>
                    </div>
                    <p
                      className={`text-xs sm:text-sm leading-relaxed ${
                        isDarkMode ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {card.desc}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            {/* More Tech Callout + Discover CTA */}
            <div
              className={`mt-8 sm:mt-10 rounded-2xl border p-6 sm:p-7 text-center flex flex-col items-center justify-center gap-4 ${
                isDarkMode
                  ? 'bg-gradient-to-r from-blue-950/40 via-slate-900 to-sky-950/30 border-blue-500/25'
                  : 'bg-gradient-to-r from-blue-50/80 via-white to-sky-50/80 border-blue-200 shadow-xs'
              }`}
            >
              <p
                className={`text-base sm:text-xl font-black leading-relaxed ${
                  isDarkMode ? 'text-white' : 'text-slate-950'
                }`}
              >
                ودي لسة البداية.. المنصة فيها تقنيات أكثر وأكثر
              </p>
              <button
                type="button"
                data-preserve-colors="true"
                onClick={onGoToLogin}
                className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white font-black text-sm sm:text-base shadow-lg shadow-blue-600/25 transition transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
              >
                <span>اكتشف بنفسك</span>
                <ArrowLeft className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        </section>

        {/* ================= 4. CONTACT US SECTION (قسم تواصل معنا) ================= */}
        <section
          id="contact-us"
          className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20"
        >
          <div className="text-center max-w-xl mx-auto mb-8 sm:mb-10">
            <h2
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                isDarkMode ? 'text-white' : 'text-slate-950'
              }`}
            >
              تواصل معنا
            </h2>
            <p
              className={`mt-2 text-sm font-medium ${
                isDarkMode ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              تواصل مباشرة مع فريق منصة أقسام رعد لأي استفسار أو دعم فني
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Rectangle 1: WhatsApp */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-preserve-colors="true"
              className="group rounded-2xl p-6 sm:p-7 bg-[#128C7E] hover:bg-[#0F766E] text-white shadow-xl shadow-emerald-900/20 transition flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                  {/* Official WhatsApp Glyph */}
                  <svg viewBox="0 0 32 32" className="w-8 h-8 fill-white" aria-hidden="true">
                    <path d="M16 3C8.82 3 3 8.82 3 16c0 2.48.7 4.88 2.02 6.96L3.3 29l6.24-1.64A12.93 12.93 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.6c-2.06 0-4.08-.56-5.84-1.62l-.42-.25-3.7.97.99-3.6-.27-.44A10.56 10.56 0 0 1 5.4 16c0-5.85 4.75-10.6 10.6-10.6S26.6 10.15 26.6 16 21.85 26.6 16 26.6zm5.82-7.93c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.71.16-.21.32-.82 1.03-1 1.24-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.54-.71-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.08-1.11 2.64 0 1.56 1.14 3.07 1.3 3.28.16.21 2.24 3.42 5.42 4.79.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.88-.77 2.15-1.51.26-.74.26-1.38.18-1.51-.08-.13-.29-.21-.61-.37z" />
                  </svg>
                </div>
                <div className="text-right min-w-0">
                  <h3 className="text-lg sm:text-xl font-black text-white">
                    تواصل عبر واتساب
                  </h3>
                  <p className="text-xs sm:text-sm text-white/90 font-medium mt-0.5 truncate">
                    رد سريع للاستفسارات والاشتراكات
                  </p>
                </div>
              </div>
              <ArrowLeft className="w-5 h-5 text-white shrink-0 transition-transform group-hover:-translate-x-1" />
            </a>

            {/* Rectangle 2: Telegram */}
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-preserve-colors="true"
              className="group rounded-2xl p-6 sm:p-7 bg-[#0088CC] hover:bg-[#0073AD] text-white shadow-xl shadow-sky-900/20 transition flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                  {/* Official Telegram Glyph */}
                  <svg viewBox="0 0 32 32" className="w-8 h-8 fill-white" aria-hidden="true">
                    <path d="M27.7 5.2a1.4 1.4 0 0 0-1.46-.22L4.2 13.78a1.4 1.4 0 0 0 .06 2.62l5.6 1.87 2.1 6.72a1.2 1.2 0 0 0 2.02.48l3.15-3.22 5.95 4.41a1.4 1.4 0 0 0 2.2-.84l3.7-19.04a1.4 1.4 0 0 0-1.28-1.58zm-4.12 4.35-9.78 8.92a.8.8 0 0 0-.24.46l-.48 3.43-1.46-4.66 11.96-8.15z" />
                  </svg>
                </div>
                <div className="text-right min-w-0">
                  <h3 className="text-lg sm:text-xl font-black text-white">
                    تواصل عبر تليجرام
                  </h3>
                  <p className="text-xs sm:text-sm text-white/90 font-medium mt-0.5 truncate">
                    الدعم المباشر ومتابعة التحديثات
                  </p>
                </div>
              </div>
              <ArrowLeft className="w-5 h-5 text-white shrink-0 transition-transform group-hover:-translate-x-1" />
            </a>
          </div>
        </section>
      </main>

      {/* Existing Platform Footer (Preserves 20-Click Admin Trigger) */}
      <PlatformFooter
        isDarkMode={isDarkMode}
        onSecretTriggerAdmin={onSecretTriggerAdmin}
      />
    </div>
  );
};
