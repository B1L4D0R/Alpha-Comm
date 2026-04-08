import { useState, useEffect } from 'react';
import { Radio, MessageSquare, Battery, Zap, Signal, AlertTriangle, Key, X, Info, Terminal, Activity, Send, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { vault, type Message as VaultMessage } from './services/db';
import { meshService, type MeshMessage } from './services/mesh';
import HandshakeUI from './components/HandshakeUI';
import SOSWidget from './components/SOSWidget';
import InfoModal from './components/InfoModal';

interface Node {
  id: string;
  name: string;
  distance: number;
  hops: number;
  signal: 'Strong' | 'Weak' | 'Dead';
  battery: number;
  active: boolean;
}

interface Packet {
  id: string;
  time: string;
  type: string;
  source: string;
  size: string;
  status: string;
}

interface RelayItem {
  id: string;
  source: string;
  type: string;
}


export default function App() {
  const [activeTab, setActiveTab] = useState('RADAR');
  const [isStealthMode, setIsStealthMode] = useState(false);
  const [isCamoMode, setIsCamoMode] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [nodes, setNodes] = useState<Node[]>([
    { id: 'ALPHA-1', name: 'BASE-ALPHA', distance: 0, hops: 0, signal: 'Strong', battery: 88, active: true },
  ]);

  const [messages, setMessages] = useState<VaultMessage[]>([]);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [relayQueue, setRelayQueue] = useState<RelayItem[]>([]);
  const [emergencyAlert, setEmergencyAlert] = useState<{ sender: string, time: string } | null>(null);

  const addPacket = (type: string, source: string, size: string) => {
    const pkt = {
      id: Math.random().toString(36).substr(2, 4).toUpperCase(),
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      type,
      source,
      size,
      status: 'OK'
    };
    setPackets(prev => [pkt, ...prev].slice(0, 20));
  };


  // Load Initial Data from Real Vault
  useEffect(() => {
    const loadData = async () => {
      const history = await vault.messages.orderBy('time').reverse().limit(50).toArray();
      setMessages(history.reverse());
    };
    loadData();
  }, []);

  // Sync real mesh events to UI
  useEffect(() => {
    // 1. New Message Received (Direct or Relayed)
    meshService.on('message', async (msg: MeshMessage) => {
      // Handle different message types
      if (msg.type === 'BEACON') {
        const payload = msg.payload as { battery: number; signal: "Strong" | "Weak" | "Dead" };
        const { battery, signal } = payload;
        setNodes(prev => prev.map(n => 
          n.id === msg.senderId 
            ? { ...n, battery, signal, active: true } 
            : n
        ));
        return;
      }

      if (msg.type === 'SOS') {
        setEmergencyAlert({ 
          sender: msg.senderId.slice(0, 4), 
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
        });
        addPacket('SOS_ALRT', msg.senderId.slice(0, 4), 'PRIORITY_CRITICAL');
        return;
      }

      const payload = msg.payload as VaultMessage;
      const exists = await vault.messages.get(payload.id);
      
      if (!exists) {
        await vault.messages.add(payload);
        setMessages(prev => [...prev, payload]);
        
        // Show in terminal
        const isRelayed = msg.hops && msg.hops.length > 2;
        addPacket(
          isRelayed ? 'RELAY_IN' : 'RECV', 
          msg.senderId.slice(0, 4), 
          isRelayed ? `VIA_${msg.hops[msg.hops.length-2].slice(0,4)}` : 'DIRECT_LINK'
        );
      }
    });

    // 2. Relay Activity (This node is helping the mesh)
    meshService.on('relay_log', (data: { id: string, source: string, type: string }) => {
      const id = data.id.slice(0,4);
      setRelayQueue(prev => [...prev, { id, source: data.source.slice(0,4), type: data.type }].slice(-5));
      
      setTimeout(() => {
        setRelayQueue(prev => prev.filter(p => p.id !== id));
        addPacket('FORWARD', data.source.slice(0,4), `HOP_DECREMENT`);
      }, 1500);
    });

    meshService.on('peer_connected', (id: string) => {
      setNodes(prev => {
        if (prev.find(n => n.id === id)) return prev;
        return [...prev, {
          id,
          name: `OPERADOR-${id.slice(0,4)}`,
          distance: 0,
          hops: 1,
          signal: 'Strong',
          battery: 100,
          active: true
        }];
      });
      addPacket('JOIN', id.slice(0, 4), 'LINK_ESTABLISHED');
    });

    return () => {
      meshService.removeAllListeners();
    };
  }, []);

  const handleSend = async (text: string) => {
    const newMessage: VaultMessage = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: meshService.getMyId(),
      senderName: 'VOCÊ',
      text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      status: 'DELIVERED',
      isMe: true
    };

    await vault.messages.add(newMessage);
    setMessages(prev => [...prev, newMessage]);
    
    // Broadcast via ARP (Now returns a Promise due to encryption)
    const msgId = await meshService.broadcast(newMessage, 'CHAT');
    addPacket('XMIT', 'ME', `AES_PKT_${msgId}`);
  };


  const resolveName = (node: Node) => {
    return node.name;
  };

  return (
    <div className={`h-screen flex flex-col bg-obsidian text-gray-300 font-sans select-none overflow-hidden ${isCamoMode ? 'brightness-[0.15] contrast-150' : ''}`}>
      <div className="scanline"></div>
      
      {/* Emergency Overlay */}
      <AnimatePresence>
        {emergencyAlert && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] pointer-events-none border-[12px] border-red-600 animate-pulse bg-red-900/10 flex items-start justify-center pt-20"
          >
            <div className="bg-red-600 text-white px-6 py-3 rounded-full font-black tracking-[0.3em] flex items-center gap-3 shadow-[0_0_50px_rgba(220,38,38,0.5)] pointer-events-auto">
               <AlertTriangle className="w-6 h-6 animate-bounce" />
               MAYDAY :: OPERADOR-{emergencyAlert.sender} :: {emergencyAlert.time}
               <button 
                 onClick={() => setEmergencyAlert(null)}
                 className="ml-4 p-1 hover:bg-black/20 rounded-full transition-colors"
               >
                 <X className="w-5 h-5" />
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="px-4 py-3 border-b border-tactical-dark flex justify-between items-center bg-obsidian/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-tactical-orange" />
          <h1 className="text-sm font-bold tracking-widest text-white uppercase font-mono">
            ALPHA <span className="text-tactical-orange">COMM</span>
          </h1>
          <span className="hidden md:block text-[8px] font-mono text-tactical-orange/60 border border-tactical-orange/30 px-2 py-0.5 rounded ml-2">
            CRIPTO: ATIVO (AES-256)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowInfo(true)}
            className="p-1.5 text-gray-500 hover:text-cyber-cyan transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
          <div className="px-2 py-1 bg-cyber-dark border border-cyber-cyan/30 rounded flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-cyber-cyan animate-pulse"></div>
            <span className="text-[10px] font-mono text-cyber-cyan tracking-wider">LNK: SEGURO</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative flex flex-col pt-4">
        <AnimatePresence mode="wait">
          {activeTab === 'RADAR' && (
            <RadarScreen 
              key="radar" 
              nodes={nodes} 
              isTransmitting={packets.some(p => p.type === 'XMIT')}
              resolveName={resolveName}
            />
          )}
          {activeTab === 'CHAT' && (
            <ChatScreen 
              key="chat" 
              messages={messages} 
              onSendMessage={handleSend}
            />
          )}
          {activeTab === 'PAIR' && (
            <HandshakeUI 
              onSuccess={() => setActiveTab('RADAR')} 
              onCancel={() => setActiveTab('RADAR')} 
            />
          )}
          {activeTab === 'NET' && (
            <TacticalTerminal 
              key="net" 
              packets={packets} 
              relayQueue={relayQueue} 
              onClear={async () => {
                await vault.messages.clear();
                setMessages([]);
                addPacket('SYSTEM', 'SELF-DESTRUCT', 'ALL-LOGS-WIPED');
              }} 
            />
          )}
          {activeTab === 'POWER' && (
            <PowerSystem 
              key="power"
              onToggleStealth={() => setIsStealthMode(!isStealthMode)}
              onToggleCamo={() => setIsCamoMode(!isCamoMode)}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <nav className="border-t border-tactical-dark bg-obsidian/90 backdrop-blur-md z-10 pb-env(safe-area-inset-bottom)">
        <div className="flex justify-around items-center p-2">
          <NavButton 
            icon={<Signal />} 
            label="RADAR" 
            active={activeTab === 'RADAR'} 
            onClick={() => setActiveTab('RADAR')} 
          />
          <NavButton 
            icon={<MessageSquare />} 
            label="COMUNICAÇÕES" 
            active={activeTab === 'CHAT'} 
            onClick={() => setActiveTab('CHAT')} 
          />
          <NavButton 
            icon={<Activity />} 
            label="REDE" 
            active={activeTab === 'NET'} 
            onClick={() => setActiveTab('NET')} 
          />
          <NavButton 
            icon={<Battery />} 
            label="ENERGIA" 
            active={activeTab === 'POWER'} 
            onClick={() => setActiveTab('POWER')} 
          />
          <NavButton 
            icon={<Key />} 
            label="PAREAR" 
            active={activeTab === 'PAIR'} 
            onClick={() => setActiveTab('PAIR')} 
          />
        </div>
      </nav>

      <AnimatePresence>
        {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      </AnimatePresence>

      {/* PWA Update Banner */}
      <AnimatePresence>
        {(offlineReady || needRefresh) && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-28 left-4 right-4 z-[70] bg-cyber-dark border border-cyber-cyan p-4 flex justify-between items-center shadow-[0_0_20px_rgba(0,240,255,0.2)]"
          >
            <div className="text-xs font-mono text-cyber-cyan">
              {offlineReady ? 'SISTEMA DISPONÍVEL OFFLINE' : 'NOVA ATUALIZAÇÃO DISPONÍVEL'}
            </div>
            <div className="flex gap-2">
              {needRefresh && (
                <button 
                  onClick={() => updateServiceWorker(true)}
                  className="bg-cyber-cyan text-obsidian px-3 py-1 font-bold text-[10px] uppercase"
                >
                  ATUALIZAR
                </button>
              )}
              <button 
                onClick={() => { setOfflineReady(false); setNeedRefresh(false); }}
                className="text-gray-500 hover:text-white px-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SOSWidget />
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center p-2 transition-all ${
        active ? 'text-tactical-orange' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      <div className={`mb-1 ${active ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,79,0,0.5)]' : ''}`}>
        {icon}
      </div>
      <span className="text-[9px] font-mono font-bold tracking-widest">{label}</span>
      {active && <div className="w-1 h-1 bg-tactical-orange rounded-full mt-1"></div>}
    </button>
  );
}

function RadarScreen({ nodes, isTransmitting, resolveName }: { nodes: Node[], isTransmitting?: boolean, resolveName: (n: Node) => string }) {
  const ticks = Array.from({ length: 180 }, (_, i) => i * 2); // Ticks every 2 degrees

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 p-12 flex flex-col items-center justify-center relative bg-obsidian"
    >
      {/* Background World Grid Area (Conceptual) */}
      <div className="absolute inset-0 opacity-[0.05] flex flex-col pointer-events-none">
        <div className="flex w-full justify-around border-b border-cyber-cyan p-2 text-[8px] font-mono">
          {['A','B','C','D','E','F','G','H','I'].map(l => <span key={l}>{l}</span>)}
        </div>
        <div className="flex-1 flex justify-between">
          <div className="flex flex-col h-full justify-around p-2 text-[8px] font-mono border-r border-cyber-cyan">
            {[1,2,3,4,5,6,7,8].map(n => <span key={n}>{n}</span>)}
          </div>
          <div className="flex-1 grid grid-cols-9 grid-rows-8 border-cyber-cyan/20">
             {Array.from({length: 72}).map((_, i) => <div key={i} className="border-[0.5px] border-cyber-cyan/5"></div>)}
          </div>
        </div>
      </div>

      <div className="relative aspect-square w-full max-w-[280px] mx-auto flex items-center justify-center">
        
        {/* OUTER BEZEL (Sport Watch Style) */}
        <div className="absolute inset-[-15px] border-[1px] border-cyber-cyan/30 rounded-full"></div>
        


        {/* Bezel Ticks */}
        {ticks.map(tick => (
          <div 
            key={tick}
            className="absolute inset-[-20px] flex justify-center pointer-events-none"
            style={{ transform: `rotate(${tick}deg)` }}
          >
            <div className={`w-[1px] bg-cyber-cyan/40 ${tick % 10 === 0 ? 'h-2' : 'h-1'}`}></div>
          </div>
        ))}

        {/* MAIN RADAR CONTAINER */}
        <div className="relative w-full h-full border-2 border-cyber-cyan/60 rounded-full bg-cyber-dark/40 shadow-[0_0_40px_rgba(0,240,255,0.15),inset_0_0_20px_rgba(0,240,255,0.1)] overflow-hidden">
          
          {/* Scope Rings */}
          <div className="absolute inset-[15%] border border-cyber-cyan/20 rounded-full"></div>
          <div className="absolute inset-[35%] border border-cyber-cyan/20 rounded-full"></div>
          <div className="absolute inset-[48%] border-2 border-cyber-cyan/40 rounded-full shadow-[0_0_10px_rgba(0,240,255,0.2)]"></div>
          
          {/* Crosshairs with Notches */}
          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-cyber-cyan/40 flex justify-around px-4">
             {Array.from({length: 10}).map((_, i) => <div key={i} className="w-[1px] h-1 bg-cyber-cyan/40 -translate-y-[1.5px]"></div>)}
          </div>
          <div className="absolute left-1/2 top-0 w-[1px] h-full bg-cyber-cyan/40 flex flex-col justify-around py-4">
             {Array.from({length: 10}).map((_, i) => <div key={i} className="h-[1px] w-1 bg-cyber-cyan/40 -translate-x-[1.5px]"></div>)}
          </div>

          {/* Radar Sweep */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-50%] z-10 origin-center pointer-events-none"
            style={{
              background: 'conic-gradient(from 0deg at 50% 50%, rgba(0, 240, 255, 0.25) 0deg, transparent 45deg)'
            }}
          />

          {/* Transmission Pulse */}
          <AnimatePresence>
            {isTransmitting && (
              <motion.div 
                initial={{ scale: 0, opacity: 1 }}
                animate={{ scale: 2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 border-2 border-tactical-orange/50 rounded-full z-20"
              />
            )}
          </AnimatePresence>

          {/* Nodes / Blips */}
          <div className="relative w-full h-full z-20">
             {nodes.map((node, i) => {
               const angle = (i * 137.5) % 360;
               const radius = node.distance === 0 ? 0 : 20 + (node.distance * 30);
               return (
                 <motion.div 
                   key={node.id}
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   style={{ 
                     position: 'absolute',
                     left: '50%',
                     top: '50%',
                     transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px)`
                   }}
                 >
                   <div style={{ transform: `rotate(-${angle}deg)` }} className="group relative">
                     {/* Tactical Blip (Crosshair dot) */}
                     <div className={`relative flex items-center justify-center`}>
                        <div className={`w-3 h-3 border border-cyber-cyan rounded-full transition-colors duration-500 ${
                          node.distance === 0 
                            ? 'bg-tactical-orange animate-pulse' 
                            : node.battery < 20 
                              ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse' 
                              : node.battery < 50 
                                ? 'bg-yellow-500' 
                                : 'bg-cyber-cyan'
                        }`}></div>
                        <div className={`absolute -top-1 -left-1 w-5 h-5 border rounded-full animate-ping ${
                          node.battery < 20 ? 'border-red-500/40' : 'border-cyber-cyan/20'
                        }`}></div>
                     </div>
                     <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-cyber-dark/95 border border-cyber-cyan/30 px-2 py-0.5 rounded text-[8px] font-bold text-cyber-cyan whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity uppercase font-mono shadow-[0_0_10px_rgba(0,0,0,0.5)] z-30">
                        {resolveName(node)} • {node.battery}%
                     </div>
                   </div>
                 </motion.div>
               );
             })}
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm mt-12 grid grid-cols-2 gap-4 px-4">
         <div className="bg-cyber-dark/60 p-3 border border-cyber-cyan/30 rounded backdrop-blur-md relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-cyber-cyan"></div>
            <div className="text-[9px] text-cyber-cyan/50 uppercase font-black tracking-widest mb-1">Operadores</div>
            <div className="text-2xl font-black text-white font-mono">{nodes.length} <span className="text-[10px] text-cyber-cyan/40">ACT</span></div>
         </div>
         <div className="bg-cyber-dark/60 p-3 border border-cyber-cyan/30 rounded backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-tactical-orange"></div>
            <div className="text-[9px] text-tactical-orange/50 uppercase font-black tracking-widest mb-1">Status de Malha</div>
            <div className="text-[10px] font-black text-white font-mono mt-1">SEGURO :: E2EE</div>
         </div>
      </div>
    </motion.div>
  );
}

function ChatScreen({ messages, onSendMessage }: { messages: VaultMessage[], onSendMessage: (txt: string) => void }) {
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col"
    >
      <div className="p-3 border-b border-tactical-dark bg-obsidian flex justify-between items-center">
        <div>
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">Canal Global de Operações</h2>
          <span className="text-[9px] text-cyber-cyan font-mono">Camada ARP • Rede Mesh Ativa</span>
        </div>
        <div className="flex items-center gap-1.5 text-[8px] font-mono text-cyber-cyan animate-pulse">
          <Key className="w-3 h-3" /> CRIPTOGRAFIA E2E ATIVA
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-lg border font-mono ${
              msg.isMe 
                ? 'bg-tactical-orange/10 border-tactical-orange/40 rounded-br-none text-white' 
                : 'bg-cyber-dark border-cyber-cyan/30 rounded-bl-none text-gray-300'
            }`}>
              <div className="flex justify-between items-baseline mb-1 gap-4">
                <span className={`text-[8px] font-black uppercase tracking-widest ${msg.isMe ? 'text-tactical-orange' : 'text-cyber-cyan'}`}>
                  {msg.senderName}
                </span>
                <span className="text-[8px] text-gray-500 flex items-center gap-1">
                  {msg.isEncrypted && <ShieldCheck className="w-2.5 h-2.5 text-cyber-cyan" />}
                  {msg.time}
                </span>
              </div>
              <p className="text-xs leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-tactical-dark bg-obsidian/80 backdrop-blur-md flex gap-2">
        <button className="p-2 border border-tactical-dark rounded text-gray-500 hover:text-cyber-cyan transition-colors">
          <Zap className="w-4 h-4" />
        </button>
        <input 
          type="text" 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Transmitir mensagem segura..."
          className="flex-1 bg-cyber-dark/50 border border-tactical-dark rounded px-3 py-2 text-xs focus:outline-none focus:border-cyber-cyan transition-colors"
        />
        <button 
          onClick={handleSend}
          className="p-2 bg-tactical-orange/20 border border-tactical-orange/40 rounded text-tactical-orange hover:bg-tactical-orange/30 transition-all font-bold"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

function TacticalTerminal({ packets, relayQueue, onInject, onClear }: { packets: Packet[], relayQueue: RelayItem[], onInject?: () => void, onClear: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 p-4 font-mono flex flex-col"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
          <Terminal className="w-4 h-4" /> MONITOR DE TRÁFEGO
        </h2>
        <div className="flex gap-2">
          {onInject && (
            <button 
              onClick={onInject}
              className="text-[10px] px-2 py-1 border border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors uppercase"
            >
              Injetar Pacote
            </button>
          )}
          <button 
            onClick={onClear}
            className="text-[10px] px-2 py-1 border border-red-900/50 text-red-500 hover:bg-red-900/20 transition-colors uppercase"
          >
            Limpar Logs
          </button>
        </div>
      </div>
      
      {/* Relay Buffer Visualization */}
      <div className="mb-6 p-3 bg-obsidian/50 border border-gray-800 rounded">
        <div className="text-[10px] text-gray-500 uppercase mb-2">Buffer de Relé ({relayQueue.length}/10)</div>
        <div className="flex gap-1 flex-wrap">
          {relayQueue.map((p, i) => (
             <motion.div 
               key={p.id}
               animate={{ opacity: [1, 0.5, 1] }} 
               transition={{ repeat: Infinity, duration: 1, delay: i * 0.1 }}
               className="w-4 h-4 bg-tactical-orange/30 border border-tactical-orange rounded-[2px]"
             />
          ))}
          {relayQueue.length === 0 && <div className="text-[8px] text-gray-700 italic">Buffer Vazio</div>}
        </div>
      </div>

      <div className="space-y-2 flex-1 overflow-y-auto">
        {packets.length === 0 && (
          <div className="text-[10px] text-gray-600 animate-pulse italic">
            Aguardando tráfego na malha...
          </div>
        )}
        {packets.map((pkt) => (
          <div 
            key={pkt.id}
            className="flex flex-col gap-1 border-l-2 border-gray-800 pl-3 py-1 text-[10px]"
          >
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className={pkt.status === 'OK' ? 'text-cyber-cyan' : 'text-yellow-500'}>
                [{pkt.time}] {pkt.type}::{pkt.source}
              </span>
              <span className="text-gray-600">{pkt.size} - STATUS: {pkt.status === 'OK' ? 'CONCLUÍDO' : 'PENDENTE'}</span>
            </div>
            <div className="flex gap-4 text-gray-500">
              <span>SRC: <span className="text-gray-300">{pkt.source}</span></span>
              <span>ID: <span className="text-gray-300">{pkt.id}</span></span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function PowerSystem({ onToggleStealth, onToggleCamo }: { onToggleStealth: () => void, onToggleCamo: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex-1 p-6 space-y-6"
    >
      <div className="bg-cyber-dark p-6 border border-cyber-cyan/30 rounded-lg flex flex-col items-center">
         <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90">
              <circle cx="64" cy="64" r="58" fill="transparent" stroke="#1a0d00" strokeWidth="8" />
              <circle cx="64" cy="64" r="58" fill="transparent" stroke="#00F0FF" strokeWidth="8" strokeDasharray="364.4" strokeDashoffset="72.8" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
               <span className="text-3xl font-black text-white">80%</span>
               <span className="text-[8px] text-cyber-cyan uppercase font-bold tracking-widest">Estável</span>
            </div>
         </div>
      </div>

      <div className="space-y-3">
         <ToggleButton label="Módulo Furtivo" onClick={onToggleStealth} icon={<Zap className="w-4 h-4" />} />
         <ToggleButton label="Modo Camuflagem" onClick={onToggleCamo} icon={<Activity className="w-4 h-4" />} />
      </div>

      <div className="p-4 bg-tactical-dark border border-gray-800 rounded text-[10px] leading-relaxed text-gray-400">
         <AlertTriangle className="w-4 h-4 text-tactical-orange mb-2" />
         <p>O Modo Camuflagem reduz a luminosidade do display para zero e aumenta o contraste para uso em situações de luz solar direta ou operação furtiva noturna.</p>
      </div>
    </motion.div>
  );
}

function ToggleButton({ label, onClick, icon }: { label: string, onClick: () => void, icon: React.ReactNode }) {
  const [active, setActive] = useState(false);
  return (
    <button 
      onClick={() => { setActive(!active); onClick(); }}
      className={`w-full p-4 border rounded flex items-center justify-between transition-all ${
        active ? 'bg-cyber-cyan border-cyber-cyan text-obsidian shadow-[0_0_15px_rgba(0,240,255,0.4)]' : 'bg-obsidian border-gray-800 text-gray-400 hover:border-gray-500'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className={`w-8 h-4 rounded-full relative transition-colors ${active ? 'bg-obsidian' : 'bg-tactical-dark'}`}>
         <motion.div 
           animate={{ x: active ? 16 : 4 }}
           className={`absolute top-1 w-2 h-2 rounded-full ${active ? 'bg-cyber-cyan' : 'bg-gray-600'}`}
         />
      </div>
    </button>
  );
}
