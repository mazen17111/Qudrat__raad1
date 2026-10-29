import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
  Award,
  PlayCircle,
  CheckCircle2,
  BarChart3,
  Calendar,
  Clock,
  Video,
  FileQuestion,
  XCircle,
  Sparkles,
  Play,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { StudentUser, ExamAttempt, ContentItem, SectionItem, ResourceItem } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: StudentUser;
  isDarkMode?: boolean;
  items?: ContentItem[];
  sections?: SectionItem[];
  resources?: ResourceItem[];
  watchedVideoIds?: string[];
  onSelectVideo?: (videoItem: ContentItem) => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  isDarkMode = true,
  items: propsItems,
  sections: propsSections = [],
  resources: propsResources = [],
  watchedVideoIds: propsWatchedVideoIds,
  onSelectVideo,
}) => {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [dbItems, setDbItems] = useState<ContentItem[]>([]);
  const [activeTab, setActiveTab] = useState<'videos' | 'exams'>('videos');

  // Real-time listener for student exam attempts
  useEffect(() => {
    if (!isOpen || !currentUser) return;
    setLoadingAttempts(true);

    try {
      const q = query(
        collection(db, 'exam_attempts'),
        where('userId', '==', currentUser.id)
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list: ExamAttempt[] = [];
          snap.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as ExamAttempt);
          });
          // Sort strictly by createdAt descending (most recent first)
          list.sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeB - timeA;
          });
          setAttempts(list);
          setLoadingAttempts(false);
        },
        (err) => {
          console.error('Error fetching exam attempts:', err);
          setLoadingAttempts(false);
        }
      );

      return () => unsub();
    } catch (err) {
      console.error(err);
      setLoadingAttempts(false);
    }
  }, [isOpen, currentUser]);

  // Fallback to fetch content items from Firestore if not provided via props
  useEffect(() => {
    if (!isOpen) return;
    if (propsItems && propsItems.length > 0) return;

    const fetchItems = async () => {
      try {
        const snap = await getDocs(collection(db, 'content_items'));
        const list: ContentItem[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ContentItem));
        setDbItems(list);
      } catch (e) {
        console.error('Error fetching items for stats:', e);
      }
    };
    fetchItems();
  }, [isOpen, propsItems]);

  const allItems = useMemo(() => {
    return (propsItems && propsItems.length > 0 ? propsItems : dbItems) || [];
  }, [propsItems, dbItems]);

  // Effective watched video IDs
  const effectiveWatchedVideoIds = useMemo(() => {
    if (propsWatchedVideoIds && propsWatchedVideoIds.length > 0) {
      return propsWatchedVideoIds;
    }
    return currentUser.watchedVideoIds || [];
  }, [propsWatchedVideoIds, currentUser.watchedVideoIds]);

  // 1. Video Statistics Calculation
  const allVideos = useMemo(() => {
    return allItems.filter((i) => i.type === 'video');
  }, [allItems]);

  const totalVideosCount = allVideos.length;
  const watchedVideosCount = effectiveWatchedVideoIds.length;
  const videoProgressPercent =
    totalVideosCount > 0 ? Math.min(100, Math.round((watchedVideosCount / totalVideosCount) * 100)) : 0;

  // List of watched videos details
  const watchedVideosList = useMemo(() => {
    return effectiveWatchedVideoIds.map((vId) => {
      const foundItem = allVideos.find((v) => v.id === vId) || allItems.find((i) => i.id === vId);
      const resObj = foundItem ? propsResources.find((r) => r.id === foundItem.resourceId) : null;
      const secObj = resObj ? propsSections.find((s) => s.id === resObj.sectionId) : null;

      return {
        id: vId,
        title: foundItem?.title || `فيديو تعليمي #${vId.slice(0, 8)}`,
        durationMinutes: foundItem?.durationMinutes,
        description: foundItem?.description,
        resourceTitle: resObj?.title,
        sectionTitle: secObj?.title,
        item: foundItem,
      };
    });
  }, [effectiveWatchedVideoIds, allVideos, allItems, propsResources, propsSections]);

  // 2. Exam Statistics Calculation
  const allExams = useMemo(() => {
    return allItems.filter((i) => i.type === 'exam');
  }, [allItems]);

  // Unique exams that this student has solved
  const uniqueSolvedExamIds = useMemo(() => {
    return Array.from(new Set(attempts.map((a) => a.examId).filter(Boolean)));
  }, [attempts]);

  const totalExamsCount = Math.max(allExams.length, uniqueSolvedExamIds.length);
  const solvedExamsCount = uniqueSolvedExamIds.length;
  const examProgressPercent =
    totalExamsCount > 0 ? Math.min(100, Math.round((solvedExamsCount / totalExamsCount) * 100)) : 0;

  // Average score calculation
  const averageScore = useMemo(() => {
    if (attempts.length === 0) return 0;
    const sum = attempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
    return Math.round(sum / attempts.length);
  }, [attempts]);

  // Total correct vs wrong answers across all attempts
  const totalCorrectAnswers = useMemo(() => {
    return attempts.reduce((acc, curr) => acc + (curr.score || 0), 0);
  }, [attempts]);

  const totalWrongAnswers = useMemo(() => {
    return attempts.reduce(
      (acc, curr) => acc + Math.max(0, (curr.totalQuestions || 0) - (curr.score || 0)),
      0
    );
  }, [attempts]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-md animate-in fade-in duration-200 ${
        isDarkMode ? 'bg-black/80' : 'bg-black/60'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl shadow-2xl border overflow-hidden text-right select-none ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 text-white shadow-blue-950/40'
            : 'bg-white border-slate-200 text-slate-900 shadow-slate-300/60'
        }`}
      >
        {/* ================= MODAL HEADER ================= */}
        <div
          className={`flex items-center justify-between p-5 md:p-6 border-b shrink-0 ${
            isDarkMode
              ? 'border-slate-800 bg-slate-900/90'
              : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 shrink-0">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className={`text-lg sm:text-2xl font-black ${
                    isDarkMode ? 'text-white' : 'text-slate-950'
                  }`}
                >
                  احصائياتي وإنجازاتي
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>ملف الطالب</span>
                </span>
              </div>
              <p
                className={`text-xs mt-0.5 font-medium ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                متابعة دقيقة لكل دقيقة مشاهدة وكل اختبار حللته في منصة أقسام رعد
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
              isDarkMode
                ? 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200 border border-slate-200'
            }`}
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================= SCROLLABLE CONTENT BODY ================= */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
          {/* ================= 1. PROGRESS BARS SECTION (أشرطة التقدم) ================= */}
          <div className="space-y-4">
            {/* 1.1 شريط تقدم الفيديوهات اللي شاهدها */}
            <div
              className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                isDarkMode
                  ? 'bg-slate-800/60 border-slate-700/70 hover:border-blue-500/40'
                  : 'bg-slate-50 border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
                    <PlayCircle className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h4
                      className={`text-sm sm:text-base font-black ${
                        isDarkMode ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      شريط تقدم الفيديوهات التي شاهدتها
                    </h4>
                    <p
                      className={`text-[11px] ${
                        isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'
                      }`}
                    >
                      شاهدت {watchedVideosCount} من أصل {totalVideosCount || 0} فيديو متاح
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-black text-blue-400 font-mono">
                    %{videoProgressPercent}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 font-bold border border-blue-500/30">
                    {watchedVideosCount}/{totalVideosCount || 0}
                  </span>
                </div>
              </div>

              {/* Progress Bar Track */}
              <div
                className={`w-full h-3.5 sm:h-4 rounded-full p-0.5 overflow-hidden border shadow-inner ${
                  isDarkMode
                    ? 'bg-slate-950/80 border-slate-700/60'
                    : 'bg-slate-200 border-slate-300'
                }`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 transition-all duration-700 shadow-md shadow-blue-500/30 relative"
                  style={{ width: `${Math.max(videoProgressPercent > 0 ? 5 : 0, videoProgressPercent)}%` }}
                >
                  {videoProgressPercent > 15 && (
                    <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                  )}
                </div>
              </div>

              {/* Status Note */}
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span
                  className={
                    videoProgressPercent === 100
                      ? 'text-emerald-400 font-bold flex items-center gap-1'
                      : isDarkMode
                      ? 'text-slate-400'
                      : 'text-slate-600 font-medium'
                  }
                >
                  {videoProgressPercent === 100
                    ? '🏆 مبارك! أتممت مشاهدة كافة الفيديوهات بنسبة 100%'
                    : videoProgressPercent > 0
                    ? '⚡ استمر في المشاهدة لإتمام كافة الدروس'
                    : '💡 ابدأ بمشاهدة أول درس لتفعيل شريط التقدم'}
                </span>
                <span
                  className={`font-mono text-[10px] ${
                    isDarkMode ? 'text-slate-500' : 'text-slate-400 font-bold'
                  }`}
                >
                  {totalVideosCount - watchedVideosCount > 0
                    ? `متبقي ${totalVideosCount - watchedVideosCount} فيديو`
                    : 'مكتمل بالكامل'}
                </span>
              </div>
            </div>

            {/* 1.2 شريط تقدم الاختبارات اللي حلها */}
            <div
              className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                isDarkMode
                  ? 'bg-slate-800/60 border-slate-700/70 hover:border-emerald-500/40'
                  : 'bg-slate-50 border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h4
                      className={`text-sm sm:text-base font-black ${
                        isDarkMode ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      شريط تقدم الاختبارات التي قمت بحلها
                    </h4>
                    <p
                      className={`text-[11px] ${
                        isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'
                      }`}
                    >
                      أتممت {solvedExamsCount} من {totalExamsCount || 0} اختبار متاح (بإجمالي {attempts.length} محاولة)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-black text-emerald-400 font-mono">
                    %{examProgressPercent}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30">
                    {solvedExamsCount}/{totalExamsCount || 0}
                  </span>
                </div>
              </div>

              {/* Progress Bar Track */}
              <div
                className={`w-full h-3.5 sm:h-4 rounded-full p-0.5 overflow-hidden border shadow-inner ${
                  isDarkMode
                    ? 'bg-slate-950/80 border-slate-700/60'
                    : 'bg-slate-200 border-slate-300'
                }`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 transition-all duration-700 shadow-md shadow-emerald-500/30 relative"
                  style={{ width: `${Math.max(examProgressPercent > 0 ? 5 : 0, examProgressPercent)}%` }}
                >
                  {examProgressPercent > 15 && (
                    <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                  )}
                </div>
              </div>

              {/* Performance Indicator */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold ${
                      isDarkMode ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    متوسط جميع اختباراتك:
                  </span>
                  <span
                    className={`font-black px-2 py-0.5 rounded-md font-mono ${
                      averageScore >= 85
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : averageScore >= 65
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    %{averageScore}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {totalCorrectAnswers} صح
                  </span>
                  <span>•</span>
                  <span className="text-rose-400 font-bold flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    {totalWrongAnswers} خطأ
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ================= 2. THE TWO LIST TABS (قائمتين: فيديوهات و اختبارات) ================= */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className={`text-sm sm:text-base font-black flex items-center gap-2 ${
                    isDarkMode ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  <span>تفاصيل سجل الإنجازات</span>
                  <span className="text-[11px] font-normal text-slate-400">
                    (اختر القائمة لعرض المحتويات)
                  </span>
                </h3>
              </div>
            </div>

            {/* Tab Switcher Buttons */}
            <div
              className={`p-1.5 rounded-2xl border grid grid-cols-2 gap-1.5 ${
                isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveTab('videos')}
                className={`py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                  activeTab === 'videos'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 scale-[1.01]'
                    : isDarkMode
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    : 'text-slate-600 hover:text-black hover:bg-white'
                }`}
              >
                <Video className="w-4 h-4 shrink-0" />
                <span>قائمة الفيديوهات المشاهدة</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === 'videos'
                      ? 'bg-white/20 text-white'
                      : isDarkMode
                      ? 'bg-slate-800 text-slate-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {watchedVideosList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('exams')}
                className={`py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                  activeTab === 'exams'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30 scale-[1.01]'
                    : isDarkMode
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    : 'text-slate-600 hover:text-black hover:bg-white'
                }`}
              >
                <Award className="w-4 h-4 shrink-0" />
                <span>قائمة الاختبارات المحلولة</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === 'exams'
                      ? 'bg-white/20 text-white'
                      : isDarkMode
                      ? 'bg-slate-800 text-slate-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {attempts.length}
                </span>
              </button>
            </div>

            {/* ================= TAB 1: قائمة الفيديوهات التي شاهدها ================= */}
            {activeTab === 'videos' && (
              <div className="space-y-3">
                {watchedVideosList.length === 0 ? (
                  <div
                    className={`py-12 px-6 rounded-3xl border text-center space-y-3 ${
                      isDarkMode
                        ? 'bg-slate-950/40 border-slate-800 text-slate-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                      <PlayCircle className="w-7 h-7" />
                    </div>
                    <div>
                      <h4
                        className={`text-sm sm:text-base font-black ${
                          isDarkMode ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        لم تقم بتأكيد مشاهدة أي فيديو حتى الآن
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        عندما تشاهد الشروحات وتضغط على زر &quot;تم تأكيد المشاهدة&quot; أو تنهي الفيديو، ستظهر جميع محاضراتك المكتملة هنا تلقائياً!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {watchedVideosList.map((vid, idx) => (
                      <div
                        key={`${vid.id}-${idx}`}
                        className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 ${
                          isDarkMode
                            ? 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70 hover:border-slate-600'
                            : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center justify-center font-mono font-black text-xs shrink-0">
                            {idx + 1}
                          </div>
                          <div className="truncate space-y-0.5">
                            <h5
                              className={`text-xs sm:text-sm font-bold truncate ${
                                isDarkMode ? 'text-white' : 'text-slate-900'
                              }`}
                            >
                              {vid.title}
                            </h5>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 truncate">
                              {vid.sectionTitle && (
                                <span className="text-indigo-400 font-bold truncate">
                                  {vid.sectionTitle}
                                </span>
                              )}
                              {vid.sectionTitle && vid.resourceTitle && <span>•</span>}
                              {vid.resourceTitle && (
                                <span className="truncate">{vid.resourceTitle}</span>
                              )}
                              {vid.durationMinutes && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1 font-mono">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {vid.durationMinutes} دقيقة
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 mr-auto sm:mr-0">
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-black flex items-center gap-1.5 shadow-sm">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تمت المشاهدة بنجاح ✓</span>
                          </span>

                          {onSelectVideo && vid.item && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectVideo(vid.item!);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-md shadow-blue-600/20"
                              title="مشاهدة هذا الفيديو مجدداً"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>مشاهدة</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ================= TAB 2: قائمة الاختبارات المحلولة ================= */}
            {activeTab === 'exams' && (
              <div className="space-y-3">
                {loadingAttempts ? (
                  <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span>جاري تحميل سجل اختباراتك...</span>
                  </div>
                ) : attempts.length === 0 ? (
                  <div
                    className={`py-12 px-6 rounded-3xl border text-center space-y-3 ${
                      isDarkMode
                        ? 'bg-slate-950/40 border-slate-800 text-slate-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                      <Award className="w-7 h-7" />
                    </div>
                    <div>
                      <h4
                        className={`text-sm sm:text-base font-black ${
                          isDarkMode ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        لم تقم بحل أي اختبار حتى الآن
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        ابدأ بحل الاختبارات التفاعلية لقياس سرعتك ودقتك، وستظهر درجاتك وعدد الإجابات الصحيحة والأخطاء وتاريخ الحل هنا!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {attempts.map((att, aIdx) => {
                      const wrongCount = Math.max(0, (att.totalQuestions || 0) - (att.score || 0));
                      const isHighPass = att.percentage >= 85;
                      const isMediumPass = att.percentage >= 60 && att.percentage < 85;

                      const formattedDate = att.createdAt
                        ? new Date(att.createdAt).toLocaleDateString('ar-SA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'تاريخ غير محدد';

                      const formattedTime = att.createdAt
                        ? new Date(att.createdAt).toLocaleTimeString('ar-SA', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '';

                      return (
                        <div
                          key={att.id || `att-${aIdx}`}
                          className={`p-4 rounded-2xl border transition-all space-y-3 ${
                            isDarkMode
                              ? 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70 hover:border-slate-600'
                              : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm'
                          }`}
                        >
                          {/* Top Row: Title & Score Badge */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 truncate">
                              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-mono font-black text-xs shrink-0">
                                {aIdx + 1}
                              </div>
                              <div>
                                <h5
                                  className={`text-xs sm:text-sm font-black truncate ${
                                    isDarkMode ? 'text-white' : 'text-slate-900'
                                  }`}
                                >
                                  {att.examTitle || 'اختبار تقييمي'}
                                </h5>
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-medium">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-slate-400" />
                                    <span>{formattedDate}</span>
                                  </span>
                                  {formattedTime && (
                                    <>
                                      <span>•</span>
                                      <span className="flex items-center gap-1 font-mono">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        <span>{formattedTime}</span>
                                      </span>
                                    </>
                                  )}
                                  {att.durationSeconds > 0 && (
                                    <>
                                      <span>•</span>
                                      <span>استغرق {Math.floor(att.durationSeconds / 60)} د و {att.durationSeconds % 60} ث</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Score Percentage Pill */}
                            <div
                              className={`px-3 py-1 rounded-xl font-black text-xs sm:text-sm font-mono shrink-0 shadow-sm ${
                                isHighPass
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : isMediumPass
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              }`}
                            >
                              %{att.percentage}
                            </div>
                          </div>

                          {/* Bottom Row: Correct Answers, Wrong Answers, Total Questions Chips */}
                          <div
                            className={`flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t text-[11px] font-bold ${
                              isDarkMode ? 'border-slate-700/60' : 'border-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                              {/* عدد الإجابات الصحيحة */}
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>الإجابات الصحيحة: {att.score}</span>
                              </span>

                              {/* عدد الأخطاء */}
                              <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 shadow-sm">
                                <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                <span>عدد الأخطاء: {wrongCount}</span>
                              </span>
                            </div>

                            {/* إجمالي الأسئلة والتقييم */}
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mr-auto sm:mr-0 font-medium">
                              <span>إجمالي الأسئلة: {att.totalQuestions}</span>
                              <span>•</span>
                              <span
                                className={`font-bold ${
                                  isHighPass
                                    ? 'text-emerald-400'
                                    : isMediumPass
                                    ? 'text-amber-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                {isHighPass
                                  ? 'ممتاز جداً 🌟'
                                  : isMediumPass
                                  ? 'جيد جداً 👍'
                                  : 'يحتاج تدريب إضافي 💡'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div
          className={`p-4 md:p-5 border-t flex items-center justify-between shrink-0 ${
            isDarkMode
              ? 'border-slate-800 bg-slate-900/90'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">يتم تحديث إحصائياتك فورياً عند كل مشاهدة واختبار</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
            }`}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
