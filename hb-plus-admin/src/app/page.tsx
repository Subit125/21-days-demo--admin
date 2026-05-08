"use client";
import { Header } from "@/components/Header";
import { TabController } from "@/components/TabController";
import { AdminLogin } from "@/components/AdminLogin";
import { AuditLogOverlay } from "@/components/AuditLogOverlay";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

type AdminUser = {
  email: string;
  name: string;
  picture: string;
};

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
    } catch {
      setIsAuthorized(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check for error from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const email = params.get('email');

    if (error === 'unauthorized_domain') {
      setAuthError(`Access denied: "${email}" is not an @hbplus.fit account.`);
      // Clean URL
      window.history.replaceState({}, '', '/');
    } else if (error) {
      setAuthError('Authentication failed. Please try again.');
      window.history.replaceState({}, '', '/');
    }

    // Check active session
    checkSession();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    setUser(null);
    setIsAuthorized(false);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#fcfaf5] flex items-center justify-center p-12">
        <div className="text-center">
           <motion.div 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             className="flex flex-col items-center"
           >
             <div className="w-20 h-20 rounded-[32px] bg-white flex items-center justify-center text-[#9f4022] shadow-inner border border-[#EDDEC8]/30 mb-10 overflow-hidden relative">
                <motion.div 
                   animate={{ y: ["100%", "0%", "-100%"] }}
                   transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                   className="absolute inset-0 bg-[#9f4022]/10"
                />
                <span className="text-xl font-editorial font-black italic">HB+</span>
             </div>
             <h2 className="text-[10px] font-black text-[#53372b]/30 uppercase tracking-[0.5em] animate-pulse">Initializing Control Tower</h2>
           </motion.div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#fcfaf5]">
      <AnimatePresence mode="wait">
        {!isAuthorized ? (
          <AdminLogin key="auth" error={authError} />
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Header 
              onShowLogs={() => setIsLogsOpen(true)} 
              onShowDatabase={() => window.location.href = '/database'}
              user={user} 
              onLogout={handleLogout} 
            />
            <TabController user={user} />
            <AuditLogOverlay isOpen={isLogsOpen} onClose={() => setIsLogsOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Dynamic Background Pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] select-none z-0"
           style={{ 
             backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 35c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm60-21c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM46 94c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM60 46c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm36 20c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zM8.5 46c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm37 38c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM90 60c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM6.5 18c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm31 4c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm32-13c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM91.5 5c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z25 43c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm-7-26c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM22 6c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%2353372b' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E\")",
           }} />
    </main>
  );
}
