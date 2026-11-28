import { jsPDF } from 'jspdf';
import { FolderQuestionItem } from '../types';
import { resolveExamImageUrl } from './examImagePack';

export interface ExportFolderPdfParams {
  folderTitle: string;
  courseTitle?: string;
  studentName?: string;
  questions: FolderQuestionItem[];
  includeSolutions?: boolean;
}

// A4 at ~150 DPI for crisp Arabic typography and compact file size
const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const MARGIN_X = 56;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 78;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CARD_PADDING_X = 28;
const CARD_PADDING_Y = 24;
const CARD_INNER_WIDTH = CONTENT_WIDTH - CARD_PADDING_X * 2;
const CARD_GAP = 22;

const ARABIC_OPTION_LABELS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
const FONT_FAMILY = "'Cairo', 'Tajawal', system-ui, -apple-system, sans-serif";

function sanitizeFilename(name: string): string {
  const cleaned = String(name || 'مجلد_الاسئلة')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned || 'مجلد_الاسئلة';
}

function formatQuestionCountArabic(count: number): string {
  if (count === 1) return 'سؤال واحد';
  if (count === 2) return 'سؤالان';
  if (count >= 3 && count <= 10) return `${count} أسئلة`;
  return `${count} سؤالاً`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number
): string[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  ctx.save();
  ctx.font = font;
  const result: string[] = [];
  const paragraphs = normalized.split('\n');

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) {
      result.push('');
      continue;
    }

    const words = trimmedPara.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          result.push(currentLine);
          currentLine = '';
        }
        // Handle single ultra-long token (e.g. URL or unbroken expression)
        if (ctx.measureText(word).width > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            const testChunk = chunk + ch;
            if (ctx.measureText(testChunk).width > maxWidth && chunk) {
              result.push(chunk);
              chunk = ch;
            } else {
              chunk = testChunk;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      result.push(currentLine);
    }
  }

  ctx.restore();
  return result;
}

async function loadSafeImage(url?: string, timeoutMs = 5000): Promise<HTMLImageElement | null> {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return null;
  }
  const resolved = await resolveExamImageUrl(url.trim());
  if (!resolved) {
    return null;
  }
  const src = resolved.trim();
  const isInlineOrSameOrigin =
    src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('/');

  return new Promise((resolve) => {
    let settled = false;
    const img = new Image();
    // Always set crossOrigin for non-inline URLs so canvas.toDataURL() never gets tainted
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    img.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        // Verify drawing won't taint canvas
        try {
          const probe = document.createElement('canvas');
          probe.width = 1;
          probe.height = 1;
          const pCtx = probe.getContext('2d');
          if (pCtx) {
            pCtx.drawImage(img, 0, 0, 1, 1);
            probe.toDataURL('image/png');
          }
          resolve(img);
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!isInlineOrSameOrigin) {
        resolve(null);
        return;
      }
      resolve(null);
    };

    img.src = src;
  });
}

interface MeasuredOption {
  index: number;
  label: string;
  lines: string[];
  height: number;
  isCorrect: boolean;
}

interface MeasuredCard {
  index: number;
  questionLines: string[];
  sourceExamText: string;
  image: HTMLImageElement | null;
  hasMissingImageNotice: boolean;
  imageDrawWidth: number;
  imageDrawHeight: number;
  options: MeasuredOption[];
  useTwoColumns: boolean;
  optionRowHeights: number[];
  explanationLines: string[];
  totalHeight: number;
}

const QUESTION_FONT = `700 25px ${FONT_FAMILY}`;
const QUESTION_LINE_HEIGHT = 38;
const SOURCE_FONT = `700 16px ${FONT_FAMILY}`;
const OPTION_FONT = `600 20px ${FONT_FAMILY}`;
const OPTION_LINE_HEIGHT = 30;
const EXPLANATION_FONT = `600 19px ${FONT_FAMILY}`;
const EXPLANATION_LINE_HEIGHT = 29;

