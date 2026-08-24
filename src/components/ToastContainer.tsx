import React from 'react';
import { useToastStore } from '../store/useToastStore';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X, Bell } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none sm:top-6 sm:right-6">
      <AnimatePresence>
        {toasts.map((toast) => {
          let Icon = Info;
          let glowColor = 'from-blue-500/20 to-transparent';
          let iconColor = 'text-blue-500';
          let iconBg = 'bg-blue-500/10';
          let borderColor = 'border-blue-500/20';

          if (toast.type === 'success') {
            Icon = CheckCircle2;
            iconColor = 'text-emerald-500';
            iconBg = 'bg-emerald-500/10';
            glowColor = 'from-emerald-500/20 to-transparent';
            borderColor = 'border-emerald-500/20';
          } else if (toast.type === 'error') {
            Icon = AlertCircle;
            iconColor = 'text-rose-500';
            iconBg = 'bg-rose-500/10';
            glowColor = 'from-rose-500/20 to-transparent';
            borderColor = 'border-rose-500/20';
          } else if (toast.type === 'activity') {
            Icon = Bell;
            iconColor = 'text-indigo-500';
            iconBg = 'bg-indigo-500/10';
            glowColor = 'from-indigo-500/20 to-transparent';
            borderColor = 'border-indigo-500/20';
          }

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`pointer-events-auto flex items-center gap-3.5 p-3 sm:p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/60 bg-white/80 backdrop-blur-xl max-w-sm w-full relative overflow-hidden group`}
            >
              {/* Background Glow */}
              <div className={`absolute top-0 left-0 w-32 h-full bg-gradient-to-r ${glowColor} opacity-50 pointer-events-none`} />
              
              <div className={`p-2 rounded-xl ${iconBg} shrink-0 relative z-10 border ${borderColor} shadow-inner`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              
              <div className="flex-1 min-w-0 relative z-10">
                <p className="text-[13px] font-bold text-gray-800 leading-snug">
                  {toast.message}
                </p>
              </div>
              
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0 text-gray-400 hover:text-gray-700 relative z-10"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
