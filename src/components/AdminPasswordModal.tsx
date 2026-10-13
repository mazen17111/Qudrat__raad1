import React, { useState } from 'react';
import { X, ShieldAlert, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface AdminPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminPasswordModal: React.FC<AdminPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.trim() === 'raadmazen2121aksam') {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setPassword('');
        onSuccess();
      }, 700);
    } else {
      setError('الكلمة الادارية غير صحيحة');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl text-right">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">قسم التحكم الإداري</h2>
              <p className="text-xs text-slate-400">يرجى تأكيد الهوية الإدارية للمنصة</p>
            </div>
          </div>
          <button
            onClick={() => {
              setError('');
              setPassword('');
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              كلمة المرور الإدارية:
            </label>
            <input
              type="password"
              placeholder="اكتب كلمة المرور للدخول للوحة الإدارة..."
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              className="w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm font-mono"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2 animate-shake">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {showSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>تم التحقق بنجاح! جاري الدخول للوحة التحكم...</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setError('');
                setPassword('');
                onClose();
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
            >
              إلغاء
            </button>

            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black transition shadow-lg shadow-amber-500/20"
            >
              <span>دخول للوحة التحكم</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