function measureQuestionCard(
  ctx: CanvasRenderingContext2D,
  q: FolderQuestionItem,
  idx: number,
  img: HTMLImageElement | null,
  includeSolutions: boolean
): MeasuredCard {
  const questionText =
    String(q.questionText || '').trim() || 'سؤال مصوّر (راجع الصورة المرفقة)';
  const questionTextWidth = CARD_INNER_WIDTH - 64;
  const questionLines = wrapTextLines(ctx, questionText, QUESTION_FONT, questionTextWidth);
  const sourceExamText = q.sourceExamTitle ? `من: ${q.sourceExamTitle}` : '';

  const questionHeaderHeight = Math.max(44, questionLines.length * QUESTION_LINE_HEIGHT);
  const sourceHeight = sourceExamText ? 28 : 0;

  let imageDrawWidth = 0;
  let imageDrawHeight = 0;
  const hasMissingImageNotice = Boolean(q.imageUrl && !img);

  if (img) {
    const maxImgW = CARD_INNER_WIDTH - 32;
    const maxImgH = 340;
    const scale = Math.min(maxImgW / img.naturalWidth, maxImgH / img.naturalHeight, 1.5);
    imageDrawWidth = Math.round(img.naturalWidth * scale);
    imageDrawHeight = Math.round(img.naturalHeight * scale);
  }

  const imageBlockHeight = img
    ? imageDrawHeight + 34
    : hasMissingImageNotice
    ? 48
    : 0;

  const rawOptions = Array.isArray(q.options) ? q.options : [];
  const colGap = 14;
  const halfWidth = (CARD_INNER_WIDTH - colGap) / 2;

  // Decide between 2-column compact grid or 1-column list based on option text length
  const canUseTwoCols =
    rawOptions.length > 0 &&
    rawOptions.length <= 6 &&
    rawOptions.every((opt) => {
      const testLines = wrapTextLines(ctx, String(opt || ''), OPTION_FONT, halfWidth - 90);
      return testLines.length <= 2;
    });

  const optTextMaxWidth = (canUseTwoCols ? halfWidth : CARD_INNER_WIDTH) - 88;
  const options: MeasuredOption[] = rawOptions.map((opt, oIdx) => {
    const label = ARABIC_OPTION_LABELS[oIdx] || String(oIdx + 1);
    const lines = wrapTextLines(ctx, String(opt || ''), OPTION_FONT, optTextMaxWidth);
    const safeLines = lines.length > 0 ? lines : ['—'];
    const height = Math.max(50, safeLines.length * OPTION_LINE_HEIGHT + 22);
    return {
      index: oIdx,
      label,
      lines: safeLines,
      height,
      isCorrect: includeSolutions && oIdx === q.correctOptionIndex,
    };
  });

  const optionRowHeights: number[] = [];
  if (canUseTwoCols) {
    for (let i = 0; i < options.length; i += 2) {
      const h1 = options[i].height;
      const h2 = options[i + 1] ? options[i + 1].height : 0;
      optionRowHeights.push(Math.max(h1, h2));
    }
  } else {
    options.forEach((o) => optionRowHeights.push(o.height));
  }

  const optionsBlockHeight =
    optionRowHeights.length > 0
      ? optionRowHeights.reduce((sum, h) => sum + h, 0) +
        (optionRowHeights.length - 1) * 12 +
        16
      : 0;

  const explanationText = includeSolutions ? String(q.explanation || '').trim() : '';
  const explanationLines = explanationText
    ? wrapTextLines(
        ctx,
        `توضيح الحل: ${explanationText}`,
        EXPLANATION_FONT,
        CARD_INNER_WIDTH - 36
      )
    : [];
  const explanationBlockHeight =
    explanationLines.length > 0
      ? explanationLines.length * EXPLANATION_LINE_HEIGHT + 34
      : 0;

  const totalHeight =
    CARD_PADDING_Y * 2 +
    questionHeaderHeight +
    sourceHeight +
    imageBlockHeight +
    optionsBlockHeight +
    explanationBlockHeight;

  return {
    index: idx,
    questionLines,
    sourceExamText,
    image: img,
    hasMissingImageNotice,
    imageDrawWidth,
    imageDrawHeight,
    options,
    useTwoColumns: canUseTwoCols,
    optionRowHeights,
    explanationLines,
    totalHeight,
  };
}

