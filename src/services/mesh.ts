import Peer from 'simple-peer';
import { EventEmitter } from 'events';
import LZString from 'lz-string';
import { securityService } from './security';

export interface PeerConnection {
  id: string;
  peer: Peer.Instance;
  name: string;
  connected: boolean;
}

export interface MeshMessage {
  msgId: string;
  ttl: number;
  senderId: string;
  timestamp: number;
  type: 'CHAT' | 'SOS' | 'BEACON' | 'RELAY';
  payload: unknown;
  hops: string[]; // Track which nodes this message has passed through
  isEncrypted?: boolean;
}

export class MeshService extends EventEmitter {
  private peers: Map<string, PeerConnection> = new Map();
  private myId: string = Math.random().toString(36).substr(2, 6).toUpperCase();
  private pendingInitiator: Peer.Instance | null = null;
  private seenMessageIds: Set<string> = new Set();
  private beaconInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    console.log(`[MESH] Service started as: ${this.myId}`);
    
    // Periodically clean seen messages to free memory
    setInterval(() => {
        if (this.seenMessageIds.size > 1000) this.seenMessageIds.clear();
    }, 10 * 60 * 1000);

    this.startStatusBeacon();
    securityService.initializeKey();
  }

  startStatusBeacon() {
    if (this.beaconInterval) return;
    this.beaconInterval = setInterval(async () => {
      // Simulate battery level (would use navigator.getBattery() in production)
      const battery = Math.floor(Math.random() * 100);
      const signal = Math.random() > 0.3 ? 'Strong' : 'Weak';
      
      this.broadcast({ battery, signal }, 'BEACON');
    }, 30000); // Every 30 seconds
  }

  stopStatusBeacon() {
    if (this.beaconInterval) {
      clearInterval(this.beaconInterval);
      this.beaconInterval = null;
    }
  }

  // Create an initiator peer and generate an offer (for Peer B to scan)
  createInitiator(): Promise<string> {
    if (this.pendingInitiator) {
      this.pendingInitiator.destroy();
    }

    return new Promise((resolve) => {
      const p = new Peer({ initiator: true, trickle: false });
      this.pendingInitiator = p;
      
      p.on('signal', data => {
        // Encode and compress the SDP Offer
        const payload = JSON.stringify({ ...data, senderId: this.myId });
        const compressed = LZString.compressToEncodedURIComponent(payload);
        resolve(compressed);
      });

      this.setupHandlers(p, 'OPERATOR_PENDING');
    });
  }

  // Act as non-initiator (Peer B), scan compressed offer, generate compressed answer
  acceptOffer(compressedOffer: string): Promise<string> {
    return new Promise((resolve) => {
      try {
        const decompressed = LZString.decompressFromEncodedURIComponent(compressedOffer);
        if (!decompressed) throw new Error('Failed to decompress offer');
        const offerData = JSON.parse(decompressed);
        const p = new Peer({ initiator: false, trickle: false });

        p.on('signal', data => {
          const payload = JSON.stringify({ ...data, senderId: this.myId });
          const compressedAnswer = LZString.compressToEncodedURIComponent(payload);
          resolve(compressedAnswer);
        });

        p.signal(offerData);
        this.setupHandlers(p, offerData.senderId);
      } catch (e) {
        console.error('[MESH] Offer processing error', e);
      }
    });
  }

  private setupHandlers(p: Peer.Instance, remoteId: string) {
    p.on('connect', () => {
        this.registerPeer(remoteId, p, `OPERATOR-${remoteId.slice(0,4)}`);
        if (p === this.pendingInitiator) this.pendingInitiator = null;
    });

    p.on('data', data => {
      try {
        const msg: MeshMessage = JSON.parse(data.toString());
        this.handleIncomingMessage(msg);
      } catch (e) {
        console.error('[MESH] Data parse error', e);
      }
    });

    p.on('error', err => {
      console.error('[MESH] P2P Error:', err);
      this.emit('error', err);
    });
    
    p.on('close', () => {
      this.peers.forEach((conn, id) => {
        if (conn.peer === p) {
            this.peers.delete(id);
            this.emit('peer_disconnected', id);
        }
      });
    });
  }

  private async handleIncomingMessage(msg: MeshMessage) {
    // 1. Check for Duplicate
    if (this.seenMessageIds.has(msg.msgId)) return;
    
    // 2. Add to seen list
    this.seenMessageIds.add(msg.msgId);
    
    // 3. Update Hops
    if (!msg.hops) msg.hops = [];
    const sourceNode = msg.hops[msg.hops.length - 1] || msg.senderId;
    msg.hops.push(this.myId);

    // 4. Decrypt if needed
    const processedMsg: MeshMessage = { ...msg };
    if (msg.type === 'CHAT' || msg.type === 'SOS') {
      const decryptedPayload = await securityService.decrypt(msg.payload as string);
      try {
        processedMsg.payload = JSON.parse(decryptedPayload);
        processedMsg.isEncrypted = true; // Flag for UI
      } catch {
        processedMsg.payload = { text: decryptedPayload };
        processedMsg.isEncrypted = false;
      }
    }

    // 5. Emit locally
    this.emit('message', processedMsg);
    
    // 6. RELAY logic (Relay the ORIGINAL encrypted message to maintain E2EE)
    if (msg.ttl > 0) {
      this.emit('relay_log', {
        id: msg.msgId,
        source: sourceNode,
        type: msg.type
      });
      
      const relayMessage: MeshMessage = {
        ...msg,
        ttl: msg.ttl - 1
      };
      
      this.relay(relayMessage, sourceNode);
    }
  }

  // Peer A (initiator) scans the compressed answer from Peer B
  finalizeConnection(compressedAnswer: string) {
    try {
      const decompressed = LZString.decompressFromEncodedURIComponent(compressedAnswer);
      if (!decompressed) throw new Error('Failed to decompress answer');
      const answerData = JSON.parse(decompressed);
      if (this.pendingInitiator) {
        this.pendingInitiator.signal(answerData);
      }
    } catch (e) {
      console.error('[MESH] Finalization error', e);
    }
  }

  private registerPeer(id: string, peer: Peer.Instance, name: string) {
    this.peers.set(id, { id, peer, name, connected: true });
    this.emit('peer_connected', id);
  }

  async broadcast(payload: unknown, type: MeshMessage['type'] = 'CHAT') {
    const msgId = Math.random().toString(36).substr(2, 6).toUpperCase();
    
    // Encrypt payload if it's sensitive
    let finalPayload: any = payload;
    if (type === 'CHAT' || type === 'SOS') {
      finalPayload = await securityService.encrypt(JSON.stringify(payload));
    }

    const message: MeshMessage = {
      msgId,
      ttl: 5,
      senderId: this.myId,
      timestamp: Date.now(),
      type,
      payload: finalPayload,
      hops: [this.myId]
    };
    
    this.seenMessageIds.add(msgId);
    this.relay(message);
    return msgId;
  }

  private relay(message: MeshMessage, excludeId?: string) {
    const payload = JSON.stringify(message);
    this.peers.forEach(conn => {
      // Don't send back to the node that just sent it to us
      if (conn.connected && conn.id !== excludeId) {
        try {
          conn.peer.send(payload);
        } catch (e) {
          console.warn(`[MESH] Failed relay to ${conn.id}`, e);
        }
      }
    });
  }

  getMyId() {
    return this.myId;
  }
}

export const meshService = new MeshService();
