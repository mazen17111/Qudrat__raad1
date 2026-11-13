import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  AlertCircle,
  RefreshCw,
  Zap,
  Captions,
} from 'lucide-react';

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement | string, options: Record<string, any>) => any;
      PlayerState?: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const ytApiPromises = new WeakMap<Window, Promise<NonNullable<Window['YT']>>>();

function loadYouTubeIframeApiInWindow(targetWin: Window): Promise<NonNullable<Window['YT']>> {
  if (targetWin.YT && typeof targetWin.YT.Player === 'function') {
    return Promise.resolve(targetWin.YT);
  }
  const existing = ytApiPromises.get(targetWin);
  if (existing) return existing;

  const promise = new Promise<NonNullable<Window['YT']>>((resolve, reject) => {
    const doc = targetWin.document;
    const existingScript = doc.querySelector('script[src*="youtube.com/iframe_api"]');
    const prevReady = targetWin.onYouTubeIframeAPIReady;

    targetWin.onYouTubeIframeAPIReady = () => {
      if (prevReady) {
        try {
          prevReady();
        } catch {}
      }
      if (targetWin.YT && typeof targetWin.YT.Player === 'function') {
        resolve(targetWin.YT);
      }
    };

    if (!existingScript) {
      const script = doc.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        ytApiPromises.delete(targetWin);
        reject(new Error('Failed to load YouTube Player API'));
      };
      doc.head.appendChild(script);
    }

    const pollTimer = window.setInterval(() => {
      if (targetWin.YT && typeof targetWin.YT.Player === 'function') {
        window.clearInterval(pollTimer);
        resolve(targetWin.YT);
      }
    }, 150);

    window.setTimeout(() => {
      window.clearInterval(pollTimer);
      if (!targetWin.YT || typeof targetWin.YT.Player !== 'function') {
        ytApiPromises.delete(targetWin);
        reject(new Error('YouTube Player API timeout'));
      }
    }, 12000);
  });

  ytApiPromises.set(targetWin, promise);
  return promise;
}

function formatTime(totalSeconds: number): string {
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
}

function applyYouTubeCaptionsOption(player: any, enable: boolean) {
  if (!player) return;
  try {
    if (enable) {
      player.loadModule?.('captions');
      const tracks = player.getOption?.('captions', 'tracklist');
      if (Array.isArray(tracks) && tracks.length > 0) {
        const arTrack = tracks.find((t: any) => String(t.languageCode || '').startsWith('ar'));
        player.setOption?.('captions', 'track', arTrack || tracks[0]);
      } else {
        player.setOption?.('captions', 'track', { languageCode: 'ar' });
      }
    } else {
      player.setOption?.('captions', 'track', {});
      player.unloadModule?.('captions');
    }
  } catch {}
}

interface PlatformYouTubePlayerProps {
  videoId: string;
  title?: string;
  onEnded?: () => void;
  watermarkContent?: React.ReactNode;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export const PlatformYouTubePlayer: React.FC<PlatformYouTubePlayerProps> = ({
  videoId,
  title,
  onEnded,
  watermarkContent,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerInstanceRef = useRef<any>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const [maskInitialTitle, setMaskInitialTitle] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const captionsEnabledRef = useRef(false);
  captionsEnabledRef.current = captionsEnabled;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const hideControlsTimerRef = useRef<number | null>(null);
  const initialMaskTimerRef = useRef<number | null>(null);
  const pendingPlayRef = useRef(false);
  const lastPointerTypeRef = useRef<string>('mouse');

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

  // Listen to global pause requests (when switching lessons/tabs/exams)
  useEffect(() => {
    const handleGlobalPause = () => {
      try {
        playerInstanceRef.current?.pauseVideo?.();
      } catch {}
    };
    window.addEventListener('raad-pause-all-videos', handleGlobalPause);
    return () => window.removeEventListener('raad-pause-all-videos', handleGlobalPause);
  }, []);

  // Track fullscreen & iOS pseudo-fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      const doc = document as any;
      const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
      setIsFullscreen(Boolean(fsEl && fsEl === wrapperRef.current));
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

  // Initialize hidden-branding YT Player instance
  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    setHasError(false);
    setIsPlaying(false);
    setIsBuffering(false);
    setIsEnded(false);
    setHasStartedOnce(false);
    setMaskInitialTitle(false);
    setCurrentTime(0);
    setDuration(0);

    loadYouTubeIframeApiInWindow(window)
      .then((YT) => {
        if (cancelled || !playerMountRef.current) return;

        playerMountRef.current.innerHTML = '';
        const targetDiv = document.createElement('div');
        targetDiv.className = 'w-full h-full';
        playerMountRef.current.appendChild(targetDiv);

        const player = new YT.Player(targetDiv, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            disablekb: 1,
            playsinline: 1,
            enablejsapi: 1,
            cc_load_policy: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (ev: any) => {
              if (cancelled) return;
              playerInstanceRef.current = ev.target;
              try {
                const iframe = ev.target.getIframe?.();
                if (iframe) {
                  iframe.style.width = '100%';
                  iframe.style.height = '100%';
                  iframe.style.pointerEvents = 'none';
                  iframe.setAttribute('tabindex', '-1');
                  iframe.setAttribute('playsinline', '1');
                  iframe.setAttribute('webkit-playsinline', '1');
                  iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
                }
                const dur = Number(ev.target.getDuration?.() || 0);
                if (dur > 0) setDuration(dur);
                if (pendingPlayRef.current) {
                  pendingPlayRef.current = false;
                  ev.target.playVideo?.();
                }
              } catch {}
              setIsReady(true);
            },
            onApiChange: (ev: any) => {
              if (cancelled) return;
              applyYouTubeCaptionsOption(ev.target, captionsEnabledRef.current);
            },
            onStateChange: (ev: any) => {
              if (cancelled) return;
              const state = ev.data;
              if (state === 1) {
                setIsPlaying(true);
                setIsBuffering(false);
                setIsEnded(false);
                setHasStartedOnce(true);
                setMaskInitialTitle(true);
                if (initialMaskTimerRef.current) {
                  window.clearTimeout(initialMaskTimerRef.current);
                }
                initialMaskTimerRef.current = window.setTimeout(() => {
                  setMaskInitialTitle(false);
                }, 4500);
                try {
                  const dur = Number(ev.target.getDuration?.() || 0);
                  if (dur > 0) setDuration(dur);
                } catch {}
                scheduleHideControls();
              } else if (state === 2) {
                setIsPlaying(false);
                setIsBuffering(false);
                setControlsVisible(true);
              } else if (state === 3) {
                setIsBuffering(true);
              } else if (state === 0) {
                setIsPlaying(false);
                setIsBuffering(false);
                setIsEnded(true);
                setControlsVisible(true);
                if (onEndedRef.current) onEndedRef.current();
              }
            },
            onError: () => {
              if (cancelled) return;
              setHasError(true);
              setIsBuffering(false);
            },
          },
        });

        playerInstanceRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });

