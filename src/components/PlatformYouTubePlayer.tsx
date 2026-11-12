import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  X,
  AlertCircle,
  RefreshCw,
  Zap,
  Captions,
  Move,
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
    documentPictureInPicture?: {
      requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
      window?: Window | null;
    };
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

interface DocumentPipInnerProps {
  pipWindow: Window;
  videoId: string;
  title?: string;
  initialTime: number;
  initialPlaying: boolean;
  initialCaptions: boolean;
  onSyncBack: (timeSec: number, wasPlaying: boolean, captions: boolean) => void;
  onClose: () => void;
  onEnded?: () => void;
}

const DocumentPipInnerPlayer: React.FC<DocumentPipInnerProps> = ({
  pipWindow,
  videoId,
  title,
  initialTime,
  initialPlaying,
  initialCaptions,
  onSyncBack,
  onClose,
  onEnded,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(initialPlaying);
  const [isMuted, setIsMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(initialCaptions);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [duration, setDuration] = useState(0);
  const captionsRef = useRef(initialCaptions);
  captionsRef.current = captionsOn;
  const latestTimeRef = useRef(initialTime);
  const latestPlayingRef = useRef(initialPlaying);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeApiInWindow(pipWindow)
      .then((YT) => {
        if (cancelled || !mountRef.current) return;
        mountRef.current.innerHTML = '';
        const div = pipWindow.document.createElement('div');
        div.className = 'w-full h-full';
        mountRef.current.appendChild(div);

        const p = new YT.Player(div, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: initialPlaying ? 1 : 0,
            start: Math.floor(initialTime),
            controls: 0,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            disablekb: 1,
            playsinline: 1,
            enablejsapi: 1,
            cc_load_policy: initialCaptions ? 1 : 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (ev: any) => {
              if (cancelled) return;
              playerRef.current = ev.target;
              try {
                const iframe = ev.target.getIframe?.();
                if (iframe) {
                  iframe.style.width = '100%';
                  iframe.style.height = '100%';
                  iframe.style.pointerEvents = 'none';
                }
                if (initialTime > 0) {
                  ev.target.seekTo(initialTime, true);
                }
                if (initialPlaying) {
                  ev.target.playVideo();
                }
                const dur = Number(ev.target.getDuration?.() || 0);
                if (dur > 0) setDuration(dur);
                if (captionsRef.current) {
                  applyYouTubeCaptionsOption(ev.target, true);
                }
              } catch {}
            },
            onApiChange: (ev: any) => {
              if (!cancelled && captionsRef.current) {
                applyYouTubeCaptionsOption(ev.target, true);
              }
            },
            onStateChange: (ev: any) => {
              if (cancelled) return;
              if (ev.data === 1) {
                setIsPlaying(true);
                latestPlayingRef.current = true;
                try {
                  const dur = Number(ev.target.getDuration?.() || 0);
                  if (dur > 0) setDuration(dur);
                } catch {}
              } else if (ev.data === 2) {
                setIsPlaying(false);
                latestPlayingRef.current = false;
              } else if (ev.data === 0) {
                setIsPlaying(false);
                latestPlayingRef.current = false;
                if (onEnded) onEnded();
              }
            },
          },
        });
        playerRef.current = p;
      })
      .catch(() => {});

    const poll = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const cur = Number(p.getCurrentTime?.() || 0);
        const dur = Number(p.getDuration?.() || 0);
        if (!isNaN(cur)) {
          setCurrentTime(cur);
          latestTimeRef.current = cur;
        }
        if (dur > 0 && !isNaN(dur)) setDuration(dur);
      } catch {}
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      onSyncBack(latestTimeRef.current, latestPlayingRef.current, captionsRef.current);
      try {
        playerRef.current?.destroy?.();
      } catch {}
    };
  }, [pipWindow, videoId]);

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      className="w-screen h-screen bg-black flex flex-col overflow-hidden select-none text-white"
      dir="rtl"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border-b border-blue-500/30 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-black truncate">{title || 'منصة أقسام رعد ⚡'}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black cursor-pointer shrink-0"
        >
          <Maximize2 className="w-3 h-3" />
          <span>عودة للمنصة</span>
        </button>
      </div>

      {/* Video Surface */}
      <div className="relative flex-1 bg-black overflow-hidden">
        <div ref={mountRef} className="w-full h-full pointer-events-none" />
        <div
          onClick={() => {
            const p = playerRef.current;
            if (!p) return;
            if (isPlaying) p.pauseVideo?.();
            else p.playVideo?.();
          }}
          className="absolute inset-0 z-10 cursor-pointer"
        />

        {!isPlaying && (
          <div
            onClick={() => playerRef.current?.playVideo?.()}
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/85 cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg">
              <Play className="w-6 h-6 fill-current -mr-0.5" />
            </div>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/90 to-transparent pt-4 pb-2 px-3">
          <div className="relative w-full h-3 flex items-center mb-1" dir="ltr">
            <div className="w-full h-1 rounded-full bg-white/25 overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${progressPct}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={Math.min(currentTime, duration || 100)}
              onChange={(e) => {
                const sec = Number(e.target.value);
                playerRef.current?.seekTo?.(sec, true);
                setCurrentTime(sec);
                latestTimeRef.current = sec;
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => (isPlaying ? playerRef.current?.pauseVideo?.() : playerRef.current?.playVideo?.())}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              </button>
              <span className="text-[10px] font-mono text-slate-200" dir="ltr">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = !captionsOn;
                  setCaptionsOn(next);
                  applyYouTubeCaptionsOption(playerRef.current, next);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer border ${
                  captionsOn
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                    : 'bg-white/10 text-slate-200 border-white/15'
                }`}
                title={captionsOn ? 'إيقاف الكابشن' : 'تشغيل الكابشن'}
              >
                <Captions className="w-3 h-3" />
                <span>CC</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = playerRef.current;
                  if (!p) return;
                  if (isMuted) {
                    p.unMute?.();
                    setIsMuted(false);
                  } else {
                    p.mute?.();
                    setIsMuted(true);
                  }
                }}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PlatformYouTubePlayerProps {
  videoId: string;
  title?: string;
  onEnded?: () => void;
  watermarkContent?: React.ReactNode;
  pipTrigger?: number;
  pipActionRef?: React.MutableRefObject<(() => void) | null>;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export const PlatformYouTubePlayer: React.FC<PlatformYouTubePlayerProps> = ({
  videoId,
  title,
  onEnded,
  watermarkContent,
  pipTrigger = 0,
  pipActionRef,
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
  const [isFloatingPiP, setIsFloatingPiP] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Draggable position for Floating PiP window
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  // Draggable position for the movable PiP + CC quick pill ("اجعل زر ال pip متحرك")
  const [quickPipPos, setQuickPipPos] = useState<{ left: number; top: number } | null>(null);
  const quickPipDragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  }>({ active: false, moved: false, startX: 0, startY: 0, originLeft: 0, originTop: 0 });
  const suppressNextQuickPipClickRef = useRef(false);

  // True Always-On-Top OS Document PiP state (persists even when browsing OTHER websites/tabs!)
  const [docPipWindow, setDocPipWindow] = useState<Window | null>(null);
  const [docPipMountNode, setDocPipMountNode] = useState<HTMLElement | null>(null);
  const docPipSnapshotRef = useRef<{ time: number; playing: boolean }>({ time: 0, playing: false });
  const [pipFallbackReason, setPipFallbackReason] = useState<'iframe' | 'unsupported' | null>(null);

  const hideControlsTimerRef = useRef<number | null>(null);
  const initialMaskTimerRef = useRef<number | null>(null);

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

  // Open True Always-On-Top Document PiP (works across OTHER websites/tabs) with graceful fallback to draggable floating PiP
  const handleTogglePiPMode = useCallback(async () => {
    // 1. If OS Document PiP is currently open, close it and return to inline player
    if (docPipWindow) {
      try {
        docPipWindow.close();
      } catch {}
      setDocPipWindow(null);
      setDocPipMountNode(null);
      return;
    }

    // 2. If in-page floating PiP is open, restore to inline
    if (isFloatingPiP) {
      setIsFloatingPiP(false);
      setPipFallbackReason(null);
      return;
    }

    // 3. Attempt True OS-level Document Picture-in-Picture (persists even on OTHER websites & tabs!)
    const docPipApi = typeof window !== 'undefined' ? window.documentPictureInPicture : undefined;
    const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

    if (docPipApi && typeof docPipApi.requestWindow === 'function') {
      try {
        const snapTime = currentTime;
        const snapPlaying = isPlaying;
        docPipSnapshotRef.current = { time: snapTime, playing: snapPlaying };

        // Pause main player cleanly before launching Document PiP
        try {
          playerInstanceRef.current?.pauseVideo?.();
        } catch {}

        const pipWin = await docPipApi.requestWindow({ width: 460, height: 285 });

        // Ensure relative CSS/asset URLs resolve cleanly inside the Document PiP window
        pipWin.document.documentElement.dir = 'rtl';
        pipWin.document.documentElement.lang = 'ar';
        pipWin.document.title = title ? `${title} - أقسام رعد` : 'أقسام رعد ⚡';

        const baseEl = pipWin.document.createElement('base');
        baseEl.href = window.location.href;
        pipWin.document.head.appendChild(baseEl);

        Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).forEach((el) => {
          try {
            const cloned = el.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
            if (el instanceof HTMLLinkElement && el.href && cloned instanceof HTMLLinkElement) {
              cloned.href = el.href;
            }
            pipWin.document.head.appendChild(cloned);
          } catch {}
        });

        const rootDiv = pipWin.document.createElement('div');
        rootDiv.className = 'w-screen h-screen bg-black overflow-hidden';
        pipWin.document.body.className = 'm-0 p-0 bg-black overflow-hidden';
        pipWin.document.body.appendChild(rootDiv);

        pipWin.addEventListener('pagehide', () => {
          setDocPipWindow(null);
          setDocPipMountNode(null);
        });

        setPipFallbackReason(null);
        setDocPipWindow(pipWin);
        setDocPipMountNode(rootDiv);
        return;
      } catch (err) {
        console.warn('Document PiP unavailable, falling back to in-page draggable PiP:', err);
      }
    }

    // 4. Graceful fallback: Draggable Floating PiP window + clear reason if iframe/browser restricted OS PiP
    setPipFallbackReason(isInsideIframe ? 'iframe' : 'unsupported');
    setIsFloatingPiP(true);
  }, [docPipWindow, isFloatingPiP, currentTime, isPlaying, title]);

  // Expose synchronous handler so external click buttons preserve browser user activation!
  if (pipActionRef) {
    pipActionRef.current = handleTogglePiPMode;
  }

  // Register MediaSession Auto-PiP on tab switch in supporting browsers
  useEffect(() => {
    try {
      const ms = (navigator as any).mediaSession;
      if (ms && typeof ms.setActionHandler === 'function') {
        ms.setActionHandler('enterpictureinpicture', () => {
          if (!docPipWindow) {
            handleTogglePiPMode();
          }
        });
        return () => {
          try {
            ms.setActionHandler('enterpictureinpicture', null);
          } catch {}
        };
      }
    } catch {}
  }, [docPipWindow, handleTogglePiPMode]);

  // Respond to external PiP trigger prop if used
  const lastPipTriggerRef = useRef(pipTrigger);
  useEffect(() => {
    if (pipTrigger !== lastPipTriggerRef.current) {
      lastPipTriggerRef.current = pipTrigger;
      handleTogglePiPMode();
    }
  }, [pipTrigger, handleTogglePiPMode]);

  // Dragging handlers for Floating PiP window & Movable Quick PiP button
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (quickPipDragRef.current.active && wrapperRef.current) {
        const dx = e.clientX - quickPipDragRef.current.startX;
        const dy = e.clientY - quickPipDragRef.current.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          quickPipDragRef.current.moved = true;
        }
        if (quickPipDragRef.current.moved) {
          const rect = wrapperRef.current.getBoundingClientRect();
          const nextLeft = Math.max(8, Math.min(Math.max(8, rect.width - 140), quickPipDragRef.current.originLeft + dx));
          const nextTop = Math.max(8, Math.min(Math.max(8, rect.height - 48), quickPipDragRef.current.originTop + dy));
          setQuickPipPos({ left: nextLeft, top: nextTop });
        }
      }

      if (!dragStateRef.current.dragging) return;
      const dx = e.clientX - dragStateRef.current.startX;
      const dy = e.clientY - dragStateRef.current.startY;
      const maxX = Math.max(12, window.innerWidth - 360);
      const maxY = Math.max(12, window.innerHeight - 240);
      const nextX = Math.max(8, Math.min(maxX, dragStateRef.current.originX + dx));
      const nextY = Math.max(8, Math.min(maxY, dragStateRef.current.originY + dy));
      setFloatingPos({ x: nextX, y: nextY });
    };
    const onPointerUp = () => {
      if (quickPipDragRef.current.active && quickPipDragRef.current.moved) {
        suppressNextQuickPipClickRef.current = true;
        window.setTimeout(() => {
          suppressNextQuickPipClickRef.current = false;
        }, 60);
      }
      quickPipDragRef.current.active = false;
      quickPipDragRef.current.moved = false;
      dragStateRef.current.dragging = false;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const startDraggingQuickPipBtn = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wrapperRef.current || isFloatingPiP) return;
    const containerRect = wrapperRef.current.getBoundingClientRect();
    const targetRect = e.currentTarget.getBoundingClientRect();
    quickPipDragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: targetRect.left - containerRect.left,
      originTop: targetRect.top - containerRect.top,
    };
  };

  const startDraggingPiP = (e: React.PointerEvent) => {
    if (!isFloatingPiP || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
    };
  };

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

  // Track fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === wrapperRef.current));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Clean up OS Document PiP if unmounted or videoId changes
  useEffect(() => {
    return () => {
      if (docPipWindow) {
        try {
          docPipWindow.close();
        } catch {}
      }
    };
  }, [docPipWindow, videoId]);

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
                }
                const dur = Number(ev.target.getDuration?.() || 0);
                if (dur > 0) setDuration(dur);
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
    if (!p || !isReady) return;
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
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (wrapperRef.current?.requestFullscreen) {
        if (isFloatingPiP) setIsFloatingPiP(false);
        await wrapperRef.current.requestFullscreen();
      }
      scheduleHideControls();
    } catch {}
  }, [isFloatingPiP, scheduleHideControls]);

  // Keyboard shortcuts (Space, Left/Right Arrows, M, F, C for Captions)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      if (!isReady || docPipWindow) return;

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
  }, [isReady, docPipWindow, currentTime, togglePlay, seekToSeconds, toggleMute, toggleFullscreen, handleToggleCaptions]);

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const isAnyPipActive = Boolean(docPipWindow) || isFloatingPiP;

  return (
    <>
      {/* Portal for OS-level Document PiP Window (stays visible across OTHER websites & tabs!) */}
      {docPipWindow &&
        docPipMountNode &&
        createPortal(
          <DocumentPipInnerPlayer
            pipWindow={docPipWindow}
            videoId={videoId}
            title={title}
            initialTime={docPipSnapshotRef.current.time}
            initialPlaying={docPipSnapshotRef.current.playing}
            initialCaptions={captionsEnabled}
            onEnded={onEnded}
            onSyncBack={(t, wasPlaying, caps) => {
              setCaptionsEnabled(caps);
              captionsEnabledRef.current = caps;
              try {
                if (playerInstanceRef.current) {
                  playerInstanceRef.current.seekTo?.(t, true);
                  setCurrentTime(t);
                  if (wasPlaying) playerInstanceRef.current.playVideo?.();
                }
              } catch {}
            }}
            onClose={() => {
              try {
                docPipWindow.close();
              } catch {}
              setDocPipWindow(null);
              setDocPipMountNode(null);
            }}
          />,
          docPipMountNode
        )}

      {/* Inline Placeholder when popped into Floating PiP OR OS Document PiP mode */}
      {isAnyPipActive && (
        <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-3 border border-blue-500/30">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
            <PictureInPicture2 className="w-6 h-6 text-blue-400 animate-pulse" />
          </div>
          <div>
            <p className="text-white font-black text-sm">
              {docPipWindow
                ? 'الفيديو يعمل في نافذة عائمة فوق جميع المواقع (PiP) ⚡'
                : 'الفيديو يعمل في النافذة العائمة المتحركة (PiP) ⚡'}
            </p>
            <p className="text-slate-400 text-xs mt-1">
              {docPipWindow
                ? 'يمكنك فتح أي موقع آخر أو التنقل في المنصة وسيبقى الفيديو ظاهراً أمامك'
                : 'اسحب النافذة العائمة لأي مكان في الشاشة وتصفح المنصة بحرية'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleTogglePiPMode}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition cursor-pointer shadow-lg"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>إعادة الفيديو للحجم الطبيعي</span>
          </button>
        </div>
      )}

      {/* Main Custom Platform Player Container */}
      <div
        ref={wrapperRef}
        onMouseMove={scheduleHideControls}
        onMouseLeave={() => {
          if (isPlaying) {
            setControlsVisible(false);
            setShowSpeedMenu(false);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={
          isFloatingPiP && floatingPos
            ? { left: `${floatingPos.x}px`, top: `${floatingPos.y}px`, right: 'auto', bottom: 'auto' }
            : undefined
        }
        className={
          docPipWindow
            ? 'hidden'
            : isFloatingPiP
            ? 'fixed bottom-5 left-5 z-[9999] w-80 sm:w-96 rounded-2xl overflow-hidden shadow-2xl border-2 border-blue-500/80 bg-slate-950 flex flex-col select-none'
            : 'relative w-full h-full bg-black overflow-hidden select-none group'
        }
        dir="rtl"
      >
        {/* Draggable Floating PiP Header Bar */}
        {isFloatingPiP && (
          <div className="flex flex-col border-b border-blue-500/30">
            <div
              onPointerDown={startDraggingPiP}
              className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white cursor-grab active:cursor-grabbing touch-none"
              title="اسحب لتحريك النافذة العائمة في أي مكان"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Move className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[11px] font-black truncate">{title || 'مشغل منصة أقسام رعد'}</span>
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
                      playerInstanceRef.current?.pauseVideo?.();
                    } catch {}
                    setIsFloatingPiP(false);
                  }}
                  className="p-1 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white transition cursor-pointer"
                  title="إغلاق النافذة العائمة"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {pipFallbackReason === 'iframe' && (
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[10px] font-bold text-center border-t border-amber-500/25 transition block"
              >
                لظهور النافذة فوق كل المواقع الأخرى: افتح المنصة في تبويب مستقل ↗
              </a>
            )}
          </div>
        )}

        {/* Video Frame Container */}
        <div className={isFloatingPiP ? 'relative aspect-video w-full bg-black overflow-hidden' : 'relative w-full h-full bg-black overflow-hidden'}>
          <div
            ref={playerMountRef}
            className="w-full h-full pointer-events-none select-none"
          />

          {/* Platform Watermark */}
          {!isFloatingPiP && watermarkContent}

          {/* Movable Animated Quick PiP + CC Pill */}
          {!isFloatingPiP && !hasError && (
            <div
              onPointerDown={startDraggingQuickPipBtn}
              onClick={(e) => e.stopPropagation()}
              style={
                quickPipPos
                  ? { left: `${quickPipPos.left}px`, top: `${quickPipPos.top}px`, right: 'auto' }
                  : undefined
              }
              className={`absolute ${quickPipPos ? '' : 'top-3 right-3'} z-30 flex items-center gap-1 p-1 rounded-2xl bg-black/75 backdrop-blur-md border border-white/20 shadow-xl cursor-grab active:cursor-grabbing touch-none select-none`}
              title="اسحب لتحريك أزرار PiP و CC في أي مكان على الشاشة"
            >
              <span className="px-1 text-slate-400" aria-hidden="true">
                <Move className="w-3 h-3" />
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCaptions();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={`flex items-center gap-1 px-2 py-1 rounded-xl border text-[11px] font-black transition cursor-pointer ${
                  captionsEnabled
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow shadow-emerald-500/30'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                }`}
                title={captionsEnabled ? 'إلغاء الكابشن / الترجمة (C)' : 'تشغيل الكابشن / الترجمة (C)'}
              >
                <Captions className="w-3.5 h-3.5" />
                <span>CC</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (suppressNextQuickPipClickRef.current) {
                    suppressNextQuickPipClickRef.current = false;
                    return;
                  }
                  handleTogglePiPMode();
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[11px] font-black transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                  isAnyPipActive
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/30'
                    : 'bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border-amber-400/50 animate-pulse'
                }`}
                title="تشغيل الفيديو في نافذة عائمة تبقى معك حتى عند فتح أي موقع آخر (PiP) — اسحب لتحريك الزر"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
                <span>PiP</span>
              </button>
            </div>
          )}

          {/* Top Mask during first ~4.5s of playback to cover any initial video title */}
          {isPlaying && maskInitialTitle && (
            <div className="pointer-events-none absolute top-0 inset-x-0 h-16 z-10 bg-gradient-to-b from-black via-black/85 to-transparent flex items-start justify-end px-4 pt-3">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/90 border border-white/15 text-white text-[11px] font-black shadow-lg">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="truncate max-w-[220px] sm:max-w-md">{title || 'منصة أقسام رعد التعليمية'}</span>
              </div>
            </div>
          )}

          {/* Full Transparent Click & Context Shield */}
          <div
            onClick={togglePlay}
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
                    {isEnded ? 'انتهى الدرس — اضغط لإعادة المشاهدة' : hasStartedOnce ? 'تم إيقاف الفيديو مؤقتاً — اضغط للمتابعة' : 'اضغط لبدء تشغيل الفيديو بجودة عالية'}
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
          {isPlaying && !controlsVisible && !isFloatingPiP && !hasError && (
            <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/80 border border-white/10 text-[10px] font-black text-amber-300 shadow">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>أقسام رعد</span>
            </div>
          )}

          {/* Custom Platform Control Bar */}
          {!hasError && (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/92 to-transparent pt-6 pb-2.5 px-3 sm:px-4 transition-opacity duration-200 ${
                controlsVisible || !isPlaying || isFloatingPiP ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              {/* Seek Slider */}
              <div className="relative w-full h-4 flex items-center group/seek mb-1.5" dir="ltr">
                <div className="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-100"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.5}
                  value={Math.min(currentTime, duration || 100)}
                  onChange={(e) => seekToSeconds(Number(e.target.value))}
                  aria-label="شريط تقديم الفيديو"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              {/* Control Buttons Row */}
              <div className="flex items-center justify-between gap-2 text-white">
                {/* Right side (RTL): Play, Skip ±10s, Time, Brand Badge */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-1.5 sm:p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer shadow"
                    title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />}
                  </button>

                  {!isFloatingPiP && (
                    <>
                      <button
                        type="button"
                        onClick={() => seekToSeconds(currentTime - 10)}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer"
                        title="ترجيع 10 ثواني"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => seekToSeconds(currentTime + 10)}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer"
                        title="تقديم 10 ثواني"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-200 px-1" dir="ltr">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>

                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900/90 border border-white/15 text-[10px] font-black text-amber-300">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>أقسام رعد</span>
                  </span>
                </div>

                {/* Left side (RTL): Volume, CC Captions, Speed, Animated PiP, Fullscreen */}
                <div className="flex items-center gap-1 sm:gap-1.5 relative">
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
                    title={captionsEnabled ? 'إلغاء الكابشن / الترجمة (C)' : 'تشغيل الكابشن / الترجمة (C)'}
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

                  {/* Animated Picture-in-Picture (PiP) Button (OS-level across sites when supported + draggable fallback) */}
                  <button
                    type="button"
                    onClick={handleTogglePiPMode}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg border text-[10px] sm:text-[11px] font-black transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                      isAnyPipActive
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/30'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-400/40 animate-pulse'
                    }`}
                    title={
                      isAnyPipActive
                        ? 'إعادة الفيديو للوضع الطبيعي'
                        : 'تشغيل في نافذة عائمة تبقى معك حتى عند فتح أي موقع آخر (PiP)'
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
                      title={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
                    >
                      {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
