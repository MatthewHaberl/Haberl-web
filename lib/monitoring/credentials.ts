/**
 * AES-256-GCM encryption for brand API credentials stored in Supabase.
 * Key is a 32-byte hex string in MONITORING_CREDENTIALS_KEY env var.
 * Never expose to client — only call from server-side routes.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import type { BrandCredentials } from './types'

function getKey(): Buffer {
  const hex = process.env.MONITORING_CREDENTIALS_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('MONITORING_CREDENTIALS_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encryptCredentials(creds: BrandCredentials): string {
  const key = getKey()
  const iv  = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = JSON.stringify(creds)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(24 hex) + tag(32 hex) + ciphertext(hex)
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex')
}

export function decryptCredentials(stored: string): BrandCredentials {
  const key = getKey()
  const iv  = Buffer.from(stored.slice(0, 24), 'hex')
  const tag = Buffer.from(stored.slice(24, 56), 'hex')
  const enc = Buffer.from(stored.slice(56), 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  return JSON.parse(plain) as BrandCredentials
}

/**
 * Decrypt a stored credential blob, tolerating dev-mode plaintext JSON and
 * returning {} instead of throwing. Use where a missing/unreadable blob should
 * degrade gracefully (collector, connection tests) rather than crash.
 */
export function decryptCredentialsLoose(stored: string | null | undefined): BrandCredentials {
  if (!stored) return {}
  try {
    return decryptCredentials(stored)
  } catch {
    try { return JSON.parse(stored) as BrandCredentials } catch { return {} }
  }
}
