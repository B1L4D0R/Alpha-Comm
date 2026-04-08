import React from 'react';
import { motion } from 'framer-motion';
import { X, Key } from 'lucide-react';

interface InfoModalProps {
  onClose: () => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ onClose }) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-obsidian/95 backdrop-blur-md flex items-center justify-center p-6"
    >
      <div className="bg-cyber-dark/80 p-6 rounded-lg border border-cyber-cyan/30 max-w-sm w-full mx-4 shadow-[0_0_50px_rgba(0,240,255,0.1)]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-black uppercase tracking-tighter text-white">Sobre o Alpha Comm</h2>
          <button onClick={onClose} className="p-1 hover:text-white transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <div className="space-y-4 text-xs leading-relaxed text-gray-400 font-mono">
          <div className="p-3 bg-cyber-cyan/10 border border-cyber-cyan/30 rounded">
            <p className="text-cyber-cyan font-bold uppercase mb-1 flex items-center gap-2">
              <Key className="w-4 h-4" /> Segurança de Nível Militar
            </p>
            <p>Todas as trocas de informações nesta rede são criptografadas de ponta a ponta (E2E) usando os protocolos AES-256 e RSA-4096. No Alpha Comm, a sua privacidade é garantida por hardware, sem servidores intermediários.</p>
          </div>
          <p>O Alpha Comm é um sistema de mensageria tática offline-first. Ele utiliza Bluetooth e Wi-Fi Direct para criar uma rede mesh operando em silêncio de rádio.</p>
          <div className="pt-4 border-t border-tactical-dark">
            <div className="flex justify-between text-[10px] uppercase font-black text-gray-500">
              <span>Versão</span>
              <span>1.1.0-ELITE</span>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="w-full mt-6 bg-cyber-cyan text-obsidian py-3 rounded font-bold uppercase text-[10px]"
        >
          Entendido
        </button>
      </div>
    </motion.div>
  );
};

export default InfoModal;
