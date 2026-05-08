"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Clock, Trophy, LayoutGrid, BarChart3, Users2, FileCheck2, Settings2, UserCog, UserPlus } from "lucide-react";
import { useState, useEffect } from "react";
import { DashboardOverview } from "@/components/DashboardOverview";
import { TeamManagement } from "@/components/TeamManagement";
import { TaskManagement } from "@/components/TaskManagement";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { MemberManagement } from "@/components/MemberManagement";
import { getAllEntities, TABLES, upsertEntity } from "@/lib/azureDb";

import { ApprovalsQueue } from "@/components/ApprovalsQueue";
import { BatchAssignment } from "@/components/BatchAssignment";

// --- MAIN CONTROLLER ---

const tabs = [
  { id: "home", label: "Home", icon: LayoutGrid },
  { id: "approvals", label: "Approvals", icon: FileCheck2 },
  { id: "members", label: "Members", icon: UserCog },
  { id: "batch-assign", label: "Batch Assign", icon: UserPlus },
];

export function TabController() {
  const [activeTab, setActiveTab] = useState("home");

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingTop: '120px', paddingLeft: '20px', paddingRight: '20px' }}>
      <nav style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px', overflowX: 'auto', paddingBottom: '16px' }}>
        <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(10px)', padding: '6px', borderRadius: '9999px', border: '1px solid rgba(198, 198, 198, 0.2)', display: 'flex', gap: '4px', whiteSpace: 'nowrap' }}>
            {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '10px 20px',
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
                        <Icon size={14} />
                        <span className="md:inline hidden">{tab.label}</span>
                        {activeTab === tab.id && <span className="md:hidden inline">{tab.label}</span>}
                    </button>
                );
            })}
        </div>
      </nav>

      <motion.div key={activeTab} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {activeTab === "home" && <DashboardOverview />}
        {activeTab === "approvals" && <ApprovalsQueue />}
        {activeTab === "members" && <MemberManagement />}
        {activeTab === "batch-assign" && <BatchAssignment />}
        {activeTab === "tasks" && <TaskManagement />}
        {activeTab === "analytics" && <AnalyticsDashboard />}
      </motion.div>
    </div>
  );
}
