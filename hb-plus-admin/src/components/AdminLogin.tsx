"use client";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, ChevronRight } from "lucide-react";
import { useState } from "react";

interface AdminLoginProps {
  error?: string | null;
}

export function AdminLogin({ error: externalError }: AdminLoginProps) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleGoogleLogin = () => {
    setIsLoggingIn(true);
    window.location.href = '/api/auth/google';
  };

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      zIndex: 1000, 
      backgroundColor: '#f5f5f5', 
      display: 'flex', 
      overflow: 'hidden',
      fontFamily: "'Outfit', sans-serif"
    }}>
        {/* Left Side: Image Content */}
        <aside style={{ 
          display: 'none', 
          flex: 1.2, 
          position: 'relative', 
          overflow: 'hidden',
          backgroundColor: '#1a1411'
        }} className="lg:block">
            <img 
              src="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=2120&auto=format&fit=crop" 
              alt="Performance" 
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
            />
            <div style={{ 
              position: 'absolute', 
              inset: 0, 
              background: 'linear-gradient(to right, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0) 100%)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '80px 60px',
              color: 'white'
            }}>
                <h2 style={{ 
                  fontSize: '82px', 
                  lineHeight: '0.95', 
                  marginBottom: '24px', 
                  fontFamily: "'Bodoni Moda', serif", 
                  fontWeight: 400, 
                  fontStyle: 'italic', 
                  letterSpacing: '-0.02em' 
                }}>
                  Admin <br />Control Tower.
                </h2>
                <p style={{ 
                  fontSize: '20px', 
                  maxWidth: '420px', 
                  lineHeight: '1.4', 
                  fontWeight: 500, 
                  opacity: 0.9 
                }}>
                  The command center for <br />HB+ Fitness Performance Systems.
                </p>
            </div>
        </aside>

        {/* Right Side: Login Card */}
        <main style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '24px',
          background: '#f5f5f5'
        }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ 
                maxWidth: '500px', 
                width: '100%', 
                backgroundColor: 'white', 
                borderRadius: '40px', 
                padding: '50px 48px', 
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                boxShadow: '0 10px 40px rgba(0,0,0,0.05)',
                position: 'relative'
              }}
            >
                 {/* Logo Box */}
                 <div style={{ 
                   width: '80px', 
                   height: '80px', 
                   backgroundColor: 'black', 
                   borderRadius: '20px', 
                   display: 'flex', 
                   alignItems: 'center', 
                   justifyContent: 'center', 
                   marginBottom: '48px', 
                   boxShadow: '0 10px 30px rgba(0,0,0,0.2)' 
                 }}>
                   <span style={{ fontSize: '24px', fontWeight: 900, color: 'white', fontFamily: "'Bodoni Moda', serif", fontStyle: 'italic' }}>HB+</span>
                 </div>

                 <div style={{ marginBottom: '40px' }}>
                    <h1 style={{ 
                      fontSize: '38px', 
                      fontFamily: "'Bodoni Moda', serif", 
                      color: '#5d4037', 
                      marginBottom: '16px', 
                      letterSpacing: '-0.01em',
                      fontWeight: 500
                    }}>
                      Control Tower
                    </h1>
                    <p style={{ 
                      color: '#8d6e63', 
                      fontSize: '14px', 
                      fontWeight: 500, 
                      lineHeight: '1.6', 
                      maxWidth: '320px', 
                      margin: '0 auto' 
                    }}>
                      Please authenticate with your @hbplus.fit account to access the administrative dashboard.
                    </p>
                 </div>

                 <AnimatePresence mode="wait">
                   {externalError && (
                     <motion.div 
                       initial={{ opacity: 0, y: -10 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0 }}
                       style={{ 
                         marginBottom: '32px', 
                         padding: '16px', 
                         backgroundColor: 'rgba(159,64,34,0.05)', 
                         borderRadius: '16px', 
                         color: '#9f4022', 
                         fontSize: '12px', 
                         fontWeight: 700, 
                         border: '1px solid rgba(159,64,34,0.1)',
                         width: '100%'
                       }}
                     >
                       {externalError}
                     </motion.div>
                   )}
                 </AnimatePresence>

                 {/* Google Button */}
                 <motion.button
                   whileHover={{ scale: 1.01 }}
                   whileTap={{ scale: 0.99 }}
                   onClick={handleGoogleLogin}
                   disabled={isLoggingIn}
                   style={{ 
                     width: '100%', 
                     backgroundColor: '#4e342e', 
                     color: 'white', 
                     display: 'flex', 
                     alignItems: 'center', 
                     justifyContent: 'center', 
                     gap: '12px', 
                     padding: '22px', 
                     borderRadius: '20px', 
                     fontSize: '13px', 
                     letterSpacing: '0.12em', 
                     fontWeight: 800, 
                     textTransform: 'uppercase', 
                     border: 'none', 
                     cursor: 'pointer', 
                     boxShadow: '0 15px 35px rgba(0,0,0,0.15)',
                     transition: 'all 0.3s ease'
                   }}
                 >
                   {isLoggingIn ? (
                     <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                        <div style={{ width: '18px', height: '18px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }} />
                     </motion.div>
                   ) : (
                     <>
                        <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.14-4.53z" fill="#EA4335"/>
                        </svg>
                        <span>Sign In with Google</span>
                     </>
                   )}
                 </motion.button>

                 <p style={{ 
                    fontSize: '11px', 
                    color: 'rgba(83, 55, 43, 0.4)', 
                    textAlign: 'center', 
                    marginTop: '24px',
                    maxWidth: '240px',
                    lineHeight: '1.4',
                    fontWeight: 500
                  }}>
                    Access is restricted to authorized HB+ administrators with @hbplus.fit accounts.
                  </p>

                 <div style={{ marginTop: 'auto', paddingTop: '32px', textAlign: 'center' }}>
                    <p style={{ fontSize: '10px', color: '#bdbdbd', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.3em' }}>
                      HB+ PERFORMANCE SYSTEMS
                    </p>
                 </div>
            </motion.div>
        </main>
    </div>
  );
}

