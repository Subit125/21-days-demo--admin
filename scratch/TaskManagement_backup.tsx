"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Calendar, Check, GripVertical, Award, MessageSquareQuote, FileVideo, FileImage, FileText, LayoutList, Clock, Video, Zap, Camera } from "lucide-react";
import { useState, useEffect } from "react";
import { getAllEntities, TABLES, upsertEntity, deleteEntity } from "@/lib/azureDb";
import { uploadToAzure as uploadFile } from "@/lib/azureClient";
import imageCompression from 'browser-image-compression';

const protocolTemplates = [
  { title: "Mindful Morning Flow", points: 15, proof: "video" },
  { title: "Daily Hydration Goals", points: 10, proof: "text" },
  { title: "Deep Breathing Protocol", points: 20, proof: "video" },
  { title: "Core Activation Circuit", points: 25, proof: "photo" },
  { title: "Evening Wind-down", points: 15, proof: "text" },
  { title: "Balanced Nutrition Lunch", points: 15, proof: "photo" },
  { title: "HIIT Session", points: 30, proof: "video" },
];

export function TaskManagement({ batchId, user, isLocked }: { batchId?: string, user?: { email: string; name: string } | null, isLocked?: boolean }) {
  const [activeWeek, setActiveWeek] = useState(1);
  const [activeDay, setActiveDay] = useState(1); 
  const [flashCards, setFlashCards] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isBatchActionModalOpen, setIsBatchActionModalOpen] = useState(false);
  const [batchActionType, setBatchActionType] = useState<'copy' | 'move'>('copy');
  const [targetDay, setTargetDay] = useState(1);

  // Form States
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskData, setNewTaskData] = useState({ title: '', description: '', points: 15, video_url: null as string | null, proof_type: 'image', proof_mode: 'both' });
  const [taskFile, setTaskFile] = useState<File | null>(null);
  
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardData, setNewCardData] = useState({ text: '', description: '', points: 50, video_url: null as string | null, proof_mode: 'both' });
  const [cardFile, setCardFile] = useState<File | null>(null);
  const [cardDeadline, setCardDeadline] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    return tomorrow.toISOString().slice(0, 16);
  });
  const [targetClientId, setTargetClientId] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);

  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [isUploading, setIsUploading] = useState(false);

  // Direct Award State
  const [isAwardingPoints, setIsAwardingPoints] = useState(false);
  const [awardData, setAwardData] = useState({
      userId: '',
      points: 100,
      reason: '',
      isTask: false
  });
  const [awardFile, setAwardFile] = useState<File | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [batchId]);

  const fetchData = async () => {
    try {
      const [allTasks, allFlashcards, allProfiles] = await Promise.all([
        getAllEntities(TABLES.TASKS),
        getAllEntities(TABLES.FLASHCARDS),
        getAllEntities(TABLES.PROFILES),
      ]);

      const filteredTasks = (batchId ? (allTasks||[]).filter((t: any) => t.batch_id === batchId || !t.batch_id) : (allTasks||[]))
        .map((t: any) => ({ ...t, id: t.rowKey || t.RowKey }));
      const filteredCards = (allFlashcards||[]).filter((f: any) => f.partitionKey === 'Flashcard' || f.PartitionKey === 'Flashcard')
        .map((f: any) => ({ ...f, id: f.rowKey || f.RowKey }));

      setTasks(filteredTasks);
      setFlashCards(filteredCards);
      setMembers((allProfiles||[]).map((p: any) => ({ id: p.rowKey || p.RowKey, name: p.name })));
    } catch (err) {
      console.error('TaskManagement fetchData error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ---- File Validation Constants ----
  const MAX_VIDEO_SIZE_KB = 2048; // 2 MB
  const MAX_IMAGE_SIZE_KB = 1024; // 1 MB
  const MAX_VIDEO_DURATION_SEC = 30;

  const validateAndSetFile = (file: File, setter: (f: File | null) => void) => {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const maxSizeKB = isVideo ? MAX_VIDEO_SIZE_KB : MAX_IMAGE_SIZE_KB;

    // 1. Size check
    if (file.size > maxSizeKB * 1024) {
      alert(`Γ¥î File too large!\n\nMaximum size for ${isVideo ? 'video' : 'image'}: ${maxSizeKB / 1024} MB\nYour file: ${(file.size / (1024 * 1024)).toFixed(2)} MB\n\nPlease compress the file and try again.`);
      return;
    }

    if (isVideo) {
        // 2. Duration check for videos
        const tempUrl = URL.createObjectURL(file);
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.onloadedmetadata = () => {
          URL.revokeObjectURL(tempUrl);
          if (tempVideo.duration > MAX_VIDEO_DURATION_SEC) {
            alert(`Γ¥î Video too long!\n\nMaximum duration: ${MAX_VIDEO_DURATION_SEC} seconds\nYour video: ${Math.round(tempVideo.duration)} seconds\n\nPlease trim the video and try again.`);
            return;
          }
          setter(file);
        };
        tempVideo.onerror = () => {
          URL.revokeObjectURL(tempUrl);
          setter(file);
        };
        tempVideo.src = tempUrl;
    } else {
        setter(file);
    }
  };

  const uploadFile = async (file: File, key: string) => {
    setIsUploading(true);
    setUploadProgress(prev => ({ ...prev, [key]: 10 }));
    
    let fileToUpload = file;

    // --- Image Compression Protocol ---
    if (file.type.startsWith('image/')) {
        const options = {
            maxSizeMB: 0.1, // Admins get slightly higher quality (100KB)
            maxWidthOrHeight: 1600,
            useWebWorker: true
        };
        try {
            fileToUpload = await imageCompression(file, options);
            console.log(`[Admin] Compressed image from ${(file.size / 1024).toFixed(2)}KB to ${(fileToUpload.size / 1024).toFixed(2)}KB`);
        } catch (e) {
            console.error('Compression failed', e);
        }
    }

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('fileName', `${Date.now()}-${file.name}`);

    try {
      setUploadProgress(prev => ({ ...prev, [key]: 30 }));
      const response = await fetch('/api/upload-video', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(prev => ({ ...prev, [key]: 80 }));
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Upload failed');

      setUploadProgress(prev => ({ ...prev, [key]: 100 }));
      return data.videoUrl;
    } catch (error: any) {
      alert(`Γ¥î Upload failed: ${error.message}`);
      return null;
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(prev => ({ ...prev, [key]: 0 })), 2000);
    }
  };

  const handleResetChallenge = async () => {
    if (!confirm("Are you sure? This will reset the challenge to Day 1, clear all leaderboard points, and remove all current submissions!")) return;
    
    try {
        // 1. Reset Challenge Start Date
        const { error: sE } = await supabase.from('challenge_settings').update({ 
            start_date: new Date().toISOString() 
        }).eq('id', 1);
        if (sE) throw sE;

        // 2. Clear Points for all non-admin users
        const { error: pE } = await supabase.from('profiles').update({ points: 0 }).neq('id', '00000000-0000-0000-0000-000000000000'); // Valid UUID string
        if (pE) throw pE;

        // 3. Clear Submissions (Delete everything)
        const { error: subE } = await supabase.from('submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (subE) throw subE;

        alert("Challenge Reset Successful! Batch started at Day 1.");
        window.location.reload();
    } catch (e: any) {
        console.error("Reset Error:", e);
        alert(`Failed to reset: ${e.message || 'Unknown database error'}`);
    }
  };

  const filteredTasks = tasks.filter(t => t.day === activeDay);

  const handleAddFlashCard = async () => {
    if (!newCardData.text.trim()) return;
    
    let videoUrl = newCardData.video_url;
    if (cardFile) {
        const uploadedUrl = await uploadFile(cardFile, 'card');
        if (!uploadedUrl) return; // Stop if upload failed
        videoUrl = uploadedUrl;
    } else if (!videoUrl) {
        videoUrl = null;
    }

    try {
        const { error } = await supabase.from('flashcards').insert([{ 
            text: newCardData.text, 
            description: newCardData.description,
            points: newCardData.points, 
            video_url: videoUrl,
            proof_mode: newCardData.proof_mode || 'both',
            type: "challenge",
            deadline: new Date(cardDeadline).toISOString(),
            target_user_id: targetClientId
        }]);
        
        if (error) {
            console.error('Broadcast Error:', error);
            alert(`Broadcast failed: ${error.message}`);
            return;
        }

        setNewCardData({ text: '', description: '', points: 50, video_url: null, proof_mode: 'both' }); 
        setCardFile(null);
        setIsAddingCard(false); 
    } catch(e) {
        console.error('System error during broadcast:', e);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskData.title.trim()) return;
    
    let videoUrl = newTaskData.video_url;
    if (taskFile) {
        const uploadedUrl = await uploadFile(taskFile, 'task');
        if (!uploadedUrl) return; // Stop if upload failed
        videoUrl = uploadedUrl;
    } else if (!videoUrl) {
        videoUrl = null;
    }

    const existingTask = tasks.find(t => t.day === activeDay && t.title.toLowerCase() === newTaskData.title.toLowerCase());
    let error = null;

    if (existingTask) {
        const { error: updateError } = await supabase.from('tasks').update({
            description: newTaskData.description,
            points: newTaskData.points, 
            video_url: videoUrl,
            proof_type: newTaskData.proof_type || 'image', 
            proof_mode: newTaskData.proof_mode || 'both',
        }).eq('id', existingTask.id);
        error = updateError;
    } else {
        const { error: insertError } = await supabase.from('tasks').insert([
          { 
            title: newTaskData.title, 
            description: newTaskData.description,
            points: newTaskData.points, 
            video_url: videoUrl,
            proof_type: newTaskData.proof_type || 'image', 
            proof_mode: newTaskData.proof_mode || 'both',
            week: activeWeek,
            day: activeDay 
          }
        ]);
        error = insertError;
    }

    if (!error) {
      setNewTaskData({ title: '', description: '', points: 15, video_url: null, proof_type: 'image', proof_mode: 'both' });
      setTaskFile(null);
      setIsAddingTask(false);
      fetchData();
    } else {
        alert(`Failed to save task: ${error.message}`);
    }
  };

  const deleteFlashCard = async (id: string) => {
    if (!confirm("Are you sure? This will remove this broadcast and all client interest data for it!")) return;
    await supabase.from('flashcards').delete().eq('id', id);
  };

  const deleteTask = async (id: string) => {
    if (!confirm("Are you sure? This will remove this protocol and ALL client submissions for it!")) return;
    await supabase.from('tasks').delete().eq('id', id);
  };

  const toggleTaskSelection = (id: string) => {
    setSelectedTaskIds(prev => 
      prev.includes(id) ? prev.filter(taskId => taskId !== id) : [...prev, id]
    );
  };

  const handleBatchAction = async () => {
    if (selectedTaskIds.length === 0) return;
    
    const targetWeek = Math.ceil(targetDay / 7);
    const selectedTasks = tasks.filter(t => selectedTaskIds.includes(t.id));
    
    try {
      if (batchActionType === 'copy') {
        const tasksToInsert = selectedTasks.map(t => ({
          title: t.title,
          points: t.points,
          video_url: t.video_url,
          proof_type: t.proof_type,
          day: targetDay,
          week: targetWeek
        }));
        const { error } = await supabase.from('tasks').insert(tasksToInsert);
        if (error) throw error;
        alert(`Successfully copied ${selectedTaskIds.length} tasks to Day ${targetDay}`);
      } else {
        const { error } = await supabase.from('tasks')
          .update({ day: targetDay, week: targetWeek })
          .in('id', selectedTaskIds);
        if (error) throw error;
        alert(`Successfully moved ${selectedTaskIds.length} tasks to Day ${targetDay}`);
      }
      
      setSelectedTaskIds([]);
      setIsBatchActionModalOpen(false);
      fetchData();
    } catch (e: any) {
      alert(`Batch action failed: ${e.message}`);
    }
  };

  const handleDirectAward = async () => {
    if (!awardData.userId || !awardData.points) {
        alert("Please select a user and point value.");
        return;
    }
    
    if (awardData.isTask && !awardFile) {
        alert("Please upload a photo proof for task assignments.");
        return;
    }

    let proofUrl = null;
    if (awardFile) {
        const uploadedUrl = await uploadFile(awardFile, 'award');
        if (!uploadedUrl) return;
        proofUrl = uploadedUrl;
    }

    try {
        // profiles.points is updated automatically by the DB trigger on manual_awards INSERT.
        // 1. Log award (trigger will recalculate profiles.points from this insert)
        const { data: mAward, error: mErr } = await supabase.from('manual_awards').insert({
            user_id: awardData.userId,
            points: Number(awardData.points),
            reason: awardData.reason || 'Admin Award',
            day: activeDay,
            week: activeWeek
        }).select().single();
        
        if (mErr) throw new Error(`Award failed: ${mErr.message}`);

        // 2. Update Central Ledger (audit trail only)
        const { error: ledgerErr } = await supabase.from('point_ledger').insert({
            user_id: awardData.userId,
            points: Number(awardData.points),
            source_type: 'manual_award',
            source_id: mAward?.id?.toString() || 'manual',
            reason: awardData.reason || 'Admin Award',
            day: activeDay,
            week: activeWeek
        });
        if (ledgerErr) console.error('Ledger Error:', ledgerErr);

        alert(`Successfully awarded ${awardData.points} points!`);
        setIsAwardingPoints(false);
        setAwardData({ userId: '', points: 100, reason: '', isTask: false });
        setAwardFile(null);
        fetchData();
    } catch (e: any) {
        alert(`Award failed: ${e.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
      
      {/* Supabase Storage Info Badge */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-[var(--hb-cream)] p-6 rounded-[20px] border border-[rgba(159,64,34,0.1)] gap-5">
          <div className="text-center md:text-left">
            <h4 style={{ margin: 0, fontSize: '13px', color: '#9f4022', fontWeight: 900, textTransform: 'uppercase' }}>ΓÜí Supabase Cloud Storage</h4>
            <p style={{ margin: 0, fontSize: '10px', color: 'rgba(83, 55, 43, 0.5)' }}>Videos and images are stored in Supabase Storage. Limits: <strong>2 MB Video</strong> ┬╖ <strong>1 MB Image</strong> ┬╖ 30s Duration.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'rgba(111, 142, 124, 0.1)', borderRadius: '12px', border: '1px solid rgba(111, 142, 124, 0.3)' }}>
            <Video size={14} style={{ color: '#6f8e7c' }} />
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#6f8e7c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Storage Active</span>
          </div>
      </div>

      {/* Flash Cards Section */}
      <div>
         <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <MessageSquareQuote size={24} color="#9f4022" />
            <h3 style={{ fontSize: '24px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wildcard Challenges</h3>
         </div>
         
         <div style={{ 
            background: '#3e2a1f', 
            borderRadius: '24px', 
            padding: '32px', 
            marginBottom: '40px', 
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            border: '1px solid rgba(201, 157, 93, 0.1)',
            display: 'grid',
            gridTemplateColumns: '180px 1fr 180px',
            alignItems: 'stretch',
            gap: '32px'
         }}>
            {/* Left: Branding */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Zap size={14} color="#c99d5d" fill="#c99d5d" />
                    <span style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#c99d5d' }}>Urgent Signal</span>
                </div>
                <h4 style={{ margin: 0, fontSize: '20px', fontFamily: "'Bodoni Moda', serif", fontStyle: 'italic', color: 'white', lineHeight: 1.2 }}>Quick Broadcast</h4>
            </div>
            
            {/* Center: Message & Duration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <textarea 
                    id="system-broadcast-msg"
                    placeholder="Broadcast an urgent message to all clients..."
                    style={{ 
                        width: '100%', 
                        flex: 1,
                        background: 'rgba(255,255,255,0.03)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        borderRadius: '16px', 
                        padding: '16px 20px', 
                        color: 'white', 
                        fontSize: '14px', 
                        resize: 'none', 
                        outline: 'none', 
                        transition: 'all 0.3s',
                        lineHeight: '1.5'
                    }}
                />
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '9px', fontWeight: '900', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Display For:</span>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '6px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <input 
                            type="number" 
                            id="broadcast-duration-val"
                            defaultValue="1"
                            min="1"
                            style={{ 
                                width: '35px', 
                                background: 'transparent', 
                                border: 'none', 
                                color: '#c99d5d', 
                                fontWeight: 'bold', 
                                fontSize: '14px',
                                outline: 'none'
                            }}
                        />
                        <select 
                            id="broadcast-duration-unit"
                            style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                color: 'white', 
                                fontSize: '10px', 
                                fontWeight: 'bold', 
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="1" style={{ color: 'black' }}>Minutes</option>
                            <option value="60" style={{ color: 'black' }}>Hours</option>
                        </select>
                    </div>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Auto-vanish after expiry.</span>
                </div>
            </div>
            
            {/* Right: Action */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
                <button 
                onClick={async () => {
                    const msg = (document.getElementById('system-broadcast-msg') as HTMLTextAreaElement).value;
                    const val = parseInt((document.getElementById('broadcast-duration-val') as HTMLInputElement).value) || 1;
                    const unit = parseInt((document.getElementById('broadcast-duration-unit') as HTMLSelectElement).value) || 1;
                    const totalMins = val * unit;

                    if (!msg.trim()) return;
                    
                    const { error } = await supabase.from('flashcards').insert([{ 
                        text: msg, 
                        type: 'alert', 
                        points: 0,
                        deadline: new Date(Date.now() + totalMins * 60000).toISOString()
                    }]);
                    
                    if (!error) {
                        (document.getElementById('system-broadcast-msg') as HTMLTextAreaElement).value = '';
                        alert(`Signal transmitted! Active for ${val} ${unit === 1 ? 'minutes' : 'hours'}.`);
                    } else {
                        alert(`Broadcast error: ${error.message}`);
                    }
                }}
                style={{ 
                    padding: '16px 32px',
                    background: '#c99d5d', 
                    color: '#3e2a1f', 
                    border: 'none', 
                    borderRadius: '16px', 
                    fontWeight: '900', 
                    fontSize: '12px', 
                    cursor: 'pointer', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.15em', 
                    transition: 'all 0.3s',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
                }}
                >
                Transmit
                </button>
            </div>
         </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

            <AnimatePresence mode="popLayout">
              {flashCards.map((card, idx) => (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: idx * 0.1 }}
                  className="premium-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    position: 'relative',
                    overflow: 'hidden',
                    padding: '24px'
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', backgroundColor: '#9f4022' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ width: '40px', height: '40px', backgroundColor: '#9f402210', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9f4022' }}>
                        <Award size={20} style={{ margin: 'auto' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '15px', color: '#53372b', fontWeight: 'bold' }}>"{card.text}"</p>
                        {card.description && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'rgba(83, 55, 43, 0.6)' }}>{card.description}</p>}
                        <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#9f4022', textTransform: 'uppercase', marginTop: '6px' }}>{card.points || 50} Points Wildcard</div>
                    </div>
                    <button 
                        onClick={() => deleteFlashCard(card.id)}
                        style={{ backgroundColor: 'transparent', border: 'none', color: '#53372b30', cursor: 'pointer' }}
                    >
                        <Trash2 size={16} />
                    </button>
                  </div>
                  {card.video_url && (
                    <div style={{ width: '100%', height: '180px', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                        <iframe src={card.video_url.replace('/view', '/preview')} style={{ width: '100%', height: '100%', border: 'none' }} />
                    </div>
                  )}
                </motion.div>
              ))}

              {isAddingCard && (
                <motion.div
                  key="add-card-form"
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="premium-card"
                  style={{
                    border: '2px solid #9f4022',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    padding: '24px'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                    <textarea 
                        autoFocus
                        placeholder="Type wildcard challenge message..."
                        value={newCardData.text}
                        onChange={(e) => setNewCardData({...newCardData, text: e.target.value})}
                        style={{ width: '100%', border: 'none', outline: 'none', fontSize: '15px', color: '#53372b', fontWeight: 'bold', backgroundColor: 'transparent', resize: 'none', minHeight: '60px' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Challenge Comment (Optional)</label>
                        <input 
                            type="text" 
                            placeholder="Add a comment or inner instructions..."
                            value={newCardData.description}
                            onChange={(e) => setNewCardData({...newCardData, description: e.target.value})}
                            style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(83, 55, 43, 0.05)', fontSize: '13px', color: '#53372b' }}
                        />
                    </div>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Challenge Points</span>
                            <input 
                                type="number" 
                                value={newCardData.points}
                                onChange={(e) => setNewCardData({...newCardData, points: parseInt(e.target.value)})}
                                style={{ width: '60px', padding: '10px', borderRadius: '12px', border: '1px solid rgba(83, 55, 43, 0.05)', textAlign: 'center' }}
                            />
                        </div>

                        {/* Targeted User Dropdown */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Target Client (Optional)</span>
                            <select 
                                value={targetClientId || ''}
                                onChange={(e) => setTargetClientId(e.target.value || null)}
                                style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(83, 55, 43, 0.05)', fontSize: '11px', fontWeight: 'bold', color: '#53372b', background: 'white' }}
                            >
                                <option value="">EVERYONE (Public Broadcast)</option>
                                {members.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Deadline Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Deadline</span>
                            <input 
                                type="datetime-local"
                                value={cardDeadline}
                                onChange={(e) => setCardDeadline(e.target.value)}
                                style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(83, 55, 43, 0.05)', fontSize: '11px', fontWeight: 'bold', color: '#53372b' }}
                            />
                        </div>
                        

                        {/* Proof Mode Selector */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Proof Submission Mode</span>
                            <div style={{ display: 'flex', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(159, 64, 34, 0.15)', width: 'fit-content' }}>
                                {(['capture', 'upload', 'both', 'checkbox'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setNewCardData({ ...newCardData, proof_mode: mode })}
                                        style={{
                                            padding: '8px 16px',
                                            fontSize: '9px',
                                            fontWeight: '900',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.08em',
                                            border: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            background: newCardData.proof_mode === mode ? '#9f4022' : 'rgba(159, 64, 34, 0.04)',
                                            color: newCardData.proof_mode === mode ? 'white' : 'rgba(83, 55, 43, 0.5)',
                                        }}
                                    >
                                        {mode === 'capture' ? '≡ƒô╖ Capture' : mode === 'upload' ? 'Γ¼å Upload' : mode === 'checkbox' ? 'Γÿæ Checkbox' : 'Γ£ª Both'}
                                    </button>
                                ))}
                            </div>
                            <span style={{ fontSize: '9px', color: 'rgba(83,55,43,0.35)', fontWeight: '600' }}>
                                {newCardData.proof_mode === 'capture' && 'Client must use camera ΓÇö no gallery access'}
                                {newCardData.proof_mode === 'upload' && 'Client can upload any saved photo or file'}
                                {newCardData.proof_mode === 'both' && 'Client can capture or upload ΓÇö their choice'}
                                {newCardData.proof_mode === 'checkbox' && 'NO PHOTO: Client clicks a checkbox for INSTANT approval'}
                            </span>
                        </div>

                        <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <input 
                                    type="file" 
                                    accept="video/*,image/*"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) validateAndSetFile(f, setCardFile);
                                      e.target.value = ''; // reset so same file can be re-selected after error
                                    }}
                                    style={{ display: 'none' }}
                                    id="card-video-upload"
                                />
                                <label 
                                    htmlFor="card-video-upload"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', background: cardFile ? '#f0f0f0' : 'rgba(159, 64, 34, 0.05)', color: '#9f4022', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid rgba(159, 64, 34, 0.1)' }}
                                >
                                    <Video size={14} /> {cardFile ? cardFile.name : "SELECT MEDIA (OPTIONAL)"}
                                </label>
                            <span style={{ fontSize: '9px', color: 'rgba(83,55,43,0.4)', fontWeight: 'bold', letterSpacing: '0.05em' }}>MAX 30 SEC ┬╖ VID 2MB ┬╖ IMG 1MB</span>
                        </div>
                    </div>
                  </div>

                  {uploadProgress['card'] > 0 && (
                      <div style={{ width: '100%', height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${uploadProgress['card']}%`, height: '100%', background: '#9f4022', transition: 'width 0.3s' }} />
                      </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                     <button onClick={() => setIsAddingCard(false)} style={{ fontSize: '10px', fontWeight: 'bold', border: 'none', background: 'transparent', color: 'rgba(83, 55, 43, 0.4)', cursor: 'pointer', padding: '8px' }}>CANCEL</button>
                     <button onClick={handleAddFlashCard} disabled={isUploading} style={{ fontSize: '10px', fontWeight: 'bold', border: 'none', background: '#9f4022', color: 'white', borderRadius: '8px', padding: '8px 16px', cursor: isUploading ? 'not-allowed' : 'pointer', opacity: isUploading ? 0.7 : 1 }}>
                        {isUploading ? 'PREPARING...' : 'DEPLOY WILDCARD'}
                     </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {!isAddingCard && (
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsAddingCard(true)}
                style={{ 
                  background: 'rgba(159, 64, 34, 0.05)',
                  borderRadius: '16px',
                  padding: '24px',
                  border: '2px dashed #9f402230',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: '#9f4022',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  cursor: 'pointer'
                }}
              >
                 <Plus size={16} /> INITIALIZE NEW WILDCARD
              </motion.button>
            )}
         </div>
      </div>


      {/* Direct Points Section */}
      <div>
         <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <Award size={24} color="#9f4022" />
            <h3 style={{ fontSize: '24px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Honor Awards & Manual Tasks</h3>
         </div>

         {!isAwardingPoints ? (
             <motion.button 
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setIsAwardingPoints(true)}
                style={{ 
                    width: '100%',
                    padding: '24px',
                    borderRadius: '20px',
                    background: 'white',
                    border: '1px solid rgba(83, 55, 43, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    color: '#9f4022',
                    fontSize: '12px',
                    fontWeight: '900',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    cursor: 'pointer',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.03)'
                }}
             >
                <Plus size={18} /> INITIALIZE MANUAL POINT GRANT
             </motion.button>
         ) : (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="premium-card"
                style={{ padding: '32px', border: '2px solid #9f4022', background: '#fcfaf5' }}
            >
                <h4 style={{ margin: '0 0 24px 0', fontSize: '14px', fontWeight: '900', color: '#9f4022', textTransform: 'uppercase' }}>Direct Point Allocation</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Target Client</label>
                        <select 
                            value={awardData.userId}
                            onChange={(e) => setAwardData({...awardData, userId: e.target.value})}
                            style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', background: 'white', fontSize: '14px', color: '#53372b' }}
                        >
                            <option value="">-- SELECT CLIENT --</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Point Value</label>
                        <input 
                            type="number" 
                            value={awardData.points}
                            onChange={(e) => setAwardData({...awardData, points: parseInt(e.target.value)})}
                            style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', fontSize: '14px', color: '#53372b' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Allocation Type</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                                onClick={() => setAwardData({...awardData, isTask: false})}
                                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid', borderColor: !awardData.isTask ? '#9f4022' : 'rgba(0,0,0,0.05)', background: !awardData.isTask ? '#9f4022' : 'white', color: !awardData.isTask ? 'white' : '#53372b', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                NOT A TASK
                            </button>
                            <button 
                                onClick={() => setAwardData({...awardData, isTask: true})}
                                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid', borderColor: awardData.isTask ? '#9f4022' : 'rgba(0,0,0,0.05)', background: awardData.isTask ? '#9f4022' : 'white', color: awardData.isTask ? 'white' : '#53372b', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                TASK CREDIT
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Reason / Memo</label>
                        <input 
                            type="text" 
                            placeholder="e.g. Exceptional community contribution or offsite activity check..."
                            value={awardData.reason}
                            onChange={(e) => setAwardData({...awardData, reason: e.target.value})}
                            style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', fontSize: '14px', color: '#53372b' }}
                        />
                    </div>

                    {awardData.isTask && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Task Proof Photo (Mandatory for Tasks)</label>
                            <input 
                                type="file" 
                                accept="image/*"
                                id="award-file-upload"
                                onChange={(e) => setAwardFile(e.target.files?.[0] || null)}
                                style={{ display: 'none' }}
                            />
                            <label 
                                htmlFor="award-file-upload"
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '12px', border: '1px dashed #9f4022', background: awardFile ? '#e8ecef' : 'white', cursor: 'pointer', fontSize: '13px', color: '#53372b' }}
                            >
                                <Camera size={16} /> {awardFile ? awardFile.name : "ATTACH PROOF IMAGE"}
                            </label>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '32px' }}>
                    <button onClick={() => setIsAwardingPoints(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(83, 55, 43, 0.4)', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', padding: '10px 20px' }}>CANCEL</button>
                    <button 
                        onClick={handleDirectAward} 
                        disabled={isUploading}
                        style={{ background: '#9f4022', border: 'none', color: 'white', fontWeight: '900', fontSize: '12px', cursor: 'pointer', padding: '12px 32px', borderRadius: '12px', boxShadow: '0 8px 16px rgba(159, 64, 34, 0.2)', textTransform: 'uppercase' }}
                    >
                        {isUploading ? 'UPLOADING PROOF...' : 'GRANT POINTS'}
                    </button>
                </div>
            </motion.div>
         )}
      </div>

      {/* Task Stack Section */}
      <div>
         <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '32px', marginBottom: '40px', borderBottom: '1px solid rgba(83, 55, 43, 0.05)', paddingBottom: '32px' }}>
            <div>
               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LayoutList size={22} color="#9f4022" />
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#9f4022', textTransform: 'uppercase', letterSpacing: '0.4em' }}>HABIT STACK MANAGEMENT</span>
                  </div>
                  <button 
                    onClick={handleResetChallenge}
                    style={{ background: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb', padding: '10px 20px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}
                  >
                    <Trash2 size={14} /> RESET FOR NEW BATCH
                  </button>
               </div>
               <h3 style={{ fontSize: '32px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Protocol Blueprint</h3>
               {/* Fixed date for synchronizing global calendar */}
               <p style={{ fontSize: '12px', color: '#9f4022', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px' }}>
                 {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
               </p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Jump to specific day in protocol</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: '8px' }}>
                {Array.from({ length: 21 }, (_, i) => i + 1).map(day => (
                    <button
                        key={day}
                        onClick={() => {
                            setActiveDay(day);
                            setActiveWeek(Math.ceil(day / 7));
                        }}
                        style={{
                            padding: '10px 4px',
                            borderRadius: '8px',
                            border: '1px solid rgba(0,0,0,0.05)',
                            backgroundColor: activeDay === day ? '#53372b' : '#f5f2e9',
                            color: activeDay === day ? 'white' : '#53372b',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'center'
                        }}
                    >
                        D{day}
                    </button>
                ))}
                </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <AnimatePresence mode="popLayout">
              {filteredTasks.filter(t => t.day === activeDay).map((task, idx) => (
                   <motion.div
                     key={task.id}
                     layout
                     initial={{ opacity: 0, x: -20 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: 20 }}
                     transition={{ delay: idx * 0.1 }}
                     className="premium-card"
                     style={{
                       padding: '20px',
                       display: 'flex',
                       flexDirection: 'column',
                       gap: '16px',
                       border: selectedTaskIds.includes(task.id) ? '2px solid #9f4022' : '1px solid rgba(198, 198, 198, 0.2)',
                       boxShadow: selectedTaskIds.includes(task.id) ? '0 8px 24px rgba(159, 64, 34, 0.12)' : '0 4px 12px rgba(83, 55, 43, 0.05)'
                     }}
                   >
                     <div className="flex flex-col md:flex-row md:items-center gap-6">
                         <div className="flex items-center gap-6 flex-1">
                            <div 
                               onClick={() => toggleTaskSelection(task.id)}
                               style={{ 
                                 width: '24px', 
                                 height: '24px', 
                                 borderRadius: '6px', 
                                 border: '2px solid #9f4022', 
                                 display: 'flex', 
                                 alignItems: 'center', 
                                 justifyContent: 'center', 
                                 cursor: 'pointer',
                                 backgroundColor: selectedTaskIds.includes(task.id) ? '#9f4022' : 'transparent',
                                 transition: 'all 0.2s'
                               }}
                            >
                              {selectedTaskIds.includes(task.id) && <Check size={14} color="white" />}
                            </div>
                            <GripVertical size={20} color="rgba(83, 55, 43, 0.15)" />
                            <div>
                               <p style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#53372b' }}>{task.title}</p>
                               {task.description && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'rgba(83, 55, 43, 0.6)' }}>{task.description}</p>}
                               <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>
                                     <Clock size={12} /> Blueprint Task ┬╖ Day {task.day}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 'bold', color: '#9f4022', textTransform: 'uppercase' }}>
                                     <Camera size={12} /> Mode: {task.proof_mode || 'both'}
                                  </div>
                               </div>
                            </div>
                         </div>
                         <div className="flex items-center justify-between md:justify-end gap-8">
                            <div style={{ textAlign: 'right' }}>
                               <p style={{ margin: 0, fontSize: '9px', fontWeight: 'extrabold', color: 'rgba(83, 55, 43, 0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Value</p>
                               <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#9f4022', fontFamily: "'Bodoni Moda', serif" }}>{task.points} PTS</p>
                            </div>
                            <button 
                              onClick={() => deleteTask(task.id)}
                              style={{ backgroundColor: 'transparent', border: 'none', color: '#53372b30', cursor: 'pointer' }}
                            >
                              <Trash2 size={18} />
                            </button>
                         </div>
                     </div>

                    {task.video_url && (
                        <div style={{ width: '100%', height: '180px', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                            <iframe src={task.video_url.replace('/view', '/preview')} style={{ width: '100%', height: '100%', border: 'none' }} />
                        </div>
                    )}
                 </motion.div>
              ))}

              {isAddingTask && (
                <motion.div
                  key="add-task-form"
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: '#fcfaf5',
                    borderRadius: '24px',
                    padding: '32px',
                    border: '2px solid #9f4022',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                    boxShadow: '0 20px 40px rgba(159, 64, 34, 0.08)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h4 style={{ fontSize: '14px', fontWeight: '900', color: '#9f4022', textTransform: 'uppercase', margin: 0 }}>Deploy Wildcard Protocol</h4>
                     <select 
                        onChange={(e) => {
                          const template = protocolTemplates.find(t => t.title === e.target.value);
                          if (template) setNewTaskData({ ...newTaskData, title: template.title, points: template.points, proof_type: template.proof === 'photo' ? 'image' : template.proof });
                        }}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(83, 55, 43, 0.1)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        <option value="">-- Apply Template --</option>
                        {protocolTemplates.map(t => <option key={t.title} value={t.title}>{t.title}</option>)}
                      </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-5">
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Task Title</label>
                        <input 
                           type="text" 
                           placeholder="Enter task name..." 
                           value={newTaskData.title}
                           onChange={(e) => setNewTaskData({...newTaskData, title: e.target.value})}
                           style={{ padding: '12px', borderRadius: '10px', border: '1px solid rgba(83, 55, 43, 0.1)', fontSize: '14px', color: '#53372b', background: 'var(--hb-cream)' }}
                        />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Task Comment (Optional)</label>
                        <input 
                           type="text" 
                           placeholder="Add inner details or comments..." 
                           value={newTaskData.description}
                           onChange={(e) => setNewTaskData({...newTaskData, description: e.target.value})}
                           style={{ padding: '12px', borderRadius: '10px', border: '1px solid rgba(83, 55, 43, 0.1)', fontSize: '14px', color: '#53372b', background: 'var(--hb-cream)' }}
                        />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                         <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Points</label>
                         <input 
                            type="number" 
                            value={newTaskData.points}
                            onChange={(e) => setNewTaskData({...newTaskData, points: parseInt(e.target.value)})}
                            style={{ padding: '12px', borderRadius: '10px', border: '1px solid rgba(83, 55, 43, 0.1)', fontSize: '14px', color: '#53372b' }}
                         />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(83, 55, 43, 0.4)', textTransform: 'uppercase' }}>Protocol Media (Optional)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <input 
                                 type="file" 
                                 accept="video/*,image/*"
                                 onChange={(e) => {
                                   const f = e.target.files?.[0];
                                   if (f) validateAndSetFile(f, setTaskFile);
                                   e.target.value = '';
                                 }}
                                 style={{ display: 'none' }}
                                 id="task-video-upload"
                              />
                               <label 
                                 htmlFor="task-video-upload"
                                 style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '10px', background: taskFile ? '#e8ecef' : 'white', border: '1px solid rgba(83, 55, 43, 0.1)', fontSize: '14px', color: '#53372b', cursor: 'pointer' }}
                              >
                                  <Video size={16} /> {taskFile ? taskFile.name : "SELECT MEDIA FROM DEVICE (OPTIONAL)"}
                              </label>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                  <button 
                                    onClick={() => setNewTaskData({...newTaskData, proof_mode: 'capture'})}
                                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid', borderColor: newTaskData.proof_mode === 'capture' ? '#9f4022' : 'rgba(83, 55, 43, 0.05)', background: newTaskData.proof_mode === 'capture' ? '#9f4022' : 'white', color: newTaskData.proof_mode === 'capture' ? 'white' : '#53372b', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                                  >
                                    CAPTURE
                                  </button>
                                  <button 
                                    onClick={() => setNewTaskData({...newTaskData, proof_mode: 'upload'})}
                                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid', borderColor: newTaskData.proof_mode === 'upload' ? '#9f4022' : 'rgba(83, 55, 43, 0.05)', background: newTaskData.proof_mode === 'upload' ? '#9f4022' : 'white', color: newTaskData.proof_mode === 'upload' ? 'white' : '#53372b', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                                  >
                                    UPLOAD
                                  </button>
                                  <button 
                                    onClick={() => setNewTaskData({...newTaskData, proof_mode: 'both'})}
                                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid', borderColor: newTaskData.proof_mode === 'both' ? '#9f4022' : 'rgba(83, 55, 43, 0.05)', background: newTaskData.proof_mode === 'both' ? '#9f4022' : 'white', color: newTaskData.proof_mode === 'both' ? 'white' : '#53372b', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                                  >
                                    BOTH
                                  </button>
                                  <button 
                                    onClick={() => setNewTaskData({...newTaskData, proof_mode: 'checkbox'})}
                                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid', borderColor: newTaskData.proof_mode === 'checkbox' ? '#9f4022' : 'rgba(83, 55, 43, 0.05)', background: newTaskData.proof_mode === 'checkbox' ? '#9f4022' : 'white', color: newTaskData.proof_mode === 'checkbox' ? 'white' : '#53372b', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                                  >
                                    CHECKBOX
                                  </button>
                               </div>
                            </div>
                            <span style={{ fontSize: '9px', color: 'rgba(83,55,43,0.4)', fontWeight: 'bold', letterSpacing: '0.05em', paddingLeft: '2px' }}>MAX 30 SECONDS ┬╖ VID 2MB ┬╖ IMG 1MB</span>
                         </div>
                        {uploadProgress['task'] > 0 && (
                            <div style={{ width: '100%', height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden', marginTop: '8px' }}>
                                <div style={{ width: `${uploadProgress['task']}%`, height: '100%', background: '#9f4022', transition: 'width 0.3s' }} />
                            </div>
                        )}
                      </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                     <button onClick={() => setIsAddingTask(false)} style={{ fontSize: '11px', fontWeight: 'bold', border: 'none', background: 'transparent', color: 'rgba(83, 55, 43, 0.4)', cursor: 'pointer', padding: '12px 24px' }}>CANCEL</button>
                     <button onClick={handleAddTask} disabled={isUploading} style={{ fontSize: '11px', fontWeight: 'bold', border: 'none', background: '#9f4022', color: 'white', borderRadius: '12px', padding: '12px 32px', cursor: isUploading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(159, 64, 34, 0.2)', opacity: isUploading ? 0.7 : 1 }}>
                        {isUploading ? 'PREPARING...' : `DEPLOY TO WEEK ${activeWeek} DAY ${activeDay}`}
                     </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {!isAddingTask && (
              <motion.button 
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setIsAddingTask(true)}
                style={{ 
                  padding: '24px',
                  borderRadius: '16px',
                  border: '2px dashed rgba(83, 55, 43, 0.1)',
                  backgroundColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: 'rgba(83, 55, 43, 0.3)',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  cursor: 'pointer',
                  marginTop: '16px'
                }}
              >
                 <Plus size={16} /> ADD NEW PROTOCOL TASK
              </motion.button>
            )}
          </div>

          {/* Batch Action Floating Toolbar */}
          <AnimatePresence>
            {selectedTaskIds.length > 0 && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                style={{
                  position: 'fixed',
                  bottom: '40px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 1000,
                  background: '#3e2a1f',
                  padding: '16px 32px',
                  borderRadius: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '24px',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                  border: '1px solid rgba(201, 157, 93, 0.2)'
                }}
              >
                <div style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ backgroundColor: '#9f4022', color: 'white', padding: '4px 10px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold' }}>{selectedTaskIds.length}</div>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasks Selected</span>
                </div>
                
                <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={() => { setBatchActionType('copy'); setIsBatchActionModalOpen(true); }}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px 20px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}
                  >
                    Copy to Day...
                  </button>
                  <button 
                    onClick={() => { setBatchActionType('move'); setIsBatchActionModalOpen(true); }}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px 20px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}
                  >
                    Move to Day...
                  </button>
                  <button 
                    onClick={() => setSelectedTaskIds([])}
                    style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', padding: '10px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Batch Action Modal */}
          <AnimatePresence>
            {isBatchActionModalOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 2000,
                  background: 'rgba(0,0,0,0.8)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px'
                }}
              >
                <motion.div
                  initial={{ scale: 0.95, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 20 }}
                  style={{
                    background: 'white',
                    width: '100%',
                    maxWidth: '430px',
                    borderRadius: '32px',
                    padding: '40px',
                    textAlign: 'center',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.3)'
                  }}
                >
                  <div style={{ width: '60px', height: '60px', backgroundColor: 'rgba(159, 64, 34, 0.1)', color: '#9f4022', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                    <Calendar size={28} />
                  </div>
                  
                  <h3 style={{ fontSize: '24px', fontFamily: "'Bodoni Moda', serif", color: '#53372b', fontWeight: '900', marginBottom: '12px', textTransform: 'uppercase' }}>
                    {batchActionType === 'copy' ? 'Batch Copy' : 'Batch Move'}
                  </h3>
                  <p style={{ color: 'rgba(83, 55, 43, 0.5)', fontSize: '14px', marginBottom: '32px' }}>
                    Select the destination day for your {selectedTaskIds.length} selected tasks.
                  </p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '40px' }}>
                    {Array.from({ length: 21 }, (_, i) => i + 1).map(day => (
                      <button
                        key={day}
                        onClick={() => setTargetDay(day)}
                        style={{
                          padding: '10px 0',
                          borderRadius: '8px',
                          border: '1px solid rgba(0,0,0,0.05)',
                          backgroundColor: targetDay === day ? '#9f4022' : '#fcfaf5',
                          color: targetDay === day ? 'white' : '#53372b',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        D{day}
                      </button>
                    ))}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      onClick={() => setIsBatchActionModalOpen(false)}
                      style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', color: 'rgba(83, 55, 43, 0.4)', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
                    >
                      CANCEL
                    </button>
                    <button 
                      onClick={handleBatchAction}
                      style={{ flex: 1, padding: '16px', borderRadius: '16px', border: 'none', background: '#9f4022', color: 'white', fontWeight: '900', fontSize: '12px', cursor: 'pointer', boxShadow: '0 8px 16px rgba(159, 64, 34, 0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                    >
                      CONFIRM
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
       </div>
    </div>
  );
}
