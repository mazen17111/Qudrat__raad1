import React from 'react';
import {
  ArrowRight,
  ZoomIn,
  Check,
  FolderPlus,
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
                onClick={finishTest}
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
                    finishTest();
                  }
                }}
                className="bg-[#00a59a] hover:bg-[#008f85] text-white border-none py-2.5 px-6 rounded-md text-base font-bold cursor-pointer transition shadow-sm"
              >
                {currentIdx < safeQuestions.length - 1 ? 'حفظ والتالي' : 'إنهاء وتسليم الاختبار ✓'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
