import React from 'react';

/** Profile photo, or initials when there's no photo. */
export default function Avatar({ src, name, className = 'w-11 h-11' }: { src?: string; name: string; className?: string }) {
  if (src) return <img src={src} alt="" className={`${className} rounded-full object-cover border border-[#E6E1DA]`} referrerPolicy="no-referrer" />;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  return <div className={`${className} rounded-full bg-[#3C5A48] text-white font-extrabold flex items-center justify-center text-sm`} aria-hidden="true">{initials}</div>;
}
