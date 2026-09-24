/**
 * AES (FIPS-197) + CBC + PKCS7 纯 JS 实现
 *
 * 为什么不直接用 WebCrypto：
 * Cloudflare Workers(workerd) 严格遵循规范 —— AES-CBC 不填充且要求输入按块对齐；
 * 而 Node.js 的 WebCrypto 实现会自动做 PKCS7 填充。为了在本地(node)测试与线上
 * (workerd) 行为完全一致，这里自带一份实现，避免运行时差异。
 */

function xtime(a) {
  return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff
}

/** GF(2^8) 乘法 */
export function gmul(a, b) {
  let p = 0
  let x = a & 0xff
  let y = b & 0xff
  for (let i = 0; i < 8; i++) {
    if (y & 1) p ^= x
    const hi = x & 0x80
    x = (x << 1) & 0xff
    if (hi) x ^= 0x1b
    y >>= 1
  }
  return p
}

function gpow(a, n) {
  let result = 1
  let base = a
  let exp = n
  while (exp > 0) {
    if (exp & 1) result = gmul(result, base)
    base = gmul(base, base)
    exp >>= 1
  }
  return result
}

function rotl8(x, n) {
  return ((x << n) | (x >>> (8 - n))) & 0xff
}

/** S 盒 / 逆 S 盒（由 GF(2^8) 逆元 + 仿射变换生成，避免手写 512 个常量出错） */
export const SBOX = new Uint8Array(256)
export const RSBOX = new Uint8Array(256)
{
  const inverse = new Uint8Array(256)
  for (let i = 1; i < 256; i++) inverse[i] = gpow(i, 254)
  for (let i = 0; i < 256; i++) {
    const x = inverse[i]
    const s = (x ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 0x63) & 0xff
    SBOX[i] = s
    RSBOX[s] = i
  }
}

function addRoundKey(state, w, round) {
  const offset = round * 16
  for (let i = 0; i < 16; i++) state[i] ^= w[offset + i]
}

function subBytes(state, box) {
  for (let i = 0; i < 16; i++) state[i] = box[state[i]]
}

function shiftRows(state) {
  let t = state[1]
  state[1] = state[5]; state[5] = state[9]; state[9] = state[13]; state[13] = t
  t = state[2]; state[2] = state[10]; state[10] = t
  t = state[6]; state[6] = state[14]; state[14] = t
  t = state[15]; state[15] = state[11]; state[11] = state[7]; state[7] = state[3]; state[3] = t
}

function invShiftRows(state) {
  let t = state[13]
  state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t
  t = state[2]; state[2] = state[10]; state[10] = t
  t = state[6]; state[6] = state[14]; state[14] = t
  t = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t
}

function mixColumns(state) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4
    const a0 = state[i]
    const a1 = state[i + 1]
    const a2 = state[i + 2]
    const a3 = state[i + 3]
    state[i] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3
    state[i + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3
    state[i + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3)
    state[i + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2)
  }
}

function invMixColumns(state) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4
    const a0 = state[i]
    const a1 = state[i + 1]
    const a2 = state[i + 2]
    const a3 = state[i + 3]
    state[i] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9)
    state[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13)
    state[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11)
    state[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14)
  }
}

/** 密钥扩展 */
function expandKey(key) {
  const Nk = key.length >> 2
  if (Nk !== 4 && Nk !== 6 && Nk !== 8) throw new Error('Invalid AES key length: ' + key.length)
  const Nr = Nk + 6
  const w = new Uint8Array(16 * (Nr + 1))
  w.set(key)

  let rcon = 1
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let t0 = w[(i - 1) * 4]
    let t1 = w[(i - 1) * 4 + 1]
    let t2 = w[(i - 1) * 4 + 2]
    let t3 = w[(i - 1) * 4 + 3]

    if (i % Nk === 0) {
      const tmp = t0
      t0 = SBOX[t1] ^ rcon
      t1 = SBOX[t2]
      t2 = SBOX[t3]
      t3 = SBOX[tmp]
      rcon = xtime(rcon)
    } else if (Nk > 6 && i % Nk === 4) {
      t0 = SBOX[t0]; t1 = SBOX[t1]; t2 = SBOX[t2]; t3 = SBOX[t3]
    }

    w[i * 4] = w[(i - Nk) * 4] ^ t0
    w[i * 4 + 1] = w[(i - Nk) * 4 + 1] ^ t1
    w[i * 4 + 2] = w[(i - Nk) * 4 + 2] ^ t2
    w[i * 4 + 3] = w[(i - Nk) * 4 + 3] ^ t3
  }
  return { w, Nr }
}

