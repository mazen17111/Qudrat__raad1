import React from 'react';
import {
  Clock,
  Zap,
  ArrowRight,
  ArrowLeft,
  ZoomIn,
  Check,
  FolderPlus,
  PenTool,
  PanelLeftClose,
  BookmarkPlus,
  ChevronDown,
} from 'lucide-react';
import { DefaultExamSystemProps } from './examSystemTypes';
import { Whiteboard } from '../Whiteboard';

export const DefaultExamSystem: React.FC<DefaultExamSystemProps> = ({
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
  examTitle,
  handleRequestExit,
  finishTest,
  setShowFolderModalForQ,
  currentQCustomFolders,
  setZoomedImageUrl,
  setImageZoomScale,
  isDarkMode = true,
  isWhiteboardOpen,
  setIsWhiteboardOpen,
  mobileViewMode,
  setMobileViewMode,
  setShowMobileQuestionsList,
  showMobileQuestionsList,
  progressPercent,
}) => {
  const currentQ = safeQuestions[currentIdx] || safeQuestions[0];
  const safeOptions = Array.isArray(currentQ?.options) && currentQ.options.length > 0
    ? currentQ.options
    : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'];

  const answeredCount = Object.keys(selectedAnswers).length;

  return (
    <div
      className={`flex flex-col min-h-screen lg:h-screen p-2 sm:p-3 md:p-4 gap-2 sm:gap-3 max-w-[1900px] mx-auto w-full pb-4 sm:pb-6 overflow-x-hidden ${
        isDarkMode ? 'text-white' : 'text-black'
      }`}
      dir="rtl"
    >
      {/* Top Exam Header: Perfectly responsive on Mobile and Desktop */}
      <div
        className={`border rounded-2xl p-2.5 sm:p-3 md:px-6 shadow-xl shrink-0 ${
          isDarkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        {/* Mobile View: 2 neat rows */}
        <div className="flex flex-col gap-2 md:hidden">
          {/* Row 1: Back + Title + Timer */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={handleRequestExit}
                className={`p-2 rounded-xl transition shrink-0 ${
                  isDarkMode
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-black hover:bg-slate-200 font-bold'
                }`}
                title="خروج من الاختبار والعودة للمنصة"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h2
                  className={`text-xs sm:text-sm font-black flex items-center gap-1.5 truncate ${
                    isDarkMode ? 'text-white' : 'text-black'
                  }`}
                >
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="truncate">{examTitle}</span>
                </h2>
              </div>
            </div>

            {/* Timer Badge */}
            <div className="shrink-0 flex items-center gap-1.5">
              {isTimed ? (
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border font-mono font-bold text-xs ${
                    timeLeft < 60
                      ? 'bg-rose-500/20 border-rose-500 text-rose-600 animate-pulse'
                      : isDarkMode
                      ? 'bg-slate-800 border-slate-700 text-blue-300'
                      : 'bg-slate-100 border-slate-300 text-black'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>{formatTime(timeLeft)}</span>
                </div>
              ) : (
                <div className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[10px] font-black">
                  تدريب حر
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Progress Counter + Whiteboard Button + Finish Button */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/40">
            <span className={`text-[11px] font-bold shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>
              سؤال {currentIdx + 1} من {safeQuestions.length} ({answeredCount} تم)
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Whiteboard button */}
              <button
                type="button"
                onClick={() => {
                  setIsWhiteboardOpen((prev) => {
                    const next = !prev;
                    setMobileViewMode(next ? 'whiteboard' : 'question');
                    return next;
                  });
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-black transition shadow-sm ${
                  isWhiteboardOpen
                    ? 'bg-rose-500/15 text-rose-500 border-rose-500/40'
                    : 'bg-indigo-600/20 text-indigo-500 border-indigo-500/40'
                }`}
              >
                {isWhiteboardOpen ? (
                  <>
                    <PanelLeftClose className="w-3.5 h-3.5" />
                    <span>قفل السبورة</span>
                  </>
                ) : (
                  <>
                    <PenTool className="w-3.5 h-3.5" />
                    <span>السبورة 📝</span>
                  </>
                )}
              </button>

              {/* Finish Button */}
              <button
                onClick={finishTest}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] transition shadow-md shadow-emerald-600/20"
              >
                إنهاء والنتيجة
              </button>
            </div>
          </div>
        </div>

        {/* Desktop View: Single Line */}
        <div className="hidden md:flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleRequestExit}
              className={`p-2 rounded-xl transition ${
                isDarkMode
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 text-black hover:bg-slate-200 font-bold'
              }`}
              title="خروج من الاختبار والعودة للمنصة"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h2
                className={`text-base md:text-lg font-black flex items-center gap-2 ${
                  isDarkMode ? 'text-white' : 'text-black'
                }`}
              >
                <Zap className="w-5 h-5 text-amber-500" />
                <span>{examTitle}</span>
              </h2>
              <div className="flex items-center gap-3 mt-0.5">
                <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>
                  سؤال {currentIdx + 1} من {safeQuestions.length} ({answeredCount} إجابة)
                </span>
                <div className="w-24 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isTimed ? (
              <div
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-mono font-bold text-sm ${
                  timeLeft < 60
                    ? 'bg-rose-500/20 border-rose-500 text-rose-600 animate-pulse'
                    : isDarkMode
                    ? 'bg-slate-800 border-slate-700 text-blue-300'
                    : 'bg-slate-100 border-slate-300 text-black'
                }`}
              >
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{formatTime(timeLeft)}</span>
              </div>
            ) : (
              <div className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs font-black">
                تدريب حر
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsWhiteboardOpen((prev) => !prev)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-black transition cursor-pointer ${
                isWhiteboardOpen
                  ? 'bg-rose-500/15 text-rose-500 border-rose-500/40 hover:bg-rose-500/25'
                  : 'bg-indigo-600/20 text-indigo-500 border-indigo-500/40 hover:bg-indigo-600/30'
              }`}
            >
              {isWhiteboardOpen ? (
                <>
                  <PanelLeftClose className="w-4 h-4" />
                  <span>إخفاء السبورة</span>
                </>
              ) : (
                <>
                  <PenTool className="w-4 h-4" />
                  <span>فتح السبورة 📝</span>
                </>
              )}
            </button>

            <button
              onClick={finishTest}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs md:text-sm transition shadow-lg shadow-emerald-600/20 cursor-pointer"
            >
              إنهاء الاختبار
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Question Stepper Bar */}
      <div
        className={`border rounded-2xl p-2 sm:p-2.5 shadow-sm shrink-0 flex items-center gap-2 ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setShowMobileQuestionsList(!showMobileQuestionsList)}
          className={`md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shrink-0 ${
            isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-black'
          }`}
        >
          <span>قائمة الأسئلة ({safeQuestions.length})</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${showMobileQuestionsList ? 'rotate-180' : ''}`}
          />
        </button>

        <div className="flex-1 overflow-x-auto py-1 scrollbar-none flex items-center gap-1.5">
          {safeQuestions.map((_, i) => {
            const isCurrent = i === currentIdx;
            const isAnswered = selectedAnswers[i] !== undefined;
            const isMarked = !!markedForReview[i];

            return (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentIdx(i)}
                className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 rounded-xl font-black text-xs transition-all shrink-0 flex items-center justify-center relative cursor-pointer ${
                  isCurrent
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 shadow-md scale-105'
                    : isAnswered
                    ? 'bg-emerald-600/20 text-emerald-600 border border-emerald-500/40'
                    : isDarkMode
                    ? 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>{i + 1}</span>
                {isMarked && (
                  <span
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-1 ring-slate-900"
                    title="مميز للمراجعة"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area: Question + Whiteboard */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
        {/* Question Panel */}
        <div
          className={`flex-1 border rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col justify-between overflow-y-auto ${
            mobileViewMode === 'whiteboard' && isWhiteboardOpen ? 'hidden lg:flex' : 'flex'
          } ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
        >
          <div className="space-y-4">
            {/* Top metadata of current question */}
            <div className="flex items-center justify-between gap-2 border-b pb-3 border-slate-800/40 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-blue-500/15 text-blue-600 border border-blue-500/30">
                  السؤال {currentIdx + 1} من {safeQuestions.length}
                </span>

                {currentQCustomFolders.map((cf) => (
                  <span
                    key={cf.id}
                    className="text-xs px-2.5 py-0.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/30 font-bold"
                  >
                    📁 {cf.title}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModalForQ(currentQ)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 text-xs font-bold transition cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
                  <span>إدارة المجلدات</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setMarkedForReview((prev) => ({
                      ...prev,
                      [currentIdx]: !prev[currentIdx],
                    }))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    markedForReview[currentIdx]
                      ? 'bg-amber-500 text-black border-amber-400 font-black'
                      : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>{markedForReview[currentIdx] ? 'مميز للمراجعة ⭐' : 'تمييز'}</span>
                </button>
              </div>
            </div>

            {/* Question Text */}
            {currentQ.questionText && (
              <h3
                className={`text-base sm:text-lg font-black leading-relaxed ${
                  isDarkMode ? 'text-white' : 'text-slate-900'
                }`}
              >
                {currentQ.questionText}
              </h3>
            )}

            {/* Question Image */}
            {currentQ.imageUrl && (
              <div className="relative rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-950/40 p-2 group text-center">
                <img
                  src={currentQ.imageUrl}
                  alt="صورة السؤال"
                  className="max-h-[380px] mx-auto object-contain rounded-xl cursor-pointer"
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
                  className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-black/80 hover:bg-black text-amber-300 text-xs font-black flex items-center gap-1.5 shadow transition cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4 text-amber-400" />
                  <span>تكبير 🔍</span>
                </button>
              </div>
            )}

            {/* Choices */}
            <div className="space-y-2.5 pt-2">
              {safeOptions.map((opt, optIdx) => {
                const isSelected = selectedAnswers[currentIdx] === optIdx;
                const letter = optIdx === 0 ? 'أ' : optIdx === 1 ? 'ب' : optIdx === 2 ? 'ج' : 'د';

                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectOption(currentIdx, optIdx)}
                    className={`w-full text-right p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-center justify-between text-sm sm:text-base font-bold cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/15 text-blue-500 ring-2 ring-blue-500/30'
                        : isDarkMode
                        ? 'border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:border-slate-700 text-slate-200'
                        : 'border-slate-200 bg-slate-50 hover:bg-blue-50/50 hover:border-blue-300 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-md'
                            : isDarkMode
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {letter}
                      </span>
                      <span>{opt}</span>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Navigation */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-800/40 mt-6">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className={`flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl border text-xs sm:text-sm font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isDarkMode
                  ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                  : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800'
              }`}
            >
              <ArrowRight className="w-4 h-4" />
              <span>السابق</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (currentIdx < safeQuestions.length - 1) {
                  setCurrentIdx((i) => i + 1);
                } else {
                  finishTest();
                }
              }}
              className="flex items-center gap-1.5 px-6 sm:px-8 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-black transition shadow-lg shadow-blue-600/25 cursor-pointer"
            >
              <span>{currentIdx < safeQuestions.length - 1 ? 'حفظ والتالي' : 'إنهاء وتسليم الاختبار ✓'}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Whiteboard side component (Desktop or active on Mobile) */}
        {isWhiteboardOpen && (
          <div
            className={`w-full lg:w-[460px] xl:w-[520px] shrink-0 border rounded-3xl p-3 shadow-xl flex flex-col ${
              mobileViewMode === 'question' ? 'hidden lg:flex' : 'flex'
            } ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/40 px-2">
              <span className="text-xs font-black text-indigo-400 flex items-center gap-1.5">
                <PenTool className="w-4 h-4" />
                <span>السبورة الذكية للحل والشخبطة</span>
              </span>
            </div>
            <div className="flex-1 min-h-[360px] mt-2 rounded-2xl overflow-hidden border border-slate-700/50">
              <Whiteboard isDark={isDarkMode} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
