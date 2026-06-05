"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Users, Clock, LayoutDashboard, ChevronLeft,
    ShieldCheck, RefreshCw, LayoutGrid, FileCheck2, UserCog, Users2, Settings2, BarChart3, Rss
} from "lucide-react";
import { getAllEntities } from "@/lib/azureDb";
import { TaskManagement } from "@/components/TaskManagement";
import { MemberManagement } from "@/components/MemberManagement";
import { TeamManagement } from "@/components/TeamManagement";
import { ApprovalsQueue } from "@/components/ApprovalsQueue";
import { DashboardOverview } from "@/components/DashboardOverview";
import { BatchFeed } from "@/components/BatchFeed";
import Link from "next/link";

export default function BatchDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [members, setMembers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("tasks");
    const [batchData, setBatchData] = useState<any>(null);

    const fetchBatchData = async () => {
        setIsLoading(true);
        try {
            const [allProfiles, allSubs, allClans, allBatches] = await Promise.all([
                getAllEntities("Profiles"),
                getAllEntities("Submissions"),
                getAllEntities("Clans"),
                getAllEntities("Batches")
            ]);

            const currentBatch = allBatches.find((b: any) => b.rowKey === id || b.RowKey === id);
            setBatchData(currentBatch);

            const batchMembers = allProfiles.filter((p: any) => p.batch_id === id);
            
            setMembers(batchMembers);
        } catch (err) {
            console.error(err);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchBatchData();
    }, [id]);

    if (isLoading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fcfaf5' }}><RefreshCw className="animate-spin" color="#9f4022" /></div>;

    const tabs = [
        { id: "home", label: "Home", icon: LayoutGrid },
        { id: "approvals", label: "Approvals", icon: FileCheck2 },
        { id: "feed", label: "Feed", icon: Rss },
        { id: "members", label: "Members", icon: UserCog },
        { id: "teams", label: "Teams", icon: Users2 },
        { id: "tasks", label: "Tasks", icon: Settings2 },
    ];

    return (
        <div style={{ minHeight: '100vh', background: '#fcfaf5', paddingBottom: '100px' }}>
            
            {/* --- HEADER --- */}
            <div style={{ padding: '40px 40px 0 40px', maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', background: '#9f4022', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                            <LayoutGrid size={24} />
                        </div>
                        <div>
                            <h1 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: '28px', color: '#53372b', margin: 0, textTransform: 'uppercase' }}>
                                CONTROL TOWER <span style={{ color: 'rgba(83, 55, 43, 0.3)' }}>/ {id}</span>
                            </h1>
                        </div>
                    </div>
                    <Link href="/batches" style={{ padding: '12px 24px', background: 'white', border: '1px solid #eee', borderRadius: '14px', color: '#53372b', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ChevronLeft size={16} /> BATCHES
                    </Link>
                </div>

                {batchData?.is_active === false && (
                    <div style={{ 
                        background: 'rgba(0, 0, 0, 0.05)', 
                        border: '1px solid #eee', 
                        borderRadius: '16px', 
                        padding: '16px 24px', 
                        marginBottom: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        color: '#666'
                    }}>
                        <ShieldCheck size={20} color="#666" />
                        <div>
                            <span style={{ fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Batch Inactive</span>
                            <p style={{ margin: '2px 0 0 0', fontSize: '11px' }}>This cycle has concluded. No submissions or registrations are being processed.</p>
                        </div>
                    </div>
                )}

                <nav style={{ display: 'flex', justifyContent: 'center', marginBottom: '64px' }}>
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(10px)', padding: '6px', borderRadius: '9999px', border: '1px solid rgba(198, 198, 198, 0.2)', display: 'flex', gap: '4px' }}>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    padding: '10px 24px',
                                    backgroundColor: activeTab === tab.id ? '#9f4022' : 'transparent',
                                    color: activeTab === tab.id ? 'white' : 'rgba(83, 55, 43, 0.6)',
                                    borderRadius: '9999px',
                                    border: 'none',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <tab.icon size={14} />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </nav>

                <motion.div key={activeTab} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    
                    {activeTab === "home" && (
                        <DashboardOverview batchId={id as string} />
                    )}

                    {activeTab === "approvals" && (
                        <ApprovalsQueue batchId={id as string} />
                    )}

                    {activeTab === "feed" && (
                        <BatchFeed batchId={id as string} />
                    )}

                    {activeTab === "members" && (
                        <MemberManagement batchId={id as string} isLocked={batchData?.is_locked} />
                    )}

                    {activeTab === "teams" && (
                        <TeamManagement batchId={id as string} isLocked={batchData?.is_locked} />
                    )}

                    {activeTab === "tasks" && (
                        <TaskManagement batchId={id as string} isLocked={batchData?.is_locked} />
                    )}

                </motion.div>
            </div>
        </div>
    );
}
