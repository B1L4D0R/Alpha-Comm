import Peer from 'simple-peer';
import { EventEmitter } from 'events';
import LZString from 'lz-string';

export interface PeerConnection {
  id: string;
  peer: Peer.Instance;
  name: string;
  connected: boolean;
}

export class MeshService extends EventEmitter {
  private peers: Map<string, PeerConnection> = new Map();
  private myId: string = Math.random().toString(36).substr(2, 6).toUpperCase();
  private pendingInitiator: Peer.Instance | null = null;

  constructor() {
    super();
    console.log(`[MESH] Service started as: ${this.myId}`);
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

      p.on('connect', () => {
        this.registerPeer(this.myId, p, 'OPERATOR_PENDING');
        this.pendingInitiator = null;
      });

      p.on('data', data => {
        try {
          const msg = JSON.parse(data.toString());
          this.emit('message', msg);
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
          if (conn.peer === p) this.peers.delete(id);
        });
        this.emit('peer_disconnected');
      });
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

        p.on('connect', () => {
          this.registerPeer(offerData.senderId, p, `OPERATOR-${offerData.senderId}`);
        });

        p.on('data', data => {
          try {
            const msg = JSON.parse(data.toString());
            this.emit('message', msg);
          } catch (e) {
            console.error('[MESH] Data parse error', e);
          }
        });
        
        p.on('error', err => {
            console.error('[MESH] P2P Error:', err);
            this.emit('error', err);
        });
      } catch (e) {
        console.error('[MESH] Offer processing error', e);
      }
    });
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

  broadcast(message: any) {
    const payload = JSON.stringify(message);
    this.peers.forEach(conn => {
      if (conn.connected) {
        try {
          conn.peer.send(payload);
        } catch (e) {
          console.warn(`[MESH] Failed to send to ${conn.id}`, e);
        }
      }
    });
  }

  getMyId() {
    return this.myId;
  }
}

export const meshService = new MeshService();
