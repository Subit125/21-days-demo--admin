"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Plus, Lock, Unlock, Calendar, LayoutDashboard, Search, RefreshCw, X, User, Power, PowerOff, Zap } from "lucide-react";
import { getAllEntities, upsertEntity } from "@/lib/azureDb";
import Link from "next/link";

export default function BatchesPage() {
    const [batches, setBatches] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newBatch, setNewBatch] = useState({ name: '', start_date: new Date().toISOString().split('T')[0] });

    const fetchBatches = async () => {
        setIsLoading(true);
        try {
            const data = await getAllEntities("Flashcards");
            // Handle both camelCase and PascalCase from Azure
            const filtered = data.filter((e: any) => 
                (e.partitionKey === "CONFIG_BATCH" || e.PartitionKey === "CONFIG_BATCH")
            );
            setBatches(filtered || []);
        } catch (err) {
            console.error(err);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchBatches();
    }, []);

    const handleCreateBatch = async () => {
        if (!newBatch.name) return;
        const id = newBatch.name.replace(/\s+/g, '_').toUpperCase();
        const batch = {
            partitionKey: "CONFIG_BATCH",
            rowKey: id,
            name: newBatch.name,
            start_date: new Date(newBatch.start_date).toISOString(),
            is_locked: false,
            is_active: true,
            type: 'batch_config',
            created_at: new Date().toISOString()
        };

        try {
            await upsertEntity("Flashcards", batch);
            setIsCreating(false);
            setNewBatch({ name: '', start_date: new Date().toISOString().split('T')[0] });
            fetchBatches();
        } catch (err) {
            alert("Failed to create batch: " + err);
        }
    };

    const toggleLock = async (batch: any) => {
        const rKey = batch.rowKey || batch.RowKey;
        await upsertEntity("Flashcards", {
            ...batch,
            partitionKey: "CONFIG_BATCH",
            rowKey: rKey,
            is_locked: !batch.is_locked
        });
        fetchBatches();
    };

    const toggleActive = async (batch: any) => {
        const rKey = batch.rowKey || batch.RowKey;
        await upsertEntity("Flashcards", {
            ...batch,
            partitionKey: "CONFIG_BATCH",
            rowKey: rKey,
            is_active: batch.is_active === false ? true : false
        });
        fetchBatches();
    };

    const startChallenge = async (batch: any) => {
        const rKey = batch.rowKey || batch.RowKey;
        const confirmStart = window.confirm(`Initialization Sequence: Do you want to START the 21-day challenge for ${batch.name} from TODAY?`);
        if (!confirmStart) return;

        await upsertEntity("Flashcards", {
            ...batch,
            partitionKey: "CONFIG_BATCH",
            rowKey: rKey,
            is_started: true,
            start_date: new Date().toISOString()
        });
        fetchBatches();
    };

    return (
        <div style={{ minHeight: '100vh', background: '#fcfaf5', padding: '40px' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                    <div>
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#999', fontSize: '11px', fontWeight: 'bold', textDecoration: 'none', marginBottom: '16px' }}>
                            <LayoutDashboard size={14} />
                            BACK TO DASHBOARD
                        </Link>
                        <h1 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: '32px', color: '#53372b', margin: 0 }}>Batch Operations</h1>
                        <p style={{ color: '#999', fontSize: '14px', marginTop: '4px' }}>Deploy and manage concurrent challenge cycles.</p>
                    </div>
                    <button 
                        onClick={() => setIsCreating(true)}
                        style={{ padding: '14px 24px', background: '#9f4022', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                    >
                        <Plus size={18} />
                        Launch New Batch
                    </button>
                </div>

                {/* Batch Grid */}
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
                        <RefreshCw className="animate-spin" size={40} color="#9f4022" />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                        {batches.map(batch => {
                            const rKey = batch.rowKey || batch.RowKey;
                            return (
                                <motion.div 
                                    key={rKey}
                                    whileHover={{ y: -5 }}
                                    style={{ background: 'white', borderRadius: '24px', padding: '32px', border: '1px solid #eee', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                                        <div style={{ width: '48px', height: '48px', background: '#fcfaf5', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9f4022' }}>
                                            <Layers size={24} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <div style={{ 
                                                padding: '6px 12px', 
                                                borderRadius: '20px', 
                                                fontSize: '10px', 
                                                fontWeight: 'bold', 
                                                background: batch.is_active === false ? 'rgba(0, 0, 0, 0.1)' : 'rgba(111, 142, 124, 0.1)',
                                                color: batch.is_active === false ? '#666' : '#6f8e7c',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em'
                                            }}>
                                                {batch.is_active === false ? 'Inactive' : 'Live'}
                                            </div>
                                            <div style={{ 
                                                padding: '6px 12px', 
                                                borderRadius: '20px', 
                                                fontSize: '10px', 
                                                fontWeight: 'bold', 
                                                background: batch.is_locked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                                color: batch.is_locked ? '#dc2626' : '#16a34a',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em'
                                            }}>
                                                {batch.is_locked ? 'Locked' : 'Active'}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <Link href={`/batches/${rKey}`} style={{ textDecoration: 'none' }}>
                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#53372b', fontWeight: 'bold', cursor: 'pointer' }}>{batch.name}</h3>
                                    </Link>
                                    <p style={{ margin: '0 0 24px 0', fontSize: '11px', color: '#999', fontWeight: 'bold' }}>ID: {rKey}</p>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                                        <Calendar size={16} color="#999" />
                                        <span style={{ fontSize: '14px', color: '#53372b', fontWeight: '500' }}>Starts: {new Date(batch.start_date).toLocaleDateString()}</span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <Link href={batch.is_active === false ? '#' : `/batches/${rKey}`} style={{ flex: 1, textDecoration: 'none' }}>
                                                <button 
                                                    disabled={batch.is_active === false}
                                                    style={{ 
                                                        width: '100%', 
                                                        padding: '12px', 
                                                        borderRadius: '12px', 
                                                        border: '1px solid #9f4022', 
                                                        background: 'rgba(159, 64, 34, 0.05)', 
                                                        color: '#9f4022', 
                                                        fontWeight: 'bold', 
                                                        fontSize: '12px', 
                                                        cursor: batch.is_active === false ? 'not-allowed' : 'pointer',
                                                        opacity: batch.is_active === false ? 0.4 : 1,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '8px'
                                                    }}
                                                >
                                                    <User size={14} />
                                                    Members
                                                </button>
                                            </Link>
                                            <Link href={batch.is_active === false ? '#' : `/batches/${rKey}`} style={{ flex: 1, textDecoration: 'none' }}>
                                                <button 
                                                    disabled={batch.is_active === false}
                                                    style={{ 
                                                        width: '100%', 
                                                        padding: '12px', 
                                                        borderRadius: '12px', 
                                                        border: '1px solid #eee', 
                                                        background: 'white', 
                                                        color: '#53372b', 
                                                        fontWeight: 'bold', 
                                                        fontSize: '12px', 
                                                        cursor: batch.is_active === false ? 'not-allowed' : 'pointer',
                                                        opacity: batch.is_active === false ? 0.4 : 1,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '8px'
                                                    }}
                                                >
                                                    <LayoutDashboard size={14} />
                                                    Tasks
                                                </button>
                                            </Link>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={() => toggleLock(batch)}
                                                style={{ 
                                                    flex: 1,
                                                    padding: '12px', 
                                                    borderRadius: '12px', 
                                                    border: '1px solid #eee', 
                                                    background: 'white', 
                                                    color: '#53372b', 
                                                    fontWeight: 'bold', 
                                                    fontSize: '10px', 
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                {batch.is_locked ? <Unlock size={12} /> : <Lock size={12} />}
                                                {batch.is_locked ? 'Unlock' : 'Lock'}
                                            </button>
                                            <button 
                                                onClick={() => toggleActive(batch)}
                                                style={{ 
                                                    flex: 1,
                                                    padding: '12px', 
                                                    borderRadius: '12px', 
                                                    border: '1px solid #eee', 
                                                    background: batch.is_active === false ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)', 
                                                    color: batch.is_active === false ? '#16a34a' : '#dc2626', 
                                                    fontWeight: 'bold', 
                                                    fontSize: '10px', 
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                {batch.is_active === false ? <Power size={12} /> : <PowerOff size={12} />}
                                                {batch.is_active === false ? 'Activate' : 'Disable'}
                                            </button>
                                        </div>
                                        
                                        {!batch.is_started && batch.is_active !== false && (
                                            <button 
                                                onClick={() => startChallenge(batch)}
                                                style={{ 
                                                    width: '100%',
                                                    padding: '14px', 
                                                    borderRadius: '12px', 
                                                    border: 'none', 
                                                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', 
                                                    color: 'white', 
                                                    fontWeight: '900', 
                                                    fontSize: '11px', 
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.1em',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '8px',
                                                    boxShadow: '0 10px 20px rgba(22, 163, 74, 0.2)'
                                                }}
                                            >
                                                <Zap size={14} fill="currentColor" />
                                                Initiate 21-Day Protocol
                                            </button>
                                        )}
                                        
                                        {batch.is_started && (
                                            <div style={{ 
                                                textAlign: 'center', 
                                                padding: '10px', 
                                                background: 'rgba(83, 55, 43, 0.05)', 
                                                borderRadius: '10px', 
                                                fontSize: '10px', 
                                                fontWeight: 'bold', 
                                                color: 'var(--accent)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.1em'
                                            }}>
                                                Protocol in Progress 📡
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                {/* Create Modal */}
                <AnimatePresence>
                    {isCreating && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ width: '400px', background: 'white', borderRadius: '24px', padding: '40px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px' }}>
                                    <h3 style={{ margin: 0, fontSize: '20px', color: '#53372b' }}>Launch New Batch</h3>
                                    <button onClick={() => setIsCreating(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={24} /></button>
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: '#9f4022', textTransform: 'uppercase', marginBottom: '8px' }}>Batch Name</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. May 2024 Challenge" 
                                        value={newBatch.name}
                                        onChange={(e) => setNewBatch({...newBatch, name: e.target.value})}
                                        style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', outline: 'none' }} 
                                    />
                                </div>

                                <div style={{ marginBottom: '32px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: '#9f4022', textTransform: 'uppercase', marginBottom: '8px' }}>Start Date</label>
                                    <input 
                                        type="date" 
                                        value={newBatch.start_date}
                                        onChange={(e) => setNewBatch({...newBatch, start_date: e.target.value})}
                                        style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', outline: 'none' }} 
                                    />
                                </div>

                                <button 
                                    onClick={handleCreateBatch}
                                    style={{ width: '100%', padding: '16px', background: '#9f4022', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    Deploy Protocol
                                </button>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
