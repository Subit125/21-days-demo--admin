"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Clock, User, Image as ImageIcon, Play, FileText } from "lucide-react";

interface ValidationCardProps {
  submission: {
    id: string;
    userName: string;
    teamName: string;
    taskName: string;
    time: string;
    mediaType: "image" | "video";
    mediaUrl: string;
    description?: string;
  };
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPartial: (id: string) => void;
}

export function ValidationCard({ submission, onApprove, onReject, onPartial }: ValidationCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, x: 100 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="premium-card overflow-hidden"
    >
      <div className="p-1.5 h-64 relative bg-hb-beige/20 border-b border-hb-brown/5 overflow-hidden">
        {submission.mediaType === "image" ? (
          <div className="w-full h-full bg-hb-beige/50 animate-pulse rounded-[18px]" /> // Placeholder
        ) : (
          <div className="w-full h-full bg-hb-dark-blue/10 flex items-center justify-center rounded-[18px]">
             <Play fill="white" className="text-white" size={48} />
          </div>
        )}
        <div className="absolute top-4 left-4 flex gap-2">
            <span className="px-3 py-1 bg-white/60 backdrop-blur-md rounded-full text-[10px] font-bold tracking-widest text-hb-brown/60 uppercase shadow-sm">
                {submission.mediaType}
            </span>
        </div>
      </div>

      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-serif font-semibold text-hb-brown">{submission.userName}</h3>
            <p className="text-xs text-hb-burnt-orange font-bold uppercase tracking-widest mt-1">
              {submission.teamName}
            </p>
          </div>
          <div className="text-right">
             <div className="flex items-center gap-1.5 text-hb-brown/40 text-[10px] font-medium uppercase tracking-wider">
               <Clock size={12} />
               {submission.time}
             </div>
          </div>
        </div>

        <div className="bg-hb-beige/30 p-4 rounded-2xl border border-white/50 mb-6">
           <h4 className="text-sm font-bold text-hb-brown/80 mb-1">{submission.taskName}</h4>
           <p className="text-xs text-hb-brown/60 italic leading-relaxed">
             {submission.description || "No description provided for this submission."}
           </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onReject(submission.id)}
              className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-full text-xs font-bold ring-1 ring-red-100 hover:bg-red-100 transition-colors"
            >
              <X size={14} /> REJECT
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onPartial(submission.id)}
              className="flex items-center justify-center gap-2 py-3 bg-hb-beige text-hb-terracotta rounded-full text-xs font-bold ring-1 ring-hb-beige hover:bg-hb-beige/80 transition-colors"
            >
              PARITAL
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onApprove(submission.id)}
              className="flex items-center justify-center gap-2 py-3 bg-hb-burnt-orange text-white rounded-full text-xs font-bold shadow-lg shadow-hb-burnt-orange/20"
            >
              <Check size={14} /> APPROVE
            </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
