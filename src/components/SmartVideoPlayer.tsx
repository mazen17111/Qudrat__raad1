import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, Play, PictureInPicture2 } from 'lucide-react';
import { resolveVideoUrl } from '../firebase';

interface SmartVideoPlayerProps {
  url: string;
  backupUrl?: string;
  title?: string;
  onEnded?: () => void;
  className?: string;
  watermarkContent?: React.ReactNode;
  externalVideoRef?: React.RefObject<HTMLVideoElement | null>;
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

export const SmartVideoPlayer: React.FC<SmartVideoPlayerProps> = ({
  url,
  backupUrl,
  title,
  onEnded,
  className = 'w-full h-full object-contain',
  watermarkContent,
  externalVideoRef,
}) => {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);

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

  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => setIsPiPActive(false);

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [reloadKey, url, useProxyFallback]);

  const handleTogglePiP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const video = internalVideoRef.current;
      if (!video) return;

      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiPActive(false);
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setIsPiPActive(true);
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
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

  // Keyboard navigation shortcuts (Arrow keys for smooth seek ±5s, Space for play/pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [safeSeek]);

  if (!url || !url.trim()) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2 bg-slate-950">
        <Play className="w-10 h-10 opacity-30 stroke-[1.5]" />
        <p className="text-xs sm:text-sm font-bold">لا يوجد رابط فيديو محدد لهذا المحتوى</p>
      </div>
    );
  }

  // 1. YouTube Detection (including youtu.be, watch?v=, embed/, shorts/, live/, m.youtube.com)
  const ytMatch = cleanUrl.match(
    /(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return (
      <div className="relative w-full h-full bg-black overflow-hidden group">
        {watermarkContent}
        <iframe
          key={`yt-${videoId}`}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`}
          title={title || 'مشغل الفيديو'}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
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

  // 4. Clean, Native Video Player for Direct URLs, /api/media/ Firebase streams, & Server Uploads
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center select-none"
    >
      {watermarkContent}

      {/* Floating Simple PiP Button */}
      {isPiPSupported && !hasError && (
        <button
          type="button"
          onClick={handleTogglePiP}
          className={`absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border shadow-lg transition-all duration-200 active:scale-95 cursor-pointer select-none ${
            isPiPActive
              ? 'bg-amber-500 text-slate-950 border-amber-300 font-black shadow-amber-500/30 ring-2 ring-amber-400/40'
              : 'bg-black/75 hover:bg-black/90 text-white border-white/20 hover:border-white/40'
          }`}
          title={isPiPActive ? 'الخروج من النافذة العائمة (PiP)' : 'تشغيل الفيديو في نافذة عائمة مصغرة (PiP)'}
        >
          <PictureInPicture2 className={`w-3.5 h-3.5 ${isPiPActive ? 'text-slate-950' : 'text-amber-400'}`} />
          <span className="text-[11px] font-black">PiP</span>
        </button>
      )}

      {/* Subtle loading pill while metadata is preparing */}
      {!hasLoadedMetadata && !hasError && (
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
          className={className}
        >
          متصفحك لا يدعم تشغيل هذا الفيديو.
        </video>
      )}
    </div>
  );
};