    return () => {
      cancelled = true;
      if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current);
      if (initialMaskTimerRef.current) window.clearTimeout(initialMaskTimerRef.current);
      try {
        playerInstanceRef.current?.destroy?.();
      } catch {}
      playerInstanceRef.current = null;
    };
  }, [videoId, reloadNonce, scheduleHideControls]);

  // Smooth progress polling while playing
  useEffect(() => {
    if (!isReady) return;
    const timer = window.setInterval(() => {
      const p = playerInstanceRef.current;
      if (!p) return;
      try {
        const cur = Number(p.getCurrentTime?.() || 0);
        const dur = Number(p.getDuration?.() || 0);
        if (!isNaN(cur)) setCurrentTime(cur);
        if (dur > 0 && !isNaN(dur)) setDuration(dur);
      } catch {}
    }, 250);
    return () => window.clearInterval(timer);
  }, [isReady]);

  const togglePlay = useCallback(() => {
    const p = playerInstanceRef.current;
    if (!p || !isReady) {
      pendingPlayRef.current = true;
      setIsBuffering(true);
      return;
    }
    try {
      if (isPlaying) {
        p.pauseVideo();
      } else {
        if (isEnded) {
          p.seekTo(0, true);
        }
        p.playVideo();
      }
      scheduleHideControls();
    } catch {}
  }, [isReady, isPlaying, isEnded, scheduleHideControls]);

  const seekToSeconds = useCallback(
    (sec: number) => {
      const p = playerInstanceRef.current;
      if (!p || !isReady) return;
      const clamped = Math.max(0, duration > 0 ? Math.min(sec, duration) : sec);
      try {
        p.seekTo(clamped, true);
        setCurrentTime(clamped);
        scheduleHideControls();
      } catch {}
    },
    [isReady, duration, scheduleHideControls]
  );

  const toggleMute = useCallback(() => {
    const p = playerInstanceRef.current;
    if (!p || !isReady) return;
    try {
      if (isMuted) {
        p.unMute();
        const nextVol = volume > 0 ? volume : 100;
        p.setVolume(nextVol);
        setVolume(nextVol);
        setIsMuted(false);
      } else {
        p.mute();
        setIsMuted(true);
      }
      scheduleHideControls();
    } catch {}
  }, [isReady, isMuted, volume, scheduleHideControls]);

  const handleVolumeChange = (val: number) => {
    const p = playerInstanceRef.current;
    setVolume(val);
    if (!p || !isReady) return;
    try {
      p.setVolume(val);
      if (val === 0) {
        p.mute();
        setIsMuted(true);
      } else {
        p.unMute();
        setIsMuted(false);
      }
    } catch {}
  };

  const handleSpeedChange = (rate: number) => {
    const p = playerInstanceRef.current;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
    if (!p || !isReady) return;
    try {
      p.setPlaybackRate(rate);
    } catch {}
  };

  const handleToggleCaptions = useCallback(() => {
    const next = !captionsEnabled;
    setCaptionsEnabled(next);
    captionsEnabledRef.current = next;
    applyYouTubeCaptionsOption(playerInstanceRef.current, next);
    scheduleHideControls();
  }, [captionsEnabled, scheduleHideControls]);

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
        const el = wrapperRef.current as any;
        if (el?.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el?.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else {
          // iPhone Safari / Telegram & Instagram in-app WebView viewport fullscreen fallback
          setIsPseudoFullscreen(true);
        }
      }
      scheduleHideControls();
    } catch {
      setIsPseudoFullscreen((prev) => !prev);
    }
  }, [isPseudoFullscreen, scheduleHideControls]);

  // Keyboard shortcuts (Space, Left/Right Arrows, M, F, C for Captions)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      if (!isReady) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekToSeconds(currentTime + 5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekToSeconds(currentTime - 5);
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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isReady, currentTime, togglePlay, seekToSeconds, toggleMute, toggleFullscreen, handleToggleCaptions]);

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const effectiveFullscreen = isFullscreen || isPseudoFullscreen;

  return (
    <div
      ref={wrapperRef}
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
      className={
        isPseudoFullscreen
          ? 'fixed inset-0 z-[99999] w-screen h-[100dvh] bg-black overflow-hidden select-none group'
          : 'relative w-full h-full bg-black overflow-hidden select-none group'
      }
      dir="rtl"
    >
      {/* Video Frame Container */}
      <div className="relative w-full h-full bg-black overflow-hidden">
        <div
          ref={playerMountRef}
          className="w-full h-full pointer-events-none select-none"
        />

        {/* Platform Watermark */}
        {watermarkContent}

        {/* Top Mask during first ~4.5s of playback to cover any initial video title */}
        {isPlaying && maskInitialTitle && (
          <div className="pointer-events-none absolute top-0 inset-x-0 h-16 z-10 bg-gradient-to-b from-black via-black/85 to-transparent flex items-start justify-end px-4 pt-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/90 border border-white/15 text-white text-[11px] font-black shadow-lg">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="truncate max-w-[220px] sm:max-w-md">{title || 'منصة أقسام رعد التعليمية'}</span>
            </div>
          </div>
        )}

        {/* Full Transparent Click & Touch Shield */}
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

        {/* Platform Branded Idle / Paused / Ended Cover */}
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

        {/* Error State */}
        {hasError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center bg-slate-950/95 space-y-3">
            <AlertCircle className="w-10 h-10 text-amber-400" />
            <div>
              <h4 className="text-white font-bold text-sm">تعذر تشغيل الفيديو حالياً</h4>
              <p className="text-slate-400 text-xs mt-1">
                يرجى التحقق من اتصال الإنترنت ثم الضغط لإعادة التحميل
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setHasError(false);
                setReloadNonce((n) => n + 1);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>إعادة تحميل الفيديو</span>
            </button>
          </div>
        )}

        {/* Corner shield covering bottom-right area even when controls auto-hide */}
        {isPlaying && !controlsVisible && !hasError && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/80 border border-white/10 text-[10px] font-black text-amber-300 shadow">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>أقسام رعد</span>
          </div>
        )}

        {/* Custom Platform Control Bar (No PiP button on YouTube videos) */}
        {!hasError && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/92 to-transparent pt-5 pb-2 px-2 sm:px-4 transition-opacity duration-200 ${
              controlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Touch-Friendly Seek Slider */}
            <div className="relative w-full h-7 sm:h-5 flex items-center group/seek mb-1 touch-none" dir="ltr">
              <div className="w-full h-1.5 sm:h-1.5 rounded-full bg-white/25 overflow-hidden relative">
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
                onChange={(e) => seekToSeconds(Number(e.target.value))}
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

                <button
                  type="button"
                  onClick={() => seekToSeconds(currentTime - 10)}
                  className="p-1 sm:p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer shrink-0"
                  title="ترجيع 10 ثواني"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => seekToSeconds(currentTime + 10)}
                  className="p-1 sm:p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer shrink-0"
                  title="تقديم 10 ثواني"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                <span className="text-[9px] sm:text-xs font-mono font-bold text-slate-200 px-0.5 sm:px-1 whitespace-nowrap" dir="ltr">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900/90 border border-white/15 text-[10px] font-black text-amber-300">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>أقسام رعد</span>
                </span>
              </div>

              {/* Left side (RTL): Volume, CC Captions, Speed, Fullscreen */}
              <div className="flex items-center gap-1 sm:gap-1.5 relative shrink-0">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer"
                  title={isMuted ? 'إلغاء الكتم' : 'كتم الصوت'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>

                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="hidden md:block w-14 accent-blue-500 cursor-pointer h-1"
                  aria-label="مستوى الصوت"
                />

                {/* Captions (CC) Toggle Button */}
                <button
                  type="button"
                  onClick={handleToggleCaptions}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] sm:text-[11px] font-black transition cursor-pointer ${
                    captionsEnabled
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow shadow-emerald-500/30'
                      : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/15'
                  }`}
                  title={captionsEnabled ? 'إلغاء الكابشن / الترجمة (C)' : 'تشغيل الكابشن / الترجمة (C)'}
                >
                  <Captions className="w-3.5 h-3.5" />
                  <span>CC</span>
                </button>

                {/* Speed selector */}
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

                {/* Fullscreen Button */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer"
                  title={effectiveFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
                >
                  {effectiveFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
