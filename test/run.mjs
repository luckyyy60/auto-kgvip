/**
 * 加密 / 签名层交叉验证
 *
 * 用参考项目所使用的 crypto-js、node-forge、big-integer 作为「标准答案」，
 * 逐项比对本项目在 Cloudflare Workers 环境下的纯 JS / WebCrypto 实现。
 *
 * 运行：node test/run.mjs
 */

import CryptoJS from 'crypto-js'
import forge from 'node-forge'
import bigInt from 'big-integer'
import nodeCrypto from 'node:crypto'

import { toHex, utf8Encode, utf8Decode, bytesToBase64, base64ToBytes } from '../src/lib/bytes.js'
import { md5, md5Bytes } from '../src/lib/md5.js'
import { calculateMid } from '../src/lib/device.js'
import {
  cryptoAesDecrypt,
  cryptoAesEncrypt,
  playlistAesDecrypt,
  playlistAesEncrypt,
} from '../src/lib/aes.js'
import { PUBLIC_RSA_KEY, parsePublicKey, rsaEncrypt2, rsaPkcs1Encrypt, rsaRawEncrypt } from '../src/lib/rsa.js'
import { signatureAndroidParams, signatureWebParams, signParamsKey } from '../src/lib/sign.js'

let passed = 0
let failed = 0

