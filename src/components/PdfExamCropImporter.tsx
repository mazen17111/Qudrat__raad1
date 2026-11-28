import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  CheckCircle2,
  Crop,
  FileText,
  Layers,
  Loader2,
  Maximize2,
  RotateCcw,
  Scissors,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ExamQuestion } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface CropRect {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  width: number; // 0..1 normalized
  height: number; // 0..1 normalized
}

type DragMode =
  | 'move'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | null;

interface PdfExamCropImporterProps {
  hasExistingFilledQuestions: boolean;
  onImportQuestions: (questions: ExamQuestion[], mode: 'replace' | 'append') => void;
  onFileSelected?: (fileName: string, fileSizeLabel: string) => void;
  onNotify?: (message: string) => void;
}

const DEFAULT_CROP: CropRect = {
  x: 0.04,
  y: 0.06,
  width: 0.92,
  height: 0.84,
};

const MIN_CROP_SIZE = 0.06;

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function canvasToCompressedBlob(
  canvas: HTMLCanvasElement,
  quality = 0.78
): Promise<{ blob: Blob; ext: string }> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webpBlob) => {
        if (webpBlob && webpBlob.size > 0) {
          resolve({ blob: webpBlob, ext: 'webp' });
          return;
        }
        canvas.toBlob(
          (jpegBlob) => {
            if (jpegBlob && jpegBlob.size > 0) {
              resolve({ blob: jpegBlob, ext: 'jpg' });
            } else {
              reject(new Error('تعذر تحويل الصورة المقصوصة'));
            }
          },
          'image/jpeg',
          Math.min(0.84, quality + 0.04)
        );
      },
      'image/webp',
      quality
    );
  });
}

async function safeParseJsonResponse(resp: Response): Promise<{ ok: boolean; data: any; rawText: string }> {
  const rawText = await resp.text();
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return { ok: resp.ok, data: parsed, rawText };
    } catch {
      return { ok: false, data: null, rawText };
    }
  }
  return { ok: false, data: null, rawText };
}

