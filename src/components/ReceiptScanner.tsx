import React, { useState, useRef } from 'react';
import { Camera, Upload, Loader2, Receipt, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { scanReceiptApi } from '../lib/api';

interface ParsedItem {
  name: string;
  price: number;
}

interface ReceiptScannerProps {
  onScanComplete: (items: ParsedItem[], total: number, tax: number) => void;
  onCancel: () => void;
}

export default function ReceiptScanner({ onScanComplete, onCancel }: ReceiptScannerProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (limit to 4MB for safety/speed)
    if (file.size > 4 * 1024 * 1024) {
      setError('Image is too large. Please upload an image under 4MB.');
      return;
    }

    setError(null);
    setIsAnalyzing(true);

    try {
      // Convert file to base64 inline string for the API
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // split off the data:image/jpeg;base64, prefix
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // The actual Gemini call now happens server-side (server/routes/receipt.ts)
      // so the API key never ships in the client bundle.
      const parsedData = await scanReceiptApi(file.type, base64Data);

      if (!parsedData.items || !Array.isArray(parsedData.items)) {
        throw new Error("Could not detect items clearly. Please try again with a clearer photo.");
      }

      onScanComplete(parsedData.items, parsedData.total || 0, parsedData.tax || 0);

    } catch (err: any) {
      console.error('Receipt scan error:', err);
      setError(err.message || 'Failed to parse the receipt. Please make sure the image is clear and try again.');
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-[#E6E1DA] shadow-sm max-w-sm w-full mx-auto relative overflow-hidden">
      
      {/* Hidden file input */}
      <input 
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <AnimatePresence mode="wait">
        {isAnalyzing ? (
          <motion.div 
            key="analyzing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center py-8"
          >
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-[#EBF1ED] animate-ping opacity-75"></div>
              <div className="w-16 h-16 bg-[#3C5A48] rounded-full flex items-center justify-center relative z-10">
                <Receipt className="w-8 h-8 text-white animate-pulse" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-[#2C2B29] mb-2">Analyzing Receipt...</h3>
            <p className="text-sm text-[#736F6A] text-center max-w-[250px]">
              Gemini AI is reading the items and crunching the numbers.
            </p>
          </motion.div>
        ) : (
          <motion.div 
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center w-full"
          >
            <div className="w-16 h-16 bg-[#EBF1ED] rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-[#3C5A48]" />
            </div>
            
            <h3 className="text-lg font-bold text-[#2C2B29] mb-2">AI Receipt Scanner</h3>
            <p className="text-sm text-[#736F6A] text-center mb-6">
              Take a photo of a receipt and let AI automatically extract the items and totals for you.
            </p>

            {error && (
              <div className="w-full p-3 mb-6 bg-[#FDF3F0] border border-[#C86D51]/40 rounded-xl text-xs text-[#C86D51] font-semibold flex items-start gap-2 shadow-2xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col w-full gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 bg-[#3C5A48] hover:bg-[#2E4738] text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                Scan Receipt
              </button>
              
              <button
                onClick={onCancel}
                className="w-full py-3 bg-transparent border border-[#E6E1DA] hover:bg-[#F8F5F2] text-[#736F6A] font-bold text-sm rounded-xl transition-all flex items-center justify-center"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