function check(name, actual, expected) {
  if (actual === expected) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    console.error(`  \u2717 ${name}\n      实际: ${actual}\n      期望: ${expected}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

// ============ 参考实现（来自参考项目 api/util/crypto.js） ============

function wordArrayFromBuffer(uint8) {
  const words = []
  for (let i = 0; i < uint8.length; i += 4) {
    words.push(
      ((uint8[i] || 0) << 24) | ((uint8[i + 1] || 0) << 16) |
      ((uint8[i + 2] || 0) << 8) | (uint8[i + 3] || 0),
    )
  }
  return CryptoJS.lib.WordArray.create(words, uint8.length)
}

function wordArrayToBuffer(wordArray) {
  const { words, sigBytes } = wordArray
  const uint8 = new Uint8Array(sigBytes)
  for (let i = 0; i < sigBytes; i++) {
    uint8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  }
  return uint8
}

function refAesEncryptHex(plain, key, iv) {
  const encrypted = CryptoJS.AES.encrypt(wordArrayFromBuffer(utf8Encode(plain)), CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return CryptoJS.enc.Hex.stringify(encrypted.ciphertext)
}

function refAesDecryptHex(hex, key, iv) {
  const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Hex.parse(hex) })
  const decrypted = CryptoJS.AES.decrypt(cipherParams, CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return utf8Decode(wordArrayToBuffer(decrypted))
}

function refAesDecryptBase64(b64, key, iv) {
  const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(b64) })
  const decrypted = CryptoJS.AES.decrypt(cipherParams, CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return utf8Decode(wordArrayToBuffer(decrypted))
}

function refRsaRawEncrypt(buffer, pem) {
  const key = forge.pki.publicKeyFromPem(pem)
  const keyLength = Math.ceil(key.n.bitLength() / 8)
  let padded = buffer
  if (buffer.length < keyLength) {
    padded = new Uint8Array(keyLength)
    padded.set(buffer)
  }
  const message = new forge.jsbn.BigInteger(toHex(padded), 16)
  return message.modPow(key.e, key.n).toString(16).padStart(keyLength * 2, '0')
}

// ============ 1. MD5 ============

section('1. MD5')
const md5Cases = [
  '',
  'abc',
  'hello world',
  '酷狗音乐 kg',
  '🎵🎶 emoji 测试',
  'a'.repeat(55),
  'a'.repeat(56),
  'a'.repeat(64),
  'a'.repeat(1000),
  '中'.repeat(200),
  'The quick brown fox jumps over the lazy dog',
]
for (const value of md5Cases) {
  const label = value.length > 24 ? `${value.slice(0, 12)}...(${value.length})` : value
  check(`md5(${JSON.stringify(label)})`, md5(value), CryptoJS.MD5(value).toString(CryptoJS.enc.Hex))
}

const rawBytes = new Uint8Array(300)
for (let i = 0; i < rawBytes.length; i++) rawBytes[i] = (i * 37 + 11) & 0xff
check('md5(字节数组)', md5Bytes(rawBytes), CryptoJS.MD5(wordArrayFromBuffer(rawBytes)).toString(CryptoJS.enc.Hex))
check('md5(对象)', md5({ a: 1, b: '中文' }), CryptoJS.MD5(JSON.stringify({ a: 1, b: '中文' })).toString(CryptoJS.enc.Hex))

// ============ 2. 设备 MID ============

section('2. 设备 MID (calculateMid)')
function refCalculateMid(str) {
  let bi = bigInt(0)
  const base = bigInt(16)
  const digest = CryptoJS.MD5(str).toString(CryptoJS.enc.Hex)
  for (let i = 0; i < digest.length; i++) {
    bi = bi.add(bigInt(parseInt(digest.charAt(i), 16)).multiply(base.pow(digest.length - 1 - i)))
  }
  return bi.toString()
}
for (const guid of ['550e8400-e29b-41d4-a716-446655440000', 'd41d8cd98f00b204e9800998ecf8427e', 'abc']) {
  check(`calculateMid(${guid.slice(0, 12)}...)`, calculateMid(guid), refCalculateMid(guid))
}

// ============ 3. AES ============

section('3. AES-CBC')
{
  const payload = JSON.stringify({ mobile: '13800000000', code: '123456' })

  // 默认模式：随机临时 key -> key = md5(tempKey)[0:32], iv = key[16:]
  const auto = await cryptoAesEncrypt({ mobile: '13800000000', code: '123456' })
  const autoKey = CryptoJS.MD5(auto.key).toString(CryptoJS.enc.Hex).substring(0, 32)
  check('默认模式(随机临时 key)', auto.str, refAesEncryptHex(payload, autoKey, autoKey.substring(16)))
  check('临时 key 长度', auto.key.length, 16)
  check('解密回原文', JSON.stringify(await cryptoAesDecrypt(auto.str, auto.key)), payload)

  // 显式 key + iv（概念版 lite 场景）-> 直接返回 hex
  const liteKey = 'fd14b35e3f81af3817a20ae7adae7020'
  const liteIv = '17a20ae7adae7020'
  const mineLite = await cryptoAesEncrypt('|1234567890', { key: liteKey, iv: liteIv })
  check('显式 key+iv', mineLite, refAesEncryptHex('|1234567890', liteKey, liteIv))
  check('显式 key+iv 解密', await cryptoAesDecrypt(mineLite, liteKey, liteIv), '|1234567890')

  // 只传 key：key = md5(key)[0:32], iv = key[16:]
  const onlyKey = 'abcdef0123456789'
  const derived = CryptoJS.MD5(onlyKey).toString(CryptoJS.enc.Hex)
  check('只传 key（派生 iv）', await cryptoAesEncrypt(payload, { key: onlyKey }), refAesEncryptHex(payload, derived.substring(0, 32), derived.substring(16, 32)))

  // 参考实现密文 -> 本项目解密
  const refHex = refAesEncryptHex('{"nickname":"酷狗用户"}', autoKey, autoKey.substring(16))
  check('参考密文 -> 本项目解密', JSON.stringify(await cryptoAesDecrypt(refHex, auto.key)), '{"nickname":"酷狗用户"}')
}

// ============ 4. 歌单 / 设备注册 AES（base64） ============

section('4. playlist AES (设备注册)')
{
  const payload = { brand: 'Xiaomi', batteryLevel: 100, imei: 'abc-123', uuid: 'abc-123' }
  const mine = await playlistAesEncrypt(payload)
  const refKey = CryptoJS.MD5(mine.key).toString(CryptoJS.enc.Hex).substring(0, 16)
  const refIv = CryptoJS.MD5(mine.key).toString(CryptoJS.enc.Hex).substring(16, 32)
  check('playlist 加密(base64)', mine.str, CryptoJS.enc.Base64.stringify(
    CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(JSON.stringify(payload)), CryptoJS.enc.Utf8.parse(refKey), {
      iv: CryptoJS.enc.Utf8.parse(refIv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).ciphertext,
  ))
  check('playlist 解密', JSON.stringify(await playlistAesDecrypt(mine)), JSON.stringify(payload))
  check('playlist 对参考密文解密', JSON.stringify(await playlistAesDecrypt({
    key: mine.key,
    str: mine.str,
  })), JSON.stringify(payload))
}

// ============ 5. RSA ============

section('5. RSA')
{
  const parsed = parsePublicKey()
  check('密钥长度', parsed.keyLength, 128)

  const payload = JSON.stringify({ clienttime_ms: 1712345678901, key: 'abcdef0123456789abcdef0123456789' })
  check('原始模幂加密 (rsaRawEncrypt)', rsaRawEncrypt(payload), refRsaRawEncrypt(utf8Encode(payload), PUBLIC_RSA_KEY))

  const short = JSON.stringify({ token: 'tok_123', clienttime: 1712345678 })
  check('原始模幂加密(短数据)', rsaRawEncrypt(short), refRsaRawEncrypt(utf8Encode(short), PUBLIC_RSA_KEY))
}

// PKCS#1 v1.5：用 node:crypto 生成的密钥对做真实的加解密往返验证
{
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const plain = JSON.stringify({ aes: 'a1b2c3', uid: 12345, token: 'tok' })
  const cipher = rsaPkcs1Encrypt(plain, publicKey)
  const decrypted = nodeCrypto.privateDecrypt(
    { key: privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(cipher, 'hex'),
  ).toString('utf8')
  check('PKCS#1 v1.5 往返解密', decrypted, plain)
  check('PKCS#1 v1.5 密文长度', cipher.length, 256)
  check('rsaEncrypt2 别名可用', typeof rsaEncrypt2, 'function')
}

// ============ 6. 签名 ============

section('6. 接口签名')
{
  const params = {
    dfid: '-',
    mid: '1234567890',
    uuid: '-',
    appid: 1005,
    clientver: 20489,
    clienttime: 1712345678,
  }
  const data = JSON.stringify({ ad_id: 12307537187, play_end: 1712345708000, play_start: 1712345678000 })

  const refAndroid = (() => {
    const salt = 'OIlwieks28dk2k092lksi2UIkp'
    const paramsString = Object.keys(params).sort()
      .map((k) => `${k}=${typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]}`).join('')
    return CryptoJS.MD5(`${salt}${paramsString}${data}${salt}`).toString(CryptoJS.enc.Hex)
  })()
  check('Android 签名', signatureAndroidParams(params, data), refAndroid)

  const webParams = Object.assign({}, params, { type: 1, plat: 4, srcappid: 2919 })
  const refWeb = (() => {
    const salt = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
    const paramsString = Object.keys(webParams).map((k) => `${k}=${webParams[k]}`).sort().join('')
    return CryptoJS.MD5(`${salt}${paramsString}${salt}`).toString(CryptoJS.enc.Hex)
  })()
  check('Web 签名', signatureWebParams(webParams), refWeb)

  const refParamsKey = CryptoJS.MD5(`1005OIlwieks28dk2k092lksi2UIkp20489${data}`).toString(CryptoJS.enc.Hex)
  check('signParamsKey', signParamsKey(data), refParamsKey)
}

// ============ 7. 编码工具 ============

section('7. 编码工具')
check('base64 往返', utf8Decode(base64ToBytes(bytesToBase64(utf8Encode('酷狗 kg 123')))), '酷狗 kg 123')
check('hex 往返', toHex(new Uint8Array([0, 15, 16, 255])), '000f10ff')

// ============ 结果 ============

console.log(`\n${'='.repeat(48)}`)
console.log(`通过 ${passed} 项，失败 ${failed} 项`)
if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('全部加密 / 签名用例与参考实现一致 \u2705')
}
