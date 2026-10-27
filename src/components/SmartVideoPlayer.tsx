import React, { useRef, useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, Play, Volume2 } from 'lucide-react';

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
  const [hasError, setHasError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Reset error when URL changes
  useEffect(() => {
    setHasError(false);
    setIsBuffering(false);
  }, [url, reloadKey]);

  if (!url || !url.trim()) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2 bg-slate-950">
        <Play className="w-10 h-10 opacity-30 stroke-[1.5]" />
        <p className="text-xs sm:text-sm font-bold">لا يوجد رابط فيديو محدد لهذا المحتوى</p>
      </div>
    );
  }

  const cleanUrl = url.trim();

  // 1. YouTube Detection
  const ytMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
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

  // 4. Native HTML5 Video for direct URLs (mp4, webm, blob, etc.)
  const handleReload = () => {
    setHasError(false);
    setIsBuffering(false);
    setReloadKey((prev) => prev + 1);
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center group">
      {watermarkContent}

      {/* Buffering Indicator */}
      {isBuffering && !hasError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none backdrop-blur-xs">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/80 text-white text-xs font-bold border border-white/10 shadow-2xl animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
            <span>جاري التحميل بسلاسة...</span>
          </div>
        </div>
      )}

      {hasError ? (
        <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 z-20 max-w-sm">
          <AlertCircle className="w-10 h-10 text-amber-400" />
          <div>
            <h4 className="text-white font-bold text-sm">تعذر تشغيل هذا الفيديو مؤقتاً</h4>
            <p className="text-slate-400 text-xs mt-1">تأكد من اتصالك بالإنترنت أو أعد تشغيل المشغل</p>
          </div>
          <button
            type="button"
            onClick={handleReload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة محاولة التشغيل</span>
          </button>
        </div>
      ) : (
        <video
          ref={videoRef}
          key={`vid-${cleanUrl}-${reloadKey}`}
          controls
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()}
          preload="metadata"
          playsInline
          autoPlay={false}
          onEnded={onEnded}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onCanPlay={() => setIsBuffering(false)}
          onError={() => {
            setIsBuffering(false);
            setHasError(true);
          }}
          className={className}
        >
          <source src={cleanUrl} type="video/mp4" />
          <source src={cleanUrl} type="video/webm" />
          <source src={cleanUrl} />
          متصفحك لا يدعم تشغيل هذا الفيديو.
        </video>
      )}
    </div>
  );
};
