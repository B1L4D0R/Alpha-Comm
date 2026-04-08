import { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { meshService } from '../services/mesh';
import { vault } from '../services/db';

export default function SOSWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isSignaling, setIsSignaling] = useState(false);
  const [wipeActive, setWipeActive] = useState(false);

  useEffect(() => {
    if (!isSignaling) return;

    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          setIsSignaling(false);
          return 5;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSignaling]);

  const triggerSOS = async () => {
    setIsSignaling(true);
    // Real tactical SOS broadcast
    await meshService.broadcast({
        alert: 'MAYDAY',
        status: 'CRITICAL',
        coordinates: 'SIMULATED_GPS_FIX'
    }, 'SOS');
  };

  const triggerWipe = async () => {
    setWipeActive(true);
    
    // 1. Clear database (all messages and peers)
    await vault.delete();
    
    // 2. Clear keys and local settings
    localStorage.clear();
    sessionStorage.clear();

    // 3. Simulated lockdown delay
    setTimeout(() => {
      window.location.reload();
    }, 2500);
  };

  return (
    <>
      {/* Floating Trigger */}
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-50 w-14 h-14 bg-tactical-orange rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,79,0,0.4)] animate-pulse"
      >
        <AlertTriangle className="w-6 h-6 text-obsidian" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-0 z-[60] bg-obsidian/95 backdrop-blur-xl flex flex-col p-6"
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-tactical-orange" />
                <h2 className="text-xl font-bold font-mono text-white uppercase tracking-widest">PROTOCOLO SOS</h2>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 text-gray-500 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center gap-8">
              {wipeActive ? (
                <motion.div 
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="text-center"
                >
                  <div className="w-24 h-24 bg-red-600/20 border-2 border-red-500 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <Zap className="w-10 h-10 text-red-500 fill-red-500 animate-bounce" />
                  </div>
                  <h3 className="text-red-500 font-bold uppercase tracking-widest text-lg">Limpeza Tática Ativa</h3>
                  <p className="text-gray-400 text-xs mt-2 font-mono">Apagando chaves e metadados locais...</p>
                </motion.div>
              ) : isSignaling ? (
                <div className="text-center">
                  <div className="text-6xl font-bold font-mono text-tactical-orange mb-4">{countdown}</div>
                  <h3 className="text-white font-bold uppercase tracking-widest">Transmitindo SINAL</h3>
                  <p className="text-gray-400 text-xs mt-2 font-mono">Buscando Alpha Nodes para retransmissão...</p>
                </div>
              ) : (
                <>
                  <div className="text-center mb-4">
                    <p className="text-gray-400 mb-6 max-w-xs mx-auto text-sm">
                      O sinal de socorro será propagado por todos os dispositivos na mesh. As coordenadas atuais e o ID serão compartilhados.
                    </p>
                    <button 
                      onClick={triggerSOS}
                      className="w-48 h-48 bg-tactical-orange rounded-full flex flex-col items-center justify-center shadow-[0_0_40px_rgba(255,79,0,0.3)] group hover:scale-105 active:scale-95 transition-all"
                    >
                      <AlertTriangle className="w-12 h-12 text-obsidian mb-2" />
                      <span className="font-bold text-obsidian uppercase tracking-widest text-sm">SINALIZAR</span>
                    </button>
                  </div>

                  <div className="w-full mt-12 pt-8 border-t border-white/5 font-mono">
                    <button 
                      onClick={triggerWipe}
                      className="w-full border border-red-500/30 text-red-500 flex items-center justify-center gap-3 py-4 text-xs font-bold uppercase tracking-[0.2em] hover:bg-red-500/10 transition-colors"
                    >
                      <Zap className="w-4 h-4" /> Autodestruição de Dados (Wipe)
                    </button>
                  </div>
                </>
              )}
            </div>

            <footer className="mt-auto text-center pb-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Protocolo Alpha Sync • Resiliência Terminal</p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
