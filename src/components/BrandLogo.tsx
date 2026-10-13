import React from 'react';

interface LogoProps {
  customLogoUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  primaryColor?: string;
}

export const BrandLogo: React.FC<LogoProps> = ({
  customLogoUrl,
  size = 'md',
  className = '',
  primaryColor = '#2563eb',
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-xl',
    md: 'w-10 h-10 rounded-2xl',
    lg: 'w-14 h-14 rounded-2xl',
    xl: 'w-20 h-20 rounded-3xl',
  }[size];

  if (customLogoUrl && customLogoUrl.trim()) {
    return (
      <div
        className={`${sizeClasses} overflow-hidden shadow-lg border border-slate-700/40 bg-slate-900/40 flex items-center justify-center shrink-0 ${className}`}
      >
        <img
          src={customLogoUrl}
          alt="شعار منصة أقسام رعد"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Modern high-fidelity vector emblem for "منصة أقسام رعد"
  return (
    <div
      className={`${sizeClasses} relative flex items-center justify-center text-white shadow-xl overflow-hidden shrink-0 group transition-transform duration-300 ${className}`}
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, #1e1b4b 100%)`,
      }}
    >
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-amber-400/20 via-transparent to-white/20 pointer-events-none" />

      {/* SVG Lightning Bolt & Thunder Emblem */}
      <svg
        viewBox="0 0 100 100"
        className="w-3/4 h-3/4 drop-shadow-[0_2px_8px_rgba(245,158,11,0.6)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="40%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="glowRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>

        {/* Outer subtle geometric shield/hex */}
        <polygon
          points="50,6 88,24 88,68 50,92 12,68 12,24"
          stroke="url(#glowRing)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.5"
        />

        {/* Inner dynamic lightning bolt (رعد) */}
        <path
          d="M54 14 L26 52 H48 L42 86 L74 44 H52 L58 14 Z"
          fill="url(#boltGrad)"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Sparkle dot */}
        <circle cx="70" cy="24" r="3" fill="#ffffff" opacity="0.9" />
        <circle cx="28" cy="72" r="2" fill="#38bdf8" opacity="0.8" />
      </svg>
    </div>
  );
};
