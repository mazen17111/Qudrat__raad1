import React, { useState } from 'react';
import {
  ArrowRight,
  ZoomIn,
  FolderPlus,
  BookmarkPlus,
  Calculator,
  Type,
  Flag,
  HelpCircle,
  FileText,
} from 'lucide-react';
import { BaseExamSystemProps } from './examSystemTypes';

export const BlueExamSystem: React.FC<BaseExamSystemProps> = ({
  safeQuestions,
  currentIdx,
  setCurrentIdx,
  selectedAnswers,
  handleSelectOption,
  markedForReview,
  setMarkedForReview,
  isTimed,
  timeLeft,
  formatTime,
  currentUser,
  examTitle,
  handleRequestExit,
  finishTest,
  setShowFolderModalForQ,
  currentQCustomFolders,
  setZoomedImageUrl,
  setImageZoomScale,
  setShowExamInstructionsModal,
  setShowEquationsModal,
}) => {
  const currentQ = safeQuestions[currentIdx] || safeQuestions[ safeQuestions.length - 1] || safeQuestions[0];
  const safeOptions = Array.isArray(currentQ?.options) && currentQ.options.length > 0
    ? currentQ.options
    : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'];

  // Font size control toggled by "خط عادي / كبير" button
  const [fontSizeMode, setFontSizeMode] = useState<'normal' | 'large'>('normal');

  // Final review screen state inside BlueExamSystem
  const [showFinalReview, setShowFinalReview] = useState(false);
  const [showConfirmFinishModal, setShowConfirmFinishModal] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(true);
  const [isSectionOpen, setIsSectionOpen] = useState(true);
  const [reviewToast, setReviewToast] = useState<string | null>(null);

  const toggleFontSize = () => {
    setFontSizeMode((prev) => (prev === 'normal' ? 'large' : 'normal'));
  };

  const isCurrentMarked = !!markedForReview[currentIdx];

  const toggleMarkForReview = () => {
    setMarkedForReview((prev) => ({
      ...prev,
      [currentIdx]: !prev[currentIdx],
    }));
  };

  const unansweredCount = safeQuestions.reduce((count, _, idx) => {
    return selectedAnswers[idx] === undefined ? count + 1 : count;
  }, 0);

  const handleReviewIncomplete = () => {
    const firstUnanswered = safeQuestions.findIndex((_, idx) => selectedAnswers[idx] === undefined);
    if (firstUnanswered !== -1) {
      setCurrentIdx(firstUnanswered);
      setShowFinalReview(false);
    } else {
      setReviewToast('🎉 رائع! جميع الأسئلة مكتملة ومجاب عليها بالكامل');
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
      setReviewToast('📌 لا توجد أسئلة مميزة بعلامة للمراجعة حالياً');
      setTimeout(() => setReviewToast(null), 3500);
    }
  };

  // ================= صفحة المراجعة النهائية - النظام الأزرق المطابقة للتصميم =================
  if (showFinalReview) {
    return (
      <div
        className="w-screen h-screen bg-[#f4f6f8] text-[#333] flex flex-col overflow-hidden select-none"
        dir="rtl"
        style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}
      >
        {/* الشريط العلوي */}
        <header className="bg-[#1b4f72] text-white flex justify-between items-center px-5 py-3 text-[15px] font-bold shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <span>{examTitle || 'اختبار القدرات العامة - القسم العلمي'} - سري جداً - محاكي درب</span>
            <button
              type="button"
              onClick={() => setShowFinalReview(false)}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded transition cursor-pointer border border-white/20"
              title="متابعة حل الاختبار"
            >
              العودة لمتابعة الحل ←
            </button>
          </div>
          <div className="flex items-center gap-2 font-mono">
            <span>{isTimed ? formatTime(timeLeft) : 'حر'}</span>
            <span>⏱ الوقت المتبقي</span>
          </div>
        </header>

        {/* المحتوى الرئيسي */}
        <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-5 bg-[#f4f6f8]">
          {/* صندوق الإرشادات */}
          <div className="bg-white border border-[#dcdcdc] rounded-[4px] shadow-sm">
            <div
              onClick={() => setIsInstructionsOpen(!isInstructionsOpen)}
              className="bg-[#1b4f72] text-white px-4 py-2.5 font-bold flex items-center justify-between cursor-pointer select-none"
            >
              <span className="flex items-center gap-2">
                <span>{isInstructionsOpen ? '⊟' : '⊞'}</span>
                <span>إرشادات</span>
              </span>
              <span className="text-xs font-normal opacity-80">
                {isInstructionsOpen ? 'طي الإرشادات' : 'عرض الإرشادات'}
              </span>
            </div>
            {isInstructionsOpen && (
              <div className="p-4 sm:px-5 text-sm text-[#444] leading-[1.8]">
                فيما يلي ملخص لإجاباتك يمكنك مراجعة أسئلتك بثلاث (3) طرق مختلفة
                <br />
                الأزرار الموجودة في الركن السفلي الأيسر تطابق هذه الخيارات :
                <ol className="mr-5 mt-1.5 space-y-1 list-decimal">
                  <li>قم بمراجعة كل أسئلتك وإجاباتك.</li>
                  <li>قم بمراجعة الأسئلة غير المكتملة.</li>
                  <li>قم بمراجعة الأسئلة المميزة بعلامة للمراجعة (انقر فوق الرمز تمييز لتغيير العلامة الخاصة بحالة المراجعة).</li>
                </ol>
                <div className="mt-2 text-xs font-semibold text-[#1b4f72] bg-blue-50/70 p-2 rounded border border-blue-100">
                  💡 يمكنك أيضاً النقر فوق أي سؤال في الجدول أدناه لربطه مباشرة بموقعه في الاختبار واستكمال الإجابة.
                </div>
              </div>
            )}
          </div>

          {/* صندوق القسم الأول */}
          <div className="bg-white border border-[#dcdcdc] rounded-[4px] shadow-sm">
            <div
              onClick={() => setIsSectionOpen(!isSectionOpen)}
              className="bg-[#1b4f72] text-white px-4 py-2.5 font-bold flex justify-between items-center cursor-pointer select-none"
            >
              <span className="flex items-center gap-2">
                <span>{isSectionOpen ? '⊟' : '⊞'}</span>
                <span>القسم الأول</span>
              </span>
              <span className="text-sm font-normal">
                ({unansweredCount} غير مرئي/غير مكتمل)
              </span>
            </div>

            {isSectionOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 border-t border-[#e0e0e0]">
                {safeQuestions.map((_, idx) => {
                  const isAnswered = selectedAnswers[idx] !== undefined;
                  const isFlagged = !!markedForReview[idx];

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setCurrentIdx(idx);
                        setShowFinalReview(false);
                      }}
                      className="p-3.5 sm:px-5 border-l border-b border-[#e0e0e0] flex justify-between items-center bg-white hover:bg-[#f8f9fa] cursor-pointer transition select-none group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[15px] text-[#2c3e50] font-medium group-hover:text-[#1b4f72]">
                          السؤال {idx + 1}
                        </span>
                        {isAnswered ? (
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            مكتمل ✓
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            غير مكتمل
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-base transition ${
                          isFlagged ? 'text-[#1b4f72] font-black scale-125' : 'text-[#bdc3c7]'
                        }`}
                        title={isFlagged ? 'السؤال مميز بعلامة للمراجعة' : 'غير مميز'}
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

        {/* الشريط السفلي (أزرار المراجعة والإنهاء) */}
        <footer className="bg-[#1b4f72] text-white flex justify-end items-center p-0 h-[55px] shrink-0 overflow-x-auto shadow-inner">
          <button
            type="button"
            onClick={() => setShowConfirmFinishModal(true)}
            className="bg-[#1b4f72] hover:bg-[#0f354f] text-white border-none border-r border-[#1b4f72] h-full px-6 text-[15px] font-bold cursor-pointer flex items-center gap-2 transition whitespace-nowrap"
          >
            <span>⚑ انهاء المراجعة</span>
          </button>
          <button
            type="button"
            onClick={handleReviewIncomplete}
            className="bg-[#154360] hover:bg-[#0f354f] text-white border-none border-r border-[#1b4f72] h-full px-6 text-[15px] font-bold cursor-pointer flex items-center gap-2 transition whitespace-nowrap"
          >
            <span>✕ مراجعة الغير مكتمل</span>
          </button>
          <button
            type="button"
            onClick={handleReviewAll}
            className="bg-[#154360] hover:bg-[#0f354f] text-white border-none border-r border-[#1b4f72] h-full px-6 text-[15px] font-bold cursor-pointer flex items-center gap-2 transition whitespace-nowrap"
          >
            <span>📋 مراجعة الكل</span>
          </button>
          <button
            type="button"
            onClick={handleReviewMarked}
            className="bg-[#154360] hover:bg-[#0f354f] text-white border-none border-r border-[#1b4f72] h-full px-6 text-[15px] font-bold cursor-pointer flex items-center gap-2 transition whitespace-nowrap"
          >
            <span>⚑ مراجعة المميز بعلامة</span>
          </button>
        </footer>

        {/* إشعار عائم Toast */}
        {reviewToast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#1b4f72] text-white px-6 py-2.5 rounded-full shadow-2xl text-sm font-bold border border-white/30 animate-bounce">
            {reviewToast}
          </div>
        )}

        {/* نافذة تأكيد تسليم الاختبار النهائي */}
        {showConfirmFinishModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl border border-slate-300 max-w-md w-full overflow-hidden text-right" dir="rtl">
              <div className="bg-[#1b4f72] text-white px-5 py-3 font-bold text-base flex justify-between items-center">
                <span>تأكيد إنهاء الاختبار وتسليمه</span>
                <button
                  type="button"
                  onClick={() => setShowConfirmFinishModal(false)}
                  className="text-white hover:text-red-200 text-lg font-bold"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                {unansweredCount > 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded text-amber-900 text-sm leading-relaxed">
                    ⚠️ <strong>تنبيه هام:</strong> لديك <strong>{unansweredCount}</strong> أسئلة غير مكتملة (لم تقم بالإجابة عليها).
                    <p className="mt-2 text-xs text-amber-800">
                      هل أنت متأكد من إنهاء المراجعة وتسليم الاختبار نهائياً؟
                    </p>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                    لقد قمت بالإجابة على جميع الأسئلة ({safeQuestions.length} سؤالاً).
                    <br />
                    هل أنت متأكد من إنهاء المراجعة وتسليم الاختبار والاطلاع على النتيجة النهائية؟
                  </p>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowConfirmFinishModal(false)}
                    className="px-5 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-bold transition"
                  >
                    العودة للمراجعة
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirmFinishModal(false);
                      finishTest();
                    }}
                    className="px-6 py-2 rounded bg-[#1b4f72] hover:bg-[#154360] text-white text-sm font-bold transition shadow"
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
    <div className="w-screen h-screen bg-black flex justify-center items-center overflow-hidden select-none" dir="rtl">
      {/* Container Interface */}
      <div className="w-full h-full bg-white flex flex-col overflow-hidden">
        
        {/* ================= 1. الشريط العلوي الرئيسي (Top Navigation Bar: #005A8C, 48px) ================= */}
        <header className="bg-[#005A8C] text-white flex justify-between items-center px-4 h-12 shrink-0 border-b border-white/20 select-none">
          {/* Top Left: Timer & Question Counter */}
          <div className="flex items-center gap-5 text-sm sm:text-[15px] font-medium">
            {/* Timer */}
            <div className="flex items-center gap-1.5 font-mono">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>{isTimed ? `الوقت المتبقي ${formatTime(timeLeft)}` : 'تدريب حر 🎯'}</span>
            </div>

            {/* Question Counter */}
            <div className="flex items-center gap-1.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span>{currentIdx + 1} من {safeQuestions.length}</span>
            </div>
          </div>

          {/* Top Right: Lightning Icon & Exam/Course Title */}
          <div className="flex items-center gap-2 text-sm sm:text-base font-medium truncate max-w-[55%]">
            <span className="text-[#ffeb3b] text-lg font-bold">⚡</span>
            <span className="truncate">
              {examTitle || 'محاكي الأقسام - النظام الأزرق'}
              {currentUser?.name ? ` - ${currentUser.name}` : ''}
            </span>
          </div>
        </header>

        {/* ================= 2. شريط الخيارات والأدوات الفرعي (Action Control Bar: #005A8C, 38px) ================= */}
        <div className="bg-[#005A8C] border-t border-white/20 flex items-center h-[38px] px-2 shrink-0 select-none overflow-x-auto text-sm">
          {/* زر تمييز السؤال للمراجعة */}
          <button
            type="button"
            onClick={toggleMarkForReview}
            className={`h-full px-4 flex items-center gap-2 text-white text-sm cursor-pointer border-l border-white/30 transition hover:bg-white/10 ${
              isCurrentMarked ? 'bg-[#ffeb3b]/25 text-[#ffeb3b] font-bold' : ''
            }`}
            title="تمييز السؤال للمراجعة"
          >
            <Flag className={`w-4 h-4 ${isCurrentMarked ? 'text-[#ffeb3b] fill-[#ffeb3b]' : 'text-white'}`} />
            <span>{isCurrentMarked ? 'السؤال مميز للمراجعة ✓' : 'تمييز السؤال للمراجعة'}</span>
          </button>

          {/* زر تغيير حجم الخط (خط عادي / خط كبير) */}
          <button
            type="button"
            onClick={toggleFontSize}
            className="h-full px-4 flex items-center gap-2 text-white text-sm cursor-pointer border-l border-white/30 transition hover:bg-white/10"
            title="تبديل حجم الخط"
          >
            <Type className="w-4 h-4 text-white" />
            <span>{fontSizeMode === 'normal' ? 'خط عادي' : 'خط كبير'}</span>
          </button>

          {/* إضافة السؤال لمجلد مخصص */}
          <button
            type="button"
            onClick={() => setShowFolderModalForQ(currentQ)}
            className="h-full px-4 flex items-center gap-2 text-white text-sm cursor-pointer border-l border-white/30 transition hover:bg-white/10"
            title="حفظ في مجلد مخصص"
          >
            <FolderPlus className="w-4 h-4 text-white" />
            <span>
              {currentQCustomFolders.length > 0
                ? `في (${currentQCustomFolders.length}) مجلدات`
                : 'حفظ في مجلد'}
            </span>
          </button>

          {/* زر التعليمات */}
          <button
            type="button"
            onClick={() => setShowExamInstructionsModal(true)}
            className="h-full px-4 flex items-center gap-2 text-white text-sm cursor-pointer border-l border-white/30 transition hover:bg-white/10"
            title="تعليمات الاختبار"
          >
            <FileText className="w-4 h-4 text-white" />
            <span>التعليمات</span>
          </button>

          {/* زر إنهاء الاختبار والانتقال للمراجعة */}
          <button
            type="button"
            onClick={() => setShowFinalReview(true)}
            className="h-full px-4 flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#ffeb3b] hover:bg-white/10 transition cursor-pointer border-l border-white/30"
            title="إنهاء الاختبار والانتقال لصفحة المراجعة النهائية"
          >
            <Flag className="w-3.5 h-3.5 fill-[#ffeb3b]" />
            <span>إنهاء الاختبار</span>
          </button>

          {/* زر الخروج السريع في أقصى اليمين/اليسار */}
          <div className="mr-auto flex items-center">
            <button
              type="button"
              onClick={handleRequestExit}
              className="h-full px-3 py-1 flex items-center gap-1.5 text-xs text-white/90 hover:text-white hover:bg-white/10 rounded transition cursor-pointer"
              title="خروج من الاختبار"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>

        {/* ================= 3. منطقة عرض السؤال والتقسيم (Main Content Layout: Split Screen) ================= */}
        {/*
            التقسيم نصفين متساويين 50% / 50%:
            - الجزء الأيسر (question-pane): فارغ تماماً وأبيض مع الخط الفاصل الأزرق العريض (border-l-[12px] solid #005A8C)
            - الجزء الأيمن (options-pane): يعرض نص السؤال باللون البنفسجي الغامق #4a148c والخيارات كـ radio list
        */}
        <main className="flex flex-1 h-[calc(100vh-128px)] bg-white overflow-hidden">
          {/* الجزء الأيسر: فارغ تماماً وأبيض مع الفاصل الأزرق العريض على اليسار (أو بين النصفين حسب RTL) */}
          {/* في نظام RTL: العنصر الأول يظهر على اليمين إذا لم يُعكس، لذا نضع options-pane أولاً لليمين أو نعين flex-row مع ترتيب صريح */}
          {/* ترتيب العناصر: options-pane في اليمين، question-pane في اليسار مع الفاصل الأزرق المتطابق تماماً مع CSS المستخدم */}
          
          {/* الجزء الأيمن (السؤال والخيارات) */}
          <section className="w-1/2 p-8 sm:p-10 lg:px-12 lg:py-10 flex flex-col overflow-y-auto bg-white">
            {/* نص السؤال باللون البنفسجي المميز المعتمد في التصميم (#4a148c) */}
            {currentQ.questionText && (
              <h2
                className={`text-[#4a148c] font-bold mb-7 leading-relaxed ${
                  fontSizeMode === 'large' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-[22px]'
                }`}
              >
                {currentQ.questionText}
              </h2>
            )}

            {/* في حال وجود صورة للسؤال */}
            {currentQ.imageUrl && (
              <div className="mb-6 p-2 bg-slate-50 border border-slate-200 rounded-lg relative group max-w-md">
                <img
                  src={currentQ.imageUrl}
                  alt="صورة السؤال"
                  className="max-h-60 mx-auto rounded object-contain cursor-pointer transition hover:opacity-95"
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
                  className="absolute top-2 left-2 px-2.5 py-1 rounded bg-[#005A8C] text-white text-xs font-bold flex items-center gap-1 shadow cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>تكبير</span>
                </button>
              </div>
            )}

            {/* قائمة الخيارات (Options List) بتصميم الـ radio item التفاعلي المطابق */}
            <div className="flex flex-col gap-5 sm:gap-[22px]">
              {safeOptions.map((option, optIdx) => {
                const isSelected = selectedAnswers[currentIdx] === optIdx;

                return (
                  <label
                    key={optIdx}
                    onClick={() => handleSelectOption(currentIdx, optIdx)}
                    className={`flex items-center justify-between cursor-pointer text-[#2c2c2c] transition select-none ${
                      fontSizeMode === 'large' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-[20px]'
                    }`}
                  >
                    <span className={`leading-relaxed ${isSelected ? 'font-bold text-[#005A8C]' : 'font-normal'}`}>
                      {option}
                    </span>
                    <input
                      type="radio"
                      name={`quiz-option-${currentIdx}`}
                      checked={isSelected}
                      onChange={() => handleSelectOption(currentIdx, optIdx)}
                      className="w-5 h-5 accent-[#005A8C] cursor-pointer shrink-0 mr-3"
                    />
                  </label>
                );
              })}
            </div>
          </section>

          {/* الجزء الأيسر (فارغ تماماً باللون الأبيض مع الخط الفاصل الأزرق #005A8C) */}
          <section className="w-1/2 bg-white border-r-[12px] border-[#005A8C]" />
        </main>

        {/* ================= 4. الشريط السفلي للتنقل (Bottom Control Bar: #005A8C, 42px) ================= */}
        <footer className="bg-[#005A8C] h-[42px] flex justify-between items-center shrink-0 select-none px-0">
          {/* زر المعادلات وإنهاء الاختبار في اليمين */}
          <div className="flex items-center h-full">
            <button
              type="button"
              onClick={() => setShowEquationsModal(true)}
              className="bg-transparent border-none text-white h-full px-5 text-sm sm:text-base font-bold flex items-center gap-2 cursor-pointer border-l border-white/30 hover:bg-white/10 transition"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>المعادلات</span>
            </button>

            {/* زر إنهاء الاختبار المباشر في الشريط السفلي */}
            <button
              type="button"
              onClick={() => setShowFinalReview(true)}
              className="bg-transparent border-none text-[#ffeb3b] hover:bg-white/10 h-full px-4 text-sm font-bold flex items-center gap-1.5 cursor-pointer border-l border-white/30 transition"
              title="إنهاء الاختبار والانتقال للمراجعة النهائية"
            >
              <Flag className="w-4 h-4 fill-[#ffeb3b]" />
              <span>إنهاء الاختبار</span>
            </button>
          </div>

          {/* زر السابق والتالي / إنهاء ومراجعة الاختبار في اليسار */}
          <div className="flex items-center h-full">
            {/* زر السابق للتنقل العكسي إن رغب الطالب */}
            {currentIdx > 0 && (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="bg-transparent border-none text-white h-full px-5 text-sm font-bold flex items-center gap-1.5 cursor-pointer border-r border-white/30 hover:bg-white/10 transition"
              >
                <span>السابق →</span>
              </button>
            )}

            {/* زر التالي / تسليم وإنهاء الاختبار */}
            <button
              type="button"
              onClick={() => {
                if (currentIdx < safeQuestions.length - 1) {
                  setCurrentIdx(currentIdx + 1);
                } else {
                  setShowFinalReview(true);
                }
              }}
              className="bg-transparent border-none text-white h-full px-6 text-base font-bold flex items-center gap-2 cursor-pointer border-r border-white/30 hover:bg-white/10 transition"
            >
              <span>{currentIdx < safeQuestions.length - 1 ? '← التالي' : 'إنهاء الاختبار ⚑'}</span>
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
};
