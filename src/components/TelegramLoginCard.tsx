import React from 'react';
import { Send, AlertCircle, Mail } from 'lucide-react';

export interface TelegramAccount {
  id: string | number;
  name: string;
  username?: string;
  photoUrl?: string;
}

interface TelegramLoginCardProps {
  accounts?: TelegramAccount[];
  defaultSelectedId?: string | number;
  onLogin?: (selectedAccount: TelegramAccount) => void;
  onUseAnotherAccount?: () => void;
  widgetNode?: React.ReactNode;
  isAddingNew?: boolean;
  isLoading?: boolean;
  errorMessage?: string;
  onSwitchToEmail?: () => void;
  onBotLoginClick?: () => void;
  isWaitingForBotAuth?: boolean;
  onCancelWaitingBotAuth?: () => void;
}

export const TelegramLoginCard: React.FC<TelegramLoginCardProps> = ({
  widgetNode,
  errorMessage,
  onSwitchToEmail,
}) => {
  return (
    <div
      dir="rtl"
      className="w-full max-w-md mx-auto rounded-3xl bg-[#1E293B] border border-slate-700/80 shadow-2xl p-6 sm:p-7 text-right transition-all duration-300 select-none text-slate-100 font-sans"
    >
      {/* ================= 1. رأس الكارت ================= */}
      <div className="flex flex-col items-center text-center space-y-3 pb-5 border-b border-slate-700/60">
        {/* أيقونة تليجرام الدائرية الزرقاء */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/25 ring-4 ring-sky-500/20">
          <Send className="w-7 h-7 text-white fill-current -translate-x-0.5 translate-y-0.5" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
            تسجيل الدخول بتليجرام
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-medium leading-relaxed max-w-xs mx-auto">
            اضغط على زر تليجرام أدناه للمتابعة وتسجيل الدخول الفوري.
          </p>
        </div>
      </div>

      {/* رسالة الخطأ إن وجدت */}
      {errorMessage && (
        <div className="mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ================= 2. زر تسجيل الدخول بتليجرام فقط ================= */}
      <div className="my-5 p-5 rounded-2xl bg-slate-800/70 border border-slate-700 text-center space-y-3">
        <p className="text-xs text-slate-300 font-medium leading-relaxed">
          تسجيل الدخول عبر تليجرام:
        </p>

        {/* زر ويدجت تليجرام الرسمي */}
        <div className="flex justify-center items-center min-h-[46px] w-full pt-1">
          {widgetNode}
        </div>
      </div>

      {/* التبديل للدخول بالبريد الإلكتروني */}
      {onSwitchToEmail && (
        <div className="pt-3 border-t border-slate-700/60 text-center">
          <button
            type="button"
            onClick={onSwitchToEmail}
            className="text-xs text-sky-400 hover:text-sky-300 font-bold transition cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>الدخول عبر البريد الإلكتروني وكلمة المرور</span>
          </button>
        </div>
      )}
    </div>
  );
};
