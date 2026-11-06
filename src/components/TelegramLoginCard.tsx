import React, { useState, useEffect } from 'react';
import { Send, AlertCircle, Mail, Bot, ExternalLink, Loader2, Settings, Check, Copy, Zap, CheckCircle2, RefreshCw } from 'lucide-react';

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
  onBotLoginClick,
  isWaitingForBotAuth = false,
  onCancelWaitingBotAuth,
}) => {
  const [showWebhookTools, setShowWebhookTools] = useState(false);
  const [botTokenInput, setBotTokenInput] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isSettingWebhook, setIsSettingWebhook] = useState(false);
  const [setupFeedback, setSetupFeedback] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch webhook status
  const checkWebhookStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const resp = await fetch('/api/telegram/status');
      if (resp.ok) {
        const data = await resp.json();
        setWebhookStatus(data);
      }
    } catch (e) {
      // Ignore
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (showWebhookTools) {
      checkWebhookStatus();
    }
  }, [showWebhookTools]);

  // Install / Set webhook via token
  const handleSaveWebhook = async () => {
    if (!botTokenInput.trim()) {
      setSetupFeedback('الرجاء إدخال رمز Bot Token من @BotFather');
      return;
    }
    setIsSettingWebhook(true);
    setSetupFeedback(null);
    try {
      const resp = await fetch('/api/telegram/setup-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botTokenInput.trim() }),
      });
      const resData = await resp.json();
      if (resData.success) {
        setSetupFeedback('✅ تم تثبيت وتفعيل الـ Webhook بنجاح! البوت الآن جاهز لاستقبال ضغطات Start فورياً.');
        setBotTokenInput('');
        checkWebhookStatus();
      } else {
        setSetupFeedback(`❌ حدث خطأ: ${resData.error || 'تأكد من صحة التوكن'}`);
      }
    } catch (err: any) {
      setSetupFeedback(`❌ فشل الاتصال: ${err.message}`);
    } finally {
      setIsSettingWebhook(false);
    }
  };

  // Simulate immediate test login
  const handleSimulateLogin = async () => {
    try {
      await fetch('/api/telegram/simulate-login', { method: 'POST' });
    } catch (e) {}
  };

  const manualWebhookLink = webhookStatus?.manualWebhookUrl || (
    webhookStatus?.webhookUrl
      ? `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=${encodeURIComponent(webhookStatus.webhookUrl)}`
      : 'https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://YOUR_DOMAIN/api/telegram/webhook'
  );

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
            onClick={() => {
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

      {/* لوحة أدوات فحص وتثبيت الـ Webhook */}
      <div className="my-3 pt-2">
        <button
          type="button"
          onClick={() => setShowWebhookTools(!showWebhookTools)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-slate-200 transition border border-slate-700/50 cursor-pointer"
        >
          <span className="flex items-center gap-1.5 font-bold">
            <Settings className="w-3.5 h-3.5 text-purple-400" />
            <span>إعدادات وتثبيت الـ Webhook للبوت</span>
          </span>
          <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded-full text-slate-300">
            {showWebhookTools ? 'إغلاق' : 'عرض الرابط والتثبيت'}
          </span>
        </button>

        {showWebhookTools && (
          <div className="mt-3 p-4 rounded-2xl bg-slate-900 border border-slate-700 space-y-3 text-right text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-200">حالة ربط الـ Webhook:</span>
              <div className="flex items-center gap-2">
                {isLoadingStatus ? (
                  <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                ) : webhookStatus?.hasToken ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>الـ Webhook مفعّل ومتصل</span>
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>بانتظار Bot Token للتفعيل</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={checkWebhookStatus}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400"
                  title="تحديث الحالة"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* رابط التفعيل اليدوي في تليجرام */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-bold text-[11px]">رابط تفعيل الـ Webhook يدويّاً:</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(manualWebhookLink);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 text-[11px]"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLink ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                </button>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 font-mono text-[10px] text-slate-300 break-all select-all border border-slate-800 text-left" dir="ltr">
                {manualWebhookLink}
              </div>
              <p className="text-[10px] text-slate-500 leading-normal">
                استبدل <code className="text-purple-300">&lt;YOUR_BOT_TOKEN&gt;</code> برمز البوت الخاص بك من @BotFather ثم افتح الرابط في المتصفح، أو ألصقه في الأسفل للتفعيل التلقائي.
              </p>
            </div>

            {/* حقل التفعيل التلقائي */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-[11px] font-bold text-slate-300 block">
                تثبيت الـ Webhook تلقائياً (أدخل Bot Token):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="مثال: 7123456789:AAH..."
                  value={botTokenInput}
                  onChange={(e) => setBotTokenInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleSaveWebhook}
                  disabled={isSettingWebhook}
                  className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                >
                  {isSettingWebhook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>تثبيت</span>
                </button>
              </div>
              {setupFeedback && (
                <p className="text-[11px] font-bold mt-1 text-slate-200">
                  {setupFeedback}
                </p>
              )}
            </div>

            {/* زر محاكاة الدخول الفوري للفحص */}
            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleSimulateLogin}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold transition flex items-center gap-1"
              >
                <Zap className="w-3 h-3" />
                <span>تجربة الدخول الفوري (محاكاة ضغط Start)</span>
              </button>
            </div>
          </div>
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
