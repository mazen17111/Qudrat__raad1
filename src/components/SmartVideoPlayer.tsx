import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Captions,
  Move,
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

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const formatTime = (totalSeconds: number): string => {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const sec = Math.floor(totalSeconds);
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
};

const isDirectBrokenSslHost = (cleanUrl: string): boolean => {
  const lower = cleanUrl.toLowerCase();
  return lower.startsWith('http://') || lower.includes('top4top.io');
};

const shouldStartWithProxy = (cleanUrl: string): boolean => {
  if (!cleanUrl) return false;
  const lower = cleanUrl.toLowerCase();
  if (lower.startsWith('/api/') || lower.startsWith('/uploads/') || lower.startsWith('blob:') || lower.startsWith('data:')) {
    return false;
  }
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
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const pendingNativePipRef = useRef(false);
  const hideControlsTimerRef = useRef<number | null>(null);

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

  // Unified Custom Player UI State (matching PlatformYouTubePlayer look across ALL videos)
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const lastPointerTypeRef = useRef<string>('mouse');

  // PiP & Captions State
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isFloatingPiP, setIsFloatingPiP] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [textTrackCount, setTextTrackCount] = useState(0);

  // Draggable position for movable PiP pill
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

  // Draggable position for Floating PiP fallback window
  const [floatingWinPos, setFloatingWinPos] = useState<{ x: number; y: number } | null>(null);
  const winDragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  // Synchronize state immediately on URL change
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
    setIsPlaying(false);
    setIsBuffering(false);
    setIsEnded(false);
    setHasStartedOnce(false);
    setCurrentTime(0);
    setDuration(0);
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

  const scheduleHideControls = useCallback(() => {
    if (hideControlsTimerRef.current) {
      window.clearTimeout(hideControlsTimerRef.current);
    }
    setControlsVisible(true);
    hideControlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      setShowSpeedMenu(false);
    }, 3200);
  }, []);

  useEffect(() => {
    setIsPiPSupported(
      typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && Boolean(document.pictureInPictureEnabled)
    );
  }, []);

  // Listen to global pause requests when student switches lessons/sections/exams
  useEffect(() => {
    const handleGlobalPause = () => {
      try {
        internalVideoRef.current?.pause();
      } catch {}
    };
    window.addEventListener('raad-pause-all-videos', handleGlobalPause);
    return () => window.removeEventListener('raad-pause-all-videos', handleGlobalPause);
  }, []);

  // Track Fullscreen & iOS Pseudo-Fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      const doc = document as any;
      const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
      setIsFullscreen(Boolean(fsEl && fsEl === playerWrapperRef.current));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  useEffect(() => {
    if (!isPseudoFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPseudoFullscreen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onEsc);
    };
  }, [isPseudoFullscreen]);

  // Native PiP (Standard + iOS Safari webkitpresentationmodechanged) & TextTrack event listeners
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    const handleEnterPiP = () => {
      setIsPiPActive(true);
      setIsFloatingPiP(false);
    };
    const handleLeavePiP = () => setIsPiPActive(false);

    const handleWebkitPresentation = () => {
      const mode = (video as any).webkitPresentationMode;
      if (mode === 'picture-in-picture') {
        setIsPiPActive(true);
        setIsFloatingPiP(false);
      } else {
        setIsPiPActive(false);
      }
    };

    const syncTracks = () => {
      const count = applyHtmlVideoCaptions(video, captionsEnabled);
      setTextTrackCount(count);
    };

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);
    video.addEventListener('webkitpresentationmodechanged', handleWebkitPresentation);
    try {
      video.textTracks?.addEventListener?.('addtrack', syncTracks);
    } catch {}

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
      video.removeEventListener('webkitpresentationmodechanged', handleWebkitPresentation);
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
      scheduleHideControls();
    },
    [captionsEnabled, scheduleHideControls]
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

      // iOS Safari Native PiP support (webkitSetPresentationMode)
      const vAny = video as any;
      if (typeof vAny.webkitSupportsPresentationMode === 'function' && vAny.webkitSupportsPresentationMode('picture-in-picture')) {
        try {
          if (video.paused) {
            video.play().catch(() => {});
          }
          const nextMode = vAny.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
          vAny.webkitSetPresentationMode(nextMode);
          setIsPiPActive(nextMode === 'picture-in-picture');
          return;
        } catch (err) {
          console.warn('iOS PiP fallback:', err);
        }
      }

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

      setIsFloatingPiP(true);
    },
    [isFloatingPiP, isPiPSupported]
  );

  if (pipActionRef) {
    pipActionRef.current = () => {
      handleTogglePiP();
    };
  }

  // Register MediaSession Auto-PiP on tab switch
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

  // Global pointer drag handlers for movable PiP pill & floating PiP window
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
          const nextLeft = Math.max(8, Math.min(Math.max(8, rect.width - 110), pipBtnDragRef.current.originLeft + dx));
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
    if (!isFloatingPiP || !playerWrapperRef.current) return;
    const rect = playerWrapperRef.current.getBoundingClientRect();
    winDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
    };
  };

  // Bidirectional stall recovery
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
  const safeSeek = useCallback(
    (targetSeconds: number) => {
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
        setCurrentTime(target);
        scheduleHideControls();
      } catch (err) {
        console.warn('Seek error handled safely:', err);
      }
    },
    [scheduleHideControls]
  );

  const togglePlay = useCallback(() => {
    const video = internalVideoRef.current;
    if (!video || hasError) return;
    try {
      if (video.paused || video.ended) {
        if (video.ended) {
          video.currentTime = 0;
        }
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      scheduleHideControls();
    } catch {}
  }, [hasError, scheduleHideControls]);

  const toggleMute = useCallback(() => {
    const video = internalVideoRef.current;
    if (!video) return;
    try {
      if (video.muted || video.volume === 0) {
        video.muted = false;
        const nextVol = volume > 0 ? volume : 100;
        video.volume = nextVol / 100;
        setVolume(nextVol);
        setIsMuted(false);
      } else {
        video.muted = true;
        setIsMuted(true);
      }
      scheduleHideControls();
    } catch {}
  }, [volume, scheduleHideControls]);

  const handleVolumeChange = (val: number) => {
    const video = internalVideoRef.current;
    setVolume(val);
    if (!video) return;
    try {
      video.volume = Math.max(0, Math.min(1, val / 100));
      if (val === 0) {
        video.muted = true;
        setIsMuted(true);
      } else {
        video.muted = false;
        setIsMuted(false);
      }
    } catch {}
  };

  const handleSpeedChange = (rate: number) => {
    const video = internalVideoRef.current;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
    if (!video) return;
    try {
      video.playbackRate = rate;
    } catch {}
  };

  const toggleFullscreen = useCallback(async () => {
    try {
      const doc = document as any;
      const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
      if (fsEl) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
        setIsPseudoFullscreen(false);
      } else if (isPseudoFullscreen) {
        setIsPseudoFullscreen(false);
      } else {
        if (isFloatingPiP) setIsFloatingPiP(false);
        const wrapper = playerWrapperRef.current as any;
        const video = internalVideoRef.current as any;
        if (wrapper?.requestFullscreen) {
          await wrapper.requestFullscreen();
        } else if (wrapper?.webkitRequestFullscreen) {
          wrapper.webkitRequestFullscreen();
        } else if (video?.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        } else {
          // Universal mobile WebView viewport fullscreen fallback
          setIsPseudoFullscreen(true);
        }
      }
      scheduleHideControls();
    } catch {
      setIsPseudoFullscreen((prev) => !prev);
    }
  }, [isFloatingPiP, isPseudoFullscreen, scheduleHideControls]);

  // Keyboard navigation shortcuts (Space, Arrows ±5s, M, F, C for Captions)
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
        togglePlay();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleToggleCaptions();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [safeSeek, togglePlay, toggleMute, toggleFullscreen, handleToggleCaptions]);

  if (!url || !url.trim()) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2 bg-slate-950">
        <Play className="w-10 h-10 opacity-30 stroke-[1.5]" />
        <p className="text-xs sm:text-sm font-bold">لا يوجد رابط فيديو محدد لهذا المحتوى</p>
      </div>
    );
  }

  // 1. YouTube Detection (rendered through PlatformYouTubePlayer — custom platform style, NO PiP button)
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
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const effectiveFullscreen = isFullscreen || isPseudoFullscreen;

  // 4. Unified Custom Branded Platform Video Player for Direct URLs, Catbox, Firebase Media & Server Uploads
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center select-none"
      dir="rtl"
    >
      {/* Inline placeholder while Floating PiP fallback is active */}
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

      {/* Main Custom Platform Player Container (or Draggable Floating PiP Window / Mobile Pseudo-Fullscreen) */}
      <div
        ref={playerWrapperRef}
        onPointerDown={(e) => {
          lastPointerTypeRef.current = e.pointerType || 'mouse';
          scheduleHideControls();
        }}
        onMouseMove={scheduleHideControls}
        onMouseLeave={() => {
          if (isPlaying && lastPointerTypeRef.current !== 'touch') {
            setControlsVisible(false);
            setShowSpeedMenu(false);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={
          isFloatingPiP && floatingWinPos
            ? { left: `${floatingWinPos.x}px`, top: `${floatingWinPos.y}px`, right: 'auto', bottom: 'auto' }
            : undefined
        }
        className={
          isFloatingPiP
            ? 'fixed bottom-4 left-3 z-[9999] w-72 sm:w-96 max-w-[calc(100vw-24px)] rounded-2xl overflow-hidden shadow-2xl border-2 border-blue-500/80 bg-slate-950 flex flex-col select-none'
            : isPseudoFullscreen
            ? 'fixed inset-0 z-[99999] w-screen h-[100dvh] bg-black overflow-hidden select-none group'
            : 'relative w-full h-full bg-black overflow-hidden select-none group'
        }
      >
        {/* Draggable Floating PiP Header Bar (fallback mode) */}
        {isFloatingPiP && (
          <div
            onPointerDown={startDraggingFloatingWin}
            className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border-b border-blue-500/30 text-white cursor-grab active:cursor-grabbing touch-none"
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

        {/* Video Frame Container */}
        <div className={isFloatingPiP ? 'relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center' : 'relative w-full h-full bg-black overflow-hidden flex items-center justify-center'}>
          {/* Native <video> with native browser controls hidden so our unified platform skin applies */}
          {!hasError && (
            <video
              ref={setCombinedVideoRef}
              key={`vid-${effectiveSource}-${reloadKey}`}
              src={effectiveSource}
              controls={false}
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              preload="metadata"
              playsInline
              autoPlay={false}
              onLoadedMetadata={() => {
                const v = internalVideoRef.current;
                setHasLoadedMetadata(true);
                setHasError(false);
                if (v) {
                  if (v.duration && isFinite(v.duration)) {
                    setDuration(v.duration);
                  }
                  v.playbackRate = playbackRate;
                  v.muted = isMuted;
                  v.volume = Math.max(0, Math.min(1, volume / 100));
                }
                const count = applyHtmlVideoCaptions(v, captionsEnabled);
                setTextTrackCount(count);
                if (pendingNativePipRef.current) {
                  pendingNativePipRef.current = false;
                  if (v && v.requestPictureInPicture) {
                    v.requestPictureInPicture()
                      .then(() => setIsPiPActive(true))
                      .catch(() => setIsFloatingPiP(true));
                  }
                }
              }}
              onDurationChange={() => {
                const v = internalVideoRef.current;
                if (v && v.duration && isFinite(v.duration)) {
                  setDuration(v.duration);
                }
              }}
              onTimeUpdate={() => {
                const v = internalVideoRef.current;
                if (v) {
                  setCurrentTime(v.currentTime || 0);
                  if (v.duration && isFinite(v.duration)) {
                    setDuration(v.duration);
                  }
                }
              }}
              onPlay={() => {
                setIsPlaying(true);
                setIsEnded(false);
                setHasStartedOnce(true);
                setIsBuffering(false);
                scheduleHideControls();
              }}
              onPlaying={() => {
                setIsPlaying(true);
                setIsBuffering(false);
              }}
              onPause={() => {
                setIsPlaying(false);
                setControlsVisible(true);
              }}
              onWaiting={() => {
                setIsBuffering(true);
              }}
              onCanPlay={() => {
                setHasLoadedMetadata(true);
                setIsBuffering(false);
              }}
              onVolumeChange={() => {
                const v = internalVideoRef.current;
                if (v) {
                  setIsMuted(v.muted || v.volume === 0);
                  setVolume(Math.round(v.volume * 100));
                }
              }}
              onRateChange={() => {
                const v = internalVideoRef.current;
                if (v) setPlaybackRate(v.playbackRate);
              }}
              onEnded={() => {
                setIsPlaying(false);
                setIsBuffering(false);
                setIsEnded(true);
                setControlsVisible(true);
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
              className={isFloatingPiP ? 'w-full h-full object-contain bg-black' : className}
            >
              متصفحك لا يدعم تشغيل هذا الفيديو.
            </video>
          )}

          {/* Platform Watermark */}
          {!isFloatingPiP && watermarkContent}

          {/* Movable Animated Quick PiP Pill (available ONLY for non-YouTube videos) */}
          {!hasError && !isFloatingPiP && (
            <div
              onPointerDown={startDraggingPipButton}
              onClick={(e) => e.stopPropagation()}
              style={
                pipBtnPos
                  ? { left: `${pipBtnPos.left}px`, top: `${pipBtnPos.top}px`, right: 'auto' }
                  : undefined
              }
              className={`absolute ${pipBtnPos ? '' : 'top-3 right-3'} z-30 flex items-center gap-1 p-1 rounded-2xl bg-black/75 backdrop-blur-md border border-white/20 shadow-xl cursor-grab active:cursor-grabbing touch-none select-none`}
              title="اسحب لتحريك زر PiP في أي مكان على الشاشة"
            >
              <span className="px-1 text-slate-400" aria-hidden="true">
                <Move className="w-3 h-3" />
              </span>
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

          {/* Click & Touch Overlay Shield */}
          {!hasError && (
            <div
              onClick={() => {
                if (lastPointerTypeRef.current === 'touch' && isPlaying && !controlsVisible) {
                  scheduleHideControls();
                  return;
                }
                togglePlay();
              }}
              onDoubleClick={toggleFullscreen}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 z-10 cursor-pointer"
            />
          )}

          {/* Unified Platform Branded Idle / Paused / Ended Cover (Exact match to YouTube custom cover) */}
          {(!isPlaying || isEnded) && !hasError && (
            <div
              onClick={togglePlay}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 text-center cursor-pointer bg-gradient-to-br from-slate-950/92 via-slate-900/88 to-blue-950/92 backdrop-blur-[3px] transition-opacity duration-200"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-2xl shadow-blue-600/40 ring-4 ring-white/15 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={isEnded ? 'إعادة تشغيل الدرس' : 'تشغيل الدرس'}
              >
                {isEnded ? (
                  <RotateCcw className="w-7 h-7 sm:w-8 sm:h-8" />
                ) : (
                  <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current -mr-0.5" />
                )}
              </button>

              {!isFloatingPiP && (
                <div className="mt-4 max-w-md space-y-1.5 px-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[11px] font-black">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>مشغل منصة أقسام رعد الخاص</span>
                  </div>
                  {title && (
                    <h4 className="text-white font-black text-sm sm:text-base line-clamp-2 drop-shadow">
                      {title}
                    </h4>
                  )}
                  <p className="text-slate-300 text-[11px] font-medium">
                    {isEnded
                      ? 'انتهى الدرس — اضغط لإعادة المشاهدة'
                      : hasStartedOnce
                      ? 'تم إيقاف الفيديو مؤقتاً — اضغط للمتابعة'
                      : 'اضغط لبدء تشغيل الفيديو بجودة عالية'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Buffering Indicator */}
          {isBuffering && isPlaying && !hasError && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 border border-white/15 text-white text-xs font-bold shadow-xl">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                <span>جاري التحميل...</span>
              </div>
            </div>
          )}

          {/* Error Recovery Screen */}
          {hasError && (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 z-30 max-w-sm">
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
          )}

          {/* Corner badge while controls are auto-hidden */}
          {isPlaying && !controlsVisible && !isFloatingPiP && !hasError && (
            <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/80 border border-white/10 text-[10px] font-black text-amber-300 shadow">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>أقسام رعد</span>
            </div>
          )}

          {/* Unified Custom Platform Control Bar (Exact match to YouTube custom player + PiP) */}
          {!hasError && (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/92 to-transparent pt-5 pb-2 px-2 sm:px-4 transition-opacity duration-200 ${
                controlsVisible || !isPlaying || isFloatingPiP ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              {/* Touch-Friendly Gradient Seek Slider */}
              <div className="relative w-full h-7 sm:h-5 flex items-center group/seek mb-1 touch-none" dir="ltr">
                <div className="w-full h-1.5 rounded-full bg-white/25 overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-100"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md ring-2 ring-blue-500 transition-transform group-hover/seek:scale-110"
                  style={{ left: `${progressPct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.5}
                  value={Math.min(currentTime, duration || 100)}
                  onChange={(e) => safeSeek(Number(e.target.value))}
                  aria-label="شريط تقديم الفيديو"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none"
                />
              </div>

              {/* Control Buttons Row */}
              <div className="flex items-center justify-between gap-1 sm:gap-2 text-white">
                {/* Right side (RTL): Play, Skip ±10s, Time, Brand Badge */}
                <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-1.5 sm:p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer shadow shrink-0"
                    title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />}
                  </button>

                  {!isFloatingPiP && (
                    <>
                      <button
                        type="button"
                        onClick={() => safeSeek(currentTime - 10)}
                        className="p-1 sm:p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer shrink-0"
                        title="ترجيع 10 ثواني"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => safeSeek(currentTime + 10)}
                        className="p-1 sm:p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer shrink-0"
                        title="تقديم 10 ثواني"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  <span className="text-[9px] sm:text-xs font-mono font-bold text-slate-200 px-0.5 sm:px-1 whitespace-nowrap" dir="ltr">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>

                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900/90 border border-white/15 text-[10px] font-black text-amber-300">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>أقسام رعد</span>
                  </span>
                </div>

                {/* Left side (RTL): Volume, CC Captions, Speed, Animated PiP, Fullscreen */}
                <div className="flex items-center gap-1 sm:gap-1.5 relative shrink-0">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer"
                    title={isMuted ? 'إلغاء الكتم' : 'كتم الصوت'}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  </button>

                  {!isFloatingPiP && (
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(Number(e.target.value))}
                      className="hidden md:block w-14 accent-blue-500 cursor-pointer h-1"
                      aria-label="مستوى الصوت"
                    />
                  )}

                  {/* Captions (CC) Toggle Button */}
                  <button
                    type="button"
                    onClick={handleToggleCaptions}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] sm:text-[11px] font-black transition cursor-pointer ${
                      captionsEnabled
                        ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow shadow-emerald-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/15'
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

                  {/* Speed selector */}
                  {!isFloatingPiP && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowSpeedMenu((s) => !s)}
                        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] sm:text-[11px] font-mono font-black text-slate-100 transition cursor-pointer"
                        title="سرعة التشغيل"
                      >
                        {playbackRate}x
                      </button>
                      {showSpeedMenu && (
                        <div className="absolute bottom-full left-0 mb-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1 flex flex-col gap-0.5 min-w-[68px] z-40">
                          {SPEED_OPTIONS.map((spd) => (
                            <button
                              key={spd}
                              type="button"
                              onClick={() => handleSpeedChange(spd)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold text-center cursor-pointer transition ${
                                playbackRate === spd
                                  ? 'bg-blue-600 text-white'
                                  : 'text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Animated PiP Button */}
                  <button
                    type="button"
                    onClick={handleTogglePiP}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg border text-[10px] sm:text-[11px] font-black transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                      isAnyPip
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/30'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-400/40 animate-pulse'
                    }`}
                    title={
                      isAnyPip
                        ? 'إعادة الفيديو للوضع الطبيعي'
                        : 'تشغيل في نافذة عائمة تبقى معك حتى لو دخلت موقعاً آخر (PiP)'
                    }
                  >
                    <PictureInPicture2 className="w-3.5 h-3.5" />
                    <span>PiP</span>
                  </button>

                  {/* Fullscreen Button */}
                  {!isFloatingPiP && (
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer"
                      title={effectiveFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
                    >
                      {effectiveFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
