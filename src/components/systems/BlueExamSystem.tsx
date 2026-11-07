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
          {/* زر المعادلات في اليمين */}
          <div className="flex items-center h-full">
            <button
              type="button"
              onClick={() => setShowEquationsModal(true)}
              className="bg-transparent border-none text-white h-full px-6 text-base font-bold flex items-center gap-2 cursor-pointer border-l border-white/30 hover:bg-white/10 transition"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>المعادلات</span>
            </button>
          </div>

          {/* زر السابق والتالي / تسليم الاختبار في اليسار */}
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

            {/* زر التالي / تسليم الاختبار */}
            <button
              type="button"
              onClick={() => {
                if (currentIdx < safeQuestions.length - 1) {
                  setCurrentIdx(currentIdx + 1);
                } else {
                  finishTest();
                }
              }}
              className="bg-transparent border-none text-white h-full px-6 text-base font-bold flex items-center gap-2 cursor-pointer border-r border-white/30 hover:bg-white/10 transition"
            >
              <span>{currentIdx < safeQuestions.length - 1 ? '← التالي' : 'تسليم الاختبار ✓'}</span>
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
};