/** 单个 16 字节分组加密 */
function encryptBlock(block, schedule) {
  const { w, Nr } = schedule
  const s = new Uint8Array(block)
  addRoundKey(s, w, 0)
  for (let round = 1; round < Nr; round++) {
    subBytes(s, SBOX)
    shiftRows(s)
    mixColumns(s)
    addRoundKey(s, w, round)
  }
  subBytes(s, SBOX)
  shiftRows(s)
  addRoundKey(s, w, Nr)
  return s
}

/** 单个 16 字节分组解密 */
function decryptBlock(block, schedule) {
  const { w, Nr } = schedule
  const s = new Uint8Array(block)
  addRoundKey(s, w, Nr)
  for (let round = Nr - 1; round > 0; round--) {
    invShiftRows(s)
    subBytes(s, RSBOX)
    addRoundKey(s, w, round)
    invMixColumns(s)
  }
  invShiftRows(s)
  subBytes(s, RSBOX)
  addRoundKey(s, w, 0)
  return s
}

function pkcs7Pad(bytes, blockSize = 16) {
  const pad = blockSize - (bytes.length % blockSize)
  const out = new Uint8Array(bytes.length + pad)
  out.set(bytes, 0)
  out.fill(pad, bytes.length)
  return out
}

function pkcs7Unpad(bytes, blockSize = 16) {
  if (bytes.length === 0 || bytes.length % blockSize !== 0) return bytes
  const pad = bytes[bytes.length - 1]
  if (pad < 1 || pad > blockSize) return bytes
  for (let i = bytes.length - pad; i < bytes.length; i++) {
    if (bytes[i] !== pad) return bytes
  }
  return bytes.subarray(0, bytes.length - pad)
}

/**
 * AES-CBC 加密（PKCS7 填充）
 * @param {Uint8Array} plainBytes
 * @param {Uint8Array} keyBytes 16 / 24 / 32 字节
 * @param {Uint8Array} ivBytes 16 字节
 * @returns {Uint8Array}
 */
export function aesCbcEncrypt(plainBytes, keyBytes, ivBytes) {
  if (ivBytes.length !== 16) throw new Error('Invalid AES IV length')
  const schedule = expandKey(keyBytes)
  const padded = pkcs7Pad(plainBytes)
  const out = new Uint8Array(padded.length)
  let previous = ivBytes

  for (let offset = 0; offset < padded.length; offset += 16) {
    const block = new Uint8Array(16)
    for (let i = 0; i < 16; i++) block[i] = padded[offset + i] ^ previous[i]
    const encrypted = encryptBlock(block, schedule)
    out.set(encrypted, offset)
    previous = encrypted
  }
  return out
}

/**
 * AES-CBC 解密（PKCS7 去填充）
 * @param {Uint8Array} cipherBytes
 * @param {Uint8Array} keyBytes
 * @param {Uint8Array} ivBytes
 * @returns {Uint8Array}
 */
export function aesCbcDecrypt(cipherBytes, keyBytes, ivBytes) {
  if (ivBytes.length !== 16) throw new Error('Invalid AES IV length')
  if (cipherBytes.length % 16 !== 0) throw new Error('Invalid AES ciphertext length')
  const schedule = expandKey(keyBytes)
  const out = new Uint8Array(cipherBytes.length)
  let previous = ivBytes

  for (let offset = 0; offset < cipherBytes.length; offset += 16) {
    const block = cipherBytes.subarray(offset, offset + 16)
    const decrypted = decryptBlock(block, schedule)
    for (let i = 0; i < 16; i++) out[offset + i] = decrypted[i] ^ previous[i]
    previous = block
  }
  return pkcs7Unpad(out)
}
