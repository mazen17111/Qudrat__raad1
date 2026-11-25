import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocsFromCache, query, where } from 'firebase/firestore';
import {
  Sun,
  Moon,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Cpu,
  FileText,
  Search,
  X,
  Play,
  Award,
} from 'lucide-react';
import { db } from '../firebase';
import {
  ContentItem,
  ExamAttempt,
  ExamSystemType,
  ResourceItem,
  SectionItem,
  StudentUser,
} from '../types';
import { getCachedExamAttempts } from '../utils/examAttemptsCache';
import {
  loadCachedContentItems,
  loadCachedResources,
  loadCachedSections,
} from '../utils/firestoreCache';

interface MyResultsQiyasModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: StudentUser;
  isDarkMode?: boolean;
  sections?: SectionItem[];
  resources?: ResourceItem[];
  contentItems?: ContentItem[];
  onSelectExam?: (exam: ContentItem) => void;
}

type ResultsOrderFilter = 'all' | 'newest' | 'oldest';

const CIRCLE_CIRCUMFERENCE = 264;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeArabicSearch(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove Arabic diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function isSameAttemptRecord(a: ExamAttempt, b: ExamAttempt): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  if (
    a.examId === b.examId &&
    a.score === b.score &&
    a.totalQuestions === b.totalQuestions &&
    a.createdAt &&
    b.createdAt
  ) {
    const diff = Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return diff < 5000;
  }
  return false;
}

function formatArabicDateTime(iso?: string): string {
  if (!iso) return 'غير محدد';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'غير محدد';
    return d.toLocaleString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'غير محدد';
  }
}

