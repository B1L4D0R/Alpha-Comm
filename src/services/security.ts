/**
 * ALPHA CODE TACTICAL SECURITY LAYER
 * Implementation of AES-GCM 256-bit End-to-End Encryption
 */

const DEFAULT_SALT = new TextEncoder().encode('alpha-tactical-salt');
const ITERATIONS = 100000;

class SecurityService {
  private key: CryptoKey | null = null;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  /**
   * Initialize a 256-bit AES-GCM key from a shared tactical secret
   */
  async initializeKey(secret: string = 'ALPHA-CODE-DEFAULT-MESH-SECRET') {
    const rawKey = this.encoder.encode(secret);
    
    // Import the raw secret as a base key
    const baseKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Derive the final AES-GCM key using PBKDF2
    this.key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: DEFAULT_SALT,
        iterations: ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    console.log('[SECURITY] Mesh encryption key initialized.');
  }

  /**
   * Encrypt a plain text message
   */
  async encrypt(text: string): Promise<string> {
    if (!this.key) await this.initializeKey();
    
    // Create a random Initialization Vector (IV) for each message
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = this.encoder.encode(text);

    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.key!,
      encodedText
    );

    // Combine IV and Ciphertext for transport
    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);

    // Encode to Base64 (using btoa/uint8array trick)
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt a cipher text
   */
  async decrypt(cipherBase64: string): Promise<string> {
    if (!this.key) await this.initializeKey();

    try {
      // Decode Base64
      const binaryString = atob(cipherBase64);
      const combined = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        combined[i] = binaryString.charCodeAt(i);
      }

      // Extract IV and Ciphertext
      const iv = combined.slice(0, 12);
      const encryptedContent = combined.slice(12);

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.key!,
        encryptedContent
      );

      return this.decoder.decode(decryptedBuffer);
    } catch (e) {
      console.error('[SECURITY] Decryption failed. Possible key mismatch.', e);
      return '[[ ERRO DE DESCRIPTOGRAFIA: CHAVE INCORRETA ]]';
    }
  }
}

export const securityService = new SecurityService();
