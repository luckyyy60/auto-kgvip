/**
 * 字节 / 字符串 / 编码转换工具（兼容 Cloudflare Workers，无 Node 依赖）
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8')

/** 字符串 -> UTF-8 字节 */
export function utf8Encode(str) {
  return encoder.encode(String(str))
}

/** UTF-8 字节 -> 字符串 */
export function utf8Decode(bytes) {
  return decoder.decode(bytes)
}

/** 字节 -> 小写 hex */
export function toHex(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

/** hex -> 字节 */
export function fromHex(hex) {
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, '')
  const out = new Uint8Array(clean.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
  return out
}

/** 字节 -> 二进制字符串（每个字节一个字符） */
export function bytesToBinaryString(bytes) {
  let out = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return out
}

/** 二进制字符串 -> 字节 */
export function binaryStringToBytes(str) {
  const out = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff
  return out
}

/** 字节 -> base64 */
export function bytesToBase64(bytes) {
  return btoa(bytesToBinaryString(bytes))
}

/** base64 -> 字节 */
export function base64ToBytes(b64) {
  return binaryStringToBytes(atob(String(b64).replace(/\s+/g, '')))
}

/** 拼接多个字节数组 */
export function concatBytes(...arrays) {
  let total = 0
  for (const a of arrays) total += a.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

/** 是否为字节数组 */
export function isBytes(value) {
  return value instanceof Uint8Array || value instanceof ArrayBuffer
}

/** 任意输入 -> 字节（对象会 JSON 序列化） */
export function normalizeToBytes(data) {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (typeof data === 'object' && data !== null) return utf8Encode(JSON.stringify(data))
  return utf8Encode(data == null ? '' : String(data))
}
