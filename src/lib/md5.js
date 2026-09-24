/**
 * MD5 (RFC 1321) 纯 JS 实现。
 *
 * Cloudflare Workers 的 WebCrypto 不提供 MD5，而酷狗接口的签名 / MID 计算
 * 全部依赖 MD5，因此这里自带一份无依赖实现。
 */

import { concatBytes, normalizeToBytes, toHex, utf8Encode } from './bytes.js'

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

// K[i] = floor(abs(sin(i + 1)) * 2^32)
const K = new Uint32Array(64)
for (let i = 0; i < 64; i++) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0
}

function rotl(x, c) {
  return ((x << c) | (x >>> (32 - c))) >>> 0
}

/**
 * 计算 MD5，返回 32 位小写 hex
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function md5Bytes(bytes) {
  const len = bytes.length
  const paddedLength = (((len + 8) >>> 6) + 1) << 6
  const buf = new Uint8Array(paddedLength)
  buf.set(bytes, 0)
  buf[len] = 0x80

  // 末尾 8 字节写入 bit 长度（小端）
  const bitLenLo = (len << 3) >>> 0
  const bitLenHi = Math.floor(len / 536870912) >>> 0
  const view = new DataView(buf.buffer)
  view.setUint32(paddedLength - 8, bitLenLo, true)
  view.setUint32(paddedLength - 4, bitLenHi, true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const M = new Uint32Array(16)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true)

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i++) {
      let f
      let g
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }

      const tmp = d
      d = c
      c = b
      const sum = (a + f + K[i] + M[g]) >>> 0
      b = (b + rotl(sum, S[i])) >>> 0
      a = tmp
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const digest = new Uint8Array(16)
  const dv = new DataView(digest.buffer)
  dv.setUint32(0, a0, true)
  dv.setUint32(4, b0, true)
  dv.setUint32(8, c0, true)
  dv.setUint32(12, d0, true)
  return toHex(digest)
}

/**
 * 兼容酷狗原实现的 MD5：对象会先 JSON.stringify
 * @param {string|Uint8Array|object} data
 * @returns {string}
 */
export function md5(data) {
  if (typeof data === 'object' && data !== null && !(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) {
    return md5Bytes(utf8Encode(JSON.stringify(data)))
  }
  return md5Bytes(normalizeToBytes(data))
}

/**
 * 对多段内容按顺序拼接后取 MD5（等价于 CryptoJS hasher 连续 update）
 * @param {...(string|Uint8Array)} parts
 * @returns {string}
 */
export function md5Parts(...parts) {
  const chunks = parts.map((p) => (p instanceof Uint8Array ? p : utf8Encode(p == null ? '' : String(p))))
  return md5Bytes(concatBytes(...chunks))
}
