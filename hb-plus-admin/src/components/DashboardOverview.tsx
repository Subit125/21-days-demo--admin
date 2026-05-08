"use client";

import { motion, AnimatePresence } from "framer-motion";
import { 
  Check, Clock, Users, Trophy, Award, Calendar, 
  CheckCircle2, MessageSquareQuote, X, LayoutGrid, 
  FileCheck2, UserCog, Users2, Settings2, BarChart3, ChevronRight, Activity
} from "lucide-react";
import { useEffect, useState } from "react";
import { getAllEntities, TABLES } from "@/lib/azureDb";

export function DashboardOverview({ batchId }: { batchId?: string }) {
  const [batchData, setBatchData] = useState<any[]>([]);
  const [globalStats, setGlobalStats] = useState({
    totalActive: 0,
    totalPending: 0,
    activeBatches: 0
  });

  const [stats, setStats] = useState({
    activeChallenge: 1,
    currentDay: 1,
    topTeam: 'Loading...',
    topClient: 'Loading...',
    activeCount: 0,
    pendingCount: 0,
    taskEngagement: [] as any[]
  });

  // Drawer States
  const [selectedBatchForDrawer, setSelectedBatchForDrawer] = useState<any>(null);

  const fetchStats = async () => {
    try {
      const [allProfiles, allSubs, allTasks, allClans, allFlashcards] = await Promise.all([
        getAllEntities(TABLES.PROFILES),
        getAllEntities(TABLES.SUBMISSIONS),
        getAllEntities(TABLES.TASKS),
        getAllEntities(TABLES.CLANS),
        getAllEntities(TABLES.FLASHCARDS),
      ]);

      const profiles = allProfiles || [];
      const subs = allSubs || [];
      const tasks = allTasks || [];
      const clans = allClans || [];
      const allFlash = allFlashcards || [];
      const batches = allFlash.filter((e: any) => (e.partitionKey === "CONFIG_BATCH" || e.PartitionKey === "CONFIG_BATCH"));

      if (!batchId) {
        // --- COMMAND CENTER LOGIC (Main Home Page) ---
        const computedBatches = batches.map((batch: any) => {
            const bId = batch.rowKey || batch.RowKey;
            const bProfiles = profiles.filter((p: any) => p.batch_id === bId);
            const bMemberIds = new Set(bProfiles.map((p: any) => p.rowKey || p.RowKey));
            const bSubs = subs.filter((s: any) => bMemberIds.has(s.user_id));
            const bTasks = tasks.filter((t: any) => t.batch_id === bId);

            let currentDay = 1;
            if (batch.start_date) {
                const diff = Math.floor((new Date().getTime() - new Date(batch.start_date).getTime()) / (1000 * 60 * 60 * 24));
                currentDay = Math.max(1, Math.min(28, diff + 1));
            }

            const topMember = [...bProfiles].sort((a: any, b: any) => (Number(b.points) || 0) - (Number(a.points) || 0))[0];

            const bClans = clans.map((c: any) => {
                const clanMembers = bProfiles.filter((p: any) => p.team_name === c.name);
                const points = clanMembers.reduce((sum: number, p: any) => sum + (Number(p.points) || 0), 0);
                return { ...c, points };
            }).sort((a: any, b: any) => b.points - a.points);
            const topClan = bClans[0];

            const todayTasks = bTasks.filter((t: any) => Number(t.day) === currentDay).map((t: any) => {
                const tId = t.rowKey || t.RowKey;
                const completionCount = bSubs.filter((s: any) => s.task_id === tId && (s.status === 'approved' || s.status === 'under-review')).length;
                return { ...t, completionCount, totalMembers: bProfiles.length };
            });

            return {
                ...batch,
                id: bId,
                currentDay,
                memberCount: bProfiles.length,
                topMember: topMember?.name || 'TBD',
                topMemberPoints: topMember?.points || 0,
                topClan: topClan?.name || 'TBD',
                topClanPoints: topClan?.points || 0,
                todayTasks
            };
        });

        setBatchData(computedBatches);
        setGlobalStats({
            totalActive: profiles.length,
            totalPending: subs.filter((s: any) => s.status === 'under-review').length,
            activeBatches: batches.length
        });
      } else {
        // --- SINGLE BATCH DETAIL LOGIC (Batch Page) ---
        const filteredProfiles = profiles.filter((p: any) => p.batch_id === batchId);
        const memberIds = new Set(filteredProfiles.map((p: any) => p.rowKey || p.RowKey));
        const filteredSubs = subs.filter((s: any) => memberIds.has(s.user_id));
        const filteredTasks = tasks.filter((t: any) => t.batch_id === batchId || !t.batch_id);

        const topMember = [...filteredProfiles].sort((a: any, b: any) => (Number(b.points) || 0) - (Number(a.points) || 0))[0];

        const clanRanked = clans.map((c: any) => {
            const clanMembers = filteredProfiles.filter((p: any) => p.team_name === c.name || p.clan_id === (c.rowKey || c.RowKey));
            const points = clanMembers.reduce((sum: number, p: any) => sum + (Number(p.points) || 0), 0);
            return { ...c, points };
        }).sort((a: any, b: any) => b.points - a.points);
        const topClan = clanRanked[0];

        const today = new Date();
        const startDay = batches.find((b: any) => (b.rowKey || b.RowKey) === batchId)?.start_date;

        let currentDay = 1;
        if (startDay) {
            const diff = Math.floor((today.getTime() - new Date(startDay).getTime()) / (1000 * 60 * 60 * 24));
            currentDay = Math.max(1, Math.min(21, diff + 1));
        }

        const todayTasks = filteredTasks.filter((t: any) => Number(t.day) === currentDay);
        const taskEngagement = todayTasks.map((t: any) => {
            const tId = t.rowKey || t.RowKey;
            const submissions = filteredSubs.filter((s: any) => s.task_id === tId).length;
            return {
                id: tId,
                title: t.title,
                points: t.points || 0,
                submissions,
                total: filteredProfiles.length,
                status: 'active'
            };
        });

        setStats({
            activeChallenge: batches.filter((b: any) => !b.is_locked).length || 1,
            currentDay,
            topTeam: topClan?.name || 'TBD',
            topClient: topMember?.name || 'TBD',
            activeCount: filteredProfiles.length,
            pendingCount: filteredSubs.filter((s: any) => s.status === 'under-review').length,
            taskEngagement,
        });
      }
    } catch (err) {
      console.error('DashboardOverview fetchStats error:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 120000);
    return () => clearInterval(interval);
  }, [batchId]);

  if (batchId) {
    // --- RENDER BATCH DETAIL VIEW ---
    const currentWeek = Math.ceil(stats.currentDay / 7);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="premium-card" style={{ padding: '48px' }}>
                <p style={{ fontSize: '10px', fontWeight: 'bold', color: '#9f4022', textTransform: 'uppercase', letterSpacing: '0.4em', marginBottom: '16px' }}>CHALLENGE PROGRESS</p>
                <h2 style={{ fontSize: '28px', fontFamily: "'Bodoni Moda', serif", fontWeight: 'bold', color: '#53372b', margin: 0 }}>
                    WEEK {currentWeek} — {['Foundation', 'Intensity', 'Mastery'][currentWeek - 1]?.toUpperCase() || 'PUSH THROUGH'}
                </h2>
                <p style={{ fontSize: '16px', color: '#53372b', marginTop: '8px', marginBottom: '32px', fontFamily: "'Bodoni Moda', serif", fontStyle: 'italic', fontWeight: 'bold' }}>
                    Day {stats.currentDay} of 21
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                    {Array.from({ length: 21 }, (_, i) => i + 1).map((day) => (
                        <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '12px 4px', borderRadius: '12px', backgroundColor: day === stats.currentDay ? '#9f4022' : day < stats.currentDay ? 'rgba(159, 64, 34, 0.08)' : 'rgba(83, 55, 43, 0.03)', border: day === stats.currentDay ? 'none' : '1px solid rgba(83, 55, 43, 0.06)' }}>
                            <span style={{ fontSize: '9px', fontWeight: 'bold', color: day === stats.currentDay ? 'white' : 'rgba(83, 55, 43, 0.4)' }}>DAY {day}</span>
                            <div style={{ color: day === stats.currentDay ? 'white' : day < stats.currentDay ? '#9f4022' : 'rgba(83, 55, 43, 0.2)' }}>
                                {day <= stats.currentDay ? <CheckCircle2 size={20} /> : <Clock size={20} opacity={0.3} />}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="premium-card" style={{ padding: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
                    <div>
                        <p style={{ fontSize: '10px', fontWeight: 'bold', color: '#9f4022', textTransform: 'uppercase', letterSpacing: '0.4em', marginBottom: '8px' }}>PROTOCOL STATUS</p>
                        <h3 style={{ fontSize: '24px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: 'bold', margin: 0 }}>Daily Task Engagement</h3>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {stats.taskEngagement.map((task) => (
                        <div key={task.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#53372b' }}>{task.title}</span>
                                <span style={{ fontSize: '12px', color: 'rgba(83,55,43,0.4)' }}>{task.submissions} / {task.total} Submitted</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', backgroundColor: '#fcfaf5', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', backgroundColor: '#9f4022', width: `${task.total > 0 ? (task.submissions/task.total)*100 : 0}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
      
      {/* Global Status Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: '900', margin: 0 }}>Command Center</h1>
          <p style={{ color: 'rgba(83, 55, 43, 0.4)', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Operations Dashboard</p>
        </div>
        <div style={{ display: 'flex', gap: '32px' }}>
           <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '9px', fontWeight: '900', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Active Batches</p>
              <p style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#9f4022', fontFamily: "'Bodoni Moda', serif" }}>{globalStats.activeBatches}</p>
           </div>
           <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '9px', fontWeight: '900', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Operatives</p>
              <p style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#53372b', fontFamily: "'Bodoni Moda', serif" }}>{globalStats.totalActive}</p>
           </div>
           <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '9px', fontWeight: '900', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pending Review</p>
              <p style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#c99d5d', fontFamily: "'Bodoni Moda', serif" }}>{globalStats.totalPending}</p>
           </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '32px' }}>
        {batchData.map((batch) => (
          <motion.div
            key={batch.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -10, boxShadow: '0 30px 60px rgba(83, 55, 43, 0.12)' }}
            className="premium-card"
            style={{ 
                padding: '32px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '28px', 
                position: 'relative', 
                overflow: 'hidden',
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(159, 64, 34, 0.05)'
            }}
          >
            <div style={{ position: 'absolute', top: 0, right: 0, background: '#9f4022', color: 'white', padding: '10px 28px', borderRadius: '0 0 0 24px', fontSize: '11px', fontWeight: '900', letterSpacing: '0.15em' }}>
                DAY {batch.currentDay}
            </div>

            <div>
              <h2 style={{ fontSize: '28px', fontFamily: "'Bodoni Moda', serif", fontWeight: '900', color: '#53372b', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>{batch.name || 'Unnamed Batch'}</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                 <span style={{ fontSize: '10px', fontWeight: '900', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>ID: {batch.id}</span>
                 <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(159, 64, 34, 0.3)' }} />
                 <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#9f4022', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{batch.memberCount} OPERATIVES</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
               <div style={{ background: '#fcfaf5', padding: '20px', borderRadius: '20px', border: '1px solid rgba(83, 55, 43, 0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                     <div style={{ background: 'rgba(111, 142, 124, 0.1)', padding: '6px', borderRadius: '8px' }}>
                        <Award size={12} color="#6f8e7c" />
                     </div>
                     <span style={{ fontSize: '9px', fontWeight: '900', color: '#6f8e7c', textTransform: 'uppercase' }}>Top Leader</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: '900', color: '#53372b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batch.topMember}</p>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)' }}>{batch.topMemberPoints} PTS</p>
               </div>
               <div style={{ background: '#fcfaf5', padding: '20px', borderRadius: '20px', border: '1px solid rgba(83, 55, 43, 0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                     <div style={{ background: 'rgba(201, 157, 93, 0.1)', padding: '6px', borderRadius: '8px' }}>
                        <Trophy size={12} color="#c99d5d" />
                     </div>
                     <span style={{ fontSize: '9px', fontWeight: '900', color: '#c99d5d', textTransform: 'uppercase' }}>Top Team</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: '900', color: '#53372b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batch.topClan}</p>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)' }}>{batch.topClanPoints} PTS</p>
               </div>
            </div>

            <button 
              onClick={() => setSelectedBatchForDrawer(batch)}
              style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: '#9f4022', color: 'white', fontSize: '11px', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', boxShadow: '0 10px 20px rgba(159, 64, 34, 0.15)' }}
            >
              Quick Review Protocols
            </button>
          </motion.div>
        ))}
      </div>

      {/* QUICK REVIEW TASK-ONLY DRAWER */}
      <AnimatePresence>
        {selectedBatchForDrawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBatchForDrawer(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(83, 55, 43, 0.2)', backdropFilter: 'blur(10px)', zIndex: 2000 }}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{ 
                position: 'fixed', top: 0, right: 0, bottom: 0, 
                width: '100%', maxWidth: '500px', 
                background: 'white', zIndex: 2001, 
                boxShadow: '-30px 0 60px rgba(0,0,0,0.15)', 
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Header */}
              <div style={{ padding: '48px', borderBottom: '1px solid rgba(83, 55, 43, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Activity size={16} color="#9f4022" />
                        <p style={{ fontSize: '10px', fontWeight: '900', color: '#9f4022', textTransform: 'uppercase', letterSpacing: '0.3em', margin: 0 }}>Protocol Audit</p>
                     </div>
                     <h2 style={{ fontSize: '32px', fontFamily: "'Bodoni Moda', serif", fontWeight: '900', color: '#53372b', margin: 0 }}>
                       {selectedBatchForDrawer.name}
                     </h2>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                           <Calendar size={14} color="rgba(83, 55, 43, 0.3)" />
                           <span style={{ fontSize: '13px', color: '#53372b', fontWeight: 'bold' }}>Day {selectedBatchForDrawer.currentDay} Sequence</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                           <Award size={14} color="rgba(111, 142, 124, 0.5)" />
                           <span style={{ fontSize: '13px', color: '#53372b', fontWeight: '900' }}>Leader: {selectedBatchForDrawer.topMember}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                           <Trophy size={14} color="rgba(201, 157, 93, 0.5)" />
                           <span style={{ fontSize: '13px', color: '#53372b', fontWeight: '900' }}>Squad: {selectedBatchForDrawer.topClan}</span>
                        </div>
                     </div>
                  </div>
                  <button 
                    onClick={() => setSelectedBatchForDrawer(null)}
                    style={{ background: 'rgba(83, 55, 43, 0.05)', border: 'none', width: '44px', height: '44px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#53372b' }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Task List - Quick Review Mode */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '48px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                   {selectedBatchForDrawer.todayTasks.length > 0 ? (
                     selectedBatchForDrawer.todayTasks.map((task: any, idx: number) => {
                       const pct = task.totalMembers > 0 ? (task.completionCount / task.totalMembers) * 100 : 0;
                       return (
                         <motion.div 
                            key={task.rowKey} 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                         >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                               <div style={{ display: 'flex', gap: '16px' }}>
                                  <div style={{ 
                                    width: '36px', height: '36px', borderRadius: '12px', 
                                    background: 'rgba(159, 64, 34, 0.05)', color: '#9f4022', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                    fontSize: '12px', fontWeight: '900', flexShrink: 0 
                                  }}>
                                    {idx + 1}
                                  </div>
                                  <div>
                                     <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#53372b', lineHeight: '1.4' }}>{task.title}</h4>
                                     <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'rgba(83, 55, 43, 0.4)', fontWeight: 'bold' }}>{task.points} PTS PROTOCOL</p>
                                  </div>
                               </div>
                               <div style={{ textAlign: 'right' }}>
                                  <p style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#9f4022' }}>{task.completionCount}/{task.totalMembers}</p>
                                  <p style={{ margin: 0, fontSize: '9px', fontWeight: '900', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase' }}>Submissions</p>
                               </div>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: 'rgba(83, 55, 43, 0.03)', borderRadius: '10px', overflow: 'hidden' }}>
                               <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 1, ease: "easeOut" }}
                                  style={{ height: '100%', background: '#9f4022', borderRadius: '10px' }}
                               />
                            </div>
                         </motion.div>
                       );
                     })
                   ) : (
                     <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(83, 55, 43, 0.02)', borderRadius: '24px', border: '1px dashed rgba(83, 55, 43, 0.1)' }}>
                        <Clock size={32} color="rgba(83, 55, 43, 0.2)" style={{ marginBottom: '16px' }} />
                        <p style={{ margin: 0, fontSize: '14px', color: 'rgba(83, 55, 43, 0.4)', fontWeight: 'bold' }}>No protocols active for Day {selectedBatchForDrawer.currentDay}</p>
                     </div>
                   )}
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '48px', background: '#fcfaf5', borderTop: '1px solid rgba(83, 55, 43, 0.05)' }}>
                 <p style={{ margin: 0, fontSize: '11px', color: 'rgba(83, 55, 43, 0.4)', lineHeight: '1.6', fontWeight: 'bold' }}>
                   * Completion status includes both verified and under-review submissions for the current operational cycle.
                 </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
