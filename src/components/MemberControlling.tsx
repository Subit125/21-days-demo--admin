"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Check, X, Clock, UserCheck, Search } from "lucide-react";
import { useState, useEffect } from "react";
import { getAllEntities, TABLES, upsertEntity } from "@/lib/azureDb";

export function MemberControlling() {
  const [members, setMembers] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [allProfiles, allFlashcards] = await Promise.all([
        getAllEntities(TABLES.PROFILES),
        getAllEntities(TABLES.FLASHCARDS)
      ]);
      
      setMembers(allProfiles || []);
      
      const configBatches = allFlashcards.filter((e: any) => 
        (e.partitionKey === "CONFIG_BATCH" || e.PartitionKey === "CONFIG_BATCH") && 
        !e.is_locked && !e.Is_locked && e.is_active !== false
      );
      setBatches(configBatches);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleActivateUser = async (user: any, targetBatchId: string) => {
    if (!targetBatchId) {
      alert("Please select a target batch first.");
      return;
    }

    try {
      const updatedProfile = {
        ...user,
        partitionKey: "Profile",
        rowKey: user.rowKey || user.RowKey,
        batch_id: targetBatchId,
        is_allowed: true,
        updated_at: new Date().toISOString()
      };

      await upsertEntity(TABLES.PROFILES, updatedProfile);
      
      setStatusMsg(`User ${user.name} activated for batch ${targetBatchId}`);
      setTimeout(() => setStatusMsg(""), 3000);
      
      fetchData();
    } catch (e) {
      alert("Activation failed");
    }
  };

  const filteredMembers = members.filter(m => 
    !m.batch_id && 
    (m.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     m.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-white p-8 rounded-[32px] border border-[rgba(83,55,43,0.05)] shadow-sm">
         <div className="flex-1 w-full relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgba(83,55,43,0.3)]" size={18} />
            <input 
              type="text" 
              placeholder="Filter unassigned members..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-[#fcfaf5] border-none rounded-2xl text-[#53372b] focus:ring-2 focus:ring-[#9f4022]/20"
            />
         </div>
         <div className="flex gap-4">
            <div className="px-6 py-4 bg-[#fcfaf5] rounded-2xl text-center border border-[rgba(159,64,34,0.05)]">
               <p className="text-[9px] font-bold text-[rgba(83,55,43,0.4)] uppercase tracking-widest mb-1">Pending Approval</p>
               <p className="text-xl font-bold text-[#9f4022]">{filteredMembers.length}</p>
            </div>
         </div>
      </div>

      <AnimatePresence>
        {statusMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl text-sm font-bold flex items-center gap-3 border border-emerald-100"
          >
            <Check size={18} /> {statusMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
         {filteredMembers.map((member) => (
           <motion.div 
             key={member.rowKey || member.RowKey}
             layout
             className="bg-white p-6 rounded-[32px] border border-[rgba(83,55,43,0.05)] shadow-sm flex flex-col gap-6"
           >
              <div className="flex items-center gap-4">
                 <img src={member.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.email}`} className="w-14 h-14 rounded-2xl" alt="" />
                 <div>
                    <h4 className="font-bold text-[#53372b]">{member.name || "Anonymous"}</h4>
                    <p className="text-xs text-[rgba(83,55,43,0.4)] font-medium">{member.email}</p>
                 </div>
              </div>

              <div className="space-y-3">
                 <p className="text-[10px] font-black text-[rgba(83,55,43,0.3)] uppercase tracking-widest">Assign to Target Cohort</p>
                 <div className="grid grid-cols-1 gap-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {batches.map((batch) => (
                       <button 
                         key={batch.rowKey || batch.RowKey}
                         onClick={() => handleActivateUser(member, batch.rowKey || batch.RowKey)}
                         className="flex items-center justify-between p-3 bg-[#fcfaf5] hover:bg-[#9f4022] hover:text-white rounded-xl transition-all group text-left"
                       >
                          <span className="text-xs font-bold">{batch.name}</span>
                          <UserCheck size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                       </button>
                    ))}
                    {batches.length === 0 && (
                       <p className="text-[10px] text-[rgba(83,55,43,0.4)] italic">No active cohorts available</p>
                    )}
                 </div>
              </div>
           </motion.div>
         ))}

         {filteredMembers.length === 0 && !isLoading && (
            <div className="col-span-full py-20 text-center bg-[#fcfaf5] rounded-[32px] border-2 border-dashed border-[rgba(83,55,43,0.05)]">
               <ShieldAlert size={48} className="mx-auto text-[rgba(83,55,43,0.1)] mb-4" />
               <p className="text-sm font-bold text-[rgba(83,55,43,0.3)] uppercase tracking-widest">No unassigned members requiring activation</p>
            </div>
         )}
      </div>
    </div>
  );
}
