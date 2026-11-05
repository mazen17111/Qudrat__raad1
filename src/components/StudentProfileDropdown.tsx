import React, { useState, useRef, useEffect } from 'react';
import { LogOut, User, Check, ChevronDown, Sparkles, BookOpen } from 'lucide-react';
import { StudentUser, CourseThemeColor } from '../types';
import { COURSE_COLOR_OPTIONS } from '../utils/courseThemes';

interface StudentProfileDropdownProps {
  currentUser: StudentUser;
  onLogout: () => void;
  onNavigateToCourses?: () => void;
  currentThemeColor: CourseThemeColor;
  onSelectThemeColor: (color: CourseThemeColor) => void;
  isDarkMode: boolean;
}

export const StudentProfileDropdown: React.FC<StudentProfileDropdownProps> = ({
  currentUser,
  onLogout,
  onNavigateToCourses,
  currentThemeColor,
  onSelectThemeColor,
  isDarkMode,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click or escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleMyAccountClick = () => {
    setIsOpen(false);
    if (onNavigateToCourses) {
      onNavigateToCourses();
    }
  };

  const handleLogoutClick = () => {
    setIsOpen(false);
    onLogout();
  };

  const handleColorClick = (color: CourseThemeColor) => {
    onSelectThemeColor(color);
  };

  return (
    <div className="relative" ref={dropdownRef} dir="rtl">
      {/* ================= زر الطالب (Trigger Button) ================= */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={`flex items-center gap-2 p-1 sm:pr-2.5 sm:pl-2 rounded-2xl border transition shadow-xs cursor-pointer select-none group ${
          isOpen
            ? isDarkMode
              ? 'bg-slate-700/90 border-sky-500/70 ring-2 ring-sky-500/30'
              : 'bg-white border-sky-400 ring-2 ring-sky-400/30 shadow-md'
            : isDarkMode
            ? 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-750 hover:border-slate-600'
            : 'bg-slate-100/90 border-slate-300 hover:bg-white hover:border-slate-400'
        }`}
        title="اضغط لفتح القائمة وتخصيص الألوان"
      >
        {/* الصورة الدائرية */}
        {currentUser.photoUrl ? (
          <img
            src={currentUser.photoUrl}
            alt={currentUser.name}
            className="w-8 h-8 rounded-full object-cover ring-2 ring-emerald-500/70 shadow-sm shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 text-white font-black text-xs flex items-center justify-center ring-2 ring-sky-400/50 shadow-sm shrink-0">
            {currentUser.name ? currentUser.name.trim().charAt(0) : 'ط'}
          </div>
        )}

        {/* الاسم والمعرف */}
        <div className="hidden sm:flex flex-col text-right min-w-0 pr-0.5">
          <span className={`text-xs font-black truncate max-w-[130px] group-hover:text-sky-400 transition-colors ${
            isDarkMode ? 'text-white' : 'text-slate-900'
          }`}>
            {currentUser.name}
          </span>
          {currentUser.telegramUsername && (
            <span className="text-[10px] text-sky-400 font-bold truncate" dir="ltr">
              @{currentUser.telegramUsername}
            </span>
          )}
        </div>

        {/* سهم مؤشر القائمة */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-sky-400' : ''
          }`}
        />
      </button>

      {/* ================= القائمة المنسدلة (Dropdown Menu) ================= */}
      {isOpen && (
        <div
          className={`absolute left-0 sm:right-auto sm:left-0 mt-2 w-72 rounded-3xl border shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl ${
            isDarkMode
              ? 'bg-slate-900/95 border-slate-700/90 text-white shadow-slate-950/80'
              : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300/60'
          }`}
        >
          {/* 1. ترويسة بيانات الطالب */}
          <div className="p-2 pb-3 mb-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
            {currentUser.photoUrl ? (
              <img
                src={currentUser.photoUrl}
                alt={currentUser.name}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/70 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 text-white font-black text-sm flex items-center justify-center ring-2 ring-sky-400/50 shrink-0">
                {currentUser.name ? currentUser.name.trim().charAt(0) : 'ط'}
              </div>
            )}
            <div className="min-w-0 flex-1 text-right">
              <div className="text-sm font-black truncate text-slate-900 dark:text-white">
                {currentUser.name}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {currentUser.telegramUsername ? `@${currentUser.telegramUsername}` : currentUser.email}
              </div>
            </div>
          </div>

          {/* 2. الخيارات الرئيسية (أولاً: حسابي، ثانياً: تسجيل خروج) */}
          <div className="space-y-1">
            {/* أولاً: كلمة حسابي (تنتقل لواجهة الكورسات) */}
            <button
              type="button"
              onClick={handleMyAccountClick}
              className={`w-full flex items-center gap-2.5 p-2.5 rounded-2xl text-xs font-black transition cursor-pointer ${
                isDarkMode
                  ? 'hover:bg-slate-800 text-slate-200 hover:text-white'
                  : 'hover:bg-slate-100 text-slate-800 hover:text-black'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="text-right flex-1">
                <div className="font-black text-xs">حسابي</div>
                <div className="text-[10px] text-slate-400 font-normal">الانتقال لواجهة الكورسات</div>
              </div>
            </button>

            {/* ثانياً: كلمة تسجيل خروج */}
            <button
              type="button"
              onClick={handleLogoutClick}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-2xl text-xs font-black transition cursor-pointer text-rose-500 dark:text-rose-400 hover:bg-rose-500/10"
            >
              <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center shrink-0">
                <LogOut className="w-4 h-4" />
              </div>
              <div className="text-right flex-1">
                <div className="font-black text-xs">تسجيل خروج</div>
                <div className="text-[10px] text-rose-400/80 font-normal">الخروج الآمن من المنصة</div>
              </div>
            </button>
          </div>

          {/* فاصل */}
          <div className="my-2.5 border-t border-slate-200 dark:border-slate-800" />

          {/* 3. دوائر الألوان لتخصيص الكورس من الداخل */}
          <div className="p-1 text-right">
            <div className="flex items-center justify-between gap-1 mb-2">
              <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>تخصيص لون الكورس 🎨:</span>
              </span>
              <span className="text-[10px] font-bold text-sky-500">
                {COURSE_COLOR_OPTIONS.find((c) => c.id === currentThemeColor)?.label || 'الافتراضي'}
              </span>
            </div>

            {/* صف الدوائر الصغيرة للألوان الستة: احمر، اخضر، ازرق، بنفسجي، وردي، والافتراضي */}
            <div className="flex items-center justify-between gap-1.5 pt-1 px-1">
              {COURSE_COLOR_OPTIONS.map((option) => {
                const isSelected = currentThemeColor === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleColorClick(option.id)}
                    className="flex flex-col items-center gap-1 group cursor-pointer"
                    title={option.label}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${option.circleClass} ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white scale-110 shadow-lg'
                          : 'opacity-85 hover:opacity-100 hover:scale-105'
                      }`}
                    >
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-white stroke-[3] drop-shadow-sm" />
                      )}
                    </div>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 group-hover:text-sky-400 transition-colors">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2 font-medium">
              يتحول شكل الكورس من الداخل فوراً للون المختار
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