function drawFirstPageBanner(
  ctx: CanvasRenderingContext2D,
  params: ExportFolderPdfParams,
  questionCount: number
): number {
  const bannerHeight = 148;
  const x = MARGIN_X;
  const y = MARGIN_TOP;

  // Card background
  drawRoundedRect(ctx, x, y, CONTENT_WIDTH, bannerHeight, 20);
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  // Top amber-emerald accent strip
  ctx.save();
  drawRoundedRect(ctx, x, y, CONTENT_WIDTH, 8, 4);
  const grad = ctx.createLinearGradient(x, y, x + CONTENT_WIDTH, y);
  grad.addColorStop(0, '#f59e0b');
  grad.addColorStop(0.5, '#10b981');
  grad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textBaseline = 'top';

  // Folder Title (Right aligned)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 32px ${FONT_FAMILY}`;
  ctx.fillText(params.folderTitle || 'مجلد الأسئلة', x + CONTENT_WIDTH - 28, y + 26);

  // Course & Platform Subtitle
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `600 18px ${FONT_FAMILY}`;
  const subParts = ['منصة أقسام رعد'];
  if (params.courseTitle) subParts.push(params.courseTitle);
  if (params.studentName) subParts.push(`الطالب: ${params.studentName}`);
  subParts.push(params.includeSolutions !== false ? 'نسخة محلولة' : 'نسخة غير محلولة (أسئلة فقط)');
  ctx.fillText(subParts.join('  •  '), x + CONTENT_WIDTH - 28, y + 74);

  // Export date
  const nowStr = new Date().toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  ctx.fillStyle = '#94a3b8';
  ctx.font = `600 15px ${FONT_FAMILY}`;
  ctx.fillText(`تاريخ التصدير: ${nowStr}`, x + CONTENT_WIDTH - 28, y + 108);

  // Live question count badge on the left side
  const countBadgeText = `العدد الحالي: ${formatQuestionCountArabic(questionCount)}`;
  ctx.font = `800 20px ${FONT_FAMILY}`;
  const badgeW = Math.max(210, ctx.measureText(countBadgeText).width + 44);
  const badgeH = 48;
  const badgeX = x + 28;
  const badgeY = y + 50;

  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 12);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(countBadgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

  ctx.restore();

  return y + bannerHeight + 24;
}

