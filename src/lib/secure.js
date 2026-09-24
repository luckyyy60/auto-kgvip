/**
 * 敏感信息加密存储（AES-GCM / WebCrypto）
 *
 * 配置了 SECRET_KEY（或 ADMIN_TOKEN）时，KV 中的 token 会加密保存，
 * 避免误导出 KV 数据即泄露账号；未配置时退化为明文存储。
 */

import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from './bytes.js'

const VERSION = 'v1'

async function deriveKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', utf8Encode(`kg-qiandao:${secret}`))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** 是否已加密 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`)
}

/**
 * 加密敏感字段
 * @param {string} plain
 * @param {string|undefined} secret
 * @returns {Promise<string>}
 */
export async function encryptSecret(plain, secret) {
  if (!plain) return ''
  if (!secret) return plain
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8Encode(plain))
  return `${VERSION}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipher))}`
}

/**
 * 解密敏感字段（兼容明文历史数据）
 * @param {string} value
 * @param {string|undefined} secret
 * @returns {Promise<string>}
 */
export async function decryptSecret(value, secret) {
  if (!value) return ''
  if (!isEncrypted(value)) return value
  if (!secret) return ''
  try {
    const [, ivPart, dataPart] = value.split(':')
    const key = await deriveKey(secret)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(ivPart) },
      key,
      base64ToBytes(dataPart),
    )
    return utf8Decode(new Uint8Array(plain))
  } catch {
    return ''
  }
}
