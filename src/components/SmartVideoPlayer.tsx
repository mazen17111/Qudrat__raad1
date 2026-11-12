import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  RefreshCw,
  Play,
  PictureInPicture2,
  Captions,
  Move,
  Maximize2,
  X,
  Zap,
} from 'lucide-react';
import { resolveVideoUrl } from '../firebase';
import { PlatformYouTubePlayer } from './PlatformYouTubePlayer';

interface SmartVideoPlayerProps {
  url: string;
  backupUrl?: string;
  title?: string;
  onEnded?: () => void;
  className?: string;
  watermarkContent?: React.ReactNode;
  externalVideoRef?: React.RefObject<HTMLVideoElement | null>;
  pipTrigger?: number;
  pipActionRef?: React.MutableRefObject<(() => void) | null>;
}

const isDirectBrokenSslHost = (cleanUrl: string): boolean => {
  const lower = cleanUrl.toLowerCase();
  return lower.startsWith('http://') || lower.includes('top4top.io');
};

const shouldStartWithProxy = (cleanUrl: string): boolean => {
  if (!cleanUrl) return false;
  const lower = cleanUrl.toLowerCase();
  // Local/Firebase-backed routes never need external stream proxy
  if (lower.startsWith('/api/') || lower.startsWith('/uploads/') || lower.startsWith('blob:') || lower.startsWith('data:')) {
    return false;
  }
  // Proactively stream via backend +faststart cache/proxy for hosts that have expired SSL, regional ISP blocks, or CORS restrictions
  if (
    lower.startsWith('http://') ||
    lower.includes('top4top.io') ||
    lower.includes('catbox.moe')
  ) {
    return true;
  }
  return false;
};

const applyHtmlVideoCaptions = (video: HTMLVideoElement | null, enabled: boolean): number => {
  if (!video || !video.textTracks) return 0;
  let trackCount = 0;
  try {
    trackCount = video.textTracks.length;
    for (let i = 0; i < trackCount; i++) {
      const track = video.textTracks[i];
      if (track) {
        track.mode = enabled ? 'showing' : 'hidden';
      }
    }
  } catch {}
  return trackCount;
};

