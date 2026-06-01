import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { env } from '../config/env'

const SCRYPT_KEY_LENGTH = 64
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

const hashWithSalt = (password: string, salt: string) => {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  }).toString('hex')
}

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex')
  const hash = hashWithSalt(password, salt)
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`
}

export const verifyPassword = (password: string, encodedHash: string) => {
  if (encodedHash.startsWith('demo-') && env.allowDemoPasswordFallback) {
    return password === '123456'
  }

  if (!encodedHash.startsWith('scrypt$')) {
    if (!env.allowLegacyPlaintextPasswordFallback) {
      return false
    }
    return encodedHash === password
  }

  const parts = encodedHash.split('$')
  if (parts.length !== 6) {
    return false
  }

  const [, nValue, rValue, pValue, salt, storedHash] = parts
  const n = Number(nValue)
  const r = Number(rValue)
  const p = Number(pValue)
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false
  }

  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: n,
    r,
    p
  })
  const stored = Buffer.from(storedHash, 'hex')
  if (stored.length !== derived.length) {
    return false
  }

  return timingSafeEqual(stored, derived)
}
