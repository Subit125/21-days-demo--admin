"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Clock, RotateCw, ImageOff } from "lucide-react";
import { useState, useEffect } from "react";
import { getAllEntities, TABLES, upsertEntity } from "@/lib/azureDb";
import { submissionBelongsToBatch } from "@/lib/points";

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
  consent_to_feed?: boolean;
}

const isVideoProof = (url: string) => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url || '');

/**
 * Proofs this submission has already had replaced, newest first.
 *
 * A submission is one row per member per task, overwritten in place, so `file_url`
 * only ever holds the latest photo. The client records each one it replaces in
 * `attempt_history`, which is what lets a reviewer compare "what they sent before"
 * against what came back. Rows written before that field existed have none.
 */
const getEarlierAttempts = (sub: any): { file_url: string; submitted_at?: string }[] => {
    let history: any[] = [];
    try {
        const raw = sub?.attempt_history;
        if (typeof raw === 'string' && raw.trim()) history = JSON.parse(raw);
        else if (Array.isArray(raw)) history = raw;
    } catch {
        return []; // one malformed record must not break the whole panel
    }
    return history.filter((a) => a?.file_url).reverse();
};

export function ApprovalsQueue({ batchId }: { batchId?: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryStates, setRetryStates] = useState<{ [id: string]: string }>({});
  const [shoutoutStates, setShoutoutStates] = useState<{ [id: string]: string }>({});
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [totals, setTotals] = useState({ approved: 0, retry: 0, rejected: 0 });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  // Submissions sent back for another try. They leave the queue above the moment they
  // are returned (it lists 'under-review' only), so without this they were countable
  // but not viewable: staff could see that four people had been asked to redo something
  // and had no way to see what any of them had sent, or what they had been told.
  const [retryList, setRetryList] = useState<Submission[]>([]);
  const [isRetryOpen, setIsRetryOpen] = useState(false);

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

          // ...and the submission itself must belong to this batch. Membership alone is
          // not enough: a member moved over from an earlier cohort brings all of their
          // old submissions with them, and those were counted here as this batch's
          // approvals and resubmits, which is misleading when reviewing a queue.
          if (batchId && !submissionBelongsToBatch(sub, batchId, allTasks || [], flashData)) return null;

          const task = (allTasks || []).find((t: any) => (t.rowKey || t.RowKey || t.id) === sub.task_id);
          const card = flashData.find((c: any) => (c.rowKey || c.RowKey || c.id) === sub.flashcard_id);
          const batch = batches.find((b: any) => (b.rowKey || b.RowKey || b.id) === profile?.batch_id);

          // Not date-filtered against batch.start_date: the profile.batch_id match above
          // already isolates a genuinely new cohort (a real reset deletes the old Task
          // rows), and filtering by start_date here hid real pending submissions whenever
          // a batch's start_date was reset after a member had already submitted earlier
          // the same day.

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
      const retryItems = subWithDetails.filter((s: any) => s.status === 'retry');
      const retry = retryItems.length;
      const rejected = subWithDetails.filter((s: any) => s.status === 'rejected').length;

      // Newest first, so whatever was just sent back is at the top of the list.
      retryItems.sort((a: any, b: any) =>
        new Date(b.processed_at || b.created_at || 0).getTime() -
        new Date(a.processed_at || a.created_at || 0).getTime()
      );
      setRetryList(retryItems);
      setTotals({ approved, retry, rejected });
      setSubmissions(subWithDetails.filter((s: any) => s.status === 'under-review'));
      setIsLoading(false);
    } catch (err) {
      console.error('fetchSubmissions error:', err);
    }
  };

  const toCleanSub = (sub: Submission) => {
    const { profiles, tasks, flashcards, batch_name, id: _id, ...clean } = sub as any;
    return clean;
  };

  const handleStatusUpdate = async (sub: Submission, status: 'approved' | 'retry', comment?: string) => {
    try {
        const subId = sub.rowKey || sub.RowKey || sub.id;
        const userId = sub.user_id;
        const pts = sub.tasks?.points || sub.flashcards?.points || 0;
        const adminEmail = 'Admin';

        const cleanSub = toCleanSub(sub);
        const consentedToFeed = sub.consent_to_feed === true || (sub as any).consent_to_feed === 'true';
        const shoutout = shoutoutStates[subId] || null;
        const featured = featuredIds.has(subId);

        await upsertEntity(TABLES.SUBMISSIONS, {
            ...cleanSub,
            status,
            rejection_comment: comment || null,
            approved_by: adminEmail,
            processed_at: new Date().toISOString(),
            ...(status === 'approved' ? {
                admin_shoutout: shoutout,
                is_featured: featured,
            } : {}),
            ...(status === 'approved' && consentedToFeed ? {
                published_to_feed: true,
                feed_published_at: new Date().toISOString()
            } : {})
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
        setShoutoutStates(prev => { const n = { ...prev }; delete n[subId]; return n; });
        setFeaturedIds(prev => { const n = new Set(prev); n.delete(subId); return n; });
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

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="responsive-grid" style={{ marginBottom: '48px' }}>
         {[
           { label: 'Pending Review', value: stats.pending, color: '#53372b', bg: '#f5f2e9', icon: Clock, onClick: null as ((() => void) | null) },
           { label: 'Approved', value: stats.passed, color: '#6f8e7c', bg: 'rgba(111, 142, 124, 0.1)', icon: Check, onClick: null as ((() => void) | null) },
           // The only tile that opens anything: everything else is a plain count.
           { label: 'Resubmit', value: stats.resubmit, color: '#c99d5d', bg: 'rgba(201, 157, 93, 0.1)', icon: RotateCw, onClick: (stats.resubmit > 0 ? () => setIsRetryOpen(true) : null) as ((() => void) | null) },
           { label: 'Rejected', value: stats.rejected, color: '#d27440', bg: 'rgba(210, 116, 64, 0.1)', icon: X, onClick: null as ((() => void) | null) },
         ].map((stat, i) => (
           <motion.div
             key={i}
             className="premium-card"
             onClick={stat.onClick ?? undefined}
             role={stat.onClick ? 'button' : undefined}
             tabIndex={stat.onClick ? 0 : undefined}
             onKeyDown={stat.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stat.onClick?.(); } } : undefined}
             whileHover={stat.onClick ? { y: -3 } : undefined}
             style={{ display: 'flex', alignItems: 'center', gap: '20px', cursor: stat.onClick ? 'pointer' : 'default' }}
           >
              <div style={{ width: '48px', minWidth: '48px', height: '48px', borderRadius: '12px', background: stat.bg, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><stat.icon size={20} /></div>
              <div>
                <p style={{ margin: 0, fontSize: '10px', color: 'rgba(83, 55, 43, 0.4)', fontWeight: 'bold' }}>{stat.label}</p>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{stat.value}</p>
                {stat.onClick && (
                  <p style={{ margin: 0, fontSize: '9px', color: '#c99d5d', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    View proofs
                  </p>
                )}
              </div>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Admin shoutout (optional)..."
                      value={shoutoutStates[sub.id] || ''}
                      onChange={(e) => setShoutoutStates(prev => ({ ...prev, [sub.id]: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(159, 64, 34, 0.15)', fontSize: '11px', color: '#53372b', outline: 'none', boxSizing: 'border-box' as any, fontFamily: 'inherit' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 10px', background: featuredIds.has(sub.id) ? 'rgba(255,215,0,0.08)' : 'rgba(83,55,43,0.03)', borderRadius: '8px', border: `1px solid ${featuredIds.has(sub.id) ? 'rgba(255,215,0,0.35)' : 'rgba(83,55,43,0.08)'}` }}>
                      <input
                        type="checkbox"
                        checked={featuredIds.has(sub.id)}
                        onChange={(e) => setFeaturedIds(prev => { const n = new Set(prev); e.target.checked ? n.add(sub.id) : n.delete(sub.id); return n; })}
                        style={{ accentColor: '#d4a017', width: '14px', height: '14px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '10px', fontWeight: '800', color: featuredIds.has(sub.id) ? '#856400' : 'rgba(83,55,43,0.4)', textTransform: 'uppercase' as any, letterSpacing: '0.05em' }}>⭐ Feature this post</span>
                    </label>
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
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>


      {/* Everything currently sent back, opened from the Resubmit tile. Shows the proof
          that was returned, which task it was for, and what the member was told to fix. */}
      <AnimatePresence>
        {isRetryOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRetryOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(23, 15, 12, 0.75)', backdropFilter: 'blur(6px)' }}
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              style={{ position: 'relative', width: '100%', maxWidth: '860px', background: '#fcfaf5', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.35)' }}
            >
              <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid rgba(83,55,43,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', fontWeight: '900', color: '#c99d5d', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
                    <RotateCw size={13} /> Sent back for another try
                  </div>
                  <h2 style={{ margin: '6px 0 0', fontSize: '26px', fontWeight: '900', color: '#53372b' }}>
                    {retryList.length} awaiting resubmission
                  </h2>
                </div>
                <button
                  onClick={() => setIsRetryOpen(false)}
                  aria-label="Close"
                  style={{ width: '42px', height: '42px', minWidth: '42px', borderRadius: '50%', border: '1px solid rgba(83,55,43,0.12)', background: 'white', color: '#53372b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px 32px 32px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
                {retryList.length === 0 && (
                  <p style={{ margin: 0, padding: '32px 0', textAlign: 'center', fontSize: '13px', color: 'rgba(83,55,43,0.4)' }}>
                    Nothing is waiting to be resubmitted.
                  </p>
                )}

                {retryList.map((sub: any) => {
                  const earlier = getEarlierAttempts(sub);
                  const title = sub.tasks?.title || sub.flashcards?.text || 'Submission';
                  const day = sub.tasks?.day;
                  return (
                    <div key={sub.id} style={{ display: 'flex', gap: '18px', padding: '18px', background: 'white', borderRadius: '20px', border: '1px solid rgba(83,55,43,0.06)' }}>
                      <div
                        onClick={() => sub.file_url && !isVideoProof(sub.file_url) && setSelectedImage(sub.file_url)}
                        style={{ width: '132px', height: '132px', minWidth: '132px', borderRadius: '14px', overflow: 'hidden', background: 'rgba(83,55,43,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sub.file_url && !isVideoProof(sub.file_url) ? 'zoom-in' : 'default' }}
                      >
                        {!sub.file_url
                          ? <div style={{ textAlign: 'center', color: 'rgba(83,55,43,0.25)' }}><ImageOff size={22} /><div style={{ fontSize: '8px', fontWeight: 'bold', marginTop: '6px', textTransform: 'uppercase' }}>No photo</div></div>
                          : isVideoProof(sub.file_url)
                            ? <video src={sub.file_url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <img src={sub.file_url} alt={`Proof for ${title}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '15px', fontWeight: '900', color: '#53372b' }}>{title}</span>
                          {day && (
                            <span style={{ fontSize: '9px', fontWeight: '900', color: '#9f4022', background: 'rgba(159,64,34,0.08)', padding: '2px 8px', borderRadius: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Day {day}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(83,55,43,0.55)', fontWeight: '600', marginTop: '3px' }}>
                          {sub.profiles?.name || 'Unknown member'}
                          {sub.batch_name ? ` · ${sub.batch_name}` : ''}
                        </div>

                        <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(201,157,93,0.10)', borderLeft: '3px solid #c99d5d', borderRadius: '10px' }}>
                          <div style={{ fontSize: '8px', fontWeight: '900', color: '#c99d5d', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Message to member</div>
                          <div style={{ fontSize: '12px', color: '#53372b', fontWeight: '600', marginTop: '3px', lineHeight: '1.5' }}>
                            {sub.rejection_comment || <span style={{ color: 'rgba(83,55,43,0.4)', fontWeight: '500' }}>No message was left.</span>}
                          </div>
                        </div>

                        {sub.processed_at && (
                          <div style={{ fontSize: '9px', color: 'rgba(83,55,43,0.35)', marginTop: '8px' }}>
                            Sent back {new Date(sub.processed_at).toLocaleString()}
                          </div>
                        )}

                        {earlier.length > 0 && (
                          <div style={{ marginTop: '10px' }}>
                            <div style={{ fontSize: '8px', fontWeight: '900', color: 'rgba(83,55,43,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>
                              Earlier attempts
                            </div>
                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                              {earlier.map((a, i) => (
                                <img
                                  key={i}
                                  src={a.file_url}
                                  alt={`Earlier attempt ${earlier.length - i}`}
                                  onClick={() => setSelectedImage(a.file_url)}
                                  style={{ width: '52px', height: '52px', minWidth: '52px', objectFit: 'cover', borderRadius: '9px', border: '1px solid rgba(83,55,43,0.12)', cursor: 'zoom-in' }}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
