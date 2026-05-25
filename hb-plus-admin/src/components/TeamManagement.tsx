"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, Users, Award, Sparkles, Trash2, ShieldCheck, X, Edit2, Check, Camera } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { getAllEntities, TABLES, upsertEntity, deleteEntity } from "@/lib/azureDb";
import { uploadToAzure } from "@/lib/azureClient";

interface Clan {
  id: string;
  name: string;
  members: number;
  points: number;
  logo_url: string | null;
  memberList: any[];
  color: string;
  bg: string;
}

interface TeamManagementProps {
  batchId: string;
  isLocked?: boolean;
}

export function TeamManagement({ batchId, isLocked }: TeamManagementProps) {
  const [clans, setClans] = useState<Clan[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMemberPickerOpen, setIsMemberPickerOpen] = useState(false);
  const [activeClanName, setActiveClanName] = useState<string | null>(null);
  
  const [newClan, setNewClan] = useState({ name: '', logo_url: null as string | null });
  const [selectedInitialMembers, setSelectedInitialMembers] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [editingClanName, setEditingClanName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5 seconds for Azure
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [profiles, clansData, subs, awards] = await Promise.all([
        getAllEntities(TABLES.PROFILES) as Promise<any[]>,
        getAllEntities(TABLES.CLANS) as Promise<any[]>,
        getAllEntities(TABLES.SUBMISSIONS) as Promise<any[]>,
        getAllEntities(TABLES.MANUAL_AWARDS) as Promise<any[]>
      ]);

      if (!profiles) return;

      const pointMap: { [key: string]: number } = {};
      (subs || []).filter((s: any) => s.status === 'approved').forEach((s: any) => {
          const pts = Number(s.points) || 0;
          pointMap[s.user_id] = (pointMap[s.user_id] || 0) + pts;
      });
      (awards || []).forEach((a: any) => {
          pointMap[a.user_id] = (pointMap[a.user_id] || 0) + (Number(a.points) || 0);
      });

      const teamGroups: { [key: string]: Clan } = {};
      const colors = ["#9f4022", "#747440", "#344161", "#a9674d", "#d27440", "#6f8e7c"];
      
      profiles.forEach((p: any) => {
          const teamName = p.team_name || 'Independent';
          const userPoints = pointMap[p.rowKey || p.RowKey || p.id] || 0;
          if (!teamGroups[teamName]) {
              const clanInfo = clansData?.find((c: any) => c.name === teamName);
              teamGroups[teamName] = { 
                  id: teamName, 
                  name: teamName, 
                  members: 0, 
                  points: 0, 
                  logo_url: clanInfo?.logo_url || null,
                  memberList: [],
                  color: colors[Object.keys(teamGroups).length % colors.length],
                  bg: `${colors[Object.keys(teamGroups).length % colors.length]}10`
              };
          }
          teamGroups[teamName].members += 1;
          teamGroups[teamName].points += userPoints;
          teamGroups[teamName].memberList.push({ 
            id: p.rowKey || p.RowKey || p.id, 
            name: p.name, 
            email: p.email, 
            role: p.role, 
            points: userPoints 
          });
      });

      setClans(Object.values(teamGroups));
      setAvailableUsers(profiles.filter((p: any) => !p.team_name || p.team_name === 'Independent'));
    } catch (err) {
      console.error('fetchData error:', err);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewClan(prev => ({ ...prev, logo_url: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleInitialize = async () => {
    if (!newClan.name.trim()) return;
    try {
        await upsertEntity(TABLES.CLANS, { partitionKey: 'Clan', rowKey: newClan.name, name: newClan.name, logo_url: newClan.logo_url });
        if (selectedInitialMembers.length > 0) {
            for (const userId of selectedInitialMembers) {
                const user = availableUsers.find(u => u.rowKey === userId || u.id === userId);
                if (user) await upsertEntity(TABLES.PROFILES, { ...user, team_name: newClan.name });
            }
        }
        alert(`Guild "${newClan.name}" initialized.`);
        setIsModalOpen(false);
        setNewClan({ name: '', logo_url: null });
        setSelectedInitialMembers([]);
        fetchData();
    } catch(e) { console.error(e); }
  };

  const assignMember = async (userId: string) => {
     if (!activeClanName) return;
     const user = availableUsers.find(u => u.rowKey === userId || u.id === userId);
     if (user) {
        await upsertEntity(TABLES.PROFILES, { ...user, team_name: activeClanName });
        fetchData(); 
        setIsMemberPickerOpen(false);
     }
  };

  const removeFromTeam = async (userId: string) => {
    const allProfiles = await getAllEntities(TABLES.PROFILES);
    const user = allProfiles.find((p: any) => p.rowKey === userId || p.id === userId);
    if (user) {
        await upsertEntity(TABLES.PROFILES, { ...user, team_name: 'Independent' });
        fetchData();
    }
  };

  const deleteClan = async (clanName: string) => {
    if (clanName === 'Independent') return;
    const allProfiles = await getAllEntities(TABLES.PROFILES);
    const teamMembers = allProfiles.filter((p: any) => p.team_name === clanName);
    for (const m of teamMembers) {
        await upsertEntity(TABLES.PROFILES, { ...m, team_name: 'Independent' });
    }
    await deleteEntity(TABLES.CLANS, 'Clan', clanName);
    fetchData();
  };

  const toggleInitialMember = (id: string) => {
    setSelectedInitialMembers(prev => prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]);
  };

  const makeCaptain = async (userId: string, teamName: string) => {
    const allProfiles = await getAllEntities(TABLES.PROFILES);
    const teamMembers = allProfiles.filter((p: any) => p.team_name === teamName);
    for (const m of teamMembers) {
        await upsertEntity(TABLES.PROFILES, { ...m, role: (m.rowKey === userId || m.id === userId) ? 'captain' : 'member' });
    }
    fetchData();
  };

  const handleRenameClan = async (oldName: string) => {
    if (!renameValue.trim() || renameValue === oldName) {
        setEditingClanName(null);
        return;
    }
    
    try {
        const clan = clans.find(c => c.name === oldName);
        await upsertEntity(TABLES.CLANS, { partitionKey: 'Clan', rowKey: renameValue, name: renameValue, logo_url: clan?.logo_url });
        await deleteEntity(TABLES.CLANS, 'Clan', oldName);

        const allProfiles = await getAllEntities(TABLES.PROFILES);
        const teamMembers = allProfiles.filter((p: any) => p.team_name === oldName);
        for (const m of teamMembers) {
            await upsertEntity(TABLES.PROFILES, { ...m, team_name: renameValue });
        }
        
        setEditingClanName(null);
        fetchData();
    } catch (e: any) {
        console.error(e);
        alert(`Rename failed: ${e.message}`);
    }
  };


  const handleUpdateTeamLogo = async (teamName: string, file: File) => {
    try {
        // Assuming uploadToAzure handles the storage part
        const fUrl = await uploadToAzure(file, `clans/${teamName}`);
        const clan = clans.find(c => c.name === teamName);
        await upsertEntity(TABLES.CLANS, { partitionKey: 'Clan', rowKey: teamName, name: teamName, logo_url: fUrl });
        
        fetchData();
        alert('Logo updated successfully!');
    } catch (e: any) {
        console.error(e);
        alert(`Logo update failed: ${e.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '32px', borderBottom: '1px solid rgba(83, 55, 43, 0.05)' }}>
        <div>
           <h3 style={{ fontSize: '28px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: '900', margin: 0, textTransform: 'uppercase' }}>Active Clans</h3>
           <p style={{ color: 'rgba(83, 55, 43, 0.4)', fontSize: '14px', marginTop: '8px' }}>Manage team dynamics and distribute elite members.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} style={{ backgroundColor: '#9f4022', borderRadius: '12px', color: 'white', padding: '14px 24px', fontSize: '11px', fontWeight: 'bold', border: 'none', cursor: 'pointer', width: 'fit-content' }}>
          <Plus size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> INITIALIZE NEW GUILD
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        {clans.filter(t => t.name !== 'Independent').map((team) => (
          <motion.div key={team.id} className="premium-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                    <div style={{ width: '56px', height: '56px', backgroundColor: team.color, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', overflow: 'hidden' }}>
                       {team.logo_url ? <img src={team.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Users size={24} />}
                    </div>
                    <button 
                        onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = (e: any) => {
                                const file = e.target.files[0];
                                if (file) handleUpdateTeamLogo(team.name, file);
                            };
                            input.click();
                        }}
                        style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: '#9f4022', color: 'white', border: 'none', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 10px rgba(159, 64, 34, 0.3)', transition: 'transform 0.2s' }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <Camera size={12} />
                    </button>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                {editingClanName === team.name ? (
                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        <input 
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameClan(team.name)}
                            style={{ flex: 1, padding: '10px 16px', borderRadius: '12px', border: '1px solid #9f4022', fontSize: '14px', outline: 'none' }}
                            autoFocus
                        />
                        <button onClick={() => handleRenameClan(team.name)} style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#6f8e7c', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}><Check size={16}/></button>
                        <button onClick={() => setEditingClanName(null)} style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#d27440', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}><X size={16}/></button>
                    </div>
                ) : (
                    <>
                        <h4 style={{ color: '#53372b', fontFamily: "'Bodoni Moda', serif", fontSize: '20px', fontWeight: 'bold', margin: 0, textTransform: 'uppercase' }}>{team.name}</h4>
                        <button 
                            onClick={() => { setEditingClanName(team.name); setRenameValue(team.name); }}
                            style={{ background: 'rgba(83, 55, 43, 0.05)', border: 'none', color: 'rgba(83, 55, 43, 0.6)', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}
                            onMouseOver={(e) => { e.currentTarget.style.color = '#9f4022'; e.currentTarget.style.background = 'rgba(159, 64, 34, 0.1)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.color = 'rgba(83, 55, 43, 0.6)'; e.currentTarget.style.background = 'rgba(83, 55, 43, 0.05)'; }}
                        >
                            <Edit2 size={14} />
                        </button>
                    </>
                )}
            </div>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
               <div style={{ background: 'var(--hb-beige)', padding: '8px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' }}>{team.members} Members</div>
               <div style={{ background: 'var(--hb-beige)', padding: '8px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' }}>{team.points} Pts</div>
            </div>

            {/* Member List Display */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                {team.memberList?.map((m: any) => (
                  <div key={m.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    background: m.role === 'captain' ? 'rgba(159, 64, 34, 0.08)' : 'rgba(0,0,0,0.02)', 
                    padding: '12px 16px', 
                    borderRadius: '12px',
                    border: m.role === 'captain' ? '1.5px solid rgba(159, 64, 34, 0.2)' : '1px solid rgba(0,0,0,0.05)',
                    transition: 'all 0.2s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                            width: '32px', 
                            height: '32px', 
                            borderRadius: '50%', 
                            backgroundColor: m.role === 'captain' ? '#9f4022' : team.color, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: '12px', 
                            color: 'white',
                            fontWeight: 'bold'
                        }}>
                            {m.role === 'captain' ? <Award size={16} /> : m.name?.[0]}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ 
                                fontSize: '13px', 
                                fontWeight: 'bold', 
                                color: m.role === 'captain' ? '#9f4022' : '#53372b' 
                            }}>
                                {m.name} {m.role === 'captain' && <span style={{ fontSize: '10px', marginLeft: '4px' }}>(Captain)</span>}
                            </span>
                            <span style={{ fontSize: '10px', color: 'rgba(83, 55, 43, 0.4)' }}>{m.email}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {m.role !== 'captain' && (
                            <button 
                                onClick={() => makeCaptain(m.id, team.name)}
                                style={{ 
                                    background: 'rgba(111, 142, 124, 0.1)', 
                                    border: 'none', 
                                    color: '#6f8e7c', 
                                    cursor: 'pointer', 
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    fontSize: '9px',
                                    fontWeight: '900',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    textTransform: 'uppercase'
                                }}
                            >
                                <ShieldCheck size={12} />
                                MAKE CAPTAIN
                            </button>
                        )}
                        <button 
                            onClick={() => removeFromTeam(m.id)}
                            style={{ 
                                background: 'rgba(210, 116, 64, 0.1)', 
                                border: 'none', 
                                color: '#d27440', 
                                cursor: 'pointer', 
                                padding: '6px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                  </div>
                ))}
            </div>
            <div style={{ paddingTop: '24px', borderTop: '1px solid rgba(83, 55, 43, 0.05)', display: 'flex', justifyContent: 'space-between' }}>
               <button onClick={() => { setActiveClanName(team.name); setIsMemberPickerOpen(true); }} style={{ background: '#9f4022', borderRadius: '8px', padding: '10px 20px', border: 'none', color: 'white', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>+ ADD MEMBER</button>
               <button onClick={() => deleteClan(team.name)} style={{ background: 'transparent', border: 'none', color: 'rgba(83, 55, 43, 0.2)', cursor: 'pointer' }}><Trash2 size={18} /></button>
            </div>
          </motion.div>
        ))}
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(83, 55, 43, 0.6)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--hb-cream)', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
             <h3 style={{ fontSize: '28px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: 'bold', textAlign: 'center', marginBottom: '32px' }}>INITIALIZE GUILD</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                   <div onClick={() => fileInputRef.current?.click()} style={{ width: '100px', height: '100px', borderRadius: '24px', background: '#fcfaf5', border: '2px dashed rgba(83, 55, 43, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}>
                      {newClan.logo_url ? <img src={newClan.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Sparkles size={32} color="rgba(83, 55, 43, 0.2)" />}
                   </div>
                   <input type="file" ref={fileInputRef} onChange={handleLogoUpload} hidden accept="image/*" />
                </div>
                <div>
                   <label style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>Guild Name</label>
                   <input type="text" placeholder="e.g. Iron Wolves..." value={newClan.name} onChange={(e) => setNewClan(prev => ({ ...prev, name: e.target.value }))} style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid rgba(83, 55, 43, 0.1)', marginTop: '8px' }} />
                </div>
                <div>
                   <label style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>Select Founders</label>
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '12px', maxHeight: '180px', overflowY: 'auto' }}>
                      {availableUsers.map(user => (
                         <button key={user.id} onClick={() => toggleInitialMember(user.id)} style={{ padding: '12px', borderRadius: '12px', border: selectedInitialMembers.includes(user.id) ? '2px solid #9f4022' : '1px solid rgba(0,0,0,0.05)', backgroundColor: selectedInitialMembers.includes(user.id) ? 'rgba(159, 64, 34, 0.05)' : 'white', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                               <ShieldCheck size={14} color={selectedInitialMembers.includes(user.id) ? '#9f4022' : 'rgba(0,0,0,0.1)'} />
                               <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{user.name}</span>
                            </div>
                            <span style={{ fontSize: '10px', color: 'rgba(83, 55, 43, 0.4)', marginLeft: '22px' }}>{user.email}</span>
                         </button>
                      ))}
                   </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                   <button onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: 'none', background: '#f5f2e9', cursor: 'pointer' }}>DISCARD</button>
                   <button onClick={handleInitialize} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#9f4022', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>INITIALIZE CLAN</button>
                </div>
             </div>
          </motion.div>
        </div>
      )}

      {isMemberPickerOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(83, 55, 43, 0.4)', backdropFilter: 'blur(12px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'white', borderRadius: '32px', padding: '40px', width: '100%', maxWidth: '400px' }}>
              <h3 style={{ fontSize: '24px', fontFamily: "'Bodoni Moda', serif", textAlign: 'center', marginBottom: '32px' }}>PICK MEMBER</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                 {availableUsers.map(user => (
                   <button key={user.id} onClick={() => assignMember(user.id)} style={{ padding: '16px', borderRadius: '16px', border: '1px solid rgba(83, 55, 43, 0.05)', background: '#fcfaf5', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '16px' }}>
                     <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#53372b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>{user.name?.[0]}</div>
                     <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#53372b' }}>{user.name}</span>
                       <span style={{ fontSize: '11px', color: 'rgba(83, 55, 43, 0.4)' }}>{user.email}</span>
                     </div>
                   </button>
                 ))}
              </div>
              <button onClick={() => setIsMemberPickerOpen(false)} style={{ width: '100%', marginTop: '32px', padding: '16px', borderRadius: '16px', border: 'none', background: '#f5f2e9', cursor: 'pointer' }}>CLOSE</button>
           </motion.div>
        </div>
      )}
    </div>
  );
}
