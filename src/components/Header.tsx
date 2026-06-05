"use client";

import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Bell, LayoutDashboard, LogOut, History, Database, ChevronDown, User, Layers } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

interface AdminUser {
  email: string;
  name: string;
  picture: string;
}

interface HeaderProps {
  onShowLogs: () => void;
  onShowDatabase: () => void;
  user: AdminUser | null;
  onLogout: () => Promise<void>;
  onShowBatches?: () => void;
}

export function Header({ onShowLogs, onShowDatabase, user, onLogout }: HeaderProps) {
  const { scrollY } = useScroll();
  const backgroundY = useTransform(scrollY, [0, 100], ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.4)"]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      style={{ 
        backgroundColor: backgroundY, 
        backdropFilter: 'blur(20px)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: '32px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(198, 198, 198, 0.2)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h1 style={{ 
            fontSize: '24px', 
            fontFamily: "'Bodoni Moda', serif", 
            fontWeight: 'bold', 
            color: '#53372b', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            margin: 0,
            letterSpacing: '0.05em'
          }}>
            <span style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '12px', 
              backgroundColor: '#9f4022', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: 'white'
            }}>
              <LayoutDashboard size={20} />
            </span>
            CONTROL TOWER
          </h1>
          <p style={{ 
            fontSize: '11px', 
            fontWeight: 'bold', 
            color: 'rgba(159, 64, 34, 0.6)', 
            letterSpacing: '0.2em', 
            textTransform: 'uppercase', 
            marginTop: '4px',
            paddingLeft: '48px',
            margin: 0
          }}>
            Admin Operations Panel
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* Database Button */}
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onShowDatabase}
          style={{ 
            background: 'rgba(159, 64, 34, 0.05)', 
            border: '1px solid rgba(159, 64, 34, 0.1)', 
            color: '#9f4022', 
            padding: '10px 18px', 
            borderRadius: '12px', 
            cursor: 'pointer', 
            fontSize: '11px', 
            fontWeight: 'bold', 
            textTransform: 'uppercase', 
            letterSpacing: '0.1em', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px' 
          }}
        >
          <Database size={14} />
          Database
        </motion.button>

        {/* Batches Button */}
        <Link href="/batches" style={{ textDecoration: 'none' }}>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ 
              background: 'rgba(83, 55, 43, 0.05)', 
              border: '1px solid rgba(83, 55, 43, 0.1)', 
              color: '#53372b', 
              padding: '10px 18px', 
              borderRadius: '12px', 
              cursor: 'pointer', 
              fontSize: '11px', 
              fontWeight: 'bold', 
              textTransform: 'uppercase', 
              letterSpacing: '0.1em', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px' 
            }}
          >
            <Layers size={14} />
            Batches
          </motion.button>
        </Link>

        {/* Logs Button */}
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onShowLogs}
          style={{ 
            background: 'white', 
            border: '1px solid rgba(83, 55, 43, 0.1)', 
            color: '#53372b', 
            padding: '10px 18px', 
            borderRadius: '12px', 
            cursor: 'pointer', 
            fontSize: '11px', 
            fontWeight: 'bold', 
            textTransform: 'uppercase', 
            letterSpacing: '0.1em', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px' 
          }}
        >
          <History size={14} />
          Audit Logs
        </motion.button>

        <div style={{ width: '1px', height: '32px', background: 'rgba(83, 55, 43, 0.1)', margin: '0 8px' }} />

        {/* Profile Section */}
        <div style={{ position: 'relative' }}>
          <motion.div 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            whileHover={{ scale: 1.02 }}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              cursor: 'pointer',
              background: 'white',
              padding: '6px',
              paddingRight: '12px',
              borderRadius: '16px',
              border: '1px solid rgba(83, 55, 43, 0.05)'
            }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', overflow: 'hidden' }}>
              <img 
                src={user?.picture || `https://api.dicebear.com/7.x/notionists/svg?seed=${user?.email}`} 
                alt="Profile" 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#53372b', margin: 0 }}>{user?.name || 'Admin'}</p>
              <p style={{ fontSize: '9px', color: 'rgba(83, 55, 43, 0.4)', margin: 0 }}>Active Session</p>
            </div>
            <ChevronDown size={14} color="rgba(83, 55, 43, 0.3)" />
          </motion.div>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                style={{ 
                  position: 'absolute', 
                  top: '100%', 
                  right: 0, 
                  marginTop: '12px', 
                  width: '200px', 
                  background: 'white', 
                  borderRadius: '16px', 
                  boxShadow: '0 20px 40px rgba(0,0,0,0.1)', 
                  border: '1px solid rgba(83, 55, 43, 0.05)',
                  padding: '8px',
                  zIndex: 200
                }}
              >
                <button 
                  onClick={onLogout}
                  style={{ 
                    width: '100%', 
                    padding: '12px', 
                    borderRadius: '10px', 
                    border: 'none', 
                    background: 'transparent', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    color: '#9f4022', 
                    fontSize: '12px', 
                    fontWeight: 'bold', 
                    cursor: 'pointer' 
                  }}
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.header>
  );
}
