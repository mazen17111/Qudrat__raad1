import React, { useState } from 'react';
import {
  ArrowRight,
  ZoomIn,
  Check,
  FolderPlus,
  Flag,
  Clock,
  CheckCircle2,
  AlertCircle,
  ListChecks,
} from 'lucide-react';
import { BaseExamSystemProps } from './examSystemTypes';

export const NimrExamSystem: React.FC<BaseExamSystemProps> = ({
  safeQuestions,
  currentIdx,
  setCurrentIdx,
  selectedAnswers,
  handleSelectOption,
  visitedIndices,
  markedForReview,
  setMarkedForReview,
  isTimed,
  timeLeft,
  formatTime,
  currentUser,
  nationalId,
  examTitle,
  currentDateStr,
  handleRequestExit,
  finishTest,
  setShowFolderModalForQ,
  currentQCustomFolders,
  setZoomedImageUrl,
  setImageZoomScale,
  setShowExamInstructionsModal,
  setShowSectionModal,
  setShowEquationsModal,
}) => {
  const currentQ = safeQuestions[currentIdx] || safeQuestions[0];
  const safeOptions = Array.isArray(currentQ?.options) && currentQ.options.length > 0
    ? currentQ.options
    : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'];

  const unvisitedCount = Math.max(0, safeQuestions.length - Object.keys(visitedIndices).length);
  const visitedCount = Object.keys(visitedIndices).length;
  const answeredCount = Object.keys(selectedAnswers).length;
  const remainingCount = Math.max(0, safeQuestions.length - answeredCount);
  const markedCount = Object.values(markedForReview).filter(Boolean).length;

  const [showFinalReview, setShowFinalReview] = useState(false);
  const [showConfirmFinishModal, setShowConfirmFinishModal] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(true);
  const [isSectionOpen, setIsSectionOpen] = useState(true);
  const [reviewToast, setReviewToast] = useState<string | null>(null);

  const handleReviewIncomplete = () => {
    const firstUnanswered = safeQuestions.findIndex((_, idx) => selectedAnswers[idx] === undefined);
    if (firstUnanswered !== -1) {
      setCurrentIdx(firstUnanswered);
      setShowFinalReview(false);
    } else {
      setReviewToast('رائع! جميع الأسئلة مكتملة ومجاب عليها بالكامل ✓');
      setTimeout(() => setReviewToast(null), 3500);
    }
  };

  const handleReviewAll = () => {
    setCurrentIdx(0);
    setShowFinalReview(false);
  };

  const handleReviewMarked = () => {
    const firstMarked = safeQuestions.findIndex((_, idx) => markedForReview[idx]);
    if (firstMarked !== -1) {
      setCurrentIdx(firstMarked);
      setShowFinalReview(false);
    } else {
      setReviewToast('لا توجد أسئلة مميزة للمراجعة حالياً');
      setTimeout(() => setReviewToast(null), 3500);
    }
  };

  // ================= صفحة المراجعة النهائية - نظام نمر (قياس #00a59a) =================
  if (showFinalReview) {
    return (
      <div
        className="w-full min-h-screen bg-[#f4f6f8] text-[#333] flex flex-col font-sans select-none"
        dir="rtl"
      >
        {/* الهيدر العلوي بلون نظام نمر */}
        <header
          data-preserve-colors="true"
          className="bg-[#00a59a] text-white flex flex-wrap justify-between items-center gap-3 px-5 py-3 text-sm sm:text-[15px] font-bold shrink-0 shadow-md"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xl font-bold tracking-wide">قياس</div>
            <span className="opacity-70">|</span>
            <span>{examTitle || 'اختبارات القدرات'} - مراجعة الإجابات</span>
            <button
              type="button"
              onClick={() => setShowFinalReview(false)}
              className="text-xs bg-[#008f85] hover:bg-[#007a71] text-white px-3 py-1.5 rounded transition cursor-pointer border border-white/25 font-bold"
              title="العودة لمتابعة حل الاختبار"
            >
              العودة لمتابعة الحل ←
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs sm:text-sm">
            <span className="hidden sm:inline bg-white/15 px-2.5 py-1 rounded">
              الطالب: {currentUser?.name || 'طالب'}
            </span>
            <div className="flex items-center gap-1.5 font-mono bg-[#008f85] px-3 py-1 rounded border border-white/20">
              <Clock className="w-4 h-4" />
              <span>{isTimed ? formatTime(timeLeft) : 'تدريب حر'}</span>
            </div>
          </div>
        </header>

        {/* المحتوى الرئيسي */}
        <div className="flex-1 p-4 sm:p-5 max-w-[1400px] w-full mx-auto flex flex-col gap-4 overflow-y-auto">
          {/* ملخص سريع بحالات نمر المعتمدة */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-[#e0e0e0] rounded p-3 flex items-center justify-between shadow-xs">
              <div>
                <div className="text-xs text-[#666] font-bold">مجموع الأسئلة</div>
                <div className="text-xl font-black text-[#00796b] mt-0.5">{safeQuestions.length}</div>
              </div>
              <ListChecks className="w-6 h-6 text-[#00a59a]" />
            </div>

            <div className="bg-white border border-[#e0e0e0] rounded p-3 flex items-center justify-between shadow-xs">
              <div>
                <div className="text-xs text-[#666] font-bold">تمت الإجابة</div>
                <div className="text-xl font-black text-[#2e7d32] mt-0.5">{answeredCount}</div>
              </div>
              <CheckCircle2 className="w-6 h-6 text-[#2e7d32]" />
            </div>

            <div className="bg-white border border-[#e0e0e0] rounded p-3 flex items-center justify-between shadow-xs">
              <div>
                <div className="text-xs text-[#666] font-bold">غير مكتمل</div>
                <div className="text-xl font-black text-[#ff5722] mt-0.5">{remainingCount}</div>
              </div>
              <AlertCircle className="w-6 h-6 text-[#ff5722]" />
            </div>

            <div className="bg-white border border-[#e0e0e0] rounded p-3 flex items-center justify-between shadow-xs">
              <div>
                <div className="text-xs text-[#666] font-bold">مميز للمراجعة</div>
                <div className="text-xl font-black text-amber-600 mt-0.5">{markedCount}</div>
              </div>
              <Flag className="w-6 h-6 text-amber-500" />
            </div>
          </div>

          {/* صندوق الإرشادات */}
          <div className="bg-white border border-[#dcdcdc] rounded shadow-xs overflow-hidden">
            <div
              data-preserve-colors="true"
              onClick={() => setIsInstructionsOpen(!isInstructionsOpen)}
              className="bg-[#00a59a] text-white px-4 py-2.5 font-bold flex items-center justify-between cursor-pointer select-none"
            >
              <span className="flex items-center gap-2">
                <span>{isInstructionsOpen ? '⊟' : '⊞'}</span>
                <span>إرشادات المراجعة</span>
              </span>
              <span className="text-xs font-normal opacity-90">
                {isInstructionsOpen ? 'طي الإرشادات' : 'عرض الإرشادات'}
              </span>
            </div>
            {isInstructionsOpen && (
              <div className="p-4 sm:px-5 text-sm text-[#444] leading-[1.8]">
                فيما يلي ملخص لإجاباتك في نظام نمر، يمكنك مراجعة أسئلتك بثلاث (3) طرق مختلفة عبر الأزرار بالأسفل:
                <ol className="mr-5 mt-1.5 space-y-1 list-decimal">
                  <li>مراجعة جميع الأسئلة وإجاباتك من البداية.</li>
                  <li>مراجعة الأسئلة غير المكتملة التي لم تتم الإجابة عليها.</li>
                  <li>مراجعة الأسئلة المميزة بعلامة للمراجعة.</li>
                </ol>
                <div className="mt-2.5 text-xs font-bold text-[#00796b] bg-[#00a59a]/10 p-2.5 rounded border border-[#00a59a]/25">
                  💡 يمكنك النقر مباشرة على أي سؤال من الجدول أدناه للانتقال إليه وتعديل إجابتك قبل التسليم النهائي.
                </div>
              </div>
            )}
          </div>

          {/* جدول مراجعة أسئلة القسم */}
          <div className="bg-white border border-[#dcdcdc] rounded shadow-xs overflow-hidden">
            <div
              data-preserve-colors="true"
              onClick={() => setIsSectionOpen(!isSectionOpen)}
              className="bg-[#00a59a] text-white px-4 py-2.5 font-bold flex justify-between items-center cursor-pointer select-none"
            >
              <span className="flex items-center gap-2">
                <span>{isSectionOpen ? '⊟' : '⊞'}</span>
                <span>القسم الأول - ملخص الأسئلة</span>
              </span>
              <span className="text-xs sm:text-sm font-bold bg-[#008f85] px-2.5 py-0.5 rounded">
                {remainingCount > 0 ? `(${remainingCount} غير مكتمل)` : 'جميع الأسئلة مكتملة ✓'}
              </span>
            </div>

            {isSectionOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 border-t border-[#e0e0e0]">
                {safeQuestions.map((_, idx) => {
                  const isAnswered = selectedAnswers[idx] !== undefined;
                  const isVisited = !!visitedIndices[idx];
                  const isFlagged = !!markedForReview[idx];

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setCurrentIdx(idx);
                        setShowFinalReview(false);
                      }}
                      className="p-3.5 sm:px-4 border-l border-b border-[#e0e0e0] flex justify-between items-center bg-white hover:bg-[#f0f9f8] cursor-pointer transition select-none group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          data-preserve-colors="true"
                          className={`w-7 h-7 rounded-[3px] flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                            isAnswered
                              ? 'bg-[#2e7d32]'
                              : isVisited
                              ? 'bg-[#4a90e2]'
                              : 'bg-[#ff5722]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm text-[#333] font-bold group-hover:text-[#00796b]">
                            السؤال {idx + 1}
                          </span>
                          <span
                            className={`text-[11px] font-bold ${
                              isAnswered
                                ? 'text-[#2e7d32]'
                                : isVisited
                                ? 'text-[#4a90e2]'
                                : 'text-[#ff5722]'
                            }`}
                          >
                            {isAnswered ? 'تمت الإجابة ✓' : isVisited ? 'تمت زيارته (غير مجاب)' : 'لم تتم زيارته'}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-base transition ${
                          isFlagged ? 'text-amber-500 font-black scale-125' : 'text-[#ccc]'
                        }`}
                        title={isFlagged ? 'مميز للمراجعة' : 'غير مميز'}
                      >
                        ⚑
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* الشريط السفلي لأزرار المراجعة والتسليم بلون نمر */}
        <footer
          data-preserve-colors="true"
          className="bg-[#00a59a] text-white flex flex-wrap justify-between items-center px-3 py-2 sm:py-0 sm:h-[56px] gap-2 shrink-0 shadow-inner"
        >
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-0 sm:h-full">
            <button
              type="button"
              onClick={handleReviewAll}
              className="bg-[#008f85] hover:bg-[#007a71] text-white border-l border-white/20 px-4 py-2 sm:py-0 sm:h-full rounded sm:rounded-none text-xs sm:text-sm font-bold cursor-pointer transition whitespace-nowrap"
            >
              📋 مراجعة الكل
            </button>
            <button
              type="button"
              onClick={handleReviewIncomplete}
              className="bg-[#008f85] hover:bg-[#007a71] text-white border-l border-white/20 px-4 py-2 sm:py-0 sm:h-full rounded sm:rounded-none text-xs sm:text-sm font-bold cursor-pointer transition whitespace-nowrap"
            >
              ✕ مراجعة الغير مكتمل ({remainingCount})
            </button>
            <button
              type="button"
              onClick={handleReviewMarked}
              className="bg-[#008f85] hover:bg-[#007a71] text-white border-l border-white/20 px-4 py-2 sm:py-0 sm:h-full rounded sm:rounded-none text-xs sm:text-sm font-bold cursor-pointer transition whitespace-nowrap"
            >
              ⚑ مراجعة المميز ({markedCount})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowConfirmFinishModal(true)}
            className="bg-[#f44336] hover:bg-[#d32f2f] text-white px-6 py-2 sm:py-0 sm:h-full rounded sm:rounded-none text-sm sm:text-[15px] font-black cursor-pointer flex items-center gap-2 transition whitespace-nowrap shadow-sm"
          >
            <span>✓ إنهاء المراجعة وتسليم الاختبار</span>
          </button>
        </footer>

        {/* إشعار عائم Toast */}
        {reviewToast && (
          <div
            data-preserve-colors="true"
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#00796b] text-white px-6 py-2.5 rounded-full shadow-2xl text-sm font-bold border border-white/30"
          >
            {reviewToast}
          </div>
        )}

        {/* نافذة تأكيد تسليم الاختبار النهائي */}
        {showConfirmFinishModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl border border-[#dcdcdc] max-w-md w-full overflow-hidden text-right" dir="rtl">
              <div
                data-preserve-colors="true"
                className="bg-[#00a59a] text-white px-5 py-3 font-bold text-base flex justify-between items-center"
              >
                <span>تأكيد إنهاء الاختبار وتسليمه</span>
                <button
                  type="button"
                  onClick={() => setShowConfirmFinishModal(false)}
                  className="text-white hover:text-amber-200 text-lg font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                {remainingCount > 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded text-amber-900 text-sm leading-relaxed">
                    ⚠️ <strong>تنبيه هام:</strong> لديك <strong>{remainingCount}</strong> أسئلة غير مكتملة (لم تقم بالإجابة عليها).
                    <p className="mt-2 text-xs text-amber-800">
                      هل أنت متأكد من إنهاء المراجعة وتسليم الاختبار نهائياً؟
                    </p>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[#333] leading-relaxed">
                    لقد قمت بالإجابة على جميع الأسئلة ({safeQuestions.length} سؤالاً).
                    <br />
                    هل أنت متأكد من إنهاء المراجعة وتسليم الاختبار وعرض النتيجة النهائية؟
                  </p>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#eee]">
                  <button
                    type="button"
                    onClick={() => setShowConfirmFinishModal(false)}
                    className="px-5 py-2 rounded bg-[#eee] hover:bg-[#e0e0e0] text-[#333] text-sm font-bold transition cursor-pointer"
                  >
                    العودة للمراجعة
                  </button>
                  <button
                    type="button"
                    data-preserve-colors="true"
                    onClick={() => {
                      setShowConfirmFinishModal(false);
                      finishTest();
                    }}
                    className="px-6 py-2 rounded bg-[#00a59a] hover:bg-[#008f85] text-white text-sm font-bold transition shadow cursor-pointer"
                  >
                    نعم، تسليم الاختبار نهائياً ✓
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 w-full bg-[#f4f6f8] text-[#333] font-sans min-h-screen">
      {/* ================= الهيدر العلوي ================= */}
      <header className="bg-[#00a59a] text-white flex justify-between items-center py-2 px-5 font-bold text-base select-none shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRequestExit}
            className="p-1 px-2.5 rounded bg-[#008f85] hover:bg-[#007a71] text-white text-xs transition cursor-pointer flex items-center gap-1 font-bold"
            title="الخروج من الاختبار والعودة للمنصة"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
          <div className="text-xl font-bold tracking-wide">قياس</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="font-mono text-sm sm:text-base tracking-wider">{currentDateStr}</div>
        </div>

        <div className="text-sm sm:text-base font-bold truncate max-w-[180px] sm:max-w-md">
          {examTitle || 'اختبارات القدرات'}
        </div>
      </header>

      {/* ================= الحاوية الرئيسية (main-container) ================= */}
      <div className="flex flex-col lg:flex-row gap-4 p-3.5 sm:p-4 max-w-[1400px] w-full mx-auto flex-1 items-start">
        {/* ================= الشريط الجانبي (sidebar: 280px) ================= */}
        <div className="w-full lg:w-[280px] shrink-0 flex flex-col gap-3">
          {/* Card 1: الوقت المتبقي */}
          <div className="bg-white border border-[#e0e0e0] rounded p-2.5 text-center shadow-xs">
            <div className="text-sm text-[#666] mb-1 font-bold">الوقت المتبقي</div>
            <div className="text-[26px] text-[#2b73b6] font-bold font-mono">
              {isTimed ? formatTime(timeLeft) : 'تدريب حر'}
            </div>
          </div>

          {/* Card 2: بطاقة بيانات الطالب (تتغير حسب كل طالب مسجل وتولد رقم هوية مختلف وعشوائي) */}
          <div className="bg-white border border-[#e0e0e0] rounded p-2.5 text-center shadow-xs">
            <div className="flex flex-col gap-1.5 text-right text-[13px] bg-[#fafafa] p-2 rounded border border-[#eee]">
              <div>
                <strong>اسم الطالب:</strong> <span className="font-bold text-[#111]">{currentUser?.name || 'اسم الطالب هنا'}</span>
              </div>
              <div>
                <strong>رقم الهوية:</strong> <span className="font-mono font-bold text-[#111]">{nationalId}</span>
              </div>
            </div>
          </div>

          {/* Card 3: معلومات القسم والشبكة الإحصائية والأسئلة والأزرار */}
          <div className="bg-white border border-[#e0e0e0] rounded p-2.5 text-center shadow-xs space-y-3">
            <div className="text-[13px] font-bold border-b border-[#eee] pb-1.5 text-right leading-relaxed">
              القسم الحالي: 1 / 1<br />
              مجموع الأسئلة: {safeQuestions.length}
            </div>

            {/* شبكة الإحصائيات (stats-grid) */}
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div>
                <div className="py-1 px-0.5 rounded text-sm font-bold bg-white text-[#333] border border-[#ccc]">
                  {unvisitedCount}
                </div>
                <div className="text-[10px] text-[#333] mt-1 h-7 flex items-center justify-center leading-tight font-bold">
                  لم تتم زيارته
                </div>
              </div>
              <div>
                <div className="py-1 px-0.5 rounded text-sm font-bold bg-[#4a90e2] text-white">
                  {visitedCount}
                </div>
                <div className="text-[10px] text-[#333] mt-1 h-7 flex items-center justify-center leading-tight font-bold">
                  تمت زيارته
                </div>
              </div>
              <div>
                <div className="py-1 px-0.5 rounded text-sm font-bold bg-[#2e7d32] text-white">
                  {answeredCount}
                </div>
                <div className="text-[10px] text-[#333] mt-1 h-7 flex items-center justify-center leading-tight font-bold">
                  تمت الإجابة
                </div>
              </div>
              <div>
                <div className="py-1 px-0.5 rounded text-sm font-bold bg-[#ff5722] text-white">
                  {remainingCount}
                </div>
                <div className="text-[10px] text-[#333] mt-1 h-7 flex items-center justify-center leading-tight font-bold">
                  باقي من القسم
                </div>
              </div>
            </div>

            {/* شبكة أرقام الأسئلة (questions-grid: 6 أعمدة) */}
            <div className="grid grid-cols-6 gap-1.5 max-h-[290px] overflow-y-auto p-0.5">
              {safeQuestions.map((_, i) => {
                const isCurrent = i === currentIdx;
                const isAnswered = selectedAnswers[i] !== undefined;
                const isVisited = !!visitedIndices[i];
                const isMarked = !!markedForReview[i];

                let btnBg = 'bg-[#ff5722]'; // لم تتم زيارته
                if (isAnswered) {
                  btnBg = 'bg-[#2e7d32]'; // تمت الإجابة
                } else if (isVisited) {
                  btnBg = 'bg-[#4a90e2]'; // تمت زيارته
                }

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentIdx(i)}
                    className={`h-[35px] text-white border-none rounded-[3px] font-bold cursor-pointer transition-all flex items-center justify-center relative text-xs ${btnBg} ${
                      isCurrent
                        ? 'ring-2 ring-[#00a59a] scale-105 z-10 shadow-md font-black'
                        : 'hover:opacity-90'
                    }`}
                    title={`الانتقال للسؤال رقم ${i + 1}`}
                  >
                    <span>{i + 1}</span>
                    {isMarked && (
                      <span
                        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-300 ring-1 ring-black shadow"
                        title="مميز للمراجعة"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* أزرار أسفل الشريط الجانبي (sidebar-actions: 2x2) */}
            <div className="grid grid-cols-2 gap-2 mt-2 pt-2.5 border-t border-[#eee]">
              <button
                type="button"
                onClick={() => setShowExamInstructionsModal(true)}
                className="py-2.5 px-1 rounded text-white font-bold cursor-pointer text-xs sm:text-[13px] bg-[#00a59a] hover:bg-[#008f85] transition"
              >
                تعليمات الاختبار
              </button>
              <button
                type="button"
                onClick={() => setShowSectionModal(true)}
                className="py-2.5 px-1 rounded text-white font-bold cursor-pointer text-xs sm:text-[13px] bg-[#00a59a] hover:bg-[#008f85] transition"
              >
                تعليمات القسم
              </button>
              <button
                type="button"
                onClick={() => setShowEquationsModal(true)}
                className="py-2.5 px-1 rounded text-white font-bold cursor-pointer text-xs sm:text-[13px] bg-[#00a59a] hover:bg-[#008f85] transition"
              >
                المعادلات
              </button>
              <button
                type="button"
                onClick={() => setShowFinalReview(true)}
                className="py-2.5 px-1 rounded text-white font-bold cursor-pointer text-xs sm:text-[13px] bg-[#f44336] hover:bg-[#d32f2f] transition"
              >
                إنهاء الاختبار
              </button>
            </div>
          </div>
        </div>

        {/* ================= منطقة عرض السؤال وصورته (content-area) ================= */}
        <div className="flex-1 bg-white border border-[#e0e0e0] rounded p-4 sm:p-5 flex flex-col justify-between shadow-xs min-h-[580px] w-full">
          <div>
            {/* Question Header */}
            <div className="flex justify-between items-center border-b border-[#eee] pb-2.5 mb-4 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {currentQCustomFolders.map((cf) => (
                  <span
                    key={cf.id}
                    className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-bold"
                  >
                    📁 {cf.title}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setShowFolderModalForQ(currentQ)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition cursor-pointer"
                  title="إضافة السؤال إلى مجلد أو حذفه منه"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-amber-600" />
                  <span>إدارة المجلدات</span>
                </button>
              </div>

              <div className="text-lg font-bold text-[#444]">
                رقم السؤال {currentIdx + 1}
              </div>
            </div>

            {/* Question Text */}
            {currentQ.questionText && (
              <h3 className="text-base sm:text-lg font-bold text-[#333] leading-relaxed mb-4">
                {currentQ.questionText}
              </h3>
            )}

            {/* مكان صورة السؤال المرفوعة */}
            {currentQ.imageUrl && (
              <div className="text-center my-4 p-2.5 bg-white border border-[#e8e8e8] rounded-md relative group">
                <img
                  id="questionImage"
                  src={currentQ.imageUrl}
                  alt="صورة السؤال"
                  className="max-w-full max-h-[460px] mx-auto rounded object-contain cursor-pointer"
                  onClick={() => {
                    setZoomedImageUrl(currentQ.imageUrl || null);
                    setImageZoomScale(1);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setZoomedImageUrl(currentQ.imageUrl || null);
                    setImageZoomScale(1);
                  }}
                  className="absolute top-2 left-2 px-2.5 py-1 rounded bg-black/75 hover:bg-black text-amber-300 text-xs font-bold flex items-center gap-1 shadow transition cursor-pointer"
                  title="تكبير صورة السؤال"
                >
                  <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                  <span>تكبير 🔍</span>
                </button>
              </div>
            )}

            {/* 4 Choices / Options */}
            <div className="space-y-2.5 my-4">
              {safeOptions.map((option, optIdx) => {
                const isSelected = selectedAnswers[currentIdx] === optIdx;
                const letter = optIdx === 0 ? 'أ' : optIdx === 1 ? 'ب' : optIdx === 2 ? 'ج' : 'د';

                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectOption(currentIdx, optIdx)}
                    className={`w-full text-right p-3.5 rounded border transition-all flex items-center justify-between text-sm md:text-base font-bold cursor-pointer ${
                      isSelected
                        ? 'bg-[#00a59a]/10 border-[#00a59a] text-[#00796b] ring-2 ring-[#00a59a]'
                        : 'bg-[#fafafa] hover:bg-[#f0f9f8] border-[#e0e0e0] text-[#333]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSelected ? 'bg-[#00a59a] text-white' : 'bg-[#eee] text-[#555]'
                        }`}
                      >
                        {letter}
                      </span>
                      <span>{option}</span>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[#00a59a] text-white flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* أسفل محتوى السؤال والأزرار (content-footer) */}
          <div className="flex justify-between items-center border-t border-[#eee] pt-4 mt-4 gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-[#555] text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                id="reviewCheck"
                checked={!!markedForReview[currentIdx]}
                onChange={(e) =>
                  setMarkedForReview((prev) => ({
                    ...prev,
                    [currentIdx]: e.target.checked,
                  }))
                }
                className="w-4 h-4 text-[#00a59a] rounded border-gray-300 focus:ring-[#00a59a] cursor-pointer"
              />
              <span>تمييز السؤال للمراجعة</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="px-4 py-2 rounded text-sm font-bold bg-[#f0f0f0] hover:bg-[#e4e4e4] disabled:opacity-40 disabled:cursor-not-allowed text-[#444] transition cursor-pointer border border-[#ddd]"
              >
                السابق
              </button>

              <button
                type="button"
                onClick={() => {
                  if (currentIdx < safeQuestions.length - 1) {
                    setCurrentIdx(currentIdx + 1);
                  } else {
                    setShowFinalReview(true);
                  }
                }}
                className="bg-[#00a59a] hover:bg-[#008f85] text-white border-none py-2.5 px-6 rounded-md text-base font-bold cursor-pointer transition shadow-sm"
              >
                {currentIdx < safeQuestions.length - 1 ? 'حفظ والتالي' : 'إنهاء ومراجعة الاختبار ✓'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
