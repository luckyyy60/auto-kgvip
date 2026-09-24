/**
 * RSA 加密（兼容 Cloudflare Workers）
 *
 * 酷狗登录 / 用户信息接口使用了两种 RSA：
 * 1. rsaRawEncrypt —— 原始模幂（无填充），与原实现 node-forge 的
 *    `message.modPow(e, n)` 完全一致，结果取 hex 并左补零到密钥长度。
 *    注意：原实现在数据不足密钥长度时，是把数据放在高位、尾部补零
 *    （`padded.set(buffer)` 从下标 0 开始），此处必须保持一致。
 * 2. rsaEncrypt2 —— 标准 RSAES-PKCS1-V1_5，用于设备注册，直接交给 WebCrypto。
 */

import { base64ToBytes, normalizeToBytes, toHex } from './bytes.js'

/** 标准版公钥（与原项目 util/crypto.js 一致） */
export const PUBLIC_RSA_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDIAG7QOELSYoIJvTFJhMpe1s/gbjDJX51HBNnEl5HXqTW6lQ7LC8jr9fWZTwusknp+sVGzwd40MwP6U5yDE27M/X1+UR4tvOGOqp94TJtQ1EPnWGWXngpeIW5GxoQGao1rmYWAu6oi1z9XkChrsUdC6DJE5E221wf/4WLFxwAtRQIDAQAB
-----END PUBLIC KEY-----`

/** 读取一个 DER TLV 结构 */
function readTLV(bytes, offset) {
  const tag = bytes[offset]
  let length = bytes[offset + 1]
  let headerLength = 2
  if (length & 0x80) {
    const count = length & 0x7f
    length = 0
    for (let i = 0; i < count; i++) length = length * 256 + bytes[offset + 2 + i]
    headerLength = 2 + count
  }
  return {
    tag,
    length,
    valueStart: offset + headerLength,
    valueEnd: offset + headerLength + length,
  }
}

function pemToDer(pem) {
  const body = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return base64ToBytes(body)
}

let cache = null

/** 解析 SPKI 公钥，得到 n / e（BigInt） */
export function parsePublicKey(pem = PUBLIC_RSA_KEY) {
  if (cache && cache.pem === pem) return cache

  const der = pemToDer(pem)
  const outer = readTLV(der, 0)
  const algorithm = readTLV(der, outer.valueStart)
  const bitString = readTLV(der, algorithm.valueEnd)
  const rsaSequence = readTLV(der, bitString.valueStart + 1)
  const modulus = readTLV(der, rsaSequence.valueStart)
  const exponent = readTLV(der, modulus.valueEnd)

  const n = BigInt('0x' + toHex(der.subarray(modulus.valueStart, modulus.valueEnd)))
  const e = BigInt('0x' + toHex(der.subarray(exponent.valueStart, exponent.valueEnd)))

  cache = {
    pem,
    der,
    n,
    e,
    keyLength: Math.ceil(n.toString(2).length / 8),
  }
  return cache
}

/** 模幂运算 */
function modPow(base, exponent, modulus) {
  let result = 1n
  let b = base % modulus
  let exp = exponent
  while (exp > 0n) {
    if (exp & 1n) result = (result * b) % modulus
    b = (b * b) % modulus
    exp >>= 1n
  }
  return result
}

function bytesToBigInt(bytes) {
  if (!bytes || bytes.length === 0) return 0n
  return BigInt('0x' + toHex(bytes))
}

/**
 * 原始 RSA 加密（无填充），返回大写前的 hex（调用方自行 toUpperCase）
 * @param {string|object|Uint8Array} data
 * @param {string} [pem]
 * @returns {string} hex
 */
export function rsaRawEncrypt(data, pem = PUBLIC_RSA_KEY) {
  const key = parsePublicKey(pem)
  const buffer = normalizeToBytes(data)
  if (buffer.length > key.keyLength) throw new Error('Data length exceeds key size')

  let padded = buffer
  if (buffer.length < key.keyLength) {
    padded = new Uint8Array(key.keyLength)
    padded.set(buffer)
  }

  const encrypted = modPow(bytesToBigInt(padded), key.e, key.n)
  return encrypted.toString(16).padStart(key.keyLength * 2, '0')
}

/**
 * 标准 RSAES-PKCS1-V1_5 加密（对应原项目 rsaEncrypt2）
 *
 * Node 的 WebCrypto 并不支持 RSAES-PKCS1-v1_5 算法名，因此这里手写
 * PKCS#1 v1.5 填充块后复用原始模幂运算，保证各运行时行为一致：
 *   0x00 || 0x02 || PS(非零随机, 长度 k-3-mLen) || 0x00 || M
 *
 * @param {string|object|Uint8Array} data
 * @param {string} [pem]
 * @returns {string} hex
 */
export function rsaPkcs1Encrypt(data, pem = PUBLIC_RSA_KEY) {
  const key = parsePublicKey(pem)
  const message = normalizeToBytes(data)
  const k = key.keyLength

  if (message.length > k - 11) throw new Error('Data length exceeds key size')

  const psLength = k - message.length - 3
  const block = new Uint8Array(k)
  block[0] = 0x00
  block[1] = 0x02

  const sample = new Uint8Array(1)
  let written = 0
  while (written < psLength) {
    crypto.getRandomValues(sample)
    if (sample[0] !== 0) block[2 + written++] = sample[0]
  }

  block[2 + psLength] = 0x00
  block.set(message, 3 + psLength)

  const encrypted = modPow(bytesToBigInt(block), key.e, key.n)
  return encrypted.toString(16).padStart(k * 2, '0')
}

/** 与原项目同名导出：Node 的 WebCrypto 不支持 RSAES-PKCS1-v1_5，故自行实现填充 */
export const rsaEncrypt2 = rsaPkcs1Encrypt
