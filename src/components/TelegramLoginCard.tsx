import React, { useState } from 'react';
import { Plus, Check, Send, AlertCircle, ArrowLeft, Mail, Sparkles } from 'lucide-react';

export interface TelegramAccount {
  id: string | number;
  name: string;
  username?: string;
  photoUrl?: string;
}

interface TelegramLoginCardProps {
  /**
   * قائمة الحسابات المتاحة للاختيار منها
   */
  accounts?: TelegramAccount[];
  /**
   * معرف الحساب المختار افتراضياً
   */
  defaultSelectedId?: string | number;
  /**
   * استدعاء عند الضغط على زر تسجيل الدخول بالحساب المختار
   */
  onLogin?: (selectedAccount: TelegramAccount) => void;
  /**
   * استدعاء عند الضغط على "استخدام حساب آخر"
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
}

export const TelegramLoginCard: React.FC<TelegramLoginCardProps> = ({
  accounts = [],
  defaultSelectedId,
  onLogin,
  onUseAnotherAccount,
  widgetNode,
  isAddingNew = false,
  isLoading = false,
  errorMessage,
  onSwitchToEmail,
}) => {
  const [selectedId, setSelectedId] = useState<string | number>(
    defaultSelectedId || (accounts.length > 0 ? accounts[0].id : '')
  );

  const selectedAccount =
    accounts.find((acc) => String(acc.id) === String(selectedId)) || accounts[0];

  const handleSelect = (account: TelegramAccount) => {
    setSelectedId(account.id);
  };

  const handleConfirmLogin = () => {
    if (selectedAccount && onLogin) {
      onLogin(selectedAccount);
    }
  };

  const hasAccounts = accounts.length > 0;

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
            سيستلم الموقع اسمك ومعرّفك وصورة ملفك الشخصي.
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

      {/* ================= 2. قائمة اختيار الحسابات (Radio Group) ================= */}
      {hasAccounts && (
        <div className="py-4 space-y-2.5">
          <label className="block text-xs font-bold text-slate-400 px-1 mb-1">
            اختر الحساب للمتابعة:
          </label>

          <div className="space-y-2.5" role="radiogroup" aria-label="حسابات تليجرام">
            {accounts.map((account) => {
              const isSelected = String(account.id) === String(selectedId);

              return (
                <div
                  key={account.id}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => handleSelect(account)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(account);
                    }
                  }}
                  className={`group flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/90 border-sky-500 shadow-md shadow-sky-500/10 ring-2 ring-sky-500/20'
                      : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  {/* معلومات الحساب (صورة واسم ومعرّف) */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* صورة البروفايل الدائرية */}
                    {account.photoUrl ? (
                      <img
                        src={account.photoUrl}
                        alt={account.name}
                        className={`w-11 h-11 rounded-full object-cover shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                          isSelected ? 'ring-2 ring-sky-400' : 'ring-1 ring-slate-600'
                        }`}
                      />
                    ) : (
                      <div
                        className={`w-11 h-11 rounded-full bg-gradient-to-tr from-sky-600 to-blue-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-inner ${
                          isSelected ? 'ring-2 ring-sky-400' : 'ring-1 ring-slate-600'
                        }`}
                      >
                        {account.name.charAt(0)}
                      </div>
                    )}

                    {/* الاسم البارز والمعرّف */}
                    <div className="min-w-0 flex flex-col text-right">
                      <span className="text-sm font-black text-white group-hover:text-sky-300 transition-colors truncate">
                        {account.name}
                      </span>
                      {account.username ? (
                        <span className="text-xs text-sky-400 font-mono font-medium truncate" dir="ltr">
                          @{account.username}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-mono">
                          ID: {account.id}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* زر الاختيار الدائري (Custom Radio Button) */}
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500 shadow-xs'
                        : 'border-slate-500 bg-transparent group-hover:border-slate-400'
                    }`}
                  >
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= 3. زر استخدام حساب آخر (+) ================= */}
      <div className="pt-1 pb-3">
        <button
          type="button"
          onClick={onUseAnotherAccount}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-dashed border-slate-600 hover:border-sky-400 bg-slate-800/40 hover:bg-slate-800/90 text-slate-300 hover:text-sky-300 text-xs sm:text-sm font-black transition-all duration-200 cursor-pointer group shadow-xs"
        >
          <div className="w-5 h-5 rounded-full bg-slate-700 group-hover:bg-sky-500/20 text-slate-300 group-hover:text-sky-400 flex items-center justify-center transition-colors">
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
          <span>استخدام حساب آخر</span>
        </button>
      </div>

      {/* الودجت الخاص بتسجيل الدخول بتليجرام (إذا كان مفعل أو إذا لم تكن هناك حسابات محفوظة) */}
      {(isAddingNew || !hasAccounts) && (
        <div className="mb-4 p-4 rounded-2xl bg-slate-800/70 border border-slate-700 text-center space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-center gap-1.5 text-sky-400 text-xs font-black">
            <Sparkles className="w-4 h-4" />
            <span>تسجيل دخول حساب تليجرام جديد</span>
          </div>
          <p className="text-[11px] text-slate-400">
            اضغط على زر تيليجرام أدناه لربط حسابك عبر البوت <strong className="text-sky-300 font-mono" dir="ltr">@Ra3d6_bot</strong>:
          </p>
          <div className="flex justify-center items-center min-h-[46px] w-full">
            {widgetNode}
          </div>
        </div>
      )}

      {/* ================= 4. زر التأكيد والدخول للحساب المختار ================= */}
      {hasAccounts && selectedAccount && (
        <button
          type="button"
          onClick={handleConfirmLogin}
          disabled={isLoading}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-sky-500 hover:from-sky-400 hover:via-blue-500 hover:to-sky-400 text-white font-black text-sm shadow-lg shadow-sky-600/30 hover:shadow-sky-600/40 hover:scale-[1.01] active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <span>جاري تسجيل الدخول...</span>
          ) : (
            <>
              <span>متابعة كـ {selectedAccount.name}</span>
              <Send className="w-4 h-4 fill-current -translate-x-0.5" />
            </>
          )}
        </button>
      )}

      {/* التبديل للدخول بالبريد الإلكتروني */}
      {onSwitchToEmail && (
        <div className="mt-4 pt-3 border-t border-slate-700/60 text-center">
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
