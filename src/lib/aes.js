/**
 * AES-CBC / PKCS7 封装（与酷狗原实现 CryptoJS 行为一致）
 *
 * - key / iv 以 UTF-8 字符串形式直接作为密钥字节使用
 * - 默认模式：key = md5(临时key) 的前 32 位，iv = key 的后 16 位
 * - 底层为纯 JS AES 实现，保证 node / workerd 行为一致
 */

import { aesCbcDecrypt, aesCbcEncrypt } from './aes-core.js'
import { base64ToBytes, bytesToBase64, fromHex, toHex, utf8Decode, utf8Encode } from './bytes.js'
import { md5 } from './md5.js'
import { randomString } from './random.js'

function toPlainBytes(data) {
  if (data instanceof Uint8Array) return data
  if (typeof data === 'object' && data !== null) return utf8Encode(JSON.stringify(data))
  return utf8Encode(data == null ? '' : String(data))
}

/**
 * AES 加密
 * @param {string|object|Uint8Array} data
 * @param {{key?: string, iv?: string}} [opt]
 * @returns {{str: string, key: string}|string} 传入 key 时直接返回 hex，否则返回 {str, key}
 */
export function cryptoAesEncrypt(data, opt) {
  const plain = toPlainBytes(data)
  let key
  let iv
  let tempKey = ''

  if (opt && opt.key && opt.iv) {
    key = opt.key
    iv = opt.iv
  } else {
    tempKey = (opt && opt.key) || randomString(16).toLowerCase()
    key = md5(tempKey).substring(0, 32)
    iv = key.substring(key.length - 16)
  }

  const hex = toHex(aesCbcEncrypt(plain, utf8Encode(key), utf8Encode(iv)))
  // 与原实现一致：显式传入 key 时直接返回 hex，否则返回 {str, key}
  if (opt && opt.key) return hex
  return { str: hex, key: tempKey }
}

/**
 * AES 解密
 * @param {string|Uint8Array} data hex 字符串或密文字节
 * @param {string} key
 * @param {string} [iv]
 * @returns {object|string}
 */
export function cryptoAesDecrypt(data, key, iv) {
  const cipher = typeof data === 'string' ? fromHex(data) : data
  let useKey = key
  if (!iv) useKey = md5(key).substring(0, 32)
  const useIv = iv || useKey.substring(useKey.length - 16)
  const plain = aesCbcDecrypt(cipher, utf8Encode(useKey), utf8Encode(useIv))
  const text = utf8Decode(plain)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** 歌单 / 设备注册用的 AES 加密（base64 输出 + 随机 6 位 key） */
export function playlistAesEncrypt(data) {
  const useData = typeof data === 'object' && data !== null ? JSON.stringify(data) : String(data)
  const key = randomString(6).toLowerCase()
  const encryptKey = md5(key).substring(0, 16)
  const iv = md5(key).substring(16, 32)
  const cipher = aesCbcEncrypt(utf8Encode(useData), utf8Encode(encryptKey), utf8Encode(iv))
  return { key, str: bytesToBase64(cipher) }
}

/** playlistAesEncrypt 的逆运算 */
export function playlistAesDecrypt(data) {
  const encryptKey = md5(data.key).substring(0, 16)
  const iv = md5(data.key).substring(16, 32)
  const cipher = typeof data.str === 'string' ? base64ToBytes(data.str) : data.str
  const plain = aesCbcDecrypt(cipher, utf8Encode(encryptKey), utf8Encode(iv))
  const text = utf8Decode(plain)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
