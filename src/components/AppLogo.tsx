import React from 'react';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export default function AppLogo({ size = 'md', showText = true, className = '' }: AppLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const titleSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-3xl',
  };

  return (
    <div className={`flex items-center gap-3 ${className}`} id="app-brand-logo">
      {/* Tabby app icon (public/icon.svg, source in assets/) */}
      <div className={`${sizeClasses[size]} relative flex-shrink-0 cursor-pointer`} id="app-logo-icon">
        <img src="/icon.svg" alt="" className="w-full h-full drop-shadow-xs transition-transform hover:scale-105 duration-200" draggable={false} />
      </div>

      {showText && (
        <div className="min-w-0">
          <span className={`font-black text-[#004D40] tracking-tight ${titleSizes[size]} block leading-none font-sans`}>
            Tabby
          </span>
          {size === 'md' && (
            <span className="text-[10px] font-extrabold text-[#00876C] tracking-widest uppercase block mt-1">
              Split Expenses
            </span>
          )}
        </div>
      )}
    </div>
  );
}
