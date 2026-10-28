import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, Play } from 'lucide-react';

interface SmartVideoPlayerProps {
  url: string;
  title?: string;
  onEnded?: () => void;
  className?: string;
  watermarkContent?: React.ReactNode;
}

export const SmartVideoPlayer: React.FC<SmartVideoPlayerProps> = ({
  url,
  title,
  onEnded,
  className = 'w-full h-full object-contain',
  watermarkContent,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [useProxyFallback, setUseProxyFallback] = useState(false);

  // Reset states when URL changes
  useEffect(() => {
    setHasError(false);
    setUseProxyFallback(false);
  }, [url, reloadKey]);

  const handleReload = () => {
    setHasError(false);
    setUseProxyFallback(false);
    setReloadKey((prev) => prev + 1);
  };

  // Safe seek handler preventing browser stalls
  const safeSeek = useCallback((targetSeconds: number) => {
    const video = videoRef.current;
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

      const video = videoRef.current;
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

  const cleanUrl = url.trim();

  // 1. YouTube Detection (including youtu.be, watch?v=, embed/, shorts/, m.youtube.com)
  const ytMatch = cleanUrl.match(
    /(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i
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

  // 2. Google Drive Detection
  const driveMatch = cleanUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    return (
      <div className="relative w-full h-full bg-black overflow-hidden group">
        {watermarkContent}
        <iframe
          key={`drive-${fileId}`}
          src={`https://drive.google.com/file/d/${fileId}/preview`}
          title={title || 'مشغل الفيديو'}
          className="w-full h-full border-0"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  // 3. Vimeo Detection
  const vimeoMatch = cleanUrl.match(/vimeo\.com\/(\d+)/i);
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
  let effectiveSource = cleanUrl;
  if (useProxyFallback && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
    effectiveSource = `/api/stream?url=${encodeURIComponent(cleanUrl)}`;
  }

  // 4. Clean, Native Video Player for Direct URLs & Server Uploads
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center select-none"
    >
      {watermarkContent}

      {hasError ? (
        <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 z-20 max-w-sm">
          <AlertCircle className="w-10 h-10 text-amber-400" />
          <div>
            <h4 className="text-white font-bold text-sm">تعذر تشغيل هذا الفيديو</h4>
            <p className="text-slate-400 text-xs mt-1">يرجى التأكد من اتصال الإنترنت أو صحة رابط الفيديو</p>
          </div>
          <button
            type="button"
            onClick={handleReload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      ) : (
        <video
          ref={videoRef}
          key={`vid-${effectiveSource}-${reloadKey}`}
          controls
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()}
          preload="metadata"
          playsInline
          autoPlay={false}
          onEnded={() => {
            if (onEnded) onEnded();
          }}
          onError={() => {
            // If direct external URL failed, try automatic silent fallback through backend stream proxy
            if (!useProxyFallback && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
              setUseProxyFallback(true);
            } else {
              setHasError(true);
            }
          }}
          className={className}
        >
          <source src={effectiveSource} type="video/mp4" />
          <source src={effectiveSource} type="video/webm" />
          <source src={effectiveSource} />
          متصفحك لا يدعم تشغيل هذا الفيديو.
        </video>
      )}
    </div>
  );
};
