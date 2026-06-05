"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, History, Camera, Award, ShieldCheck, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { getAllEntities, TABLES } from "@/lib/azureDb";

interface AuditLog {
  id: string;
  status: string;
  created_at: string;
  processed_at?: string;
  approved_by?: string;
  profiles?: any;
  tasks?: any;
  flashcards?: any;
}

export function AuditLogOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isShowingHistory, setIsShowingHistory] = useState(false);
  const [logLimit, setLogLimit] = useState(20);

  useEffect(() => {
    if (!isOpen) return;
    setIsShowingHistory(false);
    setLogLimit(20);
    fetchLogs('today');
  }, [isOpen]);

  const fetchLogs = async (mode: 'today' | 'history', limit = 20) => {
    setIsLoading(true);
    try {
      const [allSubs, allProfiles, allTasks, allCards] = await Promise.all([
        getAllEntities(TABLES.SUBMISSIONS),
        getAllEntities(TABLES.PROFILES),
        getAllEntities(TABLES.TASKS),
        getAllEntities(TABLES.FLASHCARDS)
      ]);

      const subWithDetails = (allSubs || [])
        .filter((s: any) => s.status !== 'under-review')
        .map((sub: any) => {
          const profile = (allProfiles || []).find((p: any) => (p.rowKey || p.RowKey || p.id) === sub.user_id);
          const task = (allTasks || []).find((t: any) => (t.rowKey || t.RowKey || t.id) === sub.task_id);
          const card = (allCards || []).find((c: any) => (c.rowKey || c.RowKey || c.id) === sub.flashcard_id);
          return { 
            ...sub, 
            id: sub.rowKey || sub.RowKey || sub.id,
            profiles: profile, 
            tasks: task, 
            flashcards: card 
          } as AuditLog;
        })
        .sort((a: AuditLog, b: AuditLog) => new Date(b.processed_at || b.created_at).getTime() - new Date(a.processed_at || a.created_at).getTime());

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      if (mode === 'today') {
        setLogs(subWithDetails.filter((l: AuditLog) => new Date(l.processed_at || l.created_at) >= startOfToday));
      } else {
        const historyLogs = subWithDetails.filter((l: AuditLog) => new Date(l.processed_at || l.created_at) < startOfToday);
        setLogs(prev => {
          const todayLogs = prev.filter((l: AuditLog) => new Date(l.processed_at || l.created_at) >= startOfToday);
          return [...todayLogs, ...historyLogs.slice(0, limit)];
        });
      }
    } catch (e) {
      console.error("Fetch Error:", e);
    }
    setIsLoading(false);
  };

  const handleLoadMore = () => {
    if (!isShowingHistory) {
      setIsShowingHistory(true);
      fetchLogs('history', 20);
    } else {
      const newLimit = logLimit + 20;
      setLogLimit(newLimit);
      fetchLogs('history', newLimit);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(83, 55, 43, 0.4)', backdropFilter: 'blur(12px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}
          onClick={onClose}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', width: '100%', maxWidth: '1000px', maxHeight: '85vh', borderRadius: '40px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 50px 120px rgba(0,0,0,0.4)', border: '1px solid rgba(83, 55, 43, 0.1)' }}
          >
            {/* Header */}
            <div style={{ padding: '40px', background: '#fcfaf5', borderBottom: '1px solid rgba(83, 55, 43, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#9f4022', marginBottom: '6px' }}>
                      <ShieldCheck size={16} />
                      <span style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.25em' }}>System Integrity</span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '32px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: 'bold' }}>Global Audit Logs</h3>
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => fetchLogs('today')}
                      disabled={isLoading}
                      style={{ background: 'rgba(159, 64, 34, 0.05)', border: '1px solid rgba(159, 64, 34, 0.1)', color: '#9f4022', padding: '12px 24px', borderRadius: '16px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Clock size={14} className={isLoading ? "animate-spin" : ""} />
                      {isLoading ? "Syncing..." : "Sync Database"}
                    </motion.button>
                    <button 
                      onClick={onClose}
                      style={{ background: 'white', border: '1px solid rgba(83, 55, 43, 0.1)', width: '56px', height: '56px', borderRadius: '20px', cursor: 'pointer', color: '#53372b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={24} />
                    </button>
                </div>
            </div>

            {/* Content Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px' }}>
                {isLoading ? (
                    <div style={{ padding: '100px', textAlign: 'center' }}>
                         <div className="animate-spin text-3xl mb-4">ΓÜÖ∩╕Å</div>
                         <p style={{ color: 'rgba(83, 55, 43, 0.4)', fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase' }}>Synchronizing control logs...</p>
                    </div>
                ) : (
                    <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10 }}>
                            <tr>
                                <th style={{ padding: '24px 12px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(83, 55, 43, 0.3)', borderBottom: '1px solid #f0f0f0' }}>Client</th>
                                <th style={{ padding: '24px 12px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(83, 55, 43, 0.3)', borderBottom: '1px solid #f0f0f0' }}>Activity</th>
                                <th style={{ padding: '24px 12px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(83, 55, 43, 0.3)', borderBottom: '1px solid #f0f0f0' }}>Status</th>
                                <th style={{ padding: '24px 12px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: 'rgba(83, 55, 43, 0.3)', borderBottom: '1px solid #f0f0f0' }}>Authorized By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id} style={{ borderBottom: '1px solid #fcfaf5' }}>
                                    <td style={{ padding: '20px 12px' }}>
                                        <div style={{ fontWeight: 'bold', color: '#53372b', fontSize: '14px' }}>{log.profiles?.name}</div>
                                        <div style={{ fontSize: '10px', color: 'rgba(83, 55, 43, 0.4)', fontWeight: 'bold', textTransform: 'uppercase' }}>{log.profiles?.team_name}</div>
                                    </td>
                                    <td style={{ padding: '20px 12px' }}>
                                        <div style={{ color: '#53372b', fontSize: '13px' }}>{log.tasks?.title || log.flashcards?.text || 'Standard Activity'}</div>
                                        <div style={{ fontSize: '10px', color: 'rgba(83, 55, 43, 0.3)', marginTop: '2px' }}>{new Date(log.processed_at || log.created_at).toLocaleString()}</div>
                                    </td>
                                    <td style={{ padding: '20px 12px' }}>
                                        <span style={{ 
                                            padding: '4px 10px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase',
                                            background: log.status === 'approved' ? 'rgba(111, 142, 124, 0.1)' : 'rgba(201, 157, 93, 0.1)',
                                            color: log.status === 'approved' ? '#6f8e7c' : '#c99d5d'
                                        }}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '20px 12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#9f4022' }}>
                                            {log.approved_by || (log.processed_at ? 'System Admin' : 'Legacy Entry')}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ padding: '32px 0' }}>
                        <button
                          onClick={handleLoadMore}
                          disabled={isLoading}
                          style={{ width: '100%', padding: '16px', background: 'transparent', border: '1px dashed #9f4022', color: '#9f4022', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}
                        >
                          {isLoading ? "Retrieving..." : isShowingHistory ? "Load More History Γåô" : "View Previous Days Γåô"}
                        </button>
                    </div>
                    </>
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: '32px 40px', background: '#fcfaf5', borderTop: '1px solid rgba(83, 55, 43, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(83, 55, 43, 0.3)' }}>
                    <Clock size={14} />
                    <span style={{ fontSize: '10px', fontWeight: 'bold' }}>Last sync: {new Date().toLocaleTimeString()}</span>
                </div>
                <p style={{ margin: 0, fontSize: '10px', color: 'rgba(83, 55, 43, 0.4)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fleet Personnel Logs ΓÇó Internal Use Only</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
