import Dexie, { type Table } from 'dexie';

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  status: 'SENDING' | 'DELIVERED' | 'FAILED' | 'RECONSTRUCTING';
  isMe: boolean;
  type?: 'TEXT' | 'MEDIA';
  progress?: number;
  chunks?: { received: number; total: number };
  isEncrypted?: boolean;
}

export interface Operator {
  id: string;
  name: string;
  publicKey: string;
  lastSeen: number;
  isPaired: boolean;
}

export interface UserProfile {
  id: string;
  callsign: string;
  shortId: string;
  publicKey: string;
  privateKey: string;
  setupComplete: boolean;
}

export class AlphaVault extends Dexie {
  messages!: Table<Message>;
  operators!: Table<Operator>;
  profile!: Table<UserProfile>;

  constructor() {
    super('AlphaVault');
    this.version(2).stores({
      messages: 'id, senderId, time',
      operators: 'id, name, isPaired',
      profile: 'id'
    });
  }

  async getProfile(): Promise<UserProfile | undefined> {
    return await this.profile.toCollection().first();
  }
}

export const vault = new AlphaVault();
