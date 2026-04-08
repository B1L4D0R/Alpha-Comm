import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { meshService } from '../services/mesh';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, Camera, Terminal, Key, AlertCircle } from 'lucide-react';

interface HandshakeUIProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const HandshakeUI: React.FC<HandshakeUIProps> = ({ onSuccess, onCancel }) => {
  const [mode, setMode] = useState<'IDLE' | 'GENERATE' | 'SCAN' | 'ANSWERING'>('IDLE');
  const [sdpData, setSdpData] = useState<string>('');
  const [log, setLog] = useState<string[]>(['> INICIANDO MÓDULO DE PAREAMENTO...']);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const addLog = (msg: string) => setLog(prev => [...prev.slice(-4), `> ${msg}`]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleGenerateOffer = async () => {
    setMode('GENERATE');
    addLog('GERANDO SDP OFFER (COMPRIMIDO)...');
    const offer = await meshService.createInitiator();
    setSdpData(offer);
    addLog('AGUARDANDO LEITURA DO OPERADOR REMOTO...');
  };

  const handleStartScan = async () => {
    setMode('SCAN');
    setError(null);
    addLog('INICIALIZANDO SCANNER ÓPTICO...');
    
    // Defer initialization to allow DOM update
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("reader");
        scannerRef.current = scanner;
        
        await scanner.start(
          { facingMode: "environment" }, 
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            scanner.stop().then(() => {
              processScannedData(decodedText);
            });
          },
          undefined
        );
        addLog('SISTEMA ÓPTICO ONLINE.');
      } catch (err: any) {
        console.error(err);
        setError("FALHA AO ACESSAR CÂMERA. VERIFIQUE AS PERMISSÕES.");
        addLog('ERRO: SENSOR NÃO DETECTADO.');
      }
    }, 300);
  };

  const processScannedData = async (data: string) => {
    addLog('DADOS CAPTURADOS (CRIPTO-SDP)...');
    
    if (mode === 'SCAN') {
      // We are Peer B scanning Peer A's offer
      addLog('OFERTA DETECTADA. GERANDO RESPOSTA...');
      const answer = await meshService.acceptOffer(data);
      setSdpData(answer);
      setMode('ANSWERING');
      addLog('RESPOSTA GERADA. TRANSMITA PARA O OPERADOR A.');
    } else if (mode === 'GENERATE') {
      // We are Peer A scanning Peer B's answer
      addLog('RESPOSTA DETECTADA. FINALIZANDO LINK...');
      meshService.finalizeConnection(data);
      addLog('CONEXÃO SEGURA ESTABELECIDA.');
      setTimeout(onSuccess, 2000);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 bg-obsidian text-cyber-cyan font-mono relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(var(--color-cyber-cyan) 1px, transparent 1px), linear-gradient(90deg, var(--color-cyber-cyan) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
      
      <div className="z-10 flex flex-col items-center justify-center flex-grow space-y-8">
        <AnimatePresence mode="wait">
          {mode === 'IDLE' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="grid grid-cols-1 gap-4 w-full max-w-xs"
            >
              <button 
                onClick={handleGenerateOffer}
                className="flex items-center justify-between p-6 bg-cyber-dark border border-cyber-cyan rounded-lg hover:bg-cyber-cyan/10 transition-all group"
              >
                <div className="text-left">
                  <div className="text-sm font-black uppercase tracking-widest">Transmitir</div>
                  <div className="text-[10px] opacity-50">Gerar código de convite</div>
                </div>
                <QrCode className="w-8 h-8 group-hover:scale-110 transition-transform" />
              </button>
              
              <button 
                onClick={handleStartScan}
                className="flex items-center justify-between p-6 bg-cyber-dark border border-cyber-cyan/30 rounded-lg hover:bg-cyber-cyan/10 transition-all group"
              >
                <div className="text-left">
                  <div className="text-sm font-black uppercase tracking-widest">Capturar</div>
                  <div className="text-[10px] opacity-50">Escanear operador próximo</div>
                </div>
                <Camera className="w-8 h-8 group-hover:scale-110 transition-transform" />
              </button>

              <div className="mt-4 p-3 bg-cyber-cyan/10 border border-cyber-cyan/30 rounded flex items-start gap-3">
                 <Key className="w-4 h-4 mt-0.5 shrink-0" />
                 <p className="text-[9px] uppercase leading-relaxed font-bold">Aviso: Todo o processo de pareamento é criptografado e offline. Nenhum dado sai da rede mesh.</p>
              </div>
            </motion.div>
          )}

          {(mode === 'GENERATE' || mode === 'ANSWERING') && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center space-y-6"
            >
              <div className="relative p-4 bg-white rounded-xl shadow-[0_0_50px_rgba(0,240,255,0.2)]">
                {sdpData ? (
                  <QRCodeSVG value={sdpData} size={280} level="Q" marginSize={3} />
                ) : (
                  <div className="w-[220px] h-[220px] flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-center max-w-[200px] uppercase font-bold tracking-widest leading-relaxed">
                {mode === 'GENERATE' ? 'Peça para o outro operador escanear este código' : 'Mostre para o Operador A finalizar o link'}
              </p>
              
              {mode === 'GENERATE' && (
                 <button 
                  onClick={handleStartScan}
                  className="mt-4 flex items-center gap-2 px-4 py-2 border border-cyber-cyan text-xs font-bold uppercase tracking-widest hover:bg-cyber-cyan/10"
                >
                  <Camera className="w-4 h-4" /> Escanear Resposta
                </button>
              )}

              <div className="flex items-center gap-2 text-[10px] text-cyber-cyan/60 font-bold uppercase tracking-[0.2em] animate-pulse">
                <Key className="w-3 h-3" /> Link Seguro (AES-256)
              </div>
            </motion.div>
          )}

          {mode === 'SCAN' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-sm aspect-square bg-black border border-cyber-cyan/50 overflow-hidden relative rounded-lg"
            >
              {error ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <AlertCircle className="w-12 h-12 text-red-500 animate-pulse" />
                  <p className="text-xs font-bold text-red-500 uppercase tracking-widest leading-relaxed">
                    {error}
                  </p>
                  <button 
                    onClick={handleStartScan}
                    className="px-4 py-2 bg-cyber-cyan text-obsidian text-[10px] font-black uppercase tracking-widest"
                  >
                    Tentar Novamente
                  </button>
                </div>
              ) : (
                <>
                  <div id="reader" className="w-full h-full"></div>
                  <div className="absolute inset-0 pointer-events-none border-2 border-cyber-cyan/30 animate-pulse"></div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Terminal Log Output */}
      <div className="mt-8 bg-cyber-dark/50 border border-gray-800 p-4 rounded min-h-[100px]">
        <div className="flex items-center gap-2 mb-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
          <Terminal className="w-3 h-3" /> Status do Link
        </div>
        <div className="space-y-1">
          {log.map((l, i) => (
            <div key={i} className="text-[10px] font-mono leading-tight">{l}</div>
          ))}
        </div>
      </div>

      <button 
        onClick={onCancel}
        className="mt-6 text-[10px] font-black uppercase text-gray-500 hover:text-red-500 transition-colors tracking-[0.3em]"
      >
        Cancelar Operação
      </button>
    </div>
  );
};

export default HandshakeUI;
