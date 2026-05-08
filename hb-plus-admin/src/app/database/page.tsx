"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, Search, RefreshCw, Table, ChevronRight, LayoutDashboard, ShieldAlert, X, Trophy, History, Settings, Users, BarChart3, Radio, Wifi, WifiOff } from "lucide-react";
import { getAllEntities } from "@/lib/azureDb";
import { useSync } from "@/hooks/useSync";
import Link from "next/link";

// Map display name -> actual Azure table name
const TABLES = [
  { label: "profiles",           azure: "profiles" },
  { label: "submissions",        azure: "submissions" },
  { label: "tasks",              azure: "tasks" },
  { label: "flashcards",         azure: "flashcards" },
  { label: "manual awards",      azure: "manual_awards" },
  { label: "point ledger",       azure: "PointLedger" },
  { label: "clans",              azure: "clans" },
  { label: "challenge settings", azure: "challenge_settings" },
];

const SUPER_ADMIN = "subit.pradhan@hbplus.fit";

export default function DatabasePage() {
  const [selectedTable, setSelectedTable] = useState<string>("profiles");
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [editBuffer, setEditBuffer] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [batches, setBatches] = useState<any[]>([]);

  // --- Real-time Sync Setup ---
  const { isConnected, isFallbackActive, notifyUpdate } = useSync({
    table: selectedTable,
    onUpdate: () => fetchData(true), // silent refresh
    socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001'
  });

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    if (isAuthorized) fetchData();
  }, [isAuthorized, selectedTable, selectedBatch]);

  const checkAccess = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const session = await res.json();
      if (session.authenticated && (session.user?.email === SUPER_ADMIN || session.user?.email === "subit.pradhan@hbplus.fit")) {
        setUser(session.user);
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
    } catch {
      setIsAuthorized(false);
    }
  };

  const fetchData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      if (selectedTable === "POINTS_VIEW") {
        const [profiles, submissions, awards] = await Promise.all([
          getAllEntities('Profiles'),
          getAllEntities('Submissions'),
          getAllEntities('ManualAwards')
        ]);
        const pointsMap: Record<string, number> = {};
        submissions.forEach((s: any) => {
          if (s.status === 'approved') {
            const uid = s.userId || s.user_id || s.PartitionKey;
            pointsMap[uid] = (pointsMap[uid] || 0) + (Number(s.points) || 0);
          }
        });
        awards.forEach((a: any) => {
          const uid = a.userId || a.user_id || a.PartitionKey;
          pointsMap[uid] = (pointsMap[uid] || 0) + (Number(a.points) || 0);
        });
        const pointsTable = profiles.map((p: any) => ({
          name: p.name || 'Unknown',
          id: p.RowKey,
          points: pointsMap[p.RowKey] || 0,
          created_at: p.created_at || p.Timestamp || '-',
          email: p.email || 'No Email',
          team_name: p.team_name || 'Independent',
          streak: p.streak || 0
        })).sort((a: any, b: any) => b.points - a.points);
        setData(pointsTable);

      } else if (selectedTable === "ANALYTICS_VIEW") {
        const [profiles, submissions, tasks] = await Promise.all([
          getAllEntities('Profiles'),
          getAllEntities('Submissions'),
          getAllEntities('Tasks')
        ]);

        // Build task points map
        const taskPointsMap: Record<string, number> = {};
        const taskTitleMap: Record<string, string> = {};
        tasks.forEach((t: any) => {
          const tid = t.rowKey || t.RowKey;
          taskPointsMap[tid] = Number(t.points) || 0;
          taskTitleMap[tid] = t.title || t.Title || '';
        });

        const analyticsMap: Record<string, any> = {};
        profiles.forEach((p: any) => {
          analyticsMap[p.rowKey || p.RowKey] = { name: p.name || 'Unknown', email: p.email || '-', task_points: 0, wildcard_points: 0, manual_points: 0, total_points: 0, tasks_completed: 0 };
        });
        submissions.forEach((s: any) => {
          const uid = s.userId || s.user_id || s.partitionKey;
          if (!analyticsMap[uid] || s.status !== 'approved') return;
          const taskId = s.task_id || s.taskId;
          const pts = taskPointsMap[taskId] || 0;
          if (s.flashcard_id || s.flashcardId) analyticsMap[uid].wildcard_points += pts;
          else analyticsMap[uid].task_points += pts;
          analyticsMap[uid].total_points += pts;
          analyticsMap[uid].tasks_completed += 1;
        });
        const analyticsTable = Object.values(analyticsMap).map((a: any) => ({
          name: a.name, total_points: a.total_points, task_points: a.task_points, wildcard_points: a.wildcard_points, manual_points: a.manual_points, tasks_done: a.tasks_completed, email: a.email
        })).sort((a: any, b: any) => b.total_points - a.total_points);
        setData(analyticsTable);

      } else if (selectedTable === "MARKETING_VIEW") {
        const [profiles, submissions, allFlashcards] = await Promise.all([
          getAllEntities('Profiles'),
          getAllEntities('Submissions'),
          getAllEntities('Flashcards')
        ]);

        const batchList = allFlashcards.filter((f: any) => f.partitionKey === 'CONFIG_BATCH' || f.PartitionKey === 'CONFIG_BATCH');
        setBatches(batchList);
        if (!selectedBatch && batchList.length > 0) setSelectedBatch(batchList[0].rowKey || batchList[0].RowKey);

        const targetBatch = selectedBatch || (batchList[0]?.rowKey || batchList[0]?.RowKey);
        
        const marketingData = submissions
          .filter((s: any) => s.status === 'approved' && s.file_url)
          .map((s: any) => {
            const profile = profiles.find((p: any) => (p.rowKey || p.RowKey) === s.user_id);
            if (targetBatch && profile?.batch_id !== targetBatch) return null;
            return {
              id: s.rowKey || s.RowKey,
              url: s.file_url,
              user_name: profile?.name || 'Unknown',
              batch_id: profile?.batch_id || 'Unknown',
              task_id: s.task_id || s.flashcard_id || 'Manual',
              uploaded_at: s.created_at || s.Timestamp
            };
          })
          .filter(Boolean);
          
        setData(marketingData);

      } else if (selectedTable === 'point_ledger') {
        // Reconstruct audit trail: Submissions (approved) cross-referenced with Tasks for reason+points
        const [submissions, tasks, profiles] = await Promise.all([
          getAllEntities('Submissions'),
          getAllEntities('Tasks'),
          getAllEntities('Profiles')
        ]);

        // Build lookup maps
        const nameMap: Record<string, string> = {};
        profiles.forEach((p: any) => { nameMap[p.rowKey || p.RowKey] = p.name || 'Unknown'; });

        const taskMap: Record<string, any> = {};
        tasks.forEach((t: any) => { taskMap[t.rowKey || t.RowKey || t.id] = t; });

        const ledger: any[] = [];
        submissions.forEach((s: any, idx: number) => {
          if (s.status !== 'approved') return;
          const uid = s.user_id || s.userId || s.partitionKey;
          const taskId = s.task_id || s.taskId;
          const task = taskMap[taskId] || {};
          ledger.push({
            idx: idx,
            id: s.rowKey || s.id,
            user_id: uid,
            user_name: nameMap[uid] || '-',
            points: task.points || 0,
            source_type: 'task',
            reason: task.title || task.Title || taskId || '-',
            day: task.day || s.day || '-',
            week: task.week || s.week || '-',
            created_at: s.processed_at || s.created_at || '-'
          });
        });

        // Sort latest first
        ledger.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        // Re-assign idx after sort
        ledger.forEach((row, i) => { row.idx = i; });
        setData(ledger);

      } else {
        // Map display table names to actual Azure table names (PascalCase, no underscores)
        const azureNameMap: Record<string, string> = {
          profiles: 'Profiles',
          submissions: 'Submissions',
          tasks: 'Tasks',
          flashcards: 'Flashcards',
          manual_awards: 'ManualAwards',
          clans: 'Clans',
          challenge_settings: 'ChallengeSettings'
        };
        const azureTable = azureNameMap[selectedTable] || selectedTable;
        const result = await getAllEntities(azureTable);
        setData(result || []);
      }
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleMassDelete = async () => {
    const confirm = window.confirm(`WARNING: You are about to permanently DELETE ${selectedRows.size} records from the ${selectedTable} table. This action cannot be undone. Proceed?`);
    if (!confirm) return;

    setIsDeleting(true);
    try {
        const azureNameMap: Record<string, string> = {
            profiles: 'Profiles',
            submissions: 'Submissions',
            tasks: 'Tasks',
            flashcards: 'Flashcards',
            manual_awards: 'ManualAwards',
            clans: 'Clans',
            challenge_settings: 'ChallengeSettings'
        };
        const azureTable = azureNameMap[selectedTable] || selectedTable;
        
        // Batch delete simulation (sequentially for safety)
        const ids = Array.from(selectedRows);
        for (const id of ids) {
            // We need PartitionKey for deletion. For these tables, it's usually static or mapped.
            const row = data.find(r => (r.rowKey || r.RowKey || r.id) === id);
            if (row) {
                const pk = row.partitionKey || row.PartitionKey;
                // Use the existing delete tool logic
                await fetch(`/api/azure?table=${encodeURIComponent(azureTable)}&partitionKey=${encodeURIComponent(pk)}&rowKey=${encodeURIComponent(id)}`, { method: 'DELETE' });
            }
        }
        
        setSelectedRows(new Set());
        fetchData();
        alert(`Successfully purged ${ids.length} records.`);
    } catch (e: any) {
        alert(`Partial failure: ${e.message}`);
    }
    setIsDeleting(false);
  };

  const handleMassDownload = (specificUrls?: string[]) => {
    const urls = specificUrls || filteredData.map(item => item.url).filter(Boolean);
    if (urls.length === 0) return;

    const confirm = window.confirm(`Prepare for download: This will attempt to open ${urls.length} images in your browser. Ensure your popup blocker is disabled. Continue?`);
    if (!confirm) return;

    urls.forEach((url, i) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.download = `Batch_Asset_${i}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, i * 200); // Stagger to prevent browser freezing
    });
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
        const azureNameMap: Record<string, string> = {
            profiles: 'Profiles',
            submissions: 'Submissions',
            tasks: 'Tasks',
            flashcards: 'Flashcards',
            manual_awards: 'ManualAwards',
            clans: 'Clans',
            challenge_settings: 'ChallengeSettings'
        };
        const azureTable = azureNameMap[selectedTable] || selectedTable;
        
        await fetch('/api/azure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: azureTable, entity: editBuffer })
        });
        
        setSelectedRow(editBuffer);
        setIsEditingRecord(false);
        fetchData(true);
        alert('Record updated successfully!');
    } catch (e: any) {
        alert('Failed to save changes: ' + e.message);
    }
    setIsSaving(false);
  };

  if (isAuthorized === false) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fcfaf5', padding: '40px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <ShieldAlert size={64} color="#9f4022" style={{ marginBottom: '24px' }} />
          <h1 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: '32px', color: '#53372b' }}>Access Restricted</h1>
          <p style={{ color: '#999', fontSize: '14px', lineHeight: '1.6', marginBottom: '32px' }}>
            Only the Root Administrator (**{SUPER_ADMIN}**) has clearance to access the raw Azure Data Explorer.
          </p>
          <Link href="/" style={{ padding: '16px 32px', background: '#9f4022', color: 'white', borderRadius: '16px', textDecoration: 'none', fontWeight: 'bold' }}>
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isAuthorized === null) return null;

  const filteredData = data.filter(row => 
    JSON.stringify(row).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = data.length > 0 
    ? Object.keys(data[0])
        .filter(k => k !== 'odata.metadata' && k !== 'etag' && k !== 'PartitionKey' && k !== 'RowKey' && k !== 'Timestamp')
        .sort((a, b) => {
          let priority = ['name', 'id', 'user_id', 'points', 'reason', 'created_at', 'email', 'team_name', 'streak'];
          
          if (selectedTable === 'point_ledger') {
            priority = ['id', 'user_id', 'points', 'reason', 'source_type', 'source_id', 'day', 'week', 'created_at'];
          } else if (selectedTable === 'POINTS_VIEW') {
            priority = ['name', 'id', 'points', 'created_at', 'email', 'team_name', 'streak'];
          } else if (selectedTable === 'ANALYTICS_VIEW') {
            priority = ['name', 'total_points', 'task_points', 'wildcard_points', 'manual_points', 'tasks_done', 'avg_hours', 'email'];
          }

          const indexA = priority.indexOf(a.toLowerCase());
          const indexB = priority.indexOf(b.toLowerCase());
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return a.localeCompare(b);
        })
    : [];

  const displayData = filteredData.map((row, idx) => ({
    idx: idx,
    ...row
  }));

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'white' }}>
      {/* Sidebar */}
      <div style={{ width: '280px', background: '#fcfaf5', borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '32px' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#999', fontSize: '11px', fontWeight: 'bold', textDecoration: 'none', marginBottom: '24px' }}>
            <LayoutDashboard size={14} />
            BACK TO DASHBOARD
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#9f4022', marginBottom: '8px' }}>
            <Database size={18} />
            <span style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Data Explorer</span>
          </div>
          <h2 style={{ margin: 0, fontSize: '24px', fontFamily: "'Bodoni Moda', serif", color: '#53372b' }}>Azure Tables</h2>
        </div>

        <div style={{ flex: 1, padding: '0 16px', overflowY: 'auto' }}>
          <button
            onClick={() => setSelectedTable("POINTS_VIEW")}
            style={{
              width: '100%', padding: '16px 20px', borderRadius: '16px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: selectedTable === "POINTS_VIEW" ? '#9f4022' : 'rgba(159, 64, 34, 0.05)',
              color: selectedTable === "POINTS_VIEW" ? 'white' : '#9f4022',
              fontWeight: 'bold',
              border: selectedTable === "POINTS_VIEW" ? 'none' : '1px solid rgba(159, 64, 34, 0.1)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Trophy size={16} />
              <span>LEADERBOARD</span>
            </div>
            {selectedTable === "POINTS_VIEW" && <ChevronRight size={16} />}
          </button>

          <button
            onClick={() => setSelectedTable("ANALYTICS_VIEW")}
            style={{
              width: '100%', padding: '16px 20px', borderRadius: '16px', border: 'none', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: selectedTable === "ANALYTICS_VIEW" ? '#53372b' : 'rgba(83, 55, 43, 0.05)',
              color: selectedTable === "ANALYTICS_VIEW" ? 'white' : '#53372b',
              fontWeight: 'bold'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <BarChart3 size={16} />
              <span>ANALYTICS</span>
            </div>
          </button>

          <button
            onClick={() => setSelectedTable("MARKETING_VIEW")}
            style={{
              width: '100%', padding: '16px 20px', borderRadius: '16px', border: 'none', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: selectedTable === "MARKETING_VIEW" ? '#9f4022' : 'rgba(159, 64, 34, 0.05)',
              color: selectedTable === "MARKETING_VIEW" ? 'white' : '#9f4022',
              fontWeight: 'bold'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Users size={16} />
              <span>MARKETING ASSETS</span>
            </div>
          </button>

          <p style={{ fontSize: '10px', color: '#999', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px 20px' }}>Raw Tables</p>
          {TABLES.map(t => (
            <button
              key={t.azure}
              onClick={() => setSelectedTable(t.label === 'point ledger' ? 'point_ledger' : t.azure)}
              style={{
                width: '100%', padding: '16px 20px', borderRadius: '16px', border: 'none', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: selectedTable === (t.label === 'point ledger' ? 'point_ledger' : t.azure) ? '#9f4022' : 'transparent',
                color: selectedTable === (t.label === 'point ledger' ? 'point_ledger' : t.azure) ? 'white' : '#53372b',
                fontWeight: selectedTable === (t.label === 'point ledger' ? 'point_ledger' : t.azure) ? 'bold' : 'normal'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Table size={16} opacity={0.6} />
                <span style={{ textTransform: 'capitalize', fontSize: '13px' }}>{t.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 40px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
            <input
              type="text"
              placeholder={`Search in ${selectedTable}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '14px 14px 14px 48px', borderRadius: '14px', border: '1px solid #eee', fontSize: '14px', outline: 'none' }}
            />
          </div>

          {selectedRows.size > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
               <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#9f4022' }}>{selectedRows.size} selected</span>
               <button 
                onClick={handleMassDelete}
                disabled={isDeleting}
                style={{ padding: '12px 24px', background: '#9f4022', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
               >
                 {isDeleting ? "Purging..." : "Mass Delete Selection"}
               </button>
               <button 
                onClick={() => setSelectedRows(new Set())}
                style={{ padding: '12px 16px', background: 'white', color: '#999', border: '1px solid #eee', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}
               >
                 Cancel
               </button>
            </motion.div>
          )}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ 
              padding: '10px 16px', 
              borderRadius: '12px', 
              background: isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: isConnected ? '#16a34a' : '#dc2626',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: `1px solid ${isConnected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
            }}>
              {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isConnected ? "REAL-TIME LINK ACTIVE" : "SYNC SERVER DISCONNECTED"}
            </div>

            {isFallbackActive && (
              <div 
                title="The app is pulling data directly from Azure because the cache server is busy or unavailable."
                style={{ 
                  padding: '10px 16px', 
                  borderRadius: '12px', 
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#d97706',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  cursor: 'help'
                }}
              >
                <ShieldAlert size={14} />
                DIRECT AZURE DATA
              </div>
            )}

            <button onClick={() => fetchData()} style={{ padding: '14px 24px', borderRadius: '14px', border: '1px solid #eee', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#53372b', fontWeight: 'bold' }}>
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              {isLoading ? "Syncing..." : "Sync Azure"}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw className="animate-spin" size={40} color="#9f4022" />
            </div>
          ) : selectedTable === "MARKETING_VIEW" ? (
            <div style={{ padding: '40px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                   <h3 style={{ margin: 0, color: '#53372b', fontSize: '20px', fontWeight: 'bold' }}>Marketing Asset Library</h3>
                   <p style={{ margin: '4px 0 0 0', color: '#999', fontSize: '13px' }}>Browse and download high-quality submission photos for marketing.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                   {selectedRows.size > 0 && (
                     <>
                       <button 
                        onClick={handleMassDelete}
                        style={{ padding: '10px 20px', borderRadius: '12px', border: 'none', background: '#9f4022', color: 'white', fontSize: '11px', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase' }}
                       >
                         Delete Selected ({selectedRows.size})
                       </button>
                       <button 
                        onClick={() => {
                          const selectedUrls = filteredData.filter(i => selectedRows.has(i.id)).map(i => i.url);
                          handleMassDownload(selectedUrls);
                        }}
                        style={{ padding: '10px 20px', borderRadius: '12px', border: 'none', background: '#6f8e7c', color: 'white', fontSize: '11px', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase' }}
                       >
                         Download Selected ({selectedRows.size})
                       </button>
                     </>
                   )}
                   <button 
                    onClick={() => handleMassDownload(filteredData.map(i => i.url))}
                    style={{ padding: '10px 20px', borderRadius: '12px', border: 'none', background: '#53372b', color: 'white', fontSize: '11px', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase' }}
                   >
                     Download All ({filteredData.length})
                   </button>
                   <select 
                    value={selectedBatch} 
                    onChange={(e) => setSelectedBatch(e.target.value)}
                    style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid #eee', background: 'white', color: '#53372b', fontWeight: 'bold', outline: 'none' }}
                   >
                     {batches.map(b => (
                       <option key={b.rowKey || b.RowKey} value={b.rowKey || b.RowKey}>{b.name || (b.rowKey || b.RowKey)}</option>
                     ))}
                   </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                {filteredData.map((item: any) => (
                  <motion.div 
                    key={item.id} 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => {
                      const next = new Set(selectedRows);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      setSelectedRows(next);
                    }}
                    style={{ 
                      background: 'white', 
                      borderRadius: '20px', 
                      border: selectedRows.has(item.id) ? '2px solid #9f4022' : '1px solid #eee', 
                      overflow: 'hidden', 
                      boxShadow: selectedRows.has(item.id) ? '0 10px 30px rgba(159, 64, 34, 0.1)' : '0 10px 30px rgba(0,0,0,0.02)',
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                  >
                    <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10 }}>
                       <input 
                        type="checkbox" 
                        checked={selectedRows.has(item.id)} 
                        readOnly 
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }} 
                       />
                    </div>
                    <div style={{ height: '200px', background: '#fcfaf5', position: 'relative' }}>
                      <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <a 
                        href={item.url} 
                        onClick={(e) => e.stopPropagation()}
                        download={`HB_${item.user_name}_${item.id}.jpg`} 
                        target="_blank"
                        rel="noreferrer"
                        style={{ position: 'absolute', bottom: '12px', right: '12px', background: 'white', color: '#9f4022', padding: '8px 16px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', textDecoration: 'none', boxShadow: '0 5px 15px rgba(0,0,0,0.1)' }}
                      >
                        Download
                      </a>
                    </div>
                    <div style={{ padding: '16px' }}>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#53372b' }}>{item.user_name}</p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.task_id}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fcfaf5', zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid #eee', width: '40px' }}>
                    <input 
                      type="checkbox" 
                      onChange={(e) => {
                        if (e.target.checked) setSelectedRows(new Set(displayData.map(r => r.rowKey || r.RowKey || r.id)));
                        else setSelectedRows(new Set());
                      }}
                      checked={selectedRows.size > 0 && selectedRows.size === displayData.length}
                    />
                  </th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid #eee', color: '#999', textTransform: 'uppercase', fontSize: '10px', fontWeight: '900' }}>IDX</th>
                  {columns.map(col => (
                    <th key={col} style={{ padding: '16px 20px', borderBottom: '1px solid #eee', color: '#999', textTransform: 'uppercase', fontSize: '10px', fontWeight: '900' }}>{col.replace('_', ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayData.map((row: any, idx) => (
                  <tr key={idx} onClick={() => setSelectedRow(row)} style={{ borderBottom: '1px solid #f9f9f9', cursor: 'pointer', background: selectedRows.has(row.rowKey || row.RowKey || row.id) ? 'rgba(159, 64, 34, 0.05)' : 'transparent' }}>
                    <td style={{ padding: '16px 20px' }} onClick={(e) => e.stopPropagation()}>
                       <input 
                        type="checkbox" 
                        checked={selectedRows.has(row.rowKey || row.RowKey || row.id)}
                        onChange={() => {
                          const next = new Set(selectedRows);
                          const id = row.rowKey || row.RowKey || row.id;
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          setSelectedRows(next);
                        }}
                       />
                    </td>
                    <td style={{ padding: '16px 20px', color: '#999' }}>{row.idx}</td>
                    {columns.map(col => (
                      <td key={col} style={{ padding: '16px 20px', color: '#53372b', whiteSpace: 'nowrap', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {col === 'points' || col === 'total_points' ? <b>{row[col]}</b> : String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedRow && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => { if(!isSaving) { setSelectedRow(null); setIsEditingRecord(false); } }}>
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} onClick={(e) => e.stopPropagation()} style={{ width: '500px', height: '100%', background: 'white', padding: '40px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#53372b', fontWeight: 'bold' }}>
                  {isEditingRecord ? 'Editing Record' : 'Record Details'}
                </h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {!isEditingRecord ? (
                    <button 
                      onClick={() => { setEditBuffer({...selectedRow}); setIsEditingRecord(true); }}
                      style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid #eee', background: 'white', color: '#9f4022', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                  ) : (
                    <button 
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#9f4022', color: 'white', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  )}
                  <button onClick={() => { setSelectedRow(null); setIsEditingRecord(false); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={24} /></button>
                </div>
              </div>

              {Object.entries(isEditingRecord ? editBuffer : selectedRow).map(([key, value]) => {
                const isReadOnly = ['partitionKey', 'PartitionKey', 'rowKey', 'RowKey', 'Timestamp', 'idx', 'odata.metadata', 'etag'].includes(key);
                
                return (
                  <div key={key} style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', color: isReadOnly ? '#999' : '#9f4022', textTransform: 'uppercase', marginBottom: '8px' }}>
                      {key}
                      {isReadOnly && <span style={{ fontSize: '8px', opacity: 0.5 }}>READ ONLY</span>}
                    </label>
                    
                    {isEditingRecord && !isReadOnly ? (
                      <input 
                        type={typeof value === 'number' ? 'number' : 'text'}
                        value={String(value ?? '')}
                        onChange={(e) => {
                          const val = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
                          setEditBuffer((prev: any) => ({ ...prev, [key]: val }));
                        }}
                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #9f4022', background: 'white', fontSize: '14px', color: '#53372b', outline: 'none', boxSizing: 'border-box' }}
                      />
                    ) : (
                      <div style={{ background: '#fcfaf5', padding: '12px', borderRadius: '12px', fontSize: '14px', border: '1px solid #eee', color: isReadOnly ? '#999' : '#53372b', wordBreak: 'break-all' }}>
                        {String(value ?? '')}
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
