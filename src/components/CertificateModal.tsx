import React, { useRef } from 'react';
import { X, Printer, Award, Sparkles, CheckCircle2 } from 'lucide-react';
import { CertificateData } from '../types';
import { BrandLogo } from './BrandLogo';

interface CertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: CertificateData | null;
  logoUrl?: string;
  primaryColor?: string;
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  isOpen,
  onClose,
  certificate,
  logoUrl,
  primaryColor = '#2563eb',
}) => {
  const certRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !certificate) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-xl overflow-y-auto animate-in fade-in duration-200">
      {/* Print-specific style rules */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #raad-printable-certificate, #raad-printable-certificate * {
            visibility: visible !important;
          }
          #raad-printable-certificate {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 24px !important;
            box-shadow: none !important;
            border: 8px solid #d97706 !important;
            background: #0f172a !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            page-break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="max-w-4xl w-full my-auto space-y-4">
        {/* Actions bar above certificate */}
        <div className="no-print flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-white shadow-xl">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black flex items-center gap-2">
                <span>شهادة اعتماد وتفوق رسمية 📜</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  معتمدة وموثقة ✓
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                يمكنك طباعة الشهادة أو حفظها بصيغة PDF بجودة عالية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الشهادة (PDF) 🖨️</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="إغلاق الشهادة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= THE CHIC CERTIFICATE CONTAINER ================= */}
        <div
          id="raad-printable-certificate"
          ref={certRef}
          dir="rtl"
          className="relative rounded-3xl p-6 sm:p-10 md:p-12 text-center text-slate-100 overflow-hidden shadow-2xl border-4 border-amber-500/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 select-none"
          style={{
            boxShadow: '0 0 50px rgba(217, 119, 6, 0.25), inset 0 0 60px rgba(0,0,0,0.8)',
          }}
        >
          {/* Ornate Gold Framing / Inner Borders */}
          <div className="absolute inset-2.5 sm:inset-3.5 border-2 border-amber-400/40 rounded-2xl pointer-events-none" />
          <div className="absolute inset-4 sm:inset-5 border border-dashed border-amber-500/30 rounded-xl pointer-events-none" />

          {/* Corner Floral / Arabesque Embellishments */}
          <div className="absolute top-6 right-6 text-amber-400/50 pointer-events-none text-2xl font-serif">❖</div>
          <div className="absolute top-6 left-6 text-amber-400/50 pointer-events-none text-2xl font-serif">❖</div>
          <div className="absolute bottom-6 right-6 text-amber-400/50 pointer-events-none text-2xl font-serif">❖</div>
          <div className="absolute bottom-6 left-6 text-amber-400/50 pointer-events-none text-2xl font-serif">❖</div>

          {/* Background Watermark Seal */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
            <BrandLogo customLogoUrl={logoUrl} size="lg" primaryColor={primaryColor} />
          </div>

          <div className="relative z-10 space-y-6 sm:space-y-8">
            {/* 1. Header with Platform Logo & Institutional Seal */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-amber-500/30">
              <div className="text-right text-xs text-amber-300 font-bold space-y-0.5">
                <span className="block text-[11px] text-slate-400">المملكة العربية السعودية</span>
                <span className="block text-sm font-black text-amber-400">منصة أقسام رعد للقدرات العامة ⚡</span>
                <span className="block text-[10px] text-slate-400">قسم التدريب والاعتماد الأكاديمي</span>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 border-2 border-amber-400/50 shadow-xl shadow-amber-500/20">
                  <BrandLogo customLogoUrl={logoUrl} size="md" primaryColor={primaryColor} />
                </div>
              </div>

              <div className="text-left text-xs font-mono space-y-0.5 text-slate-400">
                <span className="block text-[10px] text-amber-400/80">CERTIFICATE NO:</span>
                <span className="block font-black text-amber-300 tracking-wider">
                  {certificate.certificateNumber || 'RAAD-2025-001'}
                </span>
                <span className="block text-[10px]">{certificate.issuedAt || new Date().toLocaleDateString('ar-SA')}</span>
              </div>
            </div>

            {/* 2. Certificate Grand Title */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-black shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
                <span>شهادة تفوق واجتياز معتمدة</span>
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-200 py-1 font-serif drop-shadow-md">
                شـهـادة تـقـديـر واعـتـمـاد
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
                تشهد إدارة منصة أقسام رعد التعليمية بأن الطالب المتميز / الطالبة المتميزة:
              </p>
            </div>

            {/* 3. Student Name in Grand Majestic Calligraphy Style */}
            <div className="py-2 sm:py-3 px-6 sm:px-10 rounded-3xl bg-gradient-to-r from-amber-500/15 via-amber-500/25 to-amber-500/15 border-2 border-amber-400/60 max-w-2xl mx-auto shadow-2xl shadow-amber-500/10">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white font-serif tracking-wide py-1 drop-shadow-lg">
                {certificate.studentName}
              </h2>
            </div>

            {/* 4. Course Achievement & Details */}
            <div className="space-y-3 max-w-2xl mx-auto text-xs sm:text-sm leading-relaxed text-slate-200">
              <p>
                قد أتم بنجاح وتفوق متطلبات التدريب، وحضور المحاضرات، واجتياز بنوك الأسئلة والاختبارات المكثفة في:
              </p>
              <div className="inline-block px-5 py-2 rounded-2xl bg-slate-800/90 border border-amber-400/50 text-amber-300 font-black text-sm sm:text-base shadow-md">
                🎓 {certificate.courseTitle || 'دورة القدرات العامة الشاملة'}
              </div>
              {certificate.scoreAverage !== undefined && (
                <div className="text-xs font-black text-emerald-400 flex items-center justify-center gap-1.5 pt-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>بدرجة إنجاز ومعدل تفوق: {certificate.scoreAverage}% مع مرتبة الشرف</span>
                </div>
              )}
              {certificate.customNote && (
                <p className="text-xs text-amber-200/90 font-medium italic pt-1 max-w-lg mx-auto">
                  "{certificate.customNote}"
                </p>
              )}
            </div>

            {/* 5. Signatures & Official Gold Seal Stamp */}
            <div className="pt-6 sm:pt-8 border-t border-amber-500/30 grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              {/* Right Signature: Management */}
              <div className="text-center sm:text-right space-y-1">
                <span className="block text-[11px] text-slate-400 font-bold">اعتماد وتوقيع المنصة:</span>
                <span className="block text-sm sm:text-base font-black text-amber-300 font-serif">
                  {certificate.platformName || 'منصة أقسام رعد للقدرات'}
                </span>
                <span className="block text-[10px] text-slate-500">إدارة التعليم والتدريب</span>
              </div>

              {/* Center: Wax Seal Emblem */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-500 to-amber-400 p-1 shadow-xl shadow-amber-500/30 flex items-center justify-center border-2 border-yellow-200 transform hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-full border border-dashed border-amber-950 flex flex-col items-center justify-center text-center text-slate-950 font-black p-1">
                    <Award className="w-6 h-6 fill-current text-slate-950" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">معتمد 100%</span>
                    <span className="text-[8px] font-bold">أقسام رعد</span>
                  </div>
                </div>
                <span className="text-[10px] text-amber-400 font-bold mt-1">ختم الاعتماد الرسمي</span>
              </div>

              {/* Left Signature: General Supervisor */}
              <div className="text-center sm:text-left space-y-1">
                <span className="block text-[11px] text-slate-400 font-bold">المشرف العام على المنصة:</span>
                <span className="block text-sm sm:text-base font-black text-amber-300 font-serif">
                  {certificate.directorName || 'أ. رعد'}
                </span>
                <span className="block text-[10px] text-slate-500">التوقيع والاعتماد الرسمي ✍️</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
