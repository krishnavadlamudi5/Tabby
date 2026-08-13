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
      {/* Tabby Logo Icon - Pixel-Accurate Vector Recreation of the Official Tabby Logo */}
      <div className={`${sizeClasses[size]} relative flex-shrink-0 cursor-pointer`} id="app-logo-icon">
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full drop-shadow-xs transition-transform hover:scale-105 duration-200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Official Tabby Teal-to-Emerald Vibrant Gradient */}
            <linearGradient id="tabbyLogoGrad" x1="20" y1="20" x2="180" y2="180" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#00C4A7" />
              <stop offset="45%" stopColor="#00A88F" />
              <stop offset="100%" stopColor="#00796B" />
            </linearGradient>
          </defs>

          {/* 1. Main Capital 'T' Shape with Rounded Caps */}
          <path
            d="
              M 35,24 
              H 165 
              C 176,24 184,32 184,43 
              C 184,54 176,62 165,62 
              H 124 
              V 128 
              C 124,148 110,164 90,164 
              C 74,164 62,152 62,136 
              C 62,126 70,118 80,118 
              C 90,118 98,126 98,136 
              C 98,139 101,142 105,142 
              C 111,142 116,136 116,128 
              V 62 
              H 35 
              C 24,62 16,54 16,43 
              C 16,32 24,24 35,24 
              Z
            "
            fill="url(#tabbyLogoGrad)"
          />

          {/* 2. White Cat Silhouette inside the Stem of T */}
          {/* Cat Head facing right */}
          <path
            d="
              M 104,44 
              C 104,33 108,28 111,24 
              C 114,30 118,33 123,34 
              C 128,32 133,27 136,24 
              C 138,29 137,35 135,39 
              C 142,43 146,50 144,57 
              C 141,65 135,68 130,68 
              C 123,68 117,64 113,56 
              C 108,49 104,50 104,44 
              Z
            "
            fill="#FFFFFF"
          />

          {/* Cat Eye Detail (Teal Gradient Slit) */}
          <path
            d="M 126,42 C 129,42 131,44 130,47 C 128,46 126.5,44 126,42 Z"
            fill="url(#tabbyLogoGrad)"
          />

          {/* Cat Body sweeping vertically down the stem */}
          <path
            d="
              M 113,56 
              C 113,72 106,82 94,92 
              C 84,101 79,108 79,118 
              C 79,128 87,136 98,136 
              C 110,136 122,126 122,112 
              C 122,100 115,82 115,60 
              Z
            "
            fill="#FFFFFF"
          />

          {/* 3 White Curved Cat Stripe Cutouts on Left Side of T Stem */}
          <path
            d="M 85,80 C 93,76 102,77 108,80 C 101,85 91,86 81,85 Z"
            fill="url(#tabbyLogoGrad)"
          />
          <path
            d="M 79,93 C 88,88 98,89 104,93 C 97,98 86,99 75,98 Z"
            fill="url(#tabbyLogoGrad)"
          />
          <path
            d="M 76,107 C 84,103 93,103 100,107 C 93,111 83,112 73,111 Z"
            fill="url(#tabbyLogoGrad)"
          />

          {/* 4. Cat Tail Smooth Curve at the Bottom Hook */}
          <path
            d="
              M 98,136 
              C 114,136 128,124 128,106 
              C 128,100 134,97 138,101 
              C 142,106 141,118 132,128 
              C 122,139 108,144 92,143 
              C 86,143 92,136 98,136 
              Z
            "
            fill="url(#tabbyLogoGrad)"
          />
        </svg>
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
