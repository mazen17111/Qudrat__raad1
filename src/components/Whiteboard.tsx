import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Pen, RotateCcw, Trash2, Palette } from 'lucide-react';

interface WhiteboardProps {
  isDark?: boolean;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ isDark = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(3);
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);

  const colors = [
    '#ffffff', // White
    '#facc15', // Yellow
    '#38bdf8', // Sky Blue
    '#4ade80', // Green
    '#f87171', // Red
    '#c084fc', // Purple
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Adjust canvas resolution for retina displays
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    // Initial background
    ctx.fillStyle = isDark ? '#0f172a' : '#1e293b';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Save initial state
    saveState();

    const handleResize = () => {
      // Keep canvas drawing responsive
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-15), imageData]);
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;

    if (isEraser) {
      ctx.strokeStyle = isDark ? '#0f172a' : '#1e293b';
      ctx.lineWidth = lineWidth * 4;
    } else {
      ctx.strokeStyle = color;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveState();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = isDark ? '#0f172a' : '#1e293b';
    ctx.fillRect(0, 0, rect.width, rect.height);
    saveState();
  };

  const undo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = [...history];
    newHistory.pop(); // remove current
    const previousState = newHistory[newHistory.length - 1];
    if (previousState) {
      ctx.putImageData(previousState, 0, 0);
      setHistory(newHistory);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/90 rounded-2xl border border-slate-700/60 overflow-hidden shadow-2xl">
      {/* Whiteboard Toolbar */}
      <div className="p-2.5 bg-slate-800/90 border-b border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-200">
          <Palette className="w-4 h-4 text-amber-400" />
          <span>سبورة الحل والمسودات الذكية</span>
        </div>

        {/* Tools and colors */}
        <div className="flex items-center gap-2">
          {/* Colors */}
          <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-lg border border-slate-700/40">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  setIsEraser(false);
                }}
                className={`w-5 h-5 rounded-full border transition-transform ${
                  color === c && !isEraser
                    ? 'scale-125 border-white ring-2 ring-white/50'
                    : 'border-transparent opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
                title={`لون: ${c}`}
              />
            ))}
          </div>

          {/* Pen / Eraser toggles */}
          <button
            type="button"
            onClick={() => setIsEraser(false)}
            className={`p-1.5 rounded-lg border transition ${
              !isEraser
                ? 'bg-blue-600 text-white border-blue-400 shadow-sm'
                : 'bg-slate-700/60 text-slate-300 border-slate-600/40 hover:bg-slate-700'
            }`}
            title="قلم للكتابة"
          >
            <Pen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsEraser(true)}
            className={`p-1.5 rounded-lg border transition ${
              isEraser
                ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                : 'bg-slate-700/60 text-slate-300 border-slate-600/40 hover:bg-slate-700'
            }`}
            title="ممحاة"
          >
            <Eraser className="w-4 h-4" />
          </button>

          {/* Line width */}
          <div className="flex items-center gap-1 text-slate-300 px-1">
            <span className="text-[10px] text-slate-400">السمك:</span>
            <input
              type="range"
              min="1"
              max="12"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-16 accent-blue-500 cursor-pointer"
            />
          </div>

          {/* Undo */}
          <button
            type="button"
            onClick={undo}
            className="p-1.5 rounded-lg bg-slate-700/60 text-slate-300 border border-slate-600/40 hover:bg-slate-700 transition"
            title="تراجع"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Clear */}
          <button
            type="button"
            onClick={clearCanvas}
            className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition"
            title="مسح السبورة بالكامل"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Drawing Canvas */}
      <div className="flex-1 relative cursor-crosshair touch-none w-full min-h-[350px]">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
};
