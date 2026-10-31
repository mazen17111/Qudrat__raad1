import React, { useState } from 'react';

interface PlatformFooterProps {
  isDarkMode: boolean;
  onSecretTriggerAdmin: () => void;
}

export const PlatformFooter: React.FC<PlatformFooterProps> = ({
  isDarkMode,
  onSecretTriggerAdmin,
}) => {
  // Secret Admin 20-clicks trigger strictly on the word "محفوظة" in sentence 2
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

  return (
    <footer
      className={`mt-auto border-t select-none transition-colors py-3.5 px-4 sm:px-8 md:px-12 ${
        isDarkMode
          ? 'bg-slate-950/95 border-slate-800/80 text-slate-400'
          : 'bg-white border-slate-200 text-slate-700 shadow-xs'
      }`}
    >
      <div className="max-w-[1700px] mx-auto space-y-2.5">
        {/* Row 1: The 3 Main Sentences (Right - Center - Left on the same level) */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs md:text-sm font-bold">
          {/* Right (عاليمين) */}
          <div className={`text-center md:text-right w-full md:w-1/3 ${
            isDarkMode ? 'text-slate-300' : 'text-slate-800 font-bold'
          }`}>
            المصمم مازن محمد محروس
          </div>

          {/* Center (فالنص - 20 clicks strictly on 'محفوظة' without pointer or button styling) */}
          <div
            className={`text-center w-full md:w-1/3 cursor-default select-none py-0.5 ${
              isDarkMode ? 'text-slate-200' : 'text-slate-950 font-black'
            }`}
          >
            جميع محتويات المنصة <span onClick={handleSecretWordClick} className="cursor-default select-none">محفوظة</span> لمنصة أقسام رعد © 2026م
          </div>

          {/* Left (عاليسار) */}
          <div className="text-center md:text-left w-full md:w-1/3 text-amber-500 font-black">
            منصة أقسام رعد تضمن لك المئوية بإذن الله ⚡
          </div>
        </div>

        {/* Row 2: "دخلهم فالنص وحط كلام عاليمين وعاليسار بنفس المستوى" */}
        <div className={`pt-2.5 border-t flex flex-col md:flex-row items-center justify-between gap-2.5 text-[11px] font-bold ${
          isDarkMode ? 'border-slate-800/80 text-slate-400' : 'border-slate-100 text-slate-600'
        }`}>
          {/* كلام عاليمين بنفس المستوى */}
          <div className={`text-center md:text-right w-full md:w-1/3 ${
            isDarkMode ? 'text-slate-400' : 'text-slate-600'
          }`}>
            <span>⚖️ جميع الحقوق وبنوك الأسئلة والشروحات محمية نظامياً</span>
          </div>

          {/* دخلهم فالنص (التاريخ تأسست 2026 والشارات بالمنتصف) */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap w-full md:w-1/3 text-center">
            <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-black border border-amber-500/25 text-[10px] sm:text-[11px] whitespace-nowrap shadow-xs">
              📅 تأسست: 2026م
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 text-[10px] sm:text-[11px] whitespace-nowrap">
              📜 شهادات معتمدة
            </span>
            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-bold border border-purple-500/20 text-[10px] sm:text-[11px] whitespace-nowrap">
              🇸🇦 المملكة العربية السعودية
            </span>
          </div>

          {/* كلام عاليسار بنفس المستوى */}
          <div className="text-center md:text-left w-full md:w-1/3 text-amber-500/90 font-bold">
            <span>🎯 تدريب وتأهيل متقدم لاختبارات قياس والقدرات والتحصيلي</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
