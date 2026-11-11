import React, { useState, useEffect } from 'react';
import {
  Send,
  KeyRound,
  AlertCircle,
  Mail,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Bot,
  Sparkles,
} from 'lucide-react';
import { StudentUser } from '../types';

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
  onLoginSuccess?: (user: StudentUser) => void;
}

export const TelegramLoginCard: React.FC<TelegramLoginCardProps> = ({
  errorMessage,
  onSwitchToEmail,
  onLoginSuccess,
}) => {
  const [directCode, setDirectCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [localError, setLocalError] = useState('');

  const BOT_URL = 'https://t.me/Ra3d6_bot';

  // Handle direct code verification
  const handleVerifyDirectCode = async (codeToVerify?: string) => {
    const targetCode = (codeToVerify !== undefined ? codeToVerify : directCode).trim();
    if (!targetCode || targetCode.length < 4) {
      setLocalError('يرجى إدخال الكود المكون من 6 أرقام المستلم من البوت');
      return;
    }

    setLocalError('');
    setIsSubmitting(true);

    try {
      const resp = await fetch('/api/telegram/verify-direct-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ code: targetCode }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch (jsonErr) {
        throw new Error(`استجابة غير متوقعة من السيرفر (كود ${resp.status})`);
      }

      if (data && data.success && data.user) {
        setStatusMessage('تم التحقق بنجاح! جاري التوجيه إلى لوحة التحكم...');

        const safeUser: StudentUser = {
          ...data.user,
          enrolledCourseIds: Array.isArray(data.user.enrolledCourseIds) ? data.user.enrolledCourseIds : [],
          watchedVideoIds: Array.isArray(data.user.watchedVideoIds) ? data.user.watchedVideoIds : [],
        };

        // Guarantee session storage in both keys
        try {
          localStorage.setItem('raad_student_auth_session', JSON.stringify(safeUser));
          localStorage.setItem('raad_student_session', JSON.stringify(safeUser));
        } catch (e) {}

        if (onLoginSuccess) {
          onLoginSuccess(safeUser);
        } else {
          window.location.reload();
        }
      } else {
        setLocalError(data?.error || data?.message || 'كود الدخول غير صحيح أو انتهت صلاحيته. اطلب كوداً جديداً عبر كتابة /code في البوت.');
      }
    } catch (err: any) {
      console.error('Verify Direct Code Error:', err);
      setLocalError(err.message || 'حدث خطأ أثناء الاتصال بالسيرفر. يرجى إعادة المحاولة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setDirectCode(val);
    if (val.length === 6 && !isSubmitting) {
      handleVerifyDirectCode(val);
    }
  };

  const displayError = localError || errorMessage;

  return (
    <div
      dir="rtl"
      className="w-full max-w-md mx-auto rounded-3xl bg-[#1E293B] border border-slate-700/80 shadow-2xl p-6 sm:p-7 text-right transition-all duration-300 select-none text-slate-100 font-sans"
    >
      {/* ================= 1. رأس الكارت ================= */}
      <div className="flex flex-col items-center text-center space-y-3 pb-5 border-b border-slate-700/60">
        {/* أيقونة تليجرام الزرقاء الرسمية */}
        <div className="w-16 h-16 rounded-2xl bg-[#24A1DE] flex items-center justify-center shadow-lg shadow-[#24A1DE]/30 ring-4 ring-[#24A1DE]/20">
          <Send className="w-8 h-8 text-white fill-current -translate-x-0.5 translate-y-0.5" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide flex items-center justify-center gap-2">
            <span>تسجيل الدخول عبر تليجرام</span>
            <span className="text-[#24A1DE]">⚡</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed max-w-xs mx-auto">
            التسجيل السريع واللحظي عبر بوت تليجرام المعتمد
          </p>
        </div>
      </div>

      {/* رسالة الخطأ */}
      {displayError && (
        <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{displayError}</span>
        </div>
      )}

      {/* رسالة النجاح */}
      {statusMessage && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* ================= 2. زر فتح البوت الرسمي (الزر الأزرق المطلوب) ================= */}
      <div className="mt-5 space-y-4">
        {/* الزر الأزرق الأنيق المعتمد بشعار تليجرام */}
        <a
          href={BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3.5 px-4 rounded-2xl bg-[#24A1DE] hover:bg-[#1E96D1] active:scale-[0.99] text-white text-sm sm:text-base font-black flex items-center justify-center gap-2.5 shadow-xl shadow-[#24A1DE]/30 transition-all cursor-pointer group"
        >
          <Send className="w-5 h-5 fill-current group-hover:-translate-x-0.5 transition-transform" />
          <span>تسجيل الدخول عبر تليجرام</span>
          <ExternalLink className="w-4 h-4 opacity-80" />
        </a>

        {/* ================= 3. خطوات الدخول السريعة ================= */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700/70 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-black text-sky-400">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>خطوات تسجيل الدخول في 3 ثوانٍ:</span>
          </div>

          <ol className="space-y-1.5 text-slate-300 text-[11px] leading-relaxed pr-3 list-decimal">
            <li>
              اضغط على الزر الأزرق أعلاه لفتح البوت <strong className="text-white">@Ra3d6_bot</strong> مباشرة.
            </li>
            <li>
              اكتب أمر <strong className="text-sky-300 font-mono bg-sky-950/60 px-1 py-0.5 rounded border border-sky-800/60">/code</strong> في البوت وسيصلك كود الدخول فوراً وبشكل لحظي.
            </li>
            <li>
              أدخل الكود المكون من 6 أرقام في الخانة أدناه ليتم دخولك فوراً للمنصة.
            </li>
          </ol>
        </div>

        {/* ================= 4. خانة إدخال الكود المباشر ================= */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleVerifyDirectCode();
          }}
          className="space-y-3.5 pt-1"
        >
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              كود التحقق المستلم من البوت (6 أرقام):
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="text"
                dir="ltr"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={directCode}
                onChange={handleInputChange}
                placeholder="------"
                className="w-full pr-10 pl-4 py-3 text-xl font-mono font-bold tracking-[0.4em] text-center bg-slate-900 border-2 border-sky-500/50 hover:border-sky-400 focus:border-sky-400 rounded-xl text-white placeholder-slate-600 focus:outline-none transition"
                disabled={isSubmitting}
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              يتم التحقق تلقائياً فور كتابة الـ 6 أرقام ⚡
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || directCode.trim().length < 4}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>جاري التحقق والدخول...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>تأكيد الكود والدخول للمنصة 🚀</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* التبديل للدخول بالبريد الإلكتروني */}
      {onSwitchToEmail && (
        <div className="mt-5 pt-3.5 border-t border-slate-700/60 text-center">
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
