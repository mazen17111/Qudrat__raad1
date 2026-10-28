import React, { useRef, useState } from 'react';
import { X, Printer, Award, Sparkles, CheckCircle2, Download, ShieldCheck } from 'lucide-react';
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
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);

  if (!isOpen || !certificate) return null;

  const effectiveLogoUrl = logoUrl || certificate.logoUrl;

  const handlePrint = () => {
    window.print();
  };

  // Helper to load image for Canvas drawing
  const loadLogoImage = (src?: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  };

  // Direct High-Resolution Canvas Image Generator for Student Saving
  const handleSaveAsImage = async () => {
    setIsDownloadingImage(true);
    try {
      const width = 1600;
      const height = 1130;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        window.print();
        setIsDownloadingImage(false);
        return;
      }

      // Preload platform logo image asynchronously
      const loadedLogo = await loadLogoImage(effectiveLogoUrl);

      // Background Gradient
      const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 100, width / 2, height / 2, width / 1.1);
      bgGrad.addColorStop(0, '#090d16');
      bgGrad.addColorStop(0.5, '#060911');
      bgGrad.addColorStop(1, '#020408');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw subtle watermark logo in the exact center background if available
      if (loadedLogo) {
        ctx.save();
        ctx.globalAlpha = 0.07;
        const wmSize = 380;
        ctx.drawImage(loadedLogo, width / 2 - wmSize / 2, height / 2 - wmSize / 2 - 20, wmSize, wmSize);
        ctx.restore();
      }

      // Gold Borders
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#d97706';
      ctx.strokeRect(30, 30, width - 60, height - 60);

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fbbf24';
      ctx.strokeRect(46, 46, width - 92, height - 92);

      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = '#f59e0b';
      ctx.strokeRect(60, 60, width - 120, height - 120);
      ctx.setLineDash([]);

      // Corner Ornaments
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 36px serif';
      ctx.textAlign = 'center';
      ctx.fillText('❖', 80, 95);
      ctx.fillText('❖', width - 80, 95);
      ctx.fillText('❖', 80, height - 75);
      ctx.fillText('❖', width - 80, height - 75);

      // Basmala
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.fillText('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', width / 2, 115);

      // Center Crest / Circular Emblem with Platform Logo
      const logoRadius = 55;
      const logoCenterY = 195;
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, logoCenterY, logoRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();

      if (loadedLogo) {
        ctx.beginPath();
        ctx.arc(width / 2, logoCenterY, logoRadius - 4, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          loadedLogo,
          width / 2 - (logoRadius - 4),
          logoCenterY - (logoRadius - 4),
          (logoRadius - 4) * 2,
          (logoRadius - 4) * 2
        );
      } else {
        // Fallback golden lightning crest
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 44px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚡', width / 2, logoCenterY + 16);
      }
      ctx.restore();

      // Laurel / Medallion bottom decoration
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✦  أقسام رعد  ✦', width / 2, logoCenterY + logoRadius + 20);

      // Platform Name & Country
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '18px Arial, sans-serif';
      ctx.fillText('المملكة العربية السعودية  •  منصة أقسام رعد التعليمية ⚡', width / 2, 280);

      // Main Title
      const titleGrad = ctx.createLinearGradient(width / 2 - 300, 0, width / 2 + 300, 0);
      titleGrad.addColorStop(0, '#fef08a');
      titleGrad.addColorStop(0.5, '#f59e0b');
      titleGrad.addColorStop(1, '#fde047');
      ctx.fillStyle = titleGrad;
      ctx.font = '900 48px Arial, sans-serif';
      ctx.fillText('شَـهَـادَةُ شُـكْـرٍ وَتَـقْـدِيـرٍ وَتَـفَـوُّق', width / 2, 345);

      // Subtitle
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.fillText('تَشْهَدُ إِدَارَةُ الْمَنَصَّةِ بِأَنَّ الطَّالِبَ الْمُتَمَيِّز / الطَّالِبَةَ الْمُتَمَيِّزَة:', width / 2, 400);

      // Student Name Box (Royal Plaque)
      const nameBoxW = 900;
      const nameBoxH = 80;
      const nameBoxX = width / 2 - nameBoxW / 2;
      const nameBoxY = 430;
      
      ctx.fillStyle = 'rgba(217, 119, 6, 0.15)';
      ctx.fillRect(nameBoxX, nameBoxY, nameBoxW, nameBoxH);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f59e0b';
      ctx.strokeRect(nameBoxX, nameBoxY, nameBoxW, nameBoxH);

      // Student Name Text
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 44px Arial, sans-serif';
      ctx.fillText(certificate.studentName, width / 2, nameBoxY + 56);

      // Course Introduction
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.fillText('قَدْ أَتَمَّ بِنَجَاحٍ وَتَفَوُّقٍ كَافَّةَ مُتَطَلَّبَاتِ التَّدْرِيبِ وَالِاخْتِبَارَاتِ الْمُكَثَّفَةِ فِي:', width / 2, 560);

      // Course Name Pill
      ctx.fillStyle = '#fde68a';
      ctx.font = '900 32px Arial, sans-serif';
      ctx.fillText(`🎓 ${certificate.courseTitle || 'دورة القدرات العامة الشاملة'}`, width / 2, 615);

      // Grade Text
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 24px Arial, sans-serif';
      const grade = certificate.gradeText || 'ممتاز مرتفع بنسبة 100% مع مرتبة الشرف الأولى';
      ctx.fillText(`التقدير العام: ${grade}`, width / 2, 665);

      // Notes
      const note = certificate.notes || certificate.customNote || 'تقديراً لاجتيازه كافة الاختبارات والمحاضرات بتفوق واقتدار نتمنى له دوام التوفيق والنجاح.';
      ctx.fillStyle = '#fde68a';
      ctx.font = 'italic 20px Arial, sans-serif';
      ctx.fillText(`"${note}"`, width / 2, 715);

      // Horizontal Divider
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.beginPath();
      ctx.moveTo(120, 770);
      ctx.lineTo(width - 120, 770);
      ctx.stroke();

      // Signatures
      // Right: Platform Endorsement
      ctx.textAlign = 'right';
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText('اعتماد وتوثيق المنصة:', width - 150, 830);
      ctx.fillStyle = '#fcd34d';
      ctx.font = '900 24px Arial, sans-serif';
      ctx.fillText(certificate.platformName || 'منصة أقسام رعد للقدرات والتحصيلي', width - 150, 875);
      ctx.fillStyle = '#64748b';
      ctx.font = '16px Arial, sans-serif';
      ctx.fillText('إدارة التدريب والتعليم الإلكتروني', width - 150, 910);

      // Center: Official Stamp Seal
      ctx.textAlign = 'center';
      const sealX = width / 2;
      const sealY = 870;
      ctx.beginPath();
      ctx.arc(sealX, sealY, 50, 0, Math.PI * 2);
      ctx.fillStyle = '#b45309';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fef08a';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 16px Arial, sans-serif';
      ctx.fillText('معتمد 100%', sealX, sealY - 8);
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.fillText('أقسام رعد', sealX, sealY + 16);

      // Left: Supervisor
      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText('المشرف العام على المنصة:', 150, 830);
      ctx.fillStyle = '#fcd34d';
      ctx.font = '900 24px Arial, sans-serif';
      ctx.fillText(certificate.directorName || 'أ. رعد / المشرف العام', 150, 875);
      ctx.fillStyle = '#64748b';
      ctx.font = '16px Arial, sans-serif';
      ctx.fillText('التوقيع والاعتماد الرسمي ✍️', 150, 910);

      // Verification Code & Date at the Bottom
      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 16px monospace';
      const certCode = certificate.serialNumber || certificate.certificateNumber || 'RAAD-CERT-2026';
      const certDate = certificate.issueDate || certificate.issuedAt || new Date().toLocaleDateString('ar-SA');
      ctx.fillText(`كود التحقق والاعتماد: ${certCode}   |   تاريخ الإصدار: ${certDate}`, width / 2, 1020);

      // Trigger download
      const link = document.createElement('a');
      link.download = `شهادة_تفوق_${certificate.studentName.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      console.error('Error generating image:', err);
      window.print();
    } finally {
      setIsDownloadingImage(false);
    }
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
            padding: 32px !important;
            box-shadow: none !important;
            border: 10px solid #d97706 !important;
            background: #020617 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            page-break-inside: avoid !important;
          }
          #raad-printable-certificate img,
          #raad-printable-certificate svg {
            visibility: visible !important;
            display: block !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="max-w-4xl w-full my-auto space-y-4">
        {/* Actions bar above certificate */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 border border-amber-500/30 text-white shadow-2xl">
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
                يمكنك حفظ الشهادة في جهازك كصورة عالية الدقة أو طباعتها وحفظها كـ PDF
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Save as Image Button */}
            <button
              type="button"
              disabled={isDownloadingImage}
              onClick={handleSaveAsImage}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-600/25 transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloadingImage ? 'جاري الحفظ...' : 'حفظ كصورة بجهازك 📥'}</span>
            </button>

            {/* Print / Save as PDF Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة / حفظ PDF 🖨️</span>
            </button>

            {/* Close Button */}
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

        {/* ================= THE LUXURIOUS ROYAL CERTIFICATE ================= */}
        <div
          id="raad-printable-certificate"
          ref={certRef}
          dir="rtl"
          className="relative rounded-3xl p-6 sm:p-10 md:p-12 text-center text-slate-100 overflow-hidden shadow-2xl border-4 border-amber-500/90 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 select-none"
          style={{
            boxShadow: '0 0 60px rgba(217, 119, 6, 0.3), inset 0 0 80px rgba(0,0,0,0.85)',
          }}
        >
          {/* Ornate Gold Framing / Inner Borders */}
          <div className="absolute inset-2 sm:inset-3 border-2 border-amber-400/50 rounded-2xl pointer-events-none" />
          <div className="absolute inset-3.5 sm:inset-5 border border-dashed border-amber-500/35 rounded-xl pointer-events-none" />

          {/* Corner Arabesque Medallions */}
          <div className="absolute top-5 right-5 text-amber-400/60 pointer-events-none text-2xl font-serif">❖</div>
          <div className="absolute top-5 left-5 text-amber-400/60 pointer-events-none text-2xl font-serif">❖</div>
          <div className="absolute bottom-5 right-5 text-amber-400/60 pointer-events-none text-2xl font-serif">❖</div>
          <div className="absolute bottom-5 left-5 text-amber-400/60 pointer-events-none text-2xl font-serif">❖</div>

          {/* Background Watermark Crest in the EXACT CENTER */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.06] pointer-events-none">
            <BrandLogo customLogoUrl={effectiveLogoUrl} size="lg" primaryColor={primaryColor} />
          </div>

          <div className="relative z-10 space-y-6 sm:space-y-7">
            {/* Basmala Top Ornament */}
            <div className="text-center">
              <span className="text-xs sm:text-sm font-bold text-amber-200/90 tracking-widest font-serif">
                بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
              </span>
            </div>

            {/* ================= CENTER LOGO & CREST ================= */}
            {/* "وفي الشهادة دخل الشعار في المنتصف واجعلها اكثر جمالية" */}
            <div className="flex flex-col items-center justify-center gap-2 pt-1">
              <div className="relative group">
                {/* Glowing Aura Ring */}
                <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 opacity-60 blur-md pointer-events-none" />
                
                {/* Center Crest Medallion with Platform Logo */}
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-2 border-amber-400 p-2 shadow-2xl flex items-center justify-center">
                  <div className="w-full h-full rounded-full border border-dashed border-amber-400/60 flex items-center justify-center overflow-hidden">
                    <BrandLogo customLogoUrl={effectiveLogoUrl} size="lg" primaryColor={primaryColor} />
                  </div>
                </div>

                {/* Laurel Leaves Under Crest */}
                <div className="absolute -bottom-2 inset-x-0 flex items-center justify-center text-amber-400 text-xs font-black">
                  ✦ ⚡ ✦
                </div>
              </div>

              <div className="text-center pt-2">
                <span className="text-[11px] sm:text-xs text-slate-400 block font-medium">المملكة العربية السعودية</span>
                <span className="text-xs sm:text-sm font-black text-amber-300 block">منصة أقسام رعد للقدرات العامة والتحصيلي ⚡</span>
              </div>
            </div>

            {/* Certificate Grand Title */}
            <div className="space-y-1.5 pt-1">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-black shadow-inner">
                <Sparkles className="w-3.5 h-3.5" />
                <span>شَـهَـادَةُ اعْـتِـمَـادٍ وَتَـفَـوُّقٍ رَسْـمِـيَّـة</span>
                <Sparkles className="w-3.5 h-3.5" />
              </div>

              <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-200 py-1 font-serif drop-shadow-md">
                شَـهَـادَةُ شُـكْـرٍ وَتَـقْـدِيـر
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto pt-1 font-medium">
                تَشْهَدُ إِدَارَةُ الْمَنَصَّةِ بِأَنَّ الطَّالِبَ الْمُتَمَيِّز / الطَّالِبَةَ الْمُتَمَيِّزَة:
              </p>
            </div>

            {/* Student Name Plaque in Grand Royal Calligraphy Style */}
            <div className="py-2.5 sm:py-3.5 px-6 sm:px-12 rounded-3xl bg-gradient-to-r from-amber-950/40 via-amber-500/20 to-amber-950/40 border-2 border-amber-400/80 max-w-2xl mx-auto shadow-2xl shadow-amber-500/15">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-amber-100 font-serif tracking-wide py-1 drop-shadow-lg">
                {certificate.studentName}
              </h2>
            </div>

            {/* Course Achievement & Commendation Details */}
            <div className="space-y-3 max-w-2xl mx-auto text-xs sm:text-sm leading-relaxed text-slate-200">
              <p>
                قَدْ أَتَمَّ بِنَجَاحٍ وَتَفَوُّقٍ كَافَّةَ مُتَطَلَّبَاتِ التَّدْرِيبِ، وَحُضُورِ الْمُحَاضَرَاتِ، وَاجْتِيَازِ بَنُوكِ الأَسْئِلَةِ وَالِاخْتِبَارَاتِ فِي:
              </p>

              <div className="inline-block px-6 py-2.5 rounded-2xl bg-slate-950/90 border-2 border-amber-400/60 text-amber-300 font-black text-sm sm:text-base shadow-xl">
                🎓 {certificate.courseTitle || 'دورة القدرات العامة الشاملة'}
              </div>

              {certificate.gradeText && (
                <div className="text-xs sm:text-sm font-black text-emerald-400 flex items-center justify-center gap-1.5 pt-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>التقدير العام: {certificate.gradeText}</span>
                </div>
              )}

              {(certificate.notes || certificate.customNote) && (
                <p className="text-xs text-amber-200/90 font-medium italic pt-1 max-w-lg mx-auto">
                  "{certificate.notes || certificate.customNote}"
                </p>
              )}
            </div>

            {/* Signatures & Official Gold Seal Stamp */}
            <div className="pt-6 border-t border-amber-500/30 grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              {/* Right Signature: Management & Platform */}
              <div className="text-center sm:text-right space-y-1">
                <span className="block text-[11px] text-slate-400 font-bold">اعتماد وتوثيق المنصة:</span>
                <span className="block text-sm sm:text-base font-black text-amber-300 font-serif">
                  {certificate.platformName || 'منصة أقسام رعد للقدرات'}
                </span>
                <span className="block text-[10px] text-slate-500">إدارة التعليم والتدريب</span>
              </div>

              {/* Center: Official Wax Stamp Emblem */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-500 to-amber-400 p-1 shadow-2xl shadow-amber-500/40 flex items-center justify-center border-2 border-yellow-200 transform hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-full border border-dashed border-amber-950 flex flex-col items-center justify-center text-center text-slate-950 font-black p-1">
                    <ShieldCheck className="w-6 h-6 stroke-[2.2] text-slate-950" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">معتمد 100%</span>
                    <span className="text-[8px] font-bold">أقسام رعد</span>
                  </div>
                </div>
                <span className="text-[10px] text-amber-400 font-bold mt-1">ختم التوثيق الرسمي</span>
              </div>

              {/* Left Signature: General Supervisor */}
              <div className="text-center sm:text-left space-y-1">
                <span className="block text-[11px] text-slate-400 font-bold">المشرف العام على المنصة:</span>
                <span className="block text-sm sm:text-base font-black text-amber-300 font-serif">
                  {certificate.directorName || 'أ. رعد / المشرف العام'}
                </span>
                <span className="block text-[10px] text-slate-500">التوقيع والاعتماد الرسمي ✍️</span>
              </div>
            </div>

            {/* Bottom Bar: Serial Number & Date */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono">
              <div>
                كود التحقق: <strong className="text-amber-300">{certificate.serialNumber || certificate.certificateNumber || 'RAAD-CERT-2026'}</strong>
              </div>
              <div>
                تاريخ الإصدار: <span className="text-slate-300">{certificate.issueDate || certificate.issuedAt || new Date().toLocaleDateString('ar-SA')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
