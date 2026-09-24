/**
 * 随机数工具（使用 CSPRNG，行为对齐酷狗原实现的字符池）
 */

const CHARS = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '1234567890'

/** [0, maxExclusive) 的均匀随机整数 */
function randomInt(maxExclusive) {
  if (maxExclusive <= 0) return 0
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive
  const buf = new Uint32Array(1)
  let value
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= limit)
  return value % maxExclusive
}

/**
 * 随机字符串（大写字母 + 数字），默认 16 位
 * @param {number} [len]
 * @returns {string}
 */
export function randomString(len = 16) {
  let out = ''
  for (let i = 0; i < len; i++) out += CHARS[randomInt(CHARS.length)]
  return out
}

/**
 * 随机数字字符串，默认 16 位
 * @param {number} [len]
 * @returns {string}
 */
export function randomNumber(len = 16) {
  let out = ''
  for (let i = 0; i < len; i++) out += DIGITS[randomInt(DIGITS.length)]
  return out
}

/** UUID v4（与酷狗 getGuid 格式一致：8-4-4-4-12） */
export function getGuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 随机 uint64 的十进制字符串（用于 WebGL 指纹兜底） */
export function randomUint64Decimal() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let value = 0n
  for (const b of bytes) value = (value << 8n) | BigInt(b)
  return value.toString()
}
