import React, { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';

interface BrandLogoProps {
  customLogoUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  primaryColor?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  customLogoUrl,
  size = 'md',
  primaryColor = '#059669',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [customLogoUrl]);

  const sizeMap = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-xl',
    '2xl': 'w-32 h-32 sm:w-44 sm:h-44 text-3xl',
    '3xl': 'w-36 h-36 sm:w-48 sm:h-48 text-4xl',
  };

  const iconSizeMap = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
    xl: 'w-10 h-10',
    '2xl': 'w-16 h-16 sm:w-20 sm:h-20',
    '3xl': 'w-20 h-20 sm:w-24 sm:h-24',
  };

  if (customLogoUrl && !imgFailed) {
    return (
      <div className={`rounded-2xl overflow-hidden shrink-0 shadow-md ${sizeMap[size]}`}>
        <img
          src={customLogoUrl}
          alt="شعار منصة أقسام رعد"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain"
          loading="eager"
          decoding="sync"
        />
      </div>
    );
  }

  return (
    <div
      data-preserve-colors="true"
      className={`rounded-2xl shrink-0 flex items-center justify-center text-white shadow-lg shadow-amber-500/10 font-black transition-transform transform hover:scale-105 ${sizeMap[size]}`}
      style={{
        background: `linear-gradient(135deg, ${primaryColor}, #f59e0b)`,
      }}
    >
      <Zap className={`${iconSizeMap[size]} fill-white stroke-white`} />
    </div>
  );
};
