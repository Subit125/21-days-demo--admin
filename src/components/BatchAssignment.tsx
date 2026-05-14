"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Users, UserPlus, CheckCircle2, Clock, ShieldCheck, X, Search, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { getAllEntities, TABLES, upsertEntity } from "@/lib/azureDb";

export function BatchAssignment() {
  const [waitingUsers, setWaitingUsers] = useState<any[]>([]);
  const [activeBatches, setActiveBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [recentlyAssigned, setRecentlyAssigned] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [allProfiles, allFlashcards] = await Promise.all([
        getAllEntities(TABLES.PROFILES),
        getAllEntities(TABLES.FLASHCARDS),
      ]);

      // 1. Filter Waiting Users (No batch assigned or explicitly in "waiting")
      // Keep recently assigned users in the list for visual confirmation
      const waiting = (allProfiles || []).filter((p: any) => {
        const isWaiting = !p.batch_id || p.batch_id === "" || p.batch_id === "waiting" || p.batch_id === "Independent" || p.team_name === "Independent";
        return isWaiting || recentlyAssigned.has(p.rowKey || p.RowKey || p.id);
      });
      setWaitingUsers(waiting);

      // 2. Filter Active Unlocked Batches
      const batches = (allFlashcards || []).filter((e: any) => 
        (e.partitionKey === "CONFIG_BATCH" || e.PartitionKey === "CONFIG_BATCH") && 
        e.is_locked !== true && e.is_locked !== "true"
      );
      setActiveBatches(batches);

      setIsLoading(false);
    } catch (err) {
      console.error('BatchAssignment fetchData error:', err);
    }
  };

  const handleAssignBatch = async (userIds: string[], batchId: string) => {
    try {
        setIsLoading(true);
        const promises = userIds.map(async (userId) => {
            const user = waitingUsers.find(u => (u.rowKey || u.RowKey || u.id) === userId);
            if (!user) return;

            const updatedUser = {
                ...user,
                batch_id: batchId,
                team_name: null, // Clear Independent status
                assigned_at: new Date().toISOString()
            };

            await upsertEntity(TABLES.PROFILES, updatedUser);
            setRecentlyAssigned(prev => new Set(prev).add(userId));
        });

        await Promise.all(promises);
        
        setSelectedUserIds(new Set());
        await fetchData();
        alert(`Successfully assigned ${userIds.length} user(s) to batch.`);
    } catch (e: any) {
        console.error(e);
        alert(`Assignment failed: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const filteredUsers = waitingUsers.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleUserSelection = (userId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedUserIds(prev => {
        const next = new Set(prev);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0) {
        setSelectedUserIds(new Set());
    } else {
        setSelectedUserIds(new Set(filteredUsers.map(u => u.rowKey || u.RowKey || u.id)));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
      
      {/* Header Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '32px', borderBottom: '1px solid rgba(83, 55, 43, 0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
               <h3 style={{ fontSize: '28px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: '900', margin: 0, textTransform: 'uppercase' }}>Waiting Section</h3>
               <p style={{ color: 'rgba(83, 55, 43, 0.4)', fontSize: '14px', marginTop: '8px' }}>Operatives awaiting deployment to active training cycles.</p>
            </div>
            <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(83, 55, 43, 0.3)' }} />
                <input 
                    type="text" 
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: '14px 16px 14px 44px', borderRadius: '14px', border: '1px solid rgba(83, 55, 43, 0.05)', background: 'white', fontSize: '12px', width: '300px', outline: 'none', color: '#53372b' }}
                />
            </div>
        </div>
        
        {/* Bulk Selection Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(83, 55, 43, 0.03)', padding: '12px 24px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input 
                    type="checkbox" 
                    checked={selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: '#9f4022' }}
                />
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#53372b' }}>
                    {selectedUserIds.size} Operative(s) Selected
                </span>
            </div>
            {selectedUserIds.size > 0 && (
                <button 
                    onClick={() => setSelectedUserIds(new Set())}
                    style={{ background: 'transparent', border: 'none', color: '#9f4022', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase' }}
                >
                    Clear Selection
                </button>
            )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '48px', alignItems: 'start' }}>
        
        {/* Waiting List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
           {isLoading ? (
             <div style={{ padding: '60px', textAlign: 'center', opacity: 0.5 }}>Loading waiting list...</div>
           ) : filteredUsers.length > 0 ? (
             filteredUsers.map((user, idx) => (
               <motion.div 
                 key={user.rowKey || user.RowKey || idx}
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: idx * 0.05 }}
                 className="premium-card"
                 onClick={() => toggleUserSelection(user.rowKey || user.RowKey || user.id)}
                 style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '24px 32px',
                    cursor: 'pointer',
                    border: selectedUserIds.has(user.rowKey || user.RowKey || user.id) ? '2px solid #9f4022' : '1px solid rgba(83, 55, 43, 0.05)',
                    background: selectedUserIds.has(user.rowKey || user.RowKey || user.id) ? 'rgba(159, 64, 34, 0.02)' : 'white'
                 }}
               >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                     <input 
                        type="checkbox" 
                        checked={selectedUserIds.has(user.rowKey || user.RowKey || user.id)}
                        onChange={(e) => toggleUserSelection(user.rowKey || user.RowKey || user.id, e as any)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: '#9f4022' }}
                     />
                     <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(83, 55, 43, 0.05)', color: '#53372b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px' }}>
                        {user.name?.[0]?.toUpperCase()}
                     </div>
                     <div>
                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#53372b' }}>{user.name}</h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'rgba(83, 55, 43, 0.4)' }}>{user.email}</p>
                     </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                     {recentlyAssigned.has(user.rowKey || user.RowKey || user.id) ? (
                        <span style={{ fontSize: '10px', fontWeight: '900', color: '#2d5a27', background: 'rgba(45, 90, 39, 0.1)', padding: '6px 12px', borderRadius: '8px', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                           <CheckCircle2 size={10} /> Batch Assigned
                        </span>
                     ) : (
                        <span style={{ fontSize: '10px', fontWeight: '900', color: '#c99d5d', background: 'rgba(201, 157, 93, 0.1)', padding: '6px 12px', borderRadius: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                           Awaiting Batch
                        </span>
                     )}
                     <ChevronRight size={16} color="rgba(83, 55, 43, 0.2)" />
                  </div>
               </motion.div>
             ))
           ) : (
             <div style={{ padding: '80px', textAlign: 'center', background: 'rgba(83, 55, 43, 0.02)', borderRadius: '24px', border: '1px dashed rgba(83, 55, 43, 0.1)' }}>
                <Users size={32} color="rgba(83, 55, 43, 0.1)" style={{ marginBottom: '16px' }} />
                <p style={{ margin: 0, fontSize: '14px', color: 'rgba(83, 55, 43, 0.4)', fontWeight: 'bold' }}>No operatives currently in the waiting section.</p>
             </div>
           )}
        </div>

         {/* Assignment Sidebar */}
         <AnimatePresence>
            {selectedUserIds.size > 0 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="premium-card"
                    style={{ padding: '32px', position: 'sticky', top: '120px' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                        <div>
                           <p style={{ fontSize: '9px', fontWeight: '900', color: '#9f4022', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '8px' }}>
                              {selectedUserIds.size > 1 ? 'Bulk Assignment' : 'Assign Deployment'}
                           </p>
                           <h4 style={{ fontSize: '20px', fontFamily: "'Bodoni Moda', serif", fontWeight: '900', color: '#53372b', margin: 0 }}>
                              {selectedUserIds.size > 1
                                ? `${selectedUserIds.size} Operatives Selected`
                                : waitingUsers.find(u => selectedUserIds.has(u.rowKey || u.RowKey || u.id))?.name}
                           </h4>
                        </div>
                        <button onClick={() => setSelectedUserIds(new Set())} style={{ background: 'transparent', border: 'none', color: 'rgba(83, 55, 43, 0.2)', cursor: 'pointer' }}><X size={20} /></button>
                    </div>

                    <p style={{ fontSize: '11px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase', marginBottom: '16px' }}>Available Active Batches</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {activeBatches.length > 0 ? (
                          activeBatches.map(batch => (
                            <button
                              key={batch.rowKey || batch.RowKey}
                              onClick={() => handleAssignBatch(Array.from(selectedUserIds), batch.rowKey || batch.RowKey)}
                              style={{ 
                                 display: 'flex', 
                                 alignItems: 'center', 
                                 justifyContent: 'space-between', 
                                 padding: '16px 20px', 
                                 borderRadius: '16px', 
                                 border: '1px solid rgba(83, 55, 43, 0.05)', 
                                 background: 'white', 
                                 cursor: 'pointer',
                                 transition: 'all 0.2s'
                              }}
                              onMouseOver={(e) => { e.currentTarget.style.borderColor = '#9f4022'; e.currentTarget.style.background = 'rgba(159, 64, 34, 0.02)'; }}
                              onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(83, 55, 43, 0.05)'; e.currentTarget.style.background = 'white'; }}
                            >
                               <div style={{ textAlign: 'left' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#53372b' }}>{batch.name}</span>
                                  <p style={{ margin: 0, fontSize: '10px', color: 'rgba(83, 55, 43, 0.4)' }}>Unlocked Batch</p>
                               </div>
                               <UserPlus size={16} color="#9f4022" />
                            </button>
                          ))
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'rgba(83, 55, 43, 0.3)', fontStyle: 'italic' }}>
                             No unlocked batches available for assignment.
                          </div>
                        )}
                    </div>

                    <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid rgba(83, 55, 43, 0.05)' }}>
                       <p style={{ margin: 0, fontSize: '11px', color: 'rgba(83, 55, 43, 0.5)', lineHeight: '1.6' }}>
                          Assignment will immediately allow the operative to access the selected training cycle's dashboard and protocols.
                       </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </div>

    </div>
  );
}