function drawContinuationHeader(
  ctx: CanvasRenderingContext2D,
  folderTitle: string,
  questionCount: number
): number {
  const y = MARGIN_TOP;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textBaseline = 'top';

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 20px ${FONT_FAMILY}`;
  ctx.fillText(`${folderTitle} (تابع)`, MARGIN_X + CONTENT_WIDTH, y);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = `700 17px ${FONT_FAMILY}`;
  ctx.fillText(formatQuestionCountArabic(questionCount), MARGIN_X, y + 3);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, y + 34);
  ctx.lineTo(MARGIN_X + CONTENT_WIDTH, y + 34);
  ctx.stroke();

  ctx.restore();
  return y + 54;
}

function drawQuestionCard(
  ctx: CanvasRenderingContext2D,
  card: MeasuredCard,
  topY: number
): void {
  const x = MARGIN_X;
  const w = CONTENT_WIDTH;
  const h = card.totalHeight;

  // Card container
  drawRoundedRect(ctx, x, topY, w, h, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();

  // Right accent stripe
  ctx.save();
  drawRoundedRect(ctx, x + w - 8, topY + 14, 4, h - 28, 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.direction = 'rtl';

  let cursorY = topY + CARD_PADDING_Y;
  const rightEdge = x + w - CARD_PADDING_X;

  // Question Number Badge
  const badgeSize = 42;
  const badgeX = rightEdge - badgeSize;
  drawRoundedRect(ctx, badgeX, cursorY - 2, badgeSize, badgeSize, 11);
  ctx.fillStyle = '#fef3c7';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#f59e0b';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b45309';
  ctx.font = `900 21px ${FONT_FAMILY}`;
  ctx.fillText(String(card.index + 1), badgeX + badgeSize / 2, cursorY + badgeSize / 2 - 1);

  // Question Text
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#0f172a';
  ctx.font = QUESTION_FONT;
  const textStartX = badgeX - 16;
  card.questionLines.forEach((line, lIdx) => {
    ctx.fillText(line, textStartX, cursorY + lIdx * QUESTION_LINE_HEIGHT);
  });

  cursorY += Math.max(badgeSize + 2, card.questionLines.length * QUESTION_LINE_HEIGHT);

  if (card.sourceExamText) {
    cursorY += 4;
    ctx.fillStyle = '#047857';
    ctx.font = SOURCE_FONT;
    ctx.fillText(card.sourceExamText, textStartX, cursorY);
    cursorY += 24;
  }

  // Image
  if (card.image) {
    cursorY += 14;
    const frameW = Math.min(CARD_INNER_WIDTH, card.imageDrawWidth + 24);
    const frameH = card.imageDrawHeight + 16;
    const frameX = x + (w - frameW) / 2;

    drawRoundedRect(ctx, frameX, cursorY, frameW, frameH, 12);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    const imgX = x + (w - card.imageDrawWidth) / 2;
    ctx.drawImage(card.image, imgX, cursorY + 8, card.imageDrawWidth, card.imageDrawHeight);
    cursorY += frameH + 4;
  } else if (card.hasMissingImageNotice) {
    cursorY += 12;
    drawRoundedRect(ctx, x + CARD_PADDING_X, cursorY, CARD_INNER_WIDTH, 36, 8);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.font = `600 15px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText('صورة السؤال متوفرة للعرض التفاعلي داخل المنصة', x + w / 2, cursorY + 10);
    ctx.textAlign = 'right';
    cursorY += 36;
  }

  // Options
  if (card.options.length > 0) {
    cursorY += 16;
    const colGap = 14;
    const halfW = (CARD_INNER_WIDTH - colGap) / 2;

    const drawSingleOption = (
      opt: MeasuredOption,
      optX: number,
      optY: number,
      optW: number,
      optH: number
    ) => {
      drawRoundedRect(ctx, optX, optY, optW, optH, 11);
      ctx.fillStyle = opt.isCorrect ? '#ecfdf5' : '#f8fafc';
      ctx.fill();
      ctx.lineWidth = opt.isCorrect ? 2 : 1.5;
      ctx.strokeStyle = opt.isCorrect ? '#10b981' : '#e2e8f0';
      ctx.stroke();

      // Letter pill
      const letterSize = 30;
      const letterX = optX + optW - letterSize - 12;
      const letterY = optY + 10;
      drawRoundedRect(ctx, letterX, letterY, letterSize, letterSize, 8);
      ctx.fillStyle = opt.isCorrect ? '#10b981' : '#e2e8f0';
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = opt.isCorrect ? '#ffffff' : '#334155';
      ctx.font = `800 17px ${FONT_FAMILY}`;
      ctx.fillText(opt.label, letterX + letterSize / 2, letterY + letterSize / 2 + 1);

      // Option text
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = opt.isCorrect ? '#065f46' : '#1e293b';
      ctx.font = opt.isCorrect ? `800 20px ${FONT_FAMILY}` : OPTION_FONT;
      const optTextRight = letterX - 12;
      opt.lines.forEach((line, lIdx) => {
        ctx.fillText(line, optTextRight, optY + 12 + lIdx * OPTION_LINE_HEIGHT);
      });

      if (opt.isCorrect) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#059669';
        ctx.font = `800 16px ${FONT_FAMILY}`;
        ctx.fillText('✓', optX + 12, optY + 13);
      }
    };

    if (card.useTwoColumns) {
      let rowIdx = 0;
      for (let i = 0; i < card.options.length; i += 2) {
        const rowH = card.optionRowHeights[rowIdx];
        const rightOpt = card.options[i];
        const leftOpt = card.options[i + 1];

        drawSingleOption(
          rightOpt,
          x + CARD_PADDING_X + halfW + colGap,
          cursorY,
          halfW,
          rowH
        );
        if (leftOpt) {
          drawSingleOption(leftOpt, x + CARD_PADDING_X, cursorY, halfW, rowH);
        }

        cursorY += rowH + 12;
        rowIdx++;
      }
      cursorY -= 12;
    } else {
      card.options.forEach((opt, oIdx) => {
        const rowH = card.optionRowHeights[oIdx];
        drawSingleOption(opt, x + CARD_PADDING_X, cursorY, CARD_INNER_WIDTH, rowH);
        cursorY += rowH + 12;
      });
      cursorY -= 12;
    }
  }

  // Explanation
  if (card.explanationLines.length > 0) {
    cursorY += 16;
    const expH = card.explanationLines.length * EXPLANATION_LINE_HEIGHT + 18;
    drawRoundedRect(ctx, x + CARD_PADDING_X, cursorY, CARD_INNER_WIDTH, expH, 10);
    ctx.fillStyle = '#eff6ff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#bfdbfe';
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#1e3a8a';
    ctx.font = EXPLANATION_FONT;
    card.explanationLines.forEach((line, lIdx) => {
      ctx.fillText(line, rightEdge - 16, cursorY + 10 + lIdx * EXPLANATION_LINE_HEIGHT);
    });
  }

  ctx.restore();
}

function createBlankPageCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize Canvas 2D context for PDF generation');
  }
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  return { canvas, ctx };
}

function stampPageFooter(
  ctx: CanvasRenderingContext2D,
  folderTitle: string,
  pageNumber: number,
  totalPages: number
): void {
  const footerY = PAGE_HEIGHT - 48;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, footerY - 18);
  ctx.lineTo(MARGIN_X + CONTENT_WIDTH, footerY - 18);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `600 16px ${FONT_FAMILY}`;
  ctx.fillText(`منصة أقسام رعد  •  ${folderTitle}`, MARGIN_X + CONTENT_WIDTH, footerY);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  ctx.font = `700 16px ${FONT_FAMILY}`;
  ctx.fillText(`صفحة ${pageNumber} من ${totalPages}`, MARGIN_X, footerY);

  ctx.restore();
}

/**
 * Generates and downloads a genuine RTL Arabic PDF purely inside the browser
 * from the exact live `questions` array passed at click-time.
 * Performs ZERO Firebase Firestore reads or writes.
 */
export async function exportFolderQuestionsToPdf(params: ExportFolderPdfParams): Promise<void> {
  const { folderTitle, questions, includeSolutions = true } = params;
  if (!Array.isArray(questions) || questions.length === 0) {
    return;
  }

  // Ensure Cairo/Tajawal web fonts are ready before measuring/drawing text
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
    } catch {}
  }

  // Preload all question images cleanly in parallel (pure client-side fetch, zero Firestore)
  const loadedImages = await Promise.all(questions.map((q) => loadSafeImage(q.imageUrl)));

  // Create first page & measure every card dynamically
  const pages: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> = [];
  const firstPage = createBlankPageCanvas();
  pages.push(firstPage);

  let currentPage = firstPage;
  let cursorY = drawFirstPageBanner(currentPage.ctx, params, questions.length);
  const maxContentBottom = PAGE_HEIGHT - MARGIN_BOTTOM;

  const measuredCards = questions.map((q, idx) =>
    measureQuestionCard(currentPage.ctx, q, idx, loadedImages[idx], includeSolutions)
  );

  for (let i = 0; i < measuredCards.length; i++) {
    const card = measuredCards[i];
    const pageStartMinY = pages.length === 1 ? MARGIN_TOP + 172 : MARGIN_TOP + 54;

    // Move to a fresh page if this card won't fit cleanly on the remaining space
    if (cursorY > pageStartMinY && cursorY + card.totalHeight > maxContentBottom) {
      const nextPage = createBlankPageCanvas();
      pages.push(nextPage);
      currentPage = nextPage;
      cursorY = drawContinuationHeader(currentPage.ctx, folderTitle, questions.length);
    }

    drawQuestionCard(currentPage.ctx, card, cursorY);
    cursorY += card.totalHeight + CARD_GAP;
  }

  // Stamp accurate "صفحة X من Y" footers across all generated pages
  const totalPages = pages.length;
  pages.forEach((p, pageIdx) => {
    stampPageFooter(p.ctx, folderTitle, pageIdx + 1, totalPages);
  });

  // Compile pages into a crisp A4 PDF locally via jsPDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  pages.forEach((p, pageIdx) => {
    if (pageIdx > 0) {
      pdf.addPage('a4', 'portrait');
    }
    const imgData = p.canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  });

  const safeTitle = sanitizeFilename(folderTitle);
  const modeSuffix = includeSolutions ? 'محلول' : 'غير_محلول';
  pdf.save(`${safeTitle}_${questions.length}_سؤال_${modeSuffix}.pdf`);
}