export const SmartVideoPlayer: React.FC<SmartVideoPlayerProps> = ({
  url,
  backupUrl,
  title,
  onEnded,
  className = 'w-full h-full object-contain',
  watermarkContent,
  externalVideoRef,
  pipTrigger = 0,
  pipActionRef,
}) => {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const floatingWrapperRef = useRef<HTMLDivElement>(null);
  const pendingNativePipRef = useRef(false);

  const primaryCleanUrl = resolveVideoUrl(url);
  const backupCleanUrl = resolveVideoUrl(backupUrl);

  const [trackedPrimaryUrl, setTrackedPrimaryUrl] = useState(primaryCleanUrl);
  const [useBackupUrl, setUseBackupUrl] = useState(false);

  const cleanUrl =
    useBackupUrl && backupCleanUrl && backupCleanUrl !== primaryCleanUrl
      ? backupCleanUrl
      : primaryCleanUrl;

  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [useProxyFallback, setUseProxyFallback] = useState(() => shouldStartWithProxy(primaryCleanUrl));
  const [hasTriedProxy, setHasTriedProxy] = useState(() => shouldStartWithProxy(primaryCleanUrl));
  const [hasTriedDirect, setHasTriedDirect] = useState(() => !shouldStartWithProxy(primaryCleanUrl));
  const [hasLoadedMetadata, setHasLoadedMetadata] = useState(false);

  // PiP & Captions state
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isFloatingPiP, setIsFloatingPiP] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [textTrackCount, setTextTrackCount] = useState(0);

  // Draggable position for the quick PiP control button ("اجعل زر ال pip متحرك")
  const [pipBtnPos, setPipBtnPos] = useState<{ left: number; top: number } | null>(null);
  const pipBtnDragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  }>({ active: false, moved: false, startX: 0, startY: 0, originLeft: 0, originTop: 0 });
  const suppressNextPipClickRef = useRef(false);

  // Draggable position for in-page Floating PiP fallback window
  const [floatingWinPos, setFloatingWinPos] = useState<{ x: number; y: number } | null>(null);
  const winDragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  // Synchronize state IMMEDIATELY during render when URL changes so zero frames use old video's proxy mode
  if (primaryCleanUrl !== trackedPrimaryUrl) {
    const startWithProxy = shouldStartWithProxy(primaryCleanUrl);
    setTrackedPrimaryUrl(primaryCleanUrl);
    setUseBackupUrl(false);
    setHasError(false);
    setHasLoadedMetadata(false);
    setAutoRetryCount(0);
    setUseProxyFallback(startWithProxy);
    setHasTriedProxy(startWithProxy);
    setHasTriedDirect(!startWithProxy);
    setIsPiPActive(false);
    setIsFloatingPiP(false);
  }

  const setCombinedVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      internalVideoRef.current = node;
      if (externalVideoRef && 'current' in externalVideoRef) {
        (externalVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
      }
    },
    [externalVideoRef]
  );

  useEffect(() => {
    setIsPiPSupported(
      typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && Boolean(document.pictureInPictureEnabled)
    );
  }, []);

  // Listen to native PiP & text track updates
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    const handleEnterPiP = () => {
      setIsPiPActive(true);
      setIsFloatingPiP(false);
    };
    const handleLeavePiP = () => setIsPiPActive(false);

    const syncTracks = () => {
      const count = applyHtmlVideoCaptions(video, captionsEnabled);
      setTextTrackCount(count);
    };

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);
    try {
      video.textTracks?.addEventListener?.('addtrack', syncTracks);
      video.textTracks?.addEventListener?.('change', () => {
        if (video.textTracks) {
          setTextTrackCount(video.textTracks.length);
        }
      });
    } catch {}

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
      try {
        video.textTracks?.removeEventListener?.('addtrack', syncTracks);
      } catch {}
    };
  }, [reloadKey, url, useProxyFallback, captionsEnabled]);

  const handleToggleCaptions = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const next = !captionsEnabled;
      setCaptionsEnabled(next);
      const count = applyHtmlVideoCaptions(internalVideoRef.current, next);
      setTextTrackCount(count);
    },
    [captionsEnabled]
  );

  const handleTogglePiP = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (suppressNextPipClickRef.current) {
        suppressNextPipClickRef.current = false;
        return;
      }

      const video = internalVideoRef.current;
      if (!video) return;

      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          setIsPiPActive(false);
          return;
        }
      } catch {}

      if (isFloatingPiP) {
        setIsFloatingPiP(false);
        return;
      }

      // If metadata isn't loaded yet (readyState === 0), trigger playback & defer native PiP until loadedmetadata
      if (video.readyState < 1 && isPiPSupported && typeof video.requestPictureInPicture === 'function') {
        pendingNativePipRef.current = true;
        try {
          await video.play();
        } catch {}
        if (video.readyState >= 1) {
          pendingNativePipRef.current = false;
          try {
            await video.requestPictureInPicture();
            setIsPiPActive(true);
            return;
          } catch {}
        } else {
          // loadedmetadata handler below will immediately launch native PiP once metadata arrives
          return;
        }
      }

      try {
        if (video.requestPictureInPicture && isPiPSupported) {
          if (video.paused) {
            video.play().catch(() => {});
          }
          await video.requestPictureInPicture();
          setIsPiPActive(true);
          return;
        }
      } catch (err) {
        console.warn('Native PiP fallback to draggable window:', err);
      }

      // Fallback when browser/iframe blocks OS PiP -> activate Draggable Floating Window
      setIsFloatingPiP(true);
    },
    [isFloatingPiP, isPiPSupported]
  );

  // Expose synchronous handler so external click buttons preserve browser user activation!
  if (pipActionRef) {
    pipActionRef.current = () => {
      handleTogglePiP();
    };
  }

  // Register MediaSession Auto-PiP action handler on tab switch in supporting browsers
  useEffect(() => {
    try {
      const ms = (navigator as any).mediaSession;
      if (ms && typeof ms.setActionHandler === 'function') {
        ms.setActionHandler('enterpictureinpicture', () => {
          const video = internalVideoRef.current;
          if (video && !document.pictureInPictureElement && video.requestPictureInPicture) {
            video.requestPictureInPicture().catch(() => {});
          }
        });
        return () => {
          try {
            ms.setActionHandler('enterpictureinpicture', null);
          } catch {}
        };
      }
    } catch {}
  }, [reloadKey, cleanUrl]);

  const lastHtmlPipTriggerRef = useRef(pipTrigger);
  useEffect(() => {
    if (pipTrigger !== lastHtmlPipTriggerRef.current) {
      lastHtmlPipTriggerRef.current = pipTrigger;
      handleTogglePiP();
    }
  }, [pipTrigger, handleTogglePiP]);

  // Global pointer drag handlers for both Movable PiP Button & Movable Floating PiP Window
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (pipBtnDragRef.current.active && containerRef.current) {
        const dx = e.clientX - pipBtnDragRef.current.startX;
        const dy = e.clientY - pipBtnDragRef.current.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          pipBtnDragRef.current.moved = true;
        }
        if (pipBtnDragRef.current.moved) {
          const rect = containerRef.current.getBoundingClientRect();
          const nextLeft = Math.max(8, Math.min(Math.max(8, rect.width - 140), pipBtnDragRef.current.originLeft + dx));
          const nextTop = Math.max(8, Math.min(Math.max(8, rect.height - 48), pipBtnDragRef.current.originTop + dy));
          setPipBtnPos({ left: nextLeft, top: nextTop });
        }
      }

      if (winDragRef.current.dragging) {
        const dx = e.clientX - winDragRef.current.startX;
        const dy = e.clientY - winDragRef.current.startY;
        const maxX = Math.max(12, window.innerWidth - 340);
        const maxY = Math.max(12, window.innerHeight - 230);
        const nextX = Math.max(8, Math.min(maxX, winDragRef.current.originX + dx));
        const nextY = Math.max(8, Math.min(maxY, winDragRef.current.originY + dy));
        setFloatingWinPos({ x: nextX, y: nextY });
      }
    };

    const onPointerUp = () => {
      if (pipBtnDragRef.current.active && pipBtnDragRef.current.moved) {
        suppressNextPipClickRef.current = true;
        window.setTimeout(() => {
          suppressNextPipClickRef.current = false;
        }, 60);
      }
      pipBtnDragRef.current.active = false;
      pipBtnDragRef.current.moved = false;
      winDragRef.current.dragging = false;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const startDraggingPipButton = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const targetRect = e.currentTarget.getBoundingClientRect();
    pipBtnDragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: targetRect.left - containerRect.left,
      originTop: targetRect.top - containerRect.top,
    };
  };

  const startDraggingFloatingWin = (e: React.PointerEvent) => {
    if (!isFloatingPiP || !floatingWrapperRef.current) return;
    const rect = floatingWrapperRef.current.getBoundingClientRect();
    winDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
    };
  };

  // Bidirectional stall recovery: if current path hangs before loading metadata for > 8s, switch between /api/stream and direct HTTPS link
  useEffect(() => {
    const isExternalHttp = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://');
    if (!isExternalHttp || hasLoadedMetadata || hasError) return;

    const timer = setTimeout(() => {
      if (!useProxyFallback && !hasTriedProxy) {
        setHasTriedProxy(true);
        setUseProxyFallback(true);
        setHasLoadedMetadata(false);
        return;
      }
      if (useProxyFallback && cleanUrl.startsWith('https://') && !isDirectBrokenSslHost(cleanUrl) && !hasTriedDirect) {
        setHasTriedDirect(true);
        setUseProxyFallback(false);
        setHasLoadedMetadata(false);
      }
    }, 8000);

    return () => clearTimeout(timer);
  }, [cleanUrl, useProxyFallback, hasTriedProxy, hasTriedDirect, hasLoadedMetadata, hasError, reloadKey]);

  const handleRetryViaProxy = () => {
    setHasError(false);
    setHasLoadedMetadata(false);
    setAutoRetryCount(0);
    setHasTriedProxy(true);
    setUseProxyFallback(true);
    setReloadKey((prev) => prev + 1);
  };

  const handleRetryDirect = () => {
    setHasError(false);
    setHasLoadedMetadata(false);
    setAutoRetryCount(0);
    setHasTriedDirect(true);
    setUseProxyFallback(false);
    setReloadKey((prev) => prev + 1);
  };

  // Safe seek handler preventing browser stalls
  const safeSeek = useCallback((targetSeconds: number) => {
    const video = internalVideoRef.current;
    if (!video) return;

    let target = targetSeconds;
    const dur = video.duration;

    if (dur && isFinite(dur)) {
      target = Math.max(0, Math.min(target, dur - 0.2));
    } else {
      target = Math.max(0, target);
    }

    try {
      if (video.seekable && video.seekable.length > 0) {
        const seekableEnd = video.seekable.end(video.seekable.length - 1);
        const seekableStart = video.seekable.start(0);
        if (isFinite(seekableEnd) && target > seekableEnd) {
          target = Math.max(seekableStart, seekableEnd - 0.2);
        }
      }
    } catch (e) {}

    try {
      video.currentTime = target;
    } catch (err) {
      console.warn('Seek error handled safely:', err);
    }
  }, []);

  // Keyboard navigation shortcuts (Arrow keys for smooth seek ±5s, Space for play/pause, C for Captions)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      const video = internalVideoRef.current;
      if (!video) return;

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        safeSeek(video.currentTime + 5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        safeSeek(video.currentTime - 5);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleToggleCaptions();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [safeSeek, handleToggleCaptions]);

  if (!url || !url.trim()) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2 bg-slate-950">
        <Play className="w-10 h-10 opacity-30 stroke-[1.5]" />
        <p className="text-xs sm:text-sm font-bold">لا يوجد رابط فيديو محدد لهذا المحتوى</p>
      </div>
    );
  }

  // 1. YouTube Detection (rendered exclusively through custom PlatformYouTubePlayer — zero YouTube UI/branding + CC + OS Document PiP)
  const ytMatch = cleanUrl.match(
    /(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return (
      <PlatformYouTubePlayer
        key={`yt-${videoId}`}
        videoId={videoId}
        title={title}
        onEnded={onEnded}
        watermarkContent={watermarkContent}
        pipTrigger={pipTrigger}
        pipActionRef={pipActionRef}
      />
    );
  }

  // 2. Google Drive Detection (file/d/ID, open?id=ID, uc?id=ID)
  const driveFileMatch = cleanUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  const driveOpenMatch = cleanUrl.match(/drive\.google\.com\/(?:open|uc)\?(?:.+&)?id=([a-zA-Z0-9_-]+)/i);
  const driveId = (driveFileMatch && driveFileMatch[1]) || (driveOpenMatch && driveOpenMatch[1]);
  if (driveId) {
    return (
      <div className="relative w-full h-full bg-black overflow-hidden group">
        {watermarkContent}
        <iframe
          key={`drive-${driveId}`}
          src={`https://drive.google.com/file/d/${driveId}/preview`}
          title={title || 'مشغل الفيديو'}
          className="w-full h-full border-0"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  // 3. Vimeo Detection
  const vimeoMatch = cleanUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    const vimeoId = vimeoMatch[1];
    return (
      <div className="relative w-full h-full bg-black overflow-hidden group">
        {watermarkContent}
        <iframe
          key={`vimeo-${vimeoId}`}
          src={`https://player.vimeo.com/video/${vimeoId}?badge=0&autopause=0&player_id=0&app_id=58479`}
          title={title || 'مشغل الفيديو'}
          className="w-full h-full border-0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Determine effective streaming source (with automatic backend proxy fallback for external links)
  const isExternalHttp = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://');
  const effectiveSource =
    useProxyFallback && isExternalHttp
      ? `/api/stream?url=${encodeURIComponent(cleanUrl)}`
      : cleanUrl;

  const isAnyPip = isPiPActive || isFloatingPiP;

  // 4. Clean, Native Video Player for Direct URLs, /api/media/ Firebase streams, & Server Uploads
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center select-none"
    >
      {/* Placeholder shown inside player slot while Floating PiP fallback is active */}
      {isFloatingPiP && (
        <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-3 border border-blue-500/30">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
            <PictureInPicture2 className="w-6 h-6 text-blue-400 animate-pulse" />
          </div>
          <p className="text-white font-black text-sm">الفيديو يعمل في النافذة العائمة المتحركة (PiP) ⚡</p>
          <button
            type="button"
            onClick={() => setIsFloatingPiP(false)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition cursor-pointer shadow-lg"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>إعادة الفيديو للحجم الطبيعي</span>
          </button>
        </div>
      )}

      {/* Draggable Floating Wrapper (turns native <video> into fixed movable PiP when OS PiP is unavailable, otherwise inline) */}
      <div
        ref={floatingWrapperRef}
        style={
          isFloatingPiP && floatingWinPos
            ? { left: `${floatingWinPos.x}px`, top: `${floatingWinPos.y}px`, right: 'auto', bottom: 'auto' }
            : undefined
        }
        className={
          isFloatingPiP
            ? 'fixed bottom-5 left-5 z-[9999] w-80 sm:w-96 rounded-2xl overflow-hidden shadow-2xl border-2 border-blue-500/80 bg-slate-950 flex flex-col select-none'
            : 'relative w-full h-full flex items-center justify-center'
        }
      >
        {isFloatingPiP && (
          <div
            onPointerDown={startDraggingFloatingWin}
            className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border-b border-blue-500/30 text-white cursor-grab active:cursor-grabbing touch-none"
            dir="rtl"
            title="اسحب لتحريك النافذة العائمة في أي مكان"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Move className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] font-black truncate">{title || 'منصة أقسام رعد'}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={handleToggleCaptions}
                className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer border ${
                  captionsEnabled ? 'bg-emerald-500 text-slate-950 border-emerald-300' : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
                title={captionsEnabled ? 'إلغاء الكابشن' : 'تشغيل الكابشن'}
              >
                CC
              </button>
              <button
                type="button"
                onClick={() => setIsFloatingPiP(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                title="العودة للحجم الطبيعي"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    internalVideoRef.current?.pause();
                  } catch {}
                  setIsFloatingPiP(false);
                }}
                className="p-1 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white transition cursor-pointer"
                title="إغلاق"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {!isFloatingPiP && watermarkContent}

        {/* Floating Movable PiP + Captions (CC) Quick Pill */}
        {!hasError && !isFloatingPiP && (
          <div
            onPointerDown={startDraggingPipButton}
            style={
              pipBtnPos
                ? { left: `${pipBtnPos.left}px`, top: `${pipBtnPos.top}px`, right: 'auto' }
                : undefined
            }
            className={`absolute ${pipBtnPos ? '' : 'top-3 right-3'} z-20 flex items-center gap-1 p-1 rounded-2xl bg-black/75 backdrop-blur-md border border-white/20 shadow-xl cursor-grab active:cursor-grabbing touch-none select-none`}
            title="اسحب لتحريك أزرار PiP و CC لأي مكان على الشاشة"
          >
            <span className="px-1 text-slate-400" aria-hidden="true">
              <Move className="w-3 h-3" />
            </span>

            {/* Captions (CC) Toggle Button */}
            <button
              type="button"
              onClick={handleToggleCaptions}
              onPointerDown={(e) => e.stopPropagation()}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[11px] font-black transition cursor-pointer ${
                captionsEnabled
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow shadow-emerald-500/30'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
              }`}
              title={
                captionsEnabled
                  ? textTrackCount > 0
                    ? 'إلغاء الكابشن / الترجمة (C)'
                    : 'تم تفعيل وضع الكابشن (لا توجد ترجمة مدمجة في هذا الملف)'
                  : 'تشغيل الكابشن / الترجمة (C)'
              }
            >
              <Captions className="w-3.5 h-3.5" />
              <span>CC</span>
            </button>

            {/* Animated & Movable Picture-in-Picture (PiP) Button */}
            <button
              type="button"
              onClick={handleTogglePiP}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-black transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                isAnyPip
                  ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/40'
                  : 'bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border-amber-400/50 animate-pulse'
              }`}
              title={
                isAnyPip
                  ? 'الخروج من النافذة العائمة (PiP)'
                  : 'تشغيل في نافذة عائمة تبقى ظاهرة حتى لو دخلت موقعاً آخر (PiP) — اسحب للتحريك'
              }
            >
              <PictureInPicture2 className={`w-3.5 h-3.5 ${isAnyPip ? 'text-slate-950' : 'text-amber-300'}`} />
              <span>PiP</span>
            </button>
          </div>
        )}

        {/* Subtle loading pill while metadata is preparing */}
        {!hasLoadedMetadata && !hasError && !isFloatingPiP && (
          <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-black/70 border border-white/15 text-slate-200 text-[11px] font-bold backdrop-blur-md">
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            <span>جاري تجهيز الفيديو...</span>
          </div>
        )}

        {hasError ? (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 z-20 max-w-sm">
            <AlertCircle className="w-10 h-10 text-amber-400" />
            <div>
              <h4 className="text-white font-bold text-sm">تعذر تشغيل هذا الفيديو</h4>
              <p className="text-slate-400 text-xs mt-1">
                يرجى التأكد من اتصال الإنترنت أو الضغط لإعادة التحميل عبر خادم المنصة السريع
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {isExternalHttp ? (
                <>
                  <button
                    type="button"
                    onClick={handleRetryViaProxy}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تشغيل عبر الخادم السريع</span>
                  </button>
                  {cleanUrl.startsWith('https://') && !isDirectBrokenSslHost(cleanUrl) && (
                    <button
                      type="button"
                      onClick={handleRetryDirect}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>تشغيل مباشر</span>
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleRetryDirect}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>إعادة تحميل الفيديو</span>
                </button>
              )}
              {isExternalHttp && (
                <a
                  href={cleanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                >
                  فتح الرابط مباشرة ↗
                </a>
              )}
            </div>
          </div>
        ) : (
          <video
            ref={setCombinedVideoRef}
            key={`vid-${effectiveSource}-${reloadKey}`}
            src={effectiveSource}
            controls
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            preload="metadata"
            playsInline
            autoPlay={false}
            onLoadedMetadata={() => {
              setHasLoadedMetadata(true);
              setHasError(false);
              const count = applyHtmlVideoCaptions(internalVideoRef.current, captionsEnabled);
              setTextTrackCount(count);
              if (pendingNativePipRef.current) {
                pendingNativePipRef.current = false;
                const v = internalVideoRef.current;
                if (v && v.requestPictureInPicture) {
                  v.requestPictureInPicture()
                    .then(() => setIsPiPActive(true))
                    .catch(() => setIsFloatingPiP(true));
                }
              }
            }}
            onCanPlay={() => {
              setHasLoadedMetadata(true);
            }}
            onEnded={() => {
              if (onEnded) onEnded();
            }}
            onError={() => {
              if (!useProxyFallback && isExternalHttp && !hasTriedProxy) {
                setHasTriedProxy(true);
                setUseProxyFallback(true);
                setHasLoadedMetadata(false);
                return;
              }
              if (autoRetryCount < 1) {
                setAutoRetryCount((prev) => prev + 1);
                setHasLoadedMetadata(false);
                setTimeout(() => {
                  setReloadKey((prev) => prev + 1);
                }, 600);
                return;
              }
              if (useProxyFallback && cleanUrl.startsWith('https://') && !isDirectBrokenSslHost(cleanUrl) && !hasTriedDirect) {
                setHasTriedDirect(true);
                setUseProxyFallback(false);
                setAutoRetryCount(0);
                setHasLoadedMetadata(false);
                return;
              }
              if (!useBackupUrl && backupCleanUrl && backupCleanUrl !== primaryCleanUrl) {
                const backupProxy = shouldStartWithProxy(backupCleanUrl);
                setUseBackupUrl(true);
                setAutoRetryCount(0);
                setHasLoadedMetadata(false);
                setUseProxyFallback(backupProxy);
                setHasTriedProxy(backupProxy);
                setHasTriedDirect(!backupProxy);
                setReloadKey((prev) => prev + 1);
                return;
              }
              setHasError(true);
            }}
            className={isFloatingPiP ? 'w-full aspect-video object-contain bg-black' : className}
          >
            متصفحك لا يدعم تشغيل هذا الفيديو.
          </video>
        )}
      </div>
    </div>
  );
};
