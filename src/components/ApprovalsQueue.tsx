"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Clock, Rss } from "lucide-react";
import { useState, useEffect } from "react";
import { getAllEntities, TABLES, upsertEntity } from "@/lib/azureDb";

interface Submission {
  id: string;
  rowKey?: string;
  RowKey?: string;
  user_id: string;
  task_id?: string;
  flashcard_id?: string;
  status: string;
  file_url?: string;
  created_at: string;
  profiles?: any;
  tasks?: any;
  flashcards?: any;
  published_to_feed?: boolean;
}

export function ApprovalsQueue({ batchId }: { batchId?: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [processed, setProcessed] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryStates, setRetryStates] = useState<{ [id: string]: string }>({});
  const [totals, setTotals] = useState({ approved: 0, retry: 0, rejected: 0 });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetchSubmissions();
    const interval = setInterval(fetchSubmissions, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchSubmissions = async () => {
    try {
      const [allSubs, allProfiles, allTasks, allCards] = await Promise.all([
        getAllEntities(TABLES.SUBMISSIONS),
        getAllEntities(TABLES.PROFILES),
        getAllEntities(TABLES.TASKS),
        getAllEntities(TABLES.FLASHCARDS)
      ]);

      const flashData = allCards || [];
      const batches = flashData.filter((e: any) => e.partitionKey === "CONFIG_BATCH" || e.PartitionKey === "CONFIG_BATCH");

      const subWithDetails = (allSubs || [])
        .map((sub: any) => {
          const sId = sub.rowKey || sub.RowKey || sub.id;
          const profile = (allProfiles || []).find((p: any) => (p.rowKey || p.RowKey || p.id) === sub.user_id);
          
          // Only include if no batchId filter is set, OR if the profile matches the batchId
          if (batchId && profile?.batch_id !== batchId) return null;

          const task = (allTasks || []).find((t: any) => (t.rowKey || t.RowKey || t.id) === sub.task_id);
          const card = flashData.find((c: any) => (c.rowKey || c.RowKey || c.id) === sub.flashcard_id);
          const batch = batches.find((b: any) => (b.rowKey || b.RowKey || b.id) === profile?.batch_id);
          
          // DATE FILTER: Only show submissions from the CURRENT cycle of this batch
          const batchStart = batch?.start_date ? new Date(batch.start_date) : new Date(0);
          const subDate = new Date(sub.created_at || sub.Timestamp);
          if (batchId && subDate < batchStart) return null;

          return { 
            ...sub, 
            id: sId, 
            profiles: profile, 
            tasks: task, 
            flashcards: card,
            batch_name: batch?.name || 'Unknown Batch'
          };
        })
        .filter(Boolean);

      const approved = subWithDetails.filter((s: any) => s.status === 'approved').length;
      const retry = subWithDetails.filter((s: any) => s.status === 'retry').length;
      const rejected = subWithDetails.filter((s: any) => s.status === 'rejected').length;

      setTotals({ approved, retry, rejected });
      setSubmissions(subWithDetails.filter((s: any) => s.status === 'under-review'));
      setProcessed(subWithDetails.filter((s: any) => s.status !== 'under-review').sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 10));
      setIsLoading(false);
    } catch (err) {
      console.error('fetchSubmissions error:', err);
    }
  };

  const toCleanSub = (sub: Submission) => {
    const { profiles, tasks, flashcards, batch_name, id: _id, ...clean } = sub as any;
    return clean;
  };

  const handleToggleFeed = async (sub: Submission, publish: boolean) => {
    try {
      await upsertEntity(TABLES.SUBMISSIONS, {
        ...toCleanSub(sub),
        published_to_feed: publish,
        feed_published_at: publish ? new Date().toISOString() : null,
      });
      fetchSubmissions();
    } catch (e: any) {
      console.error('Feed Toggle Error:', e);
      alert(`Failed to update feed: ${e.message}`);
    }
  };

  const handleStatusUpdate = async (sub: Submission, status: 'approved' | 'retry', comment?: string) => {
    try {
        const subId = sub.rowKey || sub.RowKey || sub.id;
        const userId = sub.user_id;
        const pts = sub.tasks?.points || sub.flashcards?.points || 0;
        const adminEmail = 'Admin';

        const cleanSub = toCleanSub(sub);

        await upsertEntity(TABLES.SUBMISSIONS, { 
            ...cleanSub,
            status, 
            rejection_comment: comment || null,
            approved_by: adminEmail,
            processed_at: new Date().toISOString()
        });
        
        if (status === 'approved') {
            const allLedger = (await getAllEntities('PointLedger')) as any[] || [];
            const existingLedger = allLedger.find(l => l.source_id === subId.toString() && l.user_id === userId);

            if (!existingLedger) {
                await upsertEntity('PointLedger', {
                    partitionKey: 'Ledger',
                    rowKey: crypto.randomUUID(),
                    user_id: userId,
                    points: pts,
                    source_type: sub.tasks ? 'task' : 'flashcard',
                    source_id: subId.toString(),
                    reason: sub.tasks?.title || sub.flashcards?.text || 'Challenge Submission',
                    day: sub.tasks?.day || null,
                    week: sub.tasks?.week || sub.flashcards?.week || null
                });
            }
        }

        setRetryStates(prev => { const n = { ...prev }; delete n[subId]; return n; });
        fetchSubmissions();
    } catch (e: any) {
        console.error('Approval Error:', e);
        alert(`Approval Failed: ${e.message}`);
    }
  };

  const stats = {
    pending: submissions.length,
    passed: totals.approved,
    rejected: totals.rejected,
    resubmit: totals.retry,
  };

  const approvedProcessed = processed.filter((s: any) => s.status === 'approved');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="responsive-grid" style={{ marginBottom: '48px' }}>
         {[
           { label: 'Pending Review', value: stats.pending, color: '#53372b', bg: '#f5f2e9', icon: Clock },
           { label: 'Approved', value: stats.passed, color: '#6f8e7c', bg: 'rgba(111, 142, 124, 0.1)', icon: Check },
           { label: 'Resubmit', value: stats.resubmit, color: '#c99d5d', bg: 'rgba(201, 157, 93, 0.1)', icon: Clock },
           { label: 'Rejected', value: stats.rejected, color: '#d27440', bg: 'rgba(210, 116, 64, 0.1)', icon: X },
         ].map((stat, i) => (
           <motion.div key={i} className="premium-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '48px', minWidth: '48px', height: '48px', borderRadius: '12px', background: stat.bg, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><stat.icon size={20} /></div>
              <div><p style={{ margin: 0, fontSize: '10px', color: 'rgba(83, 55, 43, 0.4)', fontWeight: 'bold' }}>{stat.label}</p><p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{stat.value}</p></div>
           </motion.div>
         ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '80px' }}>
        <AnimatePresence mode="popLayout">
          {submissions.map((sub) => (
            <motion.div key={sub.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="premium-card">
                <div 
                  onClick={() => sub.file_url && !sub.file_url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) && setSelectedImage(sub.file_url)}
                  style={{ 
                    height: '240px', 
                    background: 'rgba(83, 55, 43, 0.05)', 
                    borderRadius: '12px', 
                    marginBottom: '24px', 
                    overflow: 'hidden', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    cursor: sub.file_url && !sub.file_url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) ? 'zoom-in' : 'default'
                  }}
                >
                   {sub.file_url ? (
                      sub.file_url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) || sub.tasks?.proof_type === 'video' ? (
                         <video src={sub.file_url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                         <img 
                           src={sub.file_url} 
                           alt="Proof" 
                           onError={(e) => { (e.target as any).src = 'https://via.placeholder.com/400x300?text=Error+Loading+Image'; }}
                           style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                         />
                      )
                   ) : (
                      <span style={{ opacity: 0.3, fontSize: '12px' }}>No media uploaded</span>
                   )}
               </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                 <div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                       <span style={{ fontSize: '9px', fontWeight: '900', color: '#9f4022', textTransform: 'uppercase', background: 'rgba(159, 64, 34, 0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                          {(sub as any).batch_name}
                       </span>
                       <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase' }}>
                          {sub.tasks?.title || sub.flashcards?.text || 'Submission'}
                       </span>
                    </div>
                    <h4 style={{ margin: '4px 0', fontSize: '18px', color: '#53372b', fontWeight: '900' }}>{sub.profiles?.name}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'rgba(83, 55, 43, 0.5)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                       {sub.profiles?.team_name || 'No Clan'}
                    </p>
                 </div>
                 <div style={{ fontSize: '10px', color: 'rgba(0,0,0,0.3)', fontWeight: 'bold' }}>{new Date(sub.created_at || (sub as any).Timestamp || Date.now()).toLocaleTimeString()}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {retryStates[sub.id] !== undefined ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea
                      autoFocus
                      placeholder="Enter instruction for client..."
                      value={retryStates[sub.id]}
                      onChange={(e) => setRetryStates(prev => ({ ...prev, [sub.id]: e.target.value }))}
                      style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(159, 64, 34, 0.2)', fontSize: '12px', resize: 'none', minHeight: '70px', fontFamily: 'inherit', color: '#53372b', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        onClick={() => setRetryStates(prev => { const n = { ...prev }; delete n[sub.id]; return n; })}
                        style={{ background: '#eee', border: 'none', padding: '8px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleStatusUpdate(sub, 'retry', retryStates[sub.id])}
                        disabled={!retryStates[sub.id]?.trim()}
                        style={{ background: retryStates[sub.id]?.trim() ? '#c99d5d' : '#eee', color: retryStates[sub.id]?.trim() ? 'white' : '#aaa', border: 'none', padding: '8px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: retryStates[sub.id]?.trim() ? 'pointer' : 'default' }}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button 
                      onClick={() => handleStatusUpdate(sub, 'approved')} 
                      style={{ background: '#9f4022', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      ✓ Approve
                    </button>
                    <button 
                      onClick={() => setRetryStates(prev => ({ ...prev, [sub.id]: '' }))}
                      style={{ background: '#eee', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ↺ Try Again
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Approved submissions — feed curation */}
      {approvedProcessed.length > 0 && (
        <div style={{ marginBottom: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
            <Rss size={16} color="#9f4022" />
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '900', color: '#53372b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Feed Curation</h3>
            <span style={{ fontSize: '11px', color: 'rgba(83,55,43,0.4)', fontWeight: 'bold' }}>— toggle which approved posts appear in the batch feed</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {approvedProcessed.map((sub: any) => {
                const isPublished = sub.published_to_feed === true || sub.published_to_feed === 'true';
                return (
                  <motion.div
                    key={sub.id}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      background: 'white',
                      border: `1px solid ${isPublished ? 'rgba(111, 142, 124, 0.3)' : 'rgba(83,55,43,0.08)'}`,
                      borderRadius: '14px',
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ width: '52px', height: '52px', borderRadius: '10px', overflow: 'hidden', background: 'rgba(83,55,43,0.06)', flexShrink: 0 }}>
                      {sub.file_url && !sub.file_url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) ? (
                        <img src={sub.file_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                          {sub.file_url ? '🎬' : '📄'}
                        </div>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: '900', color: '#53372b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sub.profiles?.name}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(83,55,43,0.45)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sub.tasks?.title || sub.flashcards?.text || 'Submission'} · {sub.profiles?.team_name || 'No Clan'}
                      </p>
                    </div>

                    {isPublished && (
                      <span style={{ fontSize: '10px', fontWeight: '900', color: '#6f8e7c', background: 'rgba(111,142,124,0.1)', padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                        Live
                      </span>
                    )}

                    <button
                      onClick={() => handleToggleFeed(sub, !isPublished)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        flexShrink: 0,
                        background: isPublished ? 'rgba(210, 116, 64, 0.1)' : '#9f4022',
                        color: isPublished ? '#d27440' : 'white',
                      }}
                    >
                      {isPublished ? '✕ Remove' : '↑ Publish'}
                    </button>
                  </motion.div>
                );
              })}
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedImage && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setSelectedImage(null)}
               style={{ position: 'absolute', inset: 0, background: 'rgba(23, 15, 12, 0.95)', backdropFilter: 'blur(10px)' }} 
             />
             <motion.div
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
             >
                <img 
                  src={selectedImage} 
                  alt="Zoomed" 
                  style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '16px', boxShadow: '0 30px 60px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }} 
                />
                <button 
                  onClick={() => setSelectedImage(null)}
                  style={{ position: 'absolute', top: '-48px', right: '0', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                >
                  <X size={20} /> Close
                </button>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
