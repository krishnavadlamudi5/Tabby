import React from 'react';
import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon
}: EmptyStateProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center p-8 text-center min-h-[300px] bg-white rounded-2xl border border-[#E6E1DA] shadow-sm"
    >
      <div className="w-16 h-16 rounded-full bg-[#EBF1ED] flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-[#3C5A48]" />
      </div>
      <h3 className="text-lg font-bold text-[#2C2B29] mb-2">{title}</h3>
      <p className="text-[#736F6A] text-sm max-w-sm mb-6">{description}</p>
      
      {actionLabel && onAction && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onAction}
          className="px-5 py-2.5 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-semibold text-sm rounded-xl transition-colors shadow-xs flex items-center gap-2"
        >
          {ActionIcon && <ActionIcon className="w-4 h-4" />}
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
}
