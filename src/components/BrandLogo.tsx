import React from 'react';
import { Zap } from 'lucide-react';

interface BrandLogoProps {
  customLogoUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  primaryColor?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  customLogoUrl,
  size = 'md',
  primaryColor = '#059669',
}) => {
  const sizeMap = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-xl',
  };

  const iconSizeMap = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
    xl: 'w-10 h-10',
  };

  if (customLogoUrl) {
    return (
      <div className={`rounded-2xl overflow-hidden shrink-0 shadow-md ${sizeMap[size]}`}>
        <img
          src={customLogoUrl}
          alt="شعار المنصة"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl shrink-0 flex items-center justify-center text-white shadow-lg shadow-amber-500/10 font-black transition-transform transform hover:scale-105 ${sizeMap[size]}`}
      style={{
        background: `linear-gradient(135deg, ${primaryColor}, #f59e0b)`,
      }}
    >
      <Zap className={`${iconSizeMap[size]} fill-white stroke-white`} />
    </div>
  );
};
