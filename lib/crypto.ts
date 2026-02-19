// lib/crypto.ts
// Criptografia AES-256-GCM usando Web Crypto API nativa (sem dependências externas)

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptField(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...Array.from(combined)));
}

export async function decryptField(encoded: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return dec.decode(plaintext);
}

// Adicionar ao final de lib/crypto.ts

// Gera uma chave AES-256 aleatória para o household
export async function generateHouseholdKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
}

// Exporta CryptoKey → base64 (para guardar criptografada)
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(raw))));
}

// Importa base64 → CryptoKey
export async function importKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// Criptografa a chave do household com o PIN do usuário
export async function encryptHouseholdKey(
  householdKey: CryptoKey, pin: string
): Promise<{ encryptedKey: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinKey = await deriveKey(pin, salt);
  const rawHK = await exportKey(householdKey);
  const enc = await encryptField(rawHK, pinKey);
  return {
    encryptedKey: enc,
    salt: btoa(String.fromCharCode(...Array.from(salt))),
  };
}

// Descriptografa e retorna a chave do household
export async function decryptHouseholdKey(
  encryptedKey: string, salt: string, pin: string
): Promise<CryptoKey> {
  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
  const pinKey = await deriveKey(pin, saltBytes);
  const rawHK = await decryptField(encryptedKey, pinKey);
  return importKey(rawHK);
}