export const PdfExamCropImporter: React.FC<PdfExamCropImporterProps> = ({
  hasExistingFilledQuestions,
  onImportQuestions,
  onFileSelected,
  onNotify,
}) => {
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(0);
  const [startPageInput, setStartPageInput] = useState<string>('1');
  const [endPageInput, setEndPageInput] = useState<string>('1');
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [isProcessingAll, setIsProcessingAll] = useState<boolean>(false);
  const [progressInfo, setProgressInfo] = useState<{ current: number; total: number; stage: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [importMode, setImportMode] = useState<'replace' | 'append'>(
    hasExistingFilledQuestions ? 'append' : 'replace'
  );
  const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropContainerRef = useRef<HTMLDivElement | null>(null);

  const dragStateRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    initialCrop: CropRect;
  } | null>(null);

  useEffect(() => {
    setImportMode(hasExistingFilledQuestions ? 'append' : 'replace');
  }, [hasExistingFilledQuestions]);

  // Cleanup PDF document on unmount
  useEffect(() => {
    return () => {
      try {
        renderTaskRef.current?.cancel();
      } catch {}
      try {
        void pdfDocRef.current?.cleanup();
      } catch {}
    };
  }, []);

  const validStartPage = numPages > 0 ? clamp(parseInt(startPageInput, 10) || 1, 1, numPages) : 1;
  const validEndPage = numPages > 0 ? clamp(parseInt(endPageInput, 10) || numPages, validStartPage, numPages) : 1;
  const totalSelectedPages = numPages > 0 ? Math.max(1, validEndPage - validStartPage + 1) : 0;

  // Update mini cropped preview whenever main preview canvas or crop box updates
  const updateMiniPreview = useCallback(() => {
    const srcCanvas = previewCanvasRef.current;
    const dstCanvas = miniPreviewCanvasRef.current;
    if (!srcCanvas || !dstCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) return;

    const sx = Math.round(crop.x * srcCanvas.width);
    const sy = Math.round(crop.y * srcCanvas.height);
    const sw = Math.max(1, Math.round(crop.width * srcCanvas.width));
    const sh = Math.max(1, Math.round(crop.height * srcCanvas.height));

    const maxPreviewW = 280;
    const ratio = sw > maxPreviewW ? maxPreviewW / sw : 1;
    dstCanvas.width = Math.max(1, Math.round(sw * ratio));
    dstCanvas.height = Math.max(1, Math.round(sh * ratio));

    const ctx = dstCanvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dstCanvas.width, dstCanvas.height);
    ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, dstCanvas.width, dstCanvas.height);
  }, [crop]);

  useEffect(() => {
    updateMiniPreview();
  }, [updateMiniPreview, pageDimensions]);

  // Render the selected start page onto the interactive cropper canvas
  const renderPreviewPage = useCallback(
    async (pageNumber: number) => {
      const pdfDoc = pdfDocRef.current;
      const canvas = previewCanvasRef.current;
      if (!pdfDoc || !canvas || pageNumber < 1 || pageNumber > pdfDoc.numPages) return;

      try {
        renderTaskRef.current?.cancel();
      } catch {}

      setIsRenderingPage(true);
      setErrorMsg('');

      try {
        const page = await pdfDoc.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetScale = clamp(1200 / Math.max(baseViewport.width, 1), 1.1, 2.2);
        const viewport = page.getViewport({ scale: targetScale });

        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsRenderingPage(false);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });
        renderTaskRef.current = task;
        await task.promise;

        setPageDimensions({ width: canvas.width, height: canvas.height });
        page.cleanup();
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF preview render error:', err);
          setErrorMsg('تعذر عرض هذه الصفحة من ملف PDF');
        }
      } finally {
        setIsRenderingPage(false);
      }
    },
    []
  );

  // Trigger preview re-render whenever startPageInput changes cleanly
  useEffect(() => {
    if (!pdfDocRef.current || numPages <= 0) return;
    const parsed = parseInt(startPageInput, 10);
    if (isNaN(parsed)) return;
    const clamped = clamp(parsed, 1, numPages);
    const timer = window.setTimeout(() => {
      void renderPreviewPage(clamped);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [startPageInput, numPages, renderPreviewPage]);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setIsLoadingPdf(true);

    try {
      try {
        renderTaskRef.current?.cancel();
      } catch {}
      try {
        await pdfDocRef.current?.cleanup();
      } catch {}

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;

      pdfDocRef.current = pdfDoc;
      setPdfFileName(file.name);
      setNumPages(pdfDoc.numPages);
      setStartPageInput('1');
      setEndPageInput(String(pdfDoc.numPages));
      setCrop(DEFAULT_CROP);

      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      onFileSelected?.(file.name, `${sizeMb} MB`);
      onNotify?.(`تم فتح ملف PDF (${pdfDoc.numPages} صفحة) — اختر رقم صفحة البداية وقص الأولى ثم اضغط تأكيد على الكل`);

      await renderPreviewPage(1);
    } catch (err: any) {
      console.error('PDF load error:', err);
      setErrorMsg('تعذر قراءة ملف PDF. تأكد أنه ملف PDF صالح وغير تالف.');
      setNumPages(0);
      setPdfFileName('');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // Pointer drag handlers for moving & resizing crop box
  const handlePointerDown = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!cropContainerRef.current || isProcessingAll) return;

    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
    };
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      const container = cropContainerRef.current;
      if (!drag || !container || !drag.mode) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dx = (e.clientX - drag.startX) / rect.width;
      const dy = (e.clientY - drag.startY) / rect.height;
      const init = drag.initialCrop;

      let next: CropRect = { ...init };

      if (drag.mode === 'move') {
        next.x = clamp(init.x + dx, 0, 1 - init.width);
        next.y = clamp(init.y + dy, 0, 1 - init.height);
      } else {
        let left = init.x;
        let top = init.y;
        let right = init.x + init.width;
        let bottom = init.y + init.height;

        if (drag.mode.includes('w')) {
          left = clamp(init.x + dx, 0, right - MIN_CROP_SIZE);
        }
        if (drag.mode.includes('e')) {
          right = clamp(init.x + init.width + dx, left + MIN_CROP_SIZE, 1);
        }
        if (drag.mode.includes('n')) {
          top = clamp(init.y + dy, 0, bottom - MIN_CROP_SIZE);
        }
        if (drag.mode.includes('s')) {
          bottom = clamp(init.y + init.height + dy, top + MIN_CROP_SIZE, 1);
        }

        next = {
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        };
      }

      setCrop(next);
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  // Confirm crop rectangle across ALL pages from validStartPage..validEndPage & upload zero-Firestore batches
  const handleConfirmAllPages = async () => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc || numPages === 0 || isProcessingAll) return;

    const startP = validStartPage;
    const endP = validEndPage;
    const total = endP - startP + 1;

    setIsProcessingAll(true);
    setErrorMsg('');
    setProgressInfo({ current: 0, total, stage: 'جاري تجهيز الصفحات والقص بنفس المقاس...' });

    try {
      try {
        renderTaskRef.current?.cancel();
      } catch {}
      await new Promise((r) => setTimeout(r, 40));

      const renderCanvas = document.createElement('canvas');
      const cropCanvas = document.createElement('canvas');
      const renderCtx = renderCanvas.getContext('2d');
      const cropCtx = cropCanvas.getContext('2d');

      if (!renderCtx || !cropCtx) {
        throw new Error('المتصفح لا يدعم معالجة الصور');
      }

      const croppedBlobs: { pageNumber: number; blob: Blob; ext: string }[] = [];

      for (let idx = 0; idx < total; idx++) {
        const pageNum = startP + idx;
        setProgressInfo({
          current: idx + 1,
          total,
          stage: `جاري قص الصفحة ${pageNum} (${idx + 1} من ${total}) بنفس المقاس...`,
        });

        const page = await pdfDoc.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = clamp(1100 / Math.max(baseViewport.width, 1), 1.05, 1.75);
        const viewport = page.getViewport({ scale });

        renderCanvas.width = Math.max(1, Math.round(viewport.width));
        renderCanvas.height = Math.max(1, Math.round(viewport.height));
        renderCtx.fillStyle = '#ffffff';
        renderCtx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);

        await page.render({
          canvasContext: renderCtx,
          viewport,
          canvas: renderCanvas,
        }).promise;

        page.cleanup();

        const sx = clamp(Math.round(crop.x * renderCanvas.width), 0, Math.max(0, renderCanvas.width - 20));
        const sy = clamp(Math.round(crop.y * renderCanvas.height), 0, Math.max(0, renderCanvas.height - 20));
        const sw = clamp(Math.round(crop.width * renderCanvas.width), 20, renderCanvas.width - sx);
        const sh = clamp(Math.round(crop.height * renderCanvas.height), 20, renderCanvas.height - sy);

        const maxCropDim = 1050;
        const downscale = Math.min(1, maxCropDim / Math.max(sw, sh));
        const targetW = Math.max(20, Math.round(sw * downscale));
        const targetH = Math.max(20, Math.round(sh * downscale));

        cropCanvas.width = targetW;
        cropCanvas.height = targetH;
        cropCtx.fillStyle = '#ffffff';
        cropCtx.fillRect(0, 0, targetW, targetH);
        cropCtx.drawImage(renderCanvas, sx, sy, sw, sh, 0, 0, targetW, targetH);

        let compressed = await canvasToCompressedBlob(cropCanvas, 0.76);
        if (compressed.blob.size > 320 * 1024) {
          compressed = await canvasToCompressedBlob(cropCanvas, 0.62);
        }
        croppedBlobs.push({ pageNumber: pageNum, blob: compressed.blob, ext: compressed.ext });
      }

      // Build small byte-capped batches (max 350 KB and max 4 images per request)
      type CroppedItem = { pageNumber: number; blob: Blob; ext: string };
      const batches: CroppedItem[][] = [];
      let currentBatch: CroppedItem[] = [];
      let currentBytes = 0;
      const MAX_BATCH_BYTES = 350 * 1024;
      const MAX_BATCH_COUNT = 4;

      for (const item of croppedBlobs) {
        if (
          currentBatch.length > 0 &&
          (currentBatch.length >= MAX_BATCH_COUNT || currentBytes + item.blob.size > MAX_BATCH_BYTES)
        ) {
          batches.push(currentBatch);
          currentBatch = [];
          currentBytes = 0;
        }
        currentBatch.push(item);
        currentBytes += item.blob.size;
      }
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      const uploadSingleImageFallback = async (item: CroppedItem): Promise<string> => {
        for (let tryNum = 0; tryNum < 2; tryNum++) {
          // 1. Try /api/upload-exam-images with single image
          try {
            const singleBulkForm = new FormData();
            singleBulkForm.append('files', item.blob, `pdf_q_p${item.pageNumber}.${item.ext}`);
            const r1 = await fetch('/api/upload-exam-images', { method: 'POST', body: singleBulkForm });
            const p1 = await safeParseJsonResponse(r1);
            if (p1.ok && p1.data?.success && Array.isArray(p1.data.urls) && p1.data.urls[0]) {
              return p1.data.urls[0];
            }
          } catch {}

          // 2. Fallback to standard /api/upload?skipFirebase=1
          try {
            const singleForm = new FormData();
            singleForm.append('file', item.blob, `pdf_q_p${item.pageNumber}.${item.ext}`);
            const r2 = await fetch('/api/upload?skipFirebase=1', { method: 'POST', body: singleForm });
            const p2 = await safeParseJsonResponse(r2);
            const resolvedUrl = p2.data?.localUrl || p2.data?.url;
            if (p2.ok && p2.data?.success && resolvedUrl) {
              return resolvedUrl;
            }
          } catch {}

          await new Promise((r) => setTimeout(r, 300));
        }

        throw new Error(
          `تعذر رفع صورة الصفحة ${item.pageNumber}. تأكد من تحديث الصفحة والمحاولة مرة أخرى.`
        );
      };

      const uploadedUrls: string[] = [];
      let processedCount = 0;

      for (let b = 0; b < batches.length; b++) {
        const chunk = batches[b];
        setProgressInfo({
          current: Math.min(processedCount + chunk.length, total),
          total,
          stage: `جاري رفع الصور (${Math.min(processedCount + chunk.length, total)} من ${total}) بتوفير فايربيس...`,
        });

        let batchUrls: string[] | null = null;

        // Try batch upload up to 2 times
        for (let attempt = 0; attempt < 2 && !batchUrls; attempt++) {
          try {
            const formData = new FormData();
            chunk.forEach((item) => {
              formData.append('files', item.blob, `pdf_q_p${item.pageNumber}.${item.ext}`);
            });

            const resp = await fetch('/api/upload-exam-images', {
              method: 'POST',
              body: formData,
            });
            const parsed = await safeParseJsonResponse(resp);
            if (
              parsed.ok &&
              parsed.data?.success &&
              Array.isArray(parsed.data.urls) &&
              parsed.data.urls.length === chunk.length
            ) {
              batchUrls = parsed.data.urls;
              break;
            }
          } catch {}
          if (!batchUrls && attempt === 0) {
            await new Promise((r) => setTimeout(r, 250));
          }
        }

        // Fallback: upload items in this batch one-by-one safely
        if (!batchUrls) {
          batchUrls = [];
          for (const item of chunk) {
            const singleUrl = await uploadSingleImageFallback(item);
            batchUrls.push(singleUrl);
          }
        }

        uploadedUrls.push(...batchUrls);
        processedCount += chunk.length;
      }

      const baseTimestamp = Date.now();
      const generatedQuestions: ExamQuestion[] = uploadedUrls.map((url, idx) => ({
        id: `q_pdf_${baseTimestamp}_${idx + 1}`,
        questionText: '',
        imageUrl: url,
        options: ['أ', 'ب', 'ج', 'د'],
        correctOptionIndex: 0,
        explanation: '',
      }));

      onImportQuestions(generatedQuestions, importMode);
      onNotify?.(
        `تم قص ورفع ${generatedQuestions.length} سؤال من ملف PDF بنجاح (بتوفير 100% لفايربيس)! حدد الإجابة الصحيحة لكل سؤال بالأسفل.`
      );
      setProgressInfo(null);
    } catch (err: any) {
      console.error('Bulk PDF crop error:', err);
      setErrorMsg(err?.message || 'حدث خطأ أثناء قص ورفع صفحات PDF');
      setProgressInfo(null);
    } finally {
      setIsProcessingAll(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-cyan-950/30 border-2 border-emerald-500/40 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
            <Scissors className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-emerald-300">
                رفع وقص أسئلة الاختبار تلقائياً من ملف PDF 📄✂️
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                توفير فايربيس (تُثبّت بحزمة واحدة عند الحفظ)
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              ارفع الـ PDF، اختر رقم صفحة البداية لتظهر لك فوراً، قصّ أول صورة ثم اضغط «تأكيد على الكل» لرفع باقي الصفحات بنفس المقاس وتحديد إجاباتها.
            </p>
          </div>
        </div>
      </div>

      {/* PDF File Selector */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <label className="flex-1 min-w-[220px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs cursor-pointer shadow-lg shadow-emerald-600/20 transition">
          {isLoadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>{pdfFileName ? `تغيير ملف PDF (${pdfFileName})` : 'اختر ملف PDF للاختبار الآن 📄'}</span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onClick={(e) => {
              (e.target as HTMLInputElement).value = '';
            }}
            onChange={handlePdfUpload}
            disabled={isProcessingAll}
            className="hidden"
          />
        </label>

        {numPages > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-[11px] font-bold text-slate-200">
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>إجمالي الصفحات: {numPages} صفحة</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-[11px] font-bold">
          {errorMsg}
        </div>
      )}

      {/* Interactive Page Range + Visual Cropper */}
      {numPages > 0 && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          {/* Page Selection & Import Mode Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Start Page */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-1.5">
              <label className="text-[11px] font-black text-emerald-300 block">
                يبدأ من الصورة / الصفحة رقم:
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isProcessingAll || validStartPage <= 1}
                  onClick={() => setStartPageInput(String(Math.max(1, validStartPage - 1)))}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs disabled:opacity-40"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={startPageInput}
                  disabled={isProcessingAll}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStartPageInput(val);
                    const p = parseInt(val, 10);
                    if (!isNaN(p) && p > validEndPage) {
                      setEndPageInput(String(clamp(p, 1, numPages)));
                    }
                  }}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-emerald-500/50 text-white text-center font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                <button
                  type="button"
                  disabled={isProcessingAll || validStartPage >= numPages}
                  onClick={() => {
                    const nextStart = Math.min(numPages, validStartPage + 1);
                    setStartPageInput(String(nextStart));
                    if (nextStart > validEndPage) setEndPageInput(String(nextStart));
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <span className="text-[10px] text-slate-400 block">
                تظهر لك هذه الصفحة مباشرة لتقوم بقصّها
              </span>
            </div>

            {/* End Page */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-1.5">
              <label className="text-[11px] font-black text-slate-300 block">
                إلى الصفحة رقم (الافتراضي للنهاية):
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={validStartPage}
                  max={numPages}
                  value={endPageInput}
                  disabled={isProcessingAll}
                  onChange={(e) => setEndPageInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-center font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                <button
                  type="button"
                  disabled={isProcessingAll}
                  onClick={() => setEndPageInput(String(numPages))}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-[10px] whitespace-nowrap"
                >
                  آخر صفحة ({numPages})
                </button>
              </div>
              <span className="text-[10px] text-emerald-400/90 font-bold block">
                سيتم قص ورفع {totalSelectedPages} صفحة بنفس المقاس
              </span>
            </div>

            {/* Import Mode */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-1.5">
              <span className="text-[11px] font-black text-slate-300 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>طريقة الإدراج في الاختبار:</span>
              </span>
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <button
                  type="button"
                  disabled={isProcessingAll}
                  onClick={() => setImportMode('replace')}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition ${
                    importMode === 'replace'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  استبدال الأسئلة
                </button>
                <button
                  type="button"
                  disabled={isProcessingAll}
                  onClick={() => setImportMode('append')}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition ${
                    importMode === 'append'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  إضافة للحالية
                </button>
              </div>
              <span className="text-[10px] text-slate-400 block">
                تُرفع كصور مضغوطة (0 استهلاك فايربيس)
              </span>
            </div>
          </div>

          {/* Crop Toolbar */}
          <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-200">
              <Crop className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                معاينة الصفحة الأولى المختارة (#{validStartPage}) — اسحب الإطار أو الزوايا للقص:
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={isProcessingAll}
                onClick={() => setCrop({ x: 0, y: 0, width: 1, height: 1 })}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 border border-slate-700"
              >
                <Maximize2 className="w-3 h-3 text-cyan-400" />
                <span>كامل الصفحة</span>
              </button>
              <button
                type="button"
                disabled={isProcessingAll}
                onClick={() => setCrop(DEFAULT_CROP)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 border border-slate-700"
              >
                <RotateCcw className="w-3 h-3 text-amber-400" />
                <span>ضبط افتراضي</span>
              </button>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-2 py-1 rounded-lg border border-emerald-500/30">
                {Math.round(crop.width * 100)}% × {Math.round(crop.height * 100)}%
              </span>
            </div>
          </div>

          {/* Interactive Cropper Canvas + Live Cropped Result Mini Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Main Page Crop Canvas */}
            <div className="lg:col-span-8 flex flex-col items-center justify-center bg-slate-950/90 p-3 rounded-2xl border border-slate-800 relative">
              {isRenderingPage && (
                <div className="absolute inset-0 z-20 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center rounded-2xl">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري عرض الصفحة رقم {validStartPage}...</span>
                  </div>
                </div>
              )}

              {/* LTR wrapper ensures left/top coordinates & corner cursors behave identically in RTL */}
              <div
                ref={cropContainerRef}
                dir="ltr"
                className="relative inline-block overflow-hidden rounded-lg shadow-2xl border border-slate-700 select-none touch-none max-w-full"
              >
                <canvas
                  ref={previewCanvasRef}
                  className="block max-w-full max-h-[520px] w-auto h-auto bg-white"
                />

                {/* Interactive Crop Box */}
                <div
                  onPointerDown={(e) => handlePointerDown('move', e)}
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                    boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.62)',
                  }}
                  className="absolute border-2 border-emerald-400 cursor-move z-10"
                >
                  {/* Subtle rule-of-thirds grid */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                    <div className="border-r border-b border-emerald-400/25" />
                    <div className="border-r border-b border-emerald-400/25" />
                    <div className="border-b border-emerald-400/25" />
                    <div className="border-r border-b border-emerald-400/25" />
                    <div className="border-r border-b border-emerald-400/25" />
                    <div className="border-b border-emerald-400/25" />
                    <div className="border-r border-emerald-400/25" />
                    <div className="border-r border-emerald-400/25" />
                    <div />
                  </div>

                  {/* Corner Handles */}
                  <div
                    onPointerDown={(e) => handlePointerDown('nw', e)}
                    className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950 shadow cursor-nwse-resize"
                  />
                  <div
                    onPointerDown={(e) => handlePointerDown('ne', e)}
                    className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950 shadow cursor-nesw-resize"
                  />
                  <div
                    onPointerDown={(e) => handlePointerDown('sw', e)}
                    className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950 shadow cursor-nesw-resize"
                  />
                  <div
                    onPointerDown={(e) => handlePointerDown('se', e)}
                    className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950 shadow cursor-nwse-resize"
                  />

                  {/* Edge Handles */}
                  <div
                    onPointerDown={(e) => handlePointerDown('n', e)}
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-3 rounded-full bg-emerald-400 border border-slate-950 cursor-ns-resize"
                  />
                  <div
                    onPointerDown={(e) => handlePointerDown('s', e)}
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-3 rounded-full bg-emerald-400 border border-slate-950 cursor-ns-resize"
                  />
                  <div
                    onPointerDown={(e) => handlePointerDown('w', e)}
                    className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-8 rounded-full bg-emerald-400 border border-slate-950 cursor-ew-resize"
                  />
                  <div
                    onPointerDown={(e) => handlePointerDown('e', e)}
                    className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-8 rounded-full bg-emerald-400 border border-slate-950 cursor-ew-resize"
                  />
                </div>
              </div>
            </div>

            {/* Live Output Preview + Confirm All Button */}
            <div className="lg:col-span-4 space-y-3 bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>شكل السؤال بعد القص:</span>
                </span>
                <span className="text-[10px] text-slate-400">صفحة {validStartPage}</span>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-2 flex items-center justify-center min-h-[150px]">
                <canvas
                  ref={miniPreviewCanvasRef}
                  className="max-w-full max-h-[240px] rounded bg-white shadow"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/70 text-[10px] text-slate-300 space-y-1 leading-relaxed">
                <p>
                  • سيتم تطبيق هذا المقاس بالضبط على الصفحات من <strong className="text-emerald-300">{validStartPage}</strong> إلى <strong className="text-emerald-300">{validEndPage}</strong> ({totalSelectedPages} سؤال).
                </p>
                <p>
                  • بعد الضغط، ستظهر جميع الأسئلة المقصوصة بالأسفل لتحديد الإجابة الصحيحة (<strong className="text-amber-300">أ / ب / ج / د</strong>) لكل سؤال.
                </p>
              </div>

              {progressInfo && (
                <div className="space-y-1.5 p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40">
                  <div className="flex items-center justify-between text-[10px] font-bold text-emerald-300">
                    <span>{progressInfo.stage}</span>
                    <span className="font-mono">
                      {Math.round((progressInfo.current / Math.max(1, progressInfo.total)) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-150"
                      style={{
                        width: `${Math.round((progressInfo.current / Math.max(1, progressInfo.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={isProcessingAll || isRenderingPage}
                onClick={handleConfirmAllPages}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {isProcessingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري القص والرفع...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد على الكل وقص ورفع ({totalSelectedPages} صفحة)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