function formatDurationArabic(totalSeconds?: number): string {
  const secs = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (secs === 0) return 'أقل من ثانية';
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const remainingSecs = secs % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} س`);
  if (minutes > 0) parts.push(`${minutes} د`);
  if (remainingSecs > 0 || parts.length === 0) parts.push(`${remainingSecs} ث`);
  return parts.join(' و ');
}

function formatExamSystemArabic(examSystem?: ExamSystemType | string): string {
  if (examSystem === 'nimr') return 'نظام نمر المحوسب';
  if (examSystem === 'blue') return 'النظام الأزرق';
  if (examSystem === 'standard') return 'النظام الافتراضي للمنصة';
  return 'النظام الافتراضي للمنصة';
}

export const MyResultsQiyasModal: React.FC<MyResultsQiyasModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  sections: propsSections = [],
  resources: propsResources = [],
  contentItems: propsContentItems = [],
  onSelectExam,
}) => {
  const [attempts, setAttempts] = useState<ExamAttempt[]>(() =>
    getCachedExamAttempts(currentUser?.id)
  );
  const [activeSidebarTab, setActiveSidebarTab] = useState<'results' | 'exams'>('results');
  const [resultsOrderFilter, setResultsOrderFilter] = useState<ResultsOrderFilter>('all');
  const [expandedDetailsMap, setExpandedDetailsMap] = useState<Record<string, boolean>>({});
  const [qiyasDarkMode, setQiyasDarkMode] = useState<boolean>(false);

  // Filters inside "الاختبارات" tab
  const [examsSearchQuery, setExamsSearchQuery] = useState<string>('');
  const [examsSectionFilter, setExamsSectionFilter] = useState<string>('all');

  // Default to Light Mode when opening; student can toggle Light/Dark anytime inside the page
  useEffect(() => {
    if (isOpen) {
      setQiyasDarkMode(false);
      setActiveSidebarTab('results');
      setResultsOrderFilter('all');
      setExpandedDetailsMap({});
      setExamsSearchQuery('');
      setExamsSectionFilter('all');
    }
  }, [isOpen]);

  // Toggle html.qiyas-results-open class so outer theme-black rules don't override Qiyas UI & print stays clean
  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.classList.add('qiyas-results-open');
    return () => {
      document.documentElement.classList.remove('qiyas-results-open');
    };
  }, [isOpen]);

  // Load student's completed exam results strictly from local caches (0 network Firestore reads/writes)
  useEffect(() => {
    if (!isOpen || !currentUser?.id) return;
    let cancelled = false;

    const localStorageAttempts = getCachedExamAttempts(currentUser.id);
    if (localStorageAttempts.length > 0) {
      setAttempts(localStorageAttempts);
    }

    // Also inspect Firestore's local IndexedDB cache ONLY (getDocsFromCache = 0 network reads)
    (async () => {
      try {
        const snap = await getDocsFromCache(
          query(collection(db, 'exam_attempts'), where('userId', '==', currentUser.id))
        );
        if (cancelled) return;

        const merged: ExamAttempt[] = [...localStorageAttempts];
        snap.forEach((docSnap) => {
          const item = { id: docSnap.id, ...docSnap.data() } as ExamAttempt;
          if (!merged.some((existing) => isSameAttemptRecord(existing, item))) {
            merged.push(item);
          }
        });

        merged.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });

        if (merged.length > 0) {
          setAttempts(merged);
          return;
        }
      } catch {
        // IndexedDB cache miss on fresh browsers -> strictly 0 network reads
      }

      if (cancelled) return;

      if (
        localStorageAttempts.length === 0 &&
        (Number(currentUser.totalExamsTaken) || 0) > 0 &&
        typeof currentUser.averageScore === 'number'
      ) {
        const summaryAttempt: ExamAttempt = {
          id: 'cached_user_summary_score',
          userId: currentUser.id,
          studentName: currentUser.name || 'طالب',
          examId: 'cached_summary',
          examTitle: 'الملخص العام للاختبارات المكتملة',
          score: clampScore(currentUser.averageScore),
          totalQuestions: 100,
          percentage: clampScore(currentUser.averageScore),
          isTimed: false,
          durationSeconds: 0,
          createdAt: currentUser.lastLoginAt || new Date().toISOString(),
        };
        setAttempts([summaryAttempt]);
      } else if (localStorageAttempts.length === 0) {
        setAttempts([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    currentUser?.id,
    currentUser?.totalExamsTaken,
    currentUser?.averageScore,
    currentUser?.name,
    currentUser?.lastLoginAt,
  ]);

  // Combine passed props & locally cached catalog (0 Firestore reads) so all current & future sections (e.g. التخفيض, هواوي) appear in order
  const orderedResources = useMemo(() => {
    const cachedSections = loadCachedSections();
    const sectionOrderMap = new Map<string, number>();
    cachedSections.forEach((s) => sectionOrderMap.set(s.id, s.order ?? 0));
    propsSections.forEach((s) => sectionOrderMap.set(s.id, s.order ?? 0));

    const cachedResources = loadCachedResources();
    const source = propsResources.length > 0 ? propsResources : cachedResources;
    const deduped = new Map<string, ResourceItem>();
    const seenTitles = new Set<string>();
    source.forEach((r) => {
      const titleKey = normalizeArabicSearch(r.title || '');
      if (!deduped.has(r.id) && (!titleKey || !seenTitles.has(titleKey))) {
        deduped.set(r.id, r);
        if (titleKey) seenTitles.add(titleKey);
      }
    });

    return Array.from(deduped.values()).sort((a, b) => {
      const secOrderA = sectionOrderMap.get(a.sectionId) ?? 9999;
      const secOrderB = sectionOrderMap.get(b.sectionId) ?? 9999;
      if (secOrderA !== secOrderB) return secOrderA - secOrderB;

      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) return orderA - orderB;

      return (a.title || '').localeCompare(b.title || '', 'ar');
    });
  }, [propsSections, propsResources]);

  const resourceById = useMemo(() => {
    const map = new Map<string, ResourceItem>();
    loadCachedResources().forEach((r) => map.set(r.id, r));
    orderedResources.forEach((r) => map.set(r.id, r));
    return map;
  }, [orderedResources]);

  const allContentItems = useMemo(() => {
    const cached = loadCachedContentItems();
    const source = propsContentItems.length > 0 ? propsContentItems : cached;
    const map = new Map<string, ContentItem>();
    source.forEach((i) => map.set(i.id, i));

    const resOrderMap = new Map<string, number>();
    orderedResources.forEach((r, idx) => resOrderMap.set(r.id, idx));

    return Array.from(map.values()).sort((a, b) => {
      const resIdxA = resOrderMap.get(a.resourceId) ?? 9999;
      const resIdxB = resOrderMap.get(b.resourceId) ?? 9999;
      if (resIdxA !== resIdxB) return resIdxA - resIdxB;

      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (tA !== tB) return tA - tB;

      return (a.title || '').localeCompare(b.title || '', 'ar');
    });
  }, [propsContentItems, orderedResources]);

  // All available exams on the platform (existing + any future uploaded exams)
  const allPlatformExams = useMemo(() => {
    return allContentItems.filter((item) => item.type === 'exam');
  }, [allContentItems]);

  // Resolve resourceId & resourceTitle for each attempt using local catalog mappings
  const resolveAttemptResource = useMemo(() => {
    const itemById = new Map<string, ContentItem>();
    const examByTitle = new Map<string, ContentItem>();
    allContentItems.forEach((item) => {
      itemById.set(item.id, item);
      if (item.type === 'exam' && item.title) {
        const key = normalizeArabicSearch(item.title);
        if (!examByTitle.has(key)) examByTitle.set(key, item);
      }
    });

    return (att: ExamAttempt): { resourceId: string; resourceTitle: string } => {
      const matchedItem =
        itemById.get(att.examId) ||
        (att.examTitle ? examByTitle.get(normalizeArabicSearch(att.examTitle)) : undefined);

      if (matchedItem?.resourceId) {
        const res = resourceById.get(matchedItem.resourceId);
        return {
          resourceId: matchedItem.resourceId,
          resourceTitle: res?.title || '',
        };
      }

      if (att.examTitle) {
        const normalizedExamTitle = normalizeArabicSearch(att.examTitle);
        const fallbackResource = orderedResources.find((r) => {
          const t = normalizeArabicSearch(r.title || '');
          return t && (normalizedExamTitle === t || normalizedExamTitle.includes(t));
        });
        if (fallbackResource) {
          return {
            resourceId: fallbackResource.id,
            resourceTitle: fallbackResource.title,
          };
        }
      }

      return { resourceId: '', resourceTitle: '' };
    };
  }, [allContentItems, orderedResources, resourceById]);

  // Sort attempts by الكل / الأحدث / الأقدم
  const filteredAttempts = useMemo(() => {
    const sorted = [...attempts].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return resultsOrderFilter === 'oldest' ? timeA - timeB : timeB - timeA;
    });
    return sorted;
  }, [attempts, resultsOrderFilter]);

  // Stats map for "الاختبارات" tab: count & best score per exam (100% from local cached attempts)
  const examStatsByExamId = useMemo(() => {
    const map = new Map<string, { count: number; bestScore: number; lastAttemptAt?: string }>();
    attempts.forEach((att) => {
      const pct = clampScore(att.percentage);
      const key = att.examId;
      if (!key) return;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { count: 1, bestScore: pct, lastAttemptAt: att.createdAt });
      } else {
        map.set(key, {
          count: existing.count + 1,
          bestScore: Math.max(existing.bestScore, pct),
          lastAttemptAt: existing.lastAttemptAt || att.createdAt,
        });
      }
    });
    return map;
  }, [attempts]);

  // Filtered exams list inside "الاختبارات" tab
  const filteredPlatformExams = useMemo(() => {
    const q = normalizeArabicSearch(examsSearchQuery);
    return allPlatformExams.filter((exam) => {
      if (examsSectionFilter !== 'all' && exam.resourceId !== examsSectionFilter) {
        return false;
      }
      if (!q) return true;
      const examTitleNorm = normalizeArabicSearch(exam.title);
      const resTitleNorm = normalizeArabicSearch(resourceById.get(exam.resourceId)?.title || '');
      return examTitleNorm.includes(q) || resTitleNorm.includes(q);
    });
  }, [allPlatformExams, examsSectionFilter, examsSearchQuery, resourceById]);

  const toggleAttemptDetails = (attemptKey: string) => {
    setExpandedDetailsMap((prev) => ({
      ...prev,
      [attemptKey]: !prev[attemptKey],
    }));
  };

  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      data-qiyas-results="true"
      data-qiyas-dark={qiyasDarkMode ? 'true' : 'false'}
      className={`fixed inset-0 z-[70] flex flex-col md:flex-row font-sans overflow-y-auto transition-colors ${
        qiyasDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#f4f6f5] text-gray-800'
      }`}
    >
      {/* القائمة الجانبية الخضراء */}
      <aside
        data-preserve-colors="true"
        className={`w-full md:w-64 text-white flex flex-col shrink-0 ${
          qiyasDarkMode ? 'bg-[#004d28]' : 'bg-[#006837]'
        }`}
      >
        <div
          className={`p-5 md:p-6 text-2xl font-bold border-b text-white ${
            qiyasDarkMode ? 'border-[#003b1f]' : 'border-[#00552d]'
          }`}
        >
          رعد
        </div>
        <nav className="mt-2 md:mt-4 flex flex-col">
          {/* الخانة الجديدة: الاختبارات (فوق نتائجي) */}
          <button
            type="button"
            onClick={() => setActiveSidebarTab('exams')}
            className={`flex items-center gap-3 px-6 py-4 text-right font-semibold text-white cursor-pointer transition ${
              activeSidebarTab === 'exams'
                ? `border-r-4 border-white ${qiyasDarkMode ? 'bg-[#003b1f]' : 'bg-[#00552d]'}`
                : `border-r-4 border-transparent ${
                    qiyasDarkMode ? 'hover:bg-[#003b1f]/60' : 'hover:bg-[#00552d]/60'
                  }`
            }`}
          >
            <span>📝</span>
            <span>الاختبارات</span>
          </button>

          {/* خانة نتائجي (معدلة من اختباراتي) */}
          <button
            type="button"
            onClick={() => setActiveSidebarTab('results')}
            className={`flex items-center gap-3 px-6 py-4 text-right font-semibold text-white cursor-pointer transition ${
              activeSidebarTab === 'results'
                ? `border-r-4 border-white ${qiyasDarkMode ? 'bg-[#003b1f]' : 'bg-[#00552d]'}`
                : `border-r-4 border-transparent ${
                    qiyasDarkMode ? 'hover:bg-[#003b1f]/60' : 'hover:bg-[#00552d]/60'
                  }`
            }`}
          >
            <span>📋</span>
            <span>نتائجي</span>
          </button>
        </nav>
      </aside>

      {/* المحتوى الرئيسي */}
      <main
        className={`flex-1 p-5 sm:p-6 md:p-10 flex flex-col ${
          qiyasDarkMode ? 'bg-slate-950' : 'bg-[#f4f6f5]'
        }`}
      >
        {/* الشريط العلوي: زر التبديل بين الوضع الداكن والفاتح + زر الرجوع */}
        <div className="flex items-center justify-end gap-3 mb-6">
          <button
            type="button"
            onClick={() => setQiyasDarkMode((prev) => !prev)}
            title={qiyasDarkMode ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
            className={`flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-semibold shadow-sm transition cursor-pointer ${
              qiyasDarkMode
                ? 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          >
            {qiyasDarkMode ? (
              <>
                <Sun className="w-4 h-4 text-amber-300" />
                <span>الوضع الفاتح</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-gray-700" />
                <span>الوضع الداكن</span>
              </>
            )}
          </button>

          <button
            id="closeResultsBtn"
            type="button"
            onClick={onClose}
            className={`flex items-center gap-2 px-4 py-2 border rounded-md shadow-sm transition cursor-pointer font-semibold text-sm ${
              qiyasDarkMode
                ? 'bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>→</span>
            <span>الرجوع</span>
          </button>
        </div>

        {/* ==================== TAB 1: نتائجي ==================== */}
        {activeSidebarTab === 'results' ? (
          <div className="max-w-5xl w-full mx-auto">
            <h1
              className={`text-2xl font-bold mb-2 ${
                qiyasDarkMode ? 'text-white' : 'text-gray-900'
              }`}
            >
              الاستعلام عن نتائج الاختبارات
            </h1>
            <p
              className={`text-sm mb-6 ${
                qiyasDarkMode ? 'text-slate-400' : 'text-gray-600'
              }`}
            >
              خدمة إلكترونية تتيح لك الاطلاع على نتائج اختباراتك وتفاصيلها وترتيبها بسهولة.
            </p>

            {/* القائمة المنسدلة: الكل / الأحدث / الأقدم فقط */}
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-full max-w-xs">
                <select
                  id="examSelector"
                  value={resultsOrderFilter}
                  onChange={(e) => setResultsOrderFilter(e.target.value as ResultsOrderFilter)}
                  className={`w-full p-3 border rounded-md focus:outline-none cursor-pointer font-semibold text-sm ${
                    qiyasDarkMode
                      ? 'bg-slate-900 border-slate-700 text-slate-100 focus:border-green-500'
                      : 'bg-white border-gray-400 text-gray-800 focus:border-[#006837]'
                  }`}
                >
                  <option value="all">الكل</option>
                  <option value="newest">الأحدث</option>
                  <option value="oldest">الأقدم</option>
                </select>
              </div>

              <div
                className={`text-xs font-semibold px-3 py-2.5 rounded-md border w-fit ${
                  qiyasDarkMode
                    ? 'bg-slate-900 border-slate-800 text-slate-300'
                    : 'bg-white border-gray-200 text-gray-600'
                }`}
              >
                {resultsOrderFilter === 'newest'
                  ? `عرض النتائج من الأحدث: ${filteredAttempts.length}`
                  : resultsOrderFilter === 'oldest'
                  ? `عرض النتائج من الأقدم: ${filteredAttempts.length}`
                  : `إجمالي النتائج المعروضة: ${filteredAttempts.length}`}
              </div>
            </div>

            {/* شبكة بطاقات النتائج */}
            {filteredAttempts.length === 0 ? (
              <div
                className={`rounded-xl border shadow-sm p-8 max-w-sm text-center ${
                  qiyasDarkMode
                    ? 'bg-slate-900 border-slate-800 text-slate-200'
                    : 'bg-white border-gray-200 text-gray-800'
                }`}
              >
                <div className="relative w-36 h-36 mx-auto mb-5 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      stroke={qiyasDarkMode ? '#334155' : '#e5e7eb'}
                      strokeWidth="8"
                      fill="none"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                    <span
                      className={`text-2xl font-extrabold ${
                        qiyasDarkMode ? 'text-slate-300' : 'text-gray-700'
                      }`}
                    >
                      --
                    </span>
                    <span
                      className={`text-[11px] font-bold mt-1 ${
                        qiyasDarkMode ? 'text-slate-400' : 'text-gray-500'
                      }`}
                    >
                      باقي ما اختبرت
                    </span>
                  </div>
                </div>
                <p
                  className={`text-sm font-semibold leading-relaxed ${
                    qiyasDarkMode ? 'text-slate-300' : 'text-gray-600'
                  }`}
                >
                  باقي ما اختبرت أي اختبار بعد — عند إتمام أي اختبار ستظهر نتيجته هنا تلقائياً.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
                {filteredAttempts.map((att, idx) => {
                  const attemptKey = att.id || `attempt_${idx}`;
                  const scorePercent = clampScore(att.percentage);
                  const strokeDashoffset =
                    CIRCLE_CIRCUMFERENCE - (CIRCLE_CIRCUMFERENCE * scorePercent) / 100;
                  const totalQ = Math.max(0, Number(att.totalQuestions) || 0);
                  const correctCount = Math.max(0, Number(att.score) || 0);
                  const wrongCount = Math.max(0, totalQ - correctCount);
                  const { resourceTitle } = resolveAttemptResource(att);
                  const isDetailsOpen = Boolean(expandedDetailsMap[attemptKey]);

                  return (
                    <div
                      key={attemptKey}
                      className={`rounded-xl border shadow-sm p-6 relative transition ${
                        qiyasDarkMode
                          ? 'bg-slate-900 border-slate-800 text-slate-100'
                          : 'bg-white border-gray-200 text-gray-800'
                      }`}
                    >
                      {/* زر الطباعة */}
                      <button
                        type="button"
                        onClick={() => window.print()}
                        title="طباعة النتيجة"
                        className={`absolute top-5 left-5 p-2 border rounded-lg cursor-pointer transition ${
                          qiyasDarkMode
                            ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        🖨️
                      </button>

                      <div className="pl-11 mb-5 text-right">
                        <h2
                          className={`font-bold text-sm sm:text-base leading-snug line-clamp-2 ${
                            qiyasDarkMode ? 'text-white' : 'text-gray-800'
                          }`}
                        >
                          {att.examTitle || `اختبار ${idx + 1}`}
                        </h2>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[11px] font-semibold ${
                              qiyasDarkMode ? 'text-slate-400' : 'text-gray-500'
                            }`}
                          >
                            تفاصيل النتيجة
                          </span>
                          {resourceTitle && (
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                qiyasDarkMode
                                  ? 'bg-green-950/60 border-green-700/50 text-green-400'
                                  : 'bg-green-50 border-green-200 text-[#16a34a]'
                              }`}
                            >
                              {resourceTitle}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* دائرة الدرجة الكلية */}
                      <div className="relative w-44 h-44 mx-auto mb-6 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            stroke={qiyasDarkMode ? '#334155' : '#e5e7eb'}
                            strokeWidth="8"
                            fill="none"
                          />
                          <circle
                            id={idx === 0 ? 'scoreCircle' : undefined}
                            cx="50"
                            cy="50"
                            r="42"
                            stroke={qiyasDarkMode ? '#22c55e' : '#16a34a'}
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={CIRCLE_CIRCUMFERENCE}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                          />
                        </svg>

                        {/* علامة الصح الخضراء أعلى الدائرة */}
                        <div
                          data-preserve-colors="true"
                          className="absolute -top-1 bg-[#16a34a] text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow"
                        >
                          ✓
                        </div>

                        {/* الرقم والنص داخل الدائرة */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span
                            id={idx === 0 ? 'scoreValue' : undefined}
                            className={`text-3xl font-extrabold tabular-nums ${
                              qiyasDarkMode ? 'text-white' : 'text-gray-900'
                            }`}
                          >
                            {scorePercent}
                          </span>
                          <span
                            className={`text-xs font-semibold mt-1 ${
                              qiyasDarkMode ? 'text-slate-300' : 'text-gray-600'
                            }`}
                          >
                            الدرجة<br />الكلية
                          </span>
                        </div>
                      </div>

                      {/* زر تفاصيل الاختبار */}
                      <button
                        type="button"
                        onClick={() => toggleAttemptDetails(attemptKey)}
                        className={`w-full py-2.5 px-4 border rounded-lg font-semibold text-sm transition flex items-center justify-center gap-2 cursor-pointer ${
                          qiyasDarkMode
                            ? 'border-green-500/60 text-green-400 hover:bg-green-950/50'
                            : 'border-[#16a34a] text-[#16a34a] hover:bg-green-50'
                        }`}
                      >
                        <FileText
                          className={`w-4 h-4 shrink-0 ${
                            qiyasDarkMode ? 'text-green-400' : 'text-[#16a34a]'
                          }`}
                        />
                        <span className={qiyasDarkMode ? 'text-green-400' : 'text-[#16a34a]'}>
                          {isDetailsOpen ? 'إخفاء تفاصيل الاختبار' : 'تفاصيل الاختبار'}
                        </span>
                      </button>

                      {/* التفاصيل الكاملة للاختبار (الوقت المستغرق، الصح والخطأ، الموعد، النظام المختار) */}
                      {isDetailsOpen && (
                        <div
                          className={`mt-4 p-3.5 rounded-lg border space-y-2.5 text-xs ${
                            qiyasDarkMode
                              ? 'bg-slate-950/70 border-slate-800 text-slate-200'
                              : 'bg-[#f4f6f5] border-gray-200 text-gray-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`flex items-center gap-1.5 font-semibold ${
                                qiyasDarkMode ? 'text-slate-400' : 'text-gray-600'
                              }`}
                            >
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>الوقت المستغرق:</span>
                            </span>
                            <span className="font-bold tabular-nums">
                              {formatDurationArabic(att.durationSeconds)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`flex items-center gap-1.5 font-semibold ${
                                qiyasDarkMode ? 'text-slate-400' : 'text-gray-600'
                              }`}
                            >
                              <CheckCircle2
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  qiyasDarkMode ? 'text-emerald-400' : 'text-[#16a34a]'
                                }`}
                              />
                              <span>الإجابات الصحيحة:</span>
                            </span>
                            <span
                              className={`font-bold tabular-nums ${
                                qiyasDarkMode ? 'text-emerald-400' : 'text-[#16a34a]'
                              }`}
                            >
                              {correctCount} {totalQ > 0 ? `من ${totalQ}` : ''}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`flex items-center gap-1.5 font-semibold ${
                                qiyasDarkMode ? 'text-slate-400' : 'text-gray-600'
                              }`}
                            >
                              <XCircle
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  qiyasDarkMode ? 'text-rose-400' : 'text-rose-600'
                                }`}
                              />
                              <span>الإجابات الخاطئة:</span>
                            </span>
                            <span
                              className={`font-bold tabular-nums ${
                                qiyasDarkMode ? 'text-rose-400' : 'text-rose-600'
                              }`}
                            >
                              {wrongCount}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`flex items-center gap-1.5 font-semibold ${
                                qiyasDarkMode ? 'text-slate-400' : 'text-gray-600'
                              }`}
                            >
                              <Calendar className="w-3.5 h-3.5 shrink-0" />
                              <span>موعد الاختبار:</span>
                            </span>
                            <span className="font-bold text-left">
                              {formatArabicDateTime(att.createdAt)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`flex items-center gap-1.5 font-semibold ${
                                qiyasDarkMode ? 'text-slate-400' : 'text-gray-600'
                              }`}
                            >
                              <Cpu className="w-3.5 h-3.5 shrink-0" />
                              <span>النظام المختار:</span>
                            </span>
                            <span
                              className={`font-bold ${
                                qiyasDarkMode ? 'text-sky-400' : 'text-blue-700'
                              }`}
                            >
                              {formatExamSystemArabic(att.examSystem)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ==================== TAB 2: الاختبارات (جميع الاختبارات المتاحة على المنصة) ==================== */
          <div className="max-w-5xl w-full mx-auto">
            <h1
              className={`text-2xl font-bold mb-2 ${
                qiyasDarkMode ? 'text-white' : 'text-gray-900'
              }`}
            >
              الاختبارات المتاحة على المنصة
            </h1>
            <p
              className={`text-sm mb-6 ${
                qiyasDarkMode ? 'text-slate-400' : 'text-gray-600'
              }`}
            >
              جميع الاختبارات المتاحة حالياً وأي اختبارات جديدة تُضاف مستقبلاً، مرتبة حسب أقسام المنصة.
            </p>

            {/* شريط البحث والفلترة بالأقسام داخل تبويب الاختبارات */}
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative w-full sm:max-w-xs">
                <Search
                  className={`w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                    qiyasDarkMode ? 'text-slate-400' : 'text-gray-500'
                  }`}
                />
                <input
                  type="text"
                  value={examsSearchQuery}
                  onChange={(e) => setExamsSearchQuery(e.target.value)}
                  placeholder="ابحث عن اسم اختبار أو قسم..."
                  className={`w-full pr-9 pl-8 py-2.5 border rounded-md text-sm font-semibold focus:outline-none ${
                    qiyasDarkMode
                      ? 'bg-slate-900 border-slate-700 text-slate-100 focus:border-green-500'
                      : 'bg-white border-gray-400 text-gray-800 focus:border-[#006837]'
                  }`}
                />
                {examsSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setExamsSearchQuery('')}
                    className={`absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer ${
                      qiyasDarkMode ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="w-full sm:max-w-xs">
                <select
                  value={examsSectionFilter}
                  onChange={(e) => setExamsSectionFilter(e.target.value)}
                  className={`w-full p-2.5 border rounded-md text-sm font-semibold focus:outline-none cursor-pointer ${
                    qiyasDarkMode
                      ? 'bg-slate-900 border-slate-700 text-slate-100 focus:border-green-500'
                      : 'bg-white border-gray-400 text-gray-800 focus:border-[#006837]'
                  }`}
                >
                  <option value="all">جميع الأقسام ({allPlatformExams.length})</option>
                  {orderedResources.map((res) => (
                    <option key={res.id} value={res.id}>
                      {res.title}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className={`text-xs font-semibold px-3 py-2.5 rounded-md border w-fit ${
                  qiyasDarkMode
                    ? 'bg-slate-900 border-slate-800 text-slate-300'
                    : 'bg-white border-gray-200 text-gray-600'
                }`}
              >
                الاختبارات المعروضة: {filteredPlatformExams.length}
              </div>
            </div>

            {filteredPlatformExams.length === 0 ? (
              <div
                className={`rounded-xl border shadow-sm p-8 max-w-md text-center ${
                  qiyasDarkMode
                    ? 'bg-slate-900 border-slate-800 text-slate-300'
                    : 'bg-white border-gray-200 text-gray-600'
                }`}
              >
                <p className="text-sm font-semibold">
                  لا توجد اختبارات مطابقة للبحث أو القسم المحدد حالياً.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredPlatformExams.map((exam) => {
                  const parentTitle = resourceById.get(exam.resourceId)?.title || '';
                  const qCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
                  const examStats = examStatsByExamId.get(exam.id);

                  return (
                    <div
                      key={exam.id}
                      className={`rounded-xl border shadow-sm p-5 flex flex-col justify-between gap-4 transition ${
                        qiyasDarkMode
                          ? 'bg-slate-900 border-slate-800 text-slate-100'
                          : 'bg-white border-gray-200 text-gray-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h2
                            className={`font-bold text-sm sm:text-base leading-snug line-clamp-2 ${
                              qiyasDarkMode ? 'text-white' : 'text-gray-900'
                            }`}
                          >
                            {exam.title}
                          </h2>
                          {examStats ? (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                                qiyasDarkMode
                                  ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-400'
                                  : 'bg-green-50 border-green-200 text-[#16a34a]'
                              }`}
                            >
                              تم الحل
                            </span>
                          ) : (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                                qiyasDarkMode
                                  ? 'bg-slate-800 border-slate-700 text-slate-300'
                                  : 'bg-gray-100 border-gray-200 text-gray-600'
                              }`}
                            >
                              متاح للحل
                            </span>
                          )}
                        </div>

                        {parentTitle && (
                          <div className="mb-3">
                            <span
                              className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                                qiyasDarkMode
                                  ? 'bg-green-950/50 border-green-700/50 text-green-400'
                                  : 'bg-green-50 border-green-200 text-[#006837]'
                              }`}
                            >
                              {parentTitle}
                            </span>
                          </div>
                        )}

                        <div
                          className={`text-xs space-y-1.5 ${
                            qiyasDarkMode ? 'text-slate-400' : 'text-gray-600'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>عدد الأسئلة:</span>
                            <span className="font-bold tabular-nums">
                              {exam.isExternal ? 'اختبار خارجي' : qCount > 0 ? `${qCount} سؤال` : 'متاح'}
                            </span>
                          </div>
                          {exam.durationMinutes ? (
                            <div className="flex items-center justify-between">
                              <span>المدة المحددة:</span>
                              <span className="font-bold tabular-nums">
                                {exam.durationMinutes} دقيقة
                              </span>
                            </div>
                          ) : null}
                          {examStats && (
                            <div className="flex items-center justify-between pt-1">
                              <span className="flex items-center gap-1">
                                <Award
                                  className={`w-3.5 h-3.5 ${
                                    qiyasDarkMode ? 'text-emerald-400' : 'text-[#16a34a]'
                                  }`}
                                />
                                <span>أفضل درجة:</span>
                              </span>
                              <span
                                className={`font-extrabold tabular-nums ${
                                  qiyasDarkMode ? 'text-emerald-400' : 'text-[#16a34a]'
                                }`}
                              >
                                {examStats.bestScore}% ({examStats.count} محاولة)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectExam) {
                            onSelectExam(exam);
                          } else if (exam.isExternal && exam.url) {
                            window.open(exam.url, '_blank');
                          }
                        }}
                        className={`w-full py-2.5 px-4 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer text-white ${
                          qiyasDarkMode
                            ? 'bg-[#16a34a] hover:bg-[#15803d]'
                            : 'bg-[#006837] hover:bg-[#00552d]'
                        }`}
                        data-preserve-colors="true"
                      >
                        <Play className="w-4 h-4 shrink-0" />
                        <span>{examStats ? 'إعادة الاختبار' : 'ابدأ الاختبار'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
