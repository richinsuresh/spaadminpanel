// src/lib/offlineAuth.ts
// Lightweight offline admin credential helper using Web Crypto.
// Stores a salted PBKDF2-derived hash in localStorage (NOT the plain password).
// This allows offline password verification on the same device.

const LOCAL_ADMIN_KEY = 'spa_offline_admin_auth_v1'

// --- Helpers ---
async function str2ab(str: string) {
  return new TextEncoder().encode(str);
}
async function ab2hex(buffer: ArrayBuffer) {
  const arr = Array.from(new Uint8Array(buffer));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate 16-byte random salt (hex)
export function genSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive a hex-encoded hash from password + salt using PBKDF2 with SHA-256.
 * iterations default to 150k — reduce to ~100k on very old devices if it's too slow.
 */
export async function derivePasswordHash(password: string, saltHex: string, iterations = 150_000) {
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(h => parseInt(h, 16)));
  const pwUtf8 = await str2ab(password);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pwUtf8,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return ab2hex(derivedBits);
}

/**
 * Save local admin proof (salt + hash + savedAt).
 * Returns the saved object.
 */
export async function saveLocalAdminHash(password: string) {
  const salt = genSalt();
  const hash = await derivePasswordHash(password, salt);
  const payload = {
    salt,
    hash,
    savedAt: new Date().toISOString(),
    version: 1
  };
  try {
    localStorage.setItem(LOCAL_ADMIN_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to save local admin proof to localStorage', e);
  }
  return payload;
}

/**
 * Verify given password against locally stored hash.
 * Returns true if match, false otherwise.
 */
export async function verifyLocalAdminPassword(password: string) {
  const raw = localStorage.getItem(LOCAL_ADMIN_KEY);
  if (!raw) return false;
  try {
    const { salt, hash } = JSON.parse(raw);
    const derived = await derivePasswordHash(password, salt);
    return derived === hash;
  } catch (e) {
    console.error('verifyLocalAdminPassword failed', e);
    return false;
  }
}

/** Remove the local saved admin proof (call on logout or rotation) */
export function clearLocalAdminHash() {
  try {
    localStorage.removeItem(LOCAL_ADMIN_KEY);
  } catch (e) {
    console.warn('clearLocalAdminHash failed', e);
  }
}
