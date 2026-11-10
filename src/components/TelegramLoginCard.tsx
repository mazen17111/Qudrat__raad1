import React, { useState, useEffect } from 'react';
import {
  Send,
  Phone,
  KeyRound,
  AlertCircle,
  Mail,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Bot
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
  widgetNode,
  errorMessage,
  onSwitchToEmail,
  onLoginSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'phone' | 'direct'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [directCode, setDirectCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [botDeepLink, setBotDeepLink] = useState('');
  const [notLinkedWarning, setNotLinkedWarning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [localError, setLocalError] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  // Countdown timer for OTP resend
  useEffect(() => {
    let timer: any;
    if (resendCountdown > 0) {
      timer = setInterval(() => {
        setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Request OTP via Telegram Bot
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phone || phone.trim().length < 8) {
      setLocalError('يرجى كتابة رقم الهاتف بشكل صحيح (مثال: 0512345678)');
      return;
    }

    setLocalError('');
    setStatusMessage('');
    setIsSubmitting(true);
    setNotLinkedWarning(false);

    try {
      const resp = await fetch('/api/telegram/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await resp.json();

      if (data.success && data.linked) {
        setStatusMessage(data.message || 'تم إرسال كود التحقق بنجاح إلى حسابك في تليجرام!');
        setStep('otp');
        setResendCountdown(60);
      } else if (data.notLinked) {
        setNotLinkedWarning(true);
        setBotDeepLink(data.botUrl || `https://t.me/Ra3d6_bot?start=link_${data.cleanDigits || phone}`);
        setLocalError(data.message || 'رقم هاتفك غير مربوط بالبوت بعد. اضغط على الزر أدناه لربطه بنقرة واحدة.');
        // Also allow moving to OTP in case they open bot and get code
        setStep('otp');
      } else {
        setLocalError(data.error || 'فشل إرسال كود التحقق. يرجى التأكد من الرقم والمحاولة مجدداً.');
      }
    } catch (err: any) {
      setLocalError('تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verify OTP and finish login
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!otp || otp.trim().length < 4) {
      setLocalError('يرجى إدخال كود التحقق المكون من 6 أرقام');
      return;
    }

    setLocalError('');
    setIsSubmitting(true);

    try {
      const resp = await fetch('/api/telegram/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: otp.trim() }),
      });
      const data = await resp.json();

      if (data.success && data.user) {
        setStatusMessage('تم التحقق بنجاح! جاري تسجيل الدخول...');
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        } else {
          window.location.reload();
        }
      } else {
        setLocalError(data.error || 'كود التحقق غير صحيح أو انتهت صلاحيته.');
      }
    } catch (err: any) {
      setLocalError('حدث خطأ أثناء تأكيد الكود. يرجى المحاولة ثانية.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verify Direct Code from Bot
  const handleVerifyDirectCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!directCode || directCode.trim().length < 4) {
      setLocalError('يرجى إدخال الكود المباشر المستلم من البوت');
      return;
    }

    setLocalError('');
    setIsSubmitting(true);

    try {
      const resp = await fetch('/api/telegram/verify-direct-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: directCode.trim() }),
      });
      const data = await resp.json();

      if (data.success && data.user) {
        setStatusMessage('تم التحقق بنجاح! جاري تسجيل الدخول...');
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        } else {
          window.location.reload();
        }
      } else {
        setLocalError(data.error || 'كود الدخول غير صحيح أو منتهي الصلاحية.');
      }
    } catch (err: any) {
      setLocalError('حدث خطأ أثناء التحقق. يرجى المحاولة ثانية.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || errorMessage;

  return (
    <div
      dir="rtl"
      className="w-full max-w-md mx-auto rounded-3xl bg-[#1E293B] border border-slate-700/80 shadow-2xl p-6 sm:p-7 text-right transition-all duration-300 select-none text-slate-100 font-sans"
    >
      {/* ================= 1. رأس الكارت ================= */}
      <div className="flex flex-col items-center text-center space-y-3 pb-4 border-b border-slate-700/60">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/25 ring-4 ring-sky-500/20">
          <Send className="w-7 h-7 text-white fill-current -translate-x-0.5 translate-y-0.5" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide flex items-center justify-center gap-2">
            <span>تسجيل الدخول بتليجرام</span>
            <span className="text-sky-400 text-sm">⚡</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-medium leading-relaxed max-w-xs mx-auto">
            أدخل رقم هاتفك لاستلام رمز التحقق الفوري (OTP) عبر بوت تليجرام
          </p>
        </div>
      </div>

      {/* شريط التبديل بين طريقة رقم الهاتف والكود المباشر */}
      <div className="flex items-center gap-2 p-1 mt-4 rounded-xl bg-slate-900/80 border border-slate-700/60 text-xs font-bold">
        <button
          type="button"
          onClick={() => {
            setActiveTab('phone');
            setLocalError('');
          }}
          className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
            activeTab === 'phone'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          <span>رقم الهاتف ورمز OTP</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('direct');
            setLocalError('');
          }}
          className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
            activeTab === 'direct'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>كود البوت السريع</span>
        </button>
      </div>

      {/* رسالة الخطأ */}
      {displayError && (
        <div className="mt-3.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{displayError}</span>
        </div>
      )}

      {/* رسالة النجاح */}
      {statusMessage && (
        <div className="mt-3.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* ================= TAB 1: PHONE + OTP ================= */}
      {activeTab === 'phone' && (
        <div className="mt-4 space-y-4">
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  رقم الهاتف (المرتبط بتليجرام):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05XXXXXXXX"
                    className="w-full pr-10 pl-4 py-2.5 text-sm bg-slate-900/90 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono tracking-wider text-right"
                    disabled={isSubmitting}
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  يدعم الأرقام السعودية (05...) والدولية (+966...).
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !phone.trim()}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30 transition disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري إرسال الرمز...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 fill-current" />
                    <span>إرسال رمز التحقق عبر تليجرام ✈️</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* STEP 2: OTP ENTRY */
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-800/60 text-xs text-sky-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">📱 الرقم المطلوب:</span>
                  <span className="font-mono text-sky-300 font-bold" dir="ltr">{phone}</span>
                </div>
                <p className="text-[11px] text-sky-300/80">
                  تم إرسال رمز مكون من 6 أرقام إلى رسائلك مع بوت تليجرام @Ra3d6_bot
                </p>
              </div>

              {/* إذا كان الرقم غير مربوط بعد، نظهر زر الربط السريع بنقرة واحدة */}
              {notLinkedWarning && botDeepLink && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-200 text-xs space-y-2.5">
                  <div className="flex items-center gap-1.5 font-black text-amber-300">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>الرقم غير مربوط بعد؟ اربطه فوراً بنقرة واحدة:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-300">
                    اضغط على الزر أدناه لفتح البوت؛ وسيقوم البوت بربط رقمك وإعطائك رمز التحقق فوراً:
                  </p>
                  <a
                    href={botDeepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-md hover:from-amber-400 hover:to-amber-500 transition cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>فتح البوت @Ra3d6_bot للربط الفوري 🚀</span>
                  </a>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  أدخل رمز التحقق (OTP):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    dir="ltr"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full pr-10 pl-4 py-3 text-lg font-mono tracking-[0.5em] text-center bg-slate-900 border-2 border-sky-500/60 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-sky-400"
                    disabled={isSubmitting}
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || otp.trim().length < 4}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري التحقق...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>تأكيد الرمز وتسجيل الدخول 🚀</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setLocalError('');
                    setNotLinkedWarning(false);
                  }}
                  className="text-slate-400 hover:text-white flex items-center gap-1 transition cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>تعديل رقم الهاتف</span>
                </button>

                <button
                  type="button"
                  disabled={resendCountdown > 0 || isSubmitting}
                  onClick={() => handleSendOtp()}
                  className="text-sky-400 hover:text-sky-300 disabled:text-slate-500 transition cursor-pointer font-bold"
                >
                  {resendCountdown > 0 ? (
                    <span>إعادة الإرسال خلال ({resendCountdown} ث)</span>
                  ) : (
                    <span>إعادة إرسال الرمز 🔄</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ================= TAB 2: DIRECT BOT CODE / WIDGET ================= */}
      {activeTab === 'direct' && (
        <div className="mt-4 space-y-4">
          <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs space-y-2.5">
            <div className="flex items-center gap-2 text-sky-400 font-black">
              <Bot className="w-4 h-4" />
              <span>الحصول على كود الدخول مباشرة من البوت:</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-300">
              افتح البوت واضغط على زر <strong className="text-white">"🔑 كود تسجيل الدخول السريع"</strong> أو أرسل كلمة <strong className="text-white">/code</strong>، ثم اكتب الكود المباشر هنا:
            </p>
            <a
              href="https://t.me/Ra3d6_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-3 rounded-xl bg-sky-600/30 border border-sky-500/50 hover:bg-sky-600/40 text-sky-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح بوت تليجرام @Ra3d6_bot ✈️</span>
            </a>
          </div>

          <form onSubmit={handleVerifyDirectCode} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                الكود المباشر من البوت (6 أرقام):
              </label>
              <input
                type="text"
                dir="ltr"
                maxLength={6}
                value={directCode}
                onChange={(e) => setDirectCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full py-2.5 px-4 text-center text-lg font-mono tracking-widest bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-sky-500"
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || directCode.trim().length < 4}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>الدخول بالكود المباشر ⚡</span>
            </button>
          </form>

          {/* ويدجت تليجرام كخيار إضافي */}
          {widgetNode && (
            <div className="pt-2 border-t border-slate-700/60 text-center space-y-2">
              <span className="text-[11px] text-slate-400 block">أو عبر زر تليجرام الرسمي:</span>
              <div className="flex justify-center items-center min-h-[46px] w-full">
                {widgetNode}
              </div>
            </div>
          )}
        </div>
      )}

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
