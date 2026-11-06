import React from 'react';
import { Send, AlertCircle, Mail, Bot, Sparkles, ExternalLink, Loader2 } from 'lucide-react';

export interface TelegramAccount {
  id: string | number;
  name: string;
  username?: string;
  photoUrl?: string;
}

interface TelegramLoginCardProps {
  /**
   * قائمة الحسابات المتاحة للاختيار منها (اختياري)
   */
  accounts?: TelegramAccount[];
  /**
   * معرف الحساب المختار افتراضياً (اختياري)
   */
  defaultSelectedId?: string | number;
  /**
   * استدعاء عند تسجيل الدخول (اختياري)
   */
  onLogin?: (selectedAccount: TelegramAccount) => void;
  /**
   * استدعاء عند الضغط على حساب آخر (اختياري)
   */
  onUseAnotherAccount?: () => void;
  /**
   * حاوية زر الودجت الخاص بتليجرام (Telegram Login Widget)
   */
  widgetNode?: React.ReactNode;
  /**
   * هل يتم إظهار الودجت لإضافة حساب جديد
   */
  isAddingNew?: boolean;
  /**
   * حالة التحميل أثناء تسجيل الدخول
   */
  isLoading?: boolean;
  /**
   * رسالة خطأ إن وجدت
   */
  errorMessage?: string;
  /**
   * التحويل للدخول بالبريد الإلكتروني
   */
  onSwitchToEmail?: () => void;
  /**
   * استدعاء عند الضغط على زر الدخول عبر البوت البنفسجي
   */
  onBotLoginClick?: () => void;
  /**
   * هل الواجهة تنتظر تأكيد الدخول من البوت
   */
  isWaitingForBotAuth?: boolean;
  /**
   * إلغاء الانتظار للبوت
   */
  onCancelWaitingBotAuth?: () => void;
}

export const TelegramLoginCard: React.FC<TelegramLoginCardProps> = ({
  widgetNode,
  errorMessage,
  onSwitchToEmail,
  onBotLoginClick,
  isWaitingForBotAuth = false,
  onCancelWaitingBotAuth,
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
            اختر الطريقة الأنسب لك لتسجيل الدخول الفوري بأمان عبر تيليجرام.
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

      {/* ================= 2. منطقة أزرار الدخول عبر تيليجرام ================= */}
      <div className="my-5 p-5 rounded-2xl bg-slate-800/70 border border-slate-700 text-center space-y-3.5">
        <p className="text-xs text-slate-300 font-medium leading-relaxed">
          1. الزر الأساسي المباشر عبر البوت <strong className="text-sky-300 font-mono" dir="ltr">@Ra3d6_bot</strong>:
        </p>

        {/* الزر الأساسي لتسجيل الدخول بتليجرام */}
        <div className="flex justify-center items-center min-h-[46px] w-full pt-0.5">
          {widgetNode}
        </div>

        {/* خط فاصل أنيق بين الزر الأساسي والزر الجديد */}
        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-700"></div>
          <span className="flex-shrink mx-3 text-[11px] text-slate-400 font-bold">أو مباشرة</span>
          <div className="flex-grow border-t border-slate-700"></div>
        </div>

        {/* ================= الزر البنفسجي الجديد المطلوب: تسجيل الدخول عبر التليجرام (عبر البوت) ================= */}
        {isWaitingForBotAuth ? (
          <div className="p-4 rounded-2xl bg-purple-950/50 border-2 border-purple-500/60 text-center space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-center gap-2 text-purple-300 font-black text-xs sm:text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span>جاري انتظار ضغطك على (ابدأ / Start) في شات البوت... ⏳</span>
            </div>
            <p className="text-[11px] text-purple-200/80 leading-relaxed">
              افتح شات البوت واضغط زر <strong>Start</strong> أو <strong>ابدأ</strong>، وسيتم نقلك للوحة التحكم تلقائياً دون كتابة أي أرقام!
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <a
                href="https://t.me/Ra3d6_bot?start=login"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition inline-flex items-center gap-1 shadow-md"
              >
                <span>فتح شات البوت مجدداً</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              {onCancelWaitingBotAuth && (
                <button
                  type="button"
                  onClick={onCancelWaitingBotAuth}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  إلغاء
                </button>
              )}
            </div>
          </div>
        ) : (
          <a
            href="https://t.me/Ra3d6_bot?start=login"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (onBotLoginClick) {
                onBotLoginClick();
              }
            }}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm shadow-xl shadow-purple-600/30 hover:shadow-purple-600/50 hover:scale-[1.01] active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2.5 border border-purple-400/40"
          >
            <Bot className="w-4 h-4 text-purple-200 shrink-0" />
            <span>تسجيل الدخول عبر التليجرام (عبر البوت)</span>
            <ExternalLink className="w-3.5 h-3.5 text-purple-200/80 shrink-0" />
          </a>
        )}
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

      {/* حاشية أمان أسفل الكارت */}
      <p className="mt-3.5 text-center text-[11px] text-slate-500 font-medium">
        🔒 لن يتم مشاركة أي كلمة مرور أو رسائل خاصة إطلاقاً
      </p>
    </div>
  );
};
