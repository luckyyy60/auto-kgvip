/*!
 * 酷狗概念版自动签到 · Cloudflare Worker 单文件版 v1.0.0
 *
 * 本文件由源码打包生成，可直接粘贴到 Cloudflare 网页控制台使用。
 * 完整源码与测试见本仓库 src/ 、test/ 目录。
 *
 * 使用步骤（详见 README.md）：
 *   1. Cloudflare 控制台 → Workers & Pages → 创建 Worker
 *   2. 编辑代码 → 粘贴本文件全部内容 → 部署
 *   3. 创建 KV 命名空间，并在「设置 → 绑定」中绑定为 KG_KV
 *   4. 在「设置 → 变量和机密」添加加密变量 ADMIN_TOKEN（你的管理口令）
 *   5. 在「设置 → 触发器 → Cron 触发器」添加每 5 分钟触发一次（表达式见 README）
 *
 * 本项目仅供学习交流，请勿用于商业用途；音乐平台不易，请支持正版。
 */

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/lib/aes-core.js
function xtime(a) {
  return (a << 1 ^ (a & 128 ? 27 : 0)) & 255;
}
__name(xtime, "xtime");
function gmul(a, b) {
  let p = 0;
  let x = a & 255;
  let y = b & 255;
  for (let i = 0; i < 8; i++) {
    if (y & 1) p ^= x;
    const hi = x & 128;
    x = x << 1 & 255;
    if (hi) x ^= 27;
    y >>= 1;
  }
  return p;
}
__name(gmul, "gmul");
function gpow(a, n) {
  let result = 1;
  let base = a;
  let exp = n;
  while (exp > 0) {
    if (exp & 1) result = gmul(result, base);
    base = gmul(base, base);
    exp >>= 1;
  }
  return result;
}
__name(gpow, "gpow");
function rotl8(x, n) {
  return (x << n | x >>> 8 - n) & 255;
}
__name(rotl8, "rotl8");
var SBOX = new Uint8Array(256);
var RSBOX = new Uint8Array(256);
{
  const inverse = new Uint8Array(256);
  for (let i = 1; i < 256; i++) inverse[i] = gpow(i, 254);
  for (let i = 0; i < 256; i++) {
    const x = inverse[i];
    const s = (x ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 99) & 255;
    SBOX[i] = s;
    RSBOX[s] = i;
  }
}
function addRoundKey(state, w, round) {
  const offset = round * 16;
  for (let i = 0; i < 16; i++) state[i] ^= w[offset + i];
}
__name(addRoundKey, "addRoundKey");
function subBytes(state, box) {
  for (let i = 0; i < 16; i++) state[i] = box[state[i]];
}
__name(subBytes, "subBytes");
function shiftRows(state) {
  let t = state[1];
  state[1] = state[5];
  state[5] = state[9];
  state[9] = state[13];
  state[13] = t;
  t = state[2];
  state[2] = state[10];
  state[10] = t;
  t = state[6];
  state[6] = state[14];
  state[14] = t;
  t = state[15];
  state[15] = state[11];
  state[11] = state[7];
  state[7] = state[3];
  state[3] = t;
}
__name(shiftRows, "shiftRows");
function invShiftRows(state) {
  let t = state[13];
  state[13] = state[9];
  state[9] = state[5];
  state[5] = state[1];
  state[1] = t;
  t = state[2];
  state[2] = state[10];
  state[10] = t;
  t = state[6];
  state[6] = state[14];
  state[14] = t;
  t = state[3];
  state[3] = state[7];
  state[7] = state[11];
  state[11] = state[15];
  state[15] = t;
}
__name(invShiftRows, "invShiftRows");
function mixColumns(state) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = state[i];
    const a1 = state[i + 1];
    const a2 = state[i + 2];
    const a3 = state[i + 3];
    state[i] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
    state[i + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
    state[i + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
    state[i + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
  }
}
__name(mixColumns, "mixColumns");
function invMixColumns(state) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = state[i];
    const a1 = state[i + 1];
    const a2 = state[i + 2];
    const a3 = state[i + 3];
    state[i] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
    state[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
    state[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
    state[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
  }
}
__name(invMixColumns, "invMixColumns");
function expandKey(key) {
  const Nk = key.length >> 2;
  if (Nk !== 4 && Nk !== 6 && Nk !== 8) throw new Error("Invalid AES key length: " + key.length);
  const Nr = Nk + 6;
  const w = new Uint8Array(16 * (Nr + 1));
  w.set(key);
  let rcon = 1;
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let t0 = w[(i - 1) * 4];
    let t1 = w[(i - 1) * 4 + 1];
    let t2 = w[(i - 1) * 4 + 2];
    let t3 = w[(i - 1) * 4 + 3];
    if (i % Nk === 0) {
      const tmp = t0;
      t0 = SBOX[t1] ^ rcon;
      t1 = SBOX[t2];
      t2 = SBOX[t3];
      t3 = SBOX[tmp];
      rcon = xtime(rcon);
    } else if (Nk > 6 && i % Nk === 4) {
      t0 = SBOX[t0];
      t1 = SBOX[t1];
      t2 = SBOX[t2];
      t3 = SBOX[t3];
    }
    w[i * 4] = w[(i - Nk) * 4] ^ t0;
    w[i * 4 + 1] = w[(i - Nk) * 4 + 1] ^ t1;
    w[i * 4 + 2] = w[(i - Nk) * 4 + 2] ^ t2;
    w[i * 4 + 3] = w[(i - Nk) * 4 + 3] ^ t3;
  }
  return { w, Nr };
}
__name(expandKey, "expandKey");
function encryptBlock(block, schedule) {
  const { w, Nr } = schedule;
  const s = new Uint8Array(block);
  addRoundKey(s, w, 0);
  for (let round = 1; round < Nr; round++) {
    subBytes(s, SBOX);
    shiftRows(s);
    mixColumns(s);
    addRoundKey(s, w, round);
  }
  subBytes(s, SBOX);
  shiftRows(s);
  addRoundKey(s, w, Nr);
  return s;
}
__name(encryptBlock, "encryptBlock");
function decryptBlock(block, schedule) {
  const { w, Nr } = schedule;
  const s = new Uint8Array(block);
  addRoundKey(s, w, Nr);
  for (let round = Nr - 1; round > 0; round--) {
    invShiftRows(s);
    subBytes(s, RSBOX);
    addRoundKey(s, w, round);
    invMixColumns(s);
  }
  invShiftRows(s);
  subBytes(s, RSBOX);
  addRoundKey(s, w, 0);
  return s;
}
__name(decryptBlock, "decryptBlock");
function pkcs7Pad(bytes, blockSize = 16) {
  const pad = blockSize - bytes.length % blockSize;
  const out = new Uint8Array(bytes.length + pad);
  out.set(bytes, 0);
  out.fill(pad, bytes.length);
  return out;
}
__name(pkcs7Pad, "pkcs7Pad");
function pkcs7Unpad(bytes, blockSize = 16) {
  if (bytes.length === 0 || bytes.length % blockSize !== 0) return bytes;
  const pad = bytes[bytes.length - 1];
  if (pad < 1 || pad > blockSize) return bytes;
  for (let i = bytes.length - pad; i < bytes.length; i++) {
    if (bytes[i] !== pad) return bytes;
  }
  return bytes.subarray(0, bytes.length - pad);
}
__name(pkcs7Unpad, "pkcs7Unpad");
function aesCbcEncrypt(plainBytes, keyBytes, ivBytes) {
  if (ivBytes.length !== 16) throw new Error("Invalid AES IV length");
  const schedule = expandKey(keyBytes);
  const padded = pkcs7Pad(plainBytes);
  const out = new Uint8Array(padded.length);
  let previous = ivBytes;
  for (let offset = 0; offset < padded.length; offset += 16) {
    const block = new Uint8Array(16);
    for (let i = 0; i < 16; i++) block[i] = padded[offset + i] ^ previous[i];
    const encrypted = encryptBlock(block, schedule);
    out.set(encrypted, offset);
    previous = encrypted;
  }
  return out;
}
__name(aesCbcEncrypt, "aesCbcEncrypt");
function aesCbcDecrypt(cipherBytes, keyBytes, ivBytes) {
  if (ivBytes.length !== 16) throw new Error("Invalid AES IV length");
  if (cipherBytes.length % 16 !== 0) throw new Error("Invalid AES ciphertext length");
  const schedule = expandKey(keyBytes);
  const out = new Uint8Array(cipherBytes.length);
  let previous = ivBytes;
  for (let offset = 0; offset < cipherBytes.length; offset += 16) {
    const block = cipherBytes.subarray(offset, offset + 16);
    const decrypted = decryptBlock(block, schedule);
    for (let i = 0; i < 16; i++) out[offset + i] = decrypted[i] ^ previous[i];
    previous = block;
  }
  return pkcs7Unpad(out);
}
__name(aesCbcDecrypt, "aesCbcDecrypt");

// src/lib/bytes.js
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8");
function utf8Encode(str) {
  return encoder.encode(String(str));
}
__name(utf8Encode, "utf8Encode");
function utf8Decode(bytes) {
  return decoder.decode(bytes);
}
__name(utf8Decode, "utf8Decode");
function toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
__name(toHex, "toHex");
function fromHex(hex) {
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
__name(fromHex, "fromHex");
function bytesToBinaryString(bytes) {
  let out = "";
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return out;
}
__name(bytesToBinaryString, "bytesToBinaryString");
function binaryStringToBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 255;
  return out;
}
__name(binaryStringToBytes, "binaryStringToBytes");
function bytesToBase64(bytes) {
  return btoa(bytesToBinaryString(bytes));
}
__name(bytesToBase64, "bytesToBase64");
function base64ToBytes(b64) {
  return binaryStringToBytes(atob(String(b64).replace(/\s+/g, "")));
}
__name(base64ToBytes, "base64ToBytes");
function concatBytes(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
__name(concatBytes, "concatBytes");
function normalizeToBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "object" && data !== null) return utf8Encode(JSON.stringify(data));
  return utf8Encode(data == null ? "" : String(data));
}
__name(normalizeToBytes, "normalizeToBytes");

// src/lib/md5.js
var S = [
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21
];
var K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
}
function rotl(x, c) {
  return (x << c | x >>> 32 - c) >>> 0;
}
__name(rotl, "rotl");
function md5Bytes(bytes) {
  const len = bytes.length;
  const paddedLength = (len + 8 >>> 6) + 1 << 6;
  const buf = new Uint8Array(paddedLength);
  buf.set(bytes, 0);
  buf[len] = 128;
  const bitLenLo = len << 3 >>> 0;
  const bitLenHi = Math.floor(len / 536870912) >>> 0;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLength - 8, bitLenLo, true);
  view.setUint32(paddedLength - 4, bitLenHi, true);
  let a0 = 1732584193;
  let b0 = 4023233417;
  let c0 = 2562383102;
  let d0 = 271733878;
  const M = new Uint32Array(16);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f;
      let g;
      if (i < 16) {
        f = b & c | ~b & d;
        g = i;
      } else if (i < 32) {
        f = d & b | ~d & c;
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = 7 * i % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      const sum = a + f + K[i] + M[g] >>> 0;
      b = b + rotl(sum, S[i]) >>> 0;
      a = tmp;
    }
    a0 = a0 + a >>> 0;
    b0 = b0 + b >>> 0;
    c0 = c0 + c >>> 0;
    d0 = d0 + d >>> 0;
  }
  const digest = new Uint8Array(16);
  const dv = new DataView(digest.buffer);
  dv.setUint32(0, a0, true);
  dv.setUint32(4, b0, true);
  dv.setUint32(8, c0, true);
  dv.setUint32(12, d0, true);
  return toHex(digest);
}
__name(md5Bytes, "md5Bytes");
function md5(data) {
  if (typeof data === "object" && data !== null && !(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) {
    return md5Bytes(utf8Encode(JSON.stringify(data)));
  }
  return md5Bytes(normalizeToBytes(data));
}
__name(md5, "md5");
function md5Parts(...parts) {
  const chunks = parts.map((p) => p instanceof Uint8Array ? p : utf8Encode(p == null ? "" : String(p)));
  return md5Bytes(concatBytes(...chunks));
}
__name(md5Parts, "md5Parts");

// src/lib/random.js
var CHARS = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function randomInt(maxExclusive) {
  if (maxExclusive <= 0) return 0;
  const limit = Math.floor(4294967295 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % maxExclusive;
}
__name(randomInt, "randomInt");
function randomString(len = 16) {
  let out = "";
  for (let i = 0; i < len; i++) out += CHARS[randomInt(CHARS.length)];
  return out;
}
__name(randomString, "randomString");
function getGuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
__name(getGuid, "getGuid");
function randomUint64Decimal() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (const b of bytes) value = value << 8n | BigInt(b);
  return value.toString();
}
__name(randomUint64Decimal, "randomUint64Decimal");

// src/lib/aes.js
function toPlainBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (typeof data === "object" && data !== null) return utf8Encode(JSON.stringify(data));
  return utf8Encode(data == null ? "" : String(data));
}
__name(toPlainBytes, "toPlainBytes");
function cryptoAesEncrypt(data, opt) {
  const plain = toPlainBytes(data);
  let key;
  let iv;
  let tempKey = "";
  if (opt && opt.key && opt.iv) {
    key = opt.key;
    iv = opt.iv;
  } else {
    tempKey = opt && opt.key || randomString(16).toLowerCase();
    key = md5(tempKey).substring(0, 32);
    iv = key.substring(key.length - 16);
  }
  const hex = toHex(aesCbcEncrypt(plain, utf8Encode(key), utf8Encode(iv)));
  if (opt && opt.key) return hex;
  return { str: hex, key: tempKey };
}
__name(cryptoAesEncrypt, "cryptoAesEncrypt");
function cryptoAesDecrypt(data, key, iv) {
  const cipher = typeof data === "string" ? fromHex(data) : data;
  let useKey = key;
  if (!iv) useKey = md5(key).substring(0, 32);
  const useIv = iv || useKey.substring(useKey.length - 16);
  const plain = aesCbcDecrypt(cipher, utf8Encode(useKey), utf8Encode(useIv));
  const text = utf8Decode(plain);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
__name(cryptoAesDecrypt, "cryptoAesDecrypt");
function playlistAesEncrypt(data) {
  const useData = typeof data === "object" && data !== null ? JSON.stringify(data) : String(data);
  const key = randomString(6).toLowerCase();
  const encryptKey = md5(key).substring(0, 16);
  const iv = md5(key).substring(16, 32);
  const cipher = aesCbcEncrypt(utf8Encode(useData), utf8Encode(encryptKey), utf8Encode(iv));
  return { key, str: bytesToBase64(cipher) };
}
__name(playlistAesEncrypt, "playlistAesEncrypt");
function playlistAesDecrypt(data) {
  const encryptKey = md5(data.key).substring(0, 16);
  const iv = md5(data.key).substring(16, 32);
  const cipher = typeof data.str === "string" ? base64ToBytes(data.str) : data.str;
  const plain = aesCbcDecrypt(cipher, utf8Encode(encryptKey), utf8Encode(iv));
  const text = utf8Decode(plain);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
__name(playlistAesDecrypt, "playlistAesDecrypt");

// src/lib/config.js
var APPID = 1005;
var CLIENTVER = 20489;
var SRCAPPID = 2919;
var SALT_ANDROID = "OIlwieks28dk2k092lksi2UIkp";
var SALT_WEB = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt";
var SALT_REGISTER = "1014";
var UA_DEFAULT = "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi";
var UA_LOGIN = "Android16-1070-11440-130-0-LOGIN-wifi";
var UA_REPORT = "Android13-1070-10566-201-0-ReportPlaySongToServerProtocol-wifi";

// src/lib/device.js
function calculateMid(str) {
  return BigInt("0x" + md5(str)).toString();
}
__name(calculateMid, "calculateMid");
function createDeviceIdentity(overrides = {}) {
  const guid = overrides.guid || md5(getGuid());
  return {
    guid,
    mid: overrides.mid || calculateMid(guid),
    dev: String(overrides.dev || randomString(10)).toUpperCase(),
    mac: String(overrides.mac || "02:00:00:00:00:00").toUpperCase(),
    webgl: overrides.webgl || randomUint64Decimal(),
    dfid: overrides.dfid || ""
  };
}
__name(createDeviceIdentity, "createDeviceIdentity");
function normalizeDeviceIdentity(device) {
  if (!device || !device.guid) return createDeviceIdentity();
  return {
    guid: device.guid,
    mid: device.mid || calculateMid(device.guid),
    dev: device.dev || String(randomString(10)).toUpperCase(),
    mac: device.mac || "02:00:00:00:00:00",
    webgl: device.webgl || randomUint64Decimal(),
    dfid: device.dfid || ""
  };
}
__name(normalizeDeviceIdentity, "normalizeDeviceIdentity");
function deviceCookie(device, account = {}) {
  return {
    KUGOU_API_PLATFORM: "standard",
    KUGOU_API_MID: device.mid,
    KUGOU_API_GUID: device.guid,
    KUGOU_API_DEV: device.dev,
    KUGOU_API_MAC: device.mac,
    KUGOU_API_WEBGL: device.webgl,
    dfid: account.dfid || device.dfid || "-",
    token: account.token || "",
    userid: account.userid || 0,
    t1: account.t1 || "",
    vip_type: account.vipType || 0,
    vip_token: account.vipToken || ""
  };
}
__name(deviceCookie, "deviceCookie");

// src/lib/sign.js
function signatureWebParams(params) {
  const paramsString = Object.keys(params).map((key) => `${key}=${params[key]}`).sort().join("");
  return md5(`${SALT_WEB}${paramsString}${SALT_WEB}`);
}
__name(signatureWebParams, "signatureWebParams");
function signatureAndroidParams(params, data) {
  const paramsString = Object.keys(params).sort().map((key) => `${key}=${typeof params[key] === "object" ? JSON.stringify(params[key]) : params[key]}`).join("");
  if (data instanceof Uint8Array) {
    return md5Parts(SALT_ANDROID, paramsString, data, SALT_ANDROID);
  }
  return md5(`${SALT_ANDROID}${paramsString}${data || ""}${SALT_ANDROID}`);
}
__name(signatureAndroidParams, "signatureAndroidParams");
function signatureRegisterParams(params) {
  const paramsString = Object.keys(params).map((key) => params[key]).sort().join("");
  return md5(`${SALT_REGISTER}${paramsString}${SALT_REGISTER}`);
}
__name(signatureRegisterParams, "signatureRegisterParams");
function signParamsKey(data, appid, clientver) {
  return md5(`${appid || APPID}${SALT_ANDROID}${clientver || CLIENTVER}${data}`);
}
__name(signParamsKey, "signParamsKey");

// src/lib/request.js
var DEFAULT_BASE = "https://gateway.kugou.com";
async function kugouRequest(options) {
  const cookie = options.cookie || {};
  const dfid = cookie.dfid || "-";
  const mid = `${cookie.KUGOU_API_MID || ""}`;
  const uuid = "-";
  const token = cookie.token || "";
  const userid = cookie.userid || 0;
  const clienttime = Math.floor(Date.now() / 1e3);
  const headers = {
    dfid,
    clienttime,
    mid,
    "kg-rc": "1",
    "kg-thash": "5d816a0",
    "kg-rec": "1",
    "kg-rf": "B9EDA08A64250DEFFBCADDEE00F8F25F"
  };
  const defaultParams = {
    dfid,
    mid,
    uuid,
    appid: APPID,
    clientver: CLIENTVER,
    clienttime
  };
  if (token) defaultParams.token = token;
  if (userid && userid !== 0) defaultParams.userid = userid;
  const params = Object.assign({}, defaultParams, options.params || {});
  headers.clienttime = params.clienttime;
  const isObjectBody = typeof options.data === "object" && options.data !== null && !(options.data instanceof Uint8Array);
  const data = isObjectBody ? JSON.stringify(options.data) : options.data || "";
  if (!params.signature && !options.notSignature) {
    switch (options.encryptType) {
      case "register":
        params.signature = signatureRegisterParams(params);
        break;
      case "web":
        params.signature = signatureWebParams(params);
        break;
      case "android":
      default:
        params.signature = signatureAndroidParams(params, data);
        break;
    }
  }
  const baseURL = options.baseURL || DEFAULT_BASE;
  const query = new URLSearchParams();
  for (const key of Object.keys(params)) {
    query.append(key, typeof params[key] === "object" ? JSON.stringify(params[key]) : String(params[key]));
  }
  const url = `${baseURL}${options.url}?${query.toString()}`;
  const finalHeaders = Object.assign(
    { "User-Agent": UA_DEFAULT },
    options.headers || {},
    { dfid, clienttime: params.clienttime, mid },
    headers
  );
  const method = (options.method || "GET").toUpperCase();
  const init = { method, headers: finalHeaders };
  if (method !== "GET" && method !== "HEAD" && data !== "") {
    init.body = data;
    if (isObjectBody && !finalHeaders["Content-Type"] && !finalHeaders["content-type"]) {
      init.headers = Object.assign({ "Content-Type": "application/json" }, finalHeaders);
    }
  }
  try {
    const response = await fetch(url, init);
    const setCookie = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie().map(parseSetCookie) : [];
    let body;
    if (options.responseType === "arrayBuffer") {
      body = new Uint8Array(await response.arrayBuffer());
    } else {
      const text = await response.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const ok = !(body && typeof body === "object" && (body.status === 0 || body.error_code && body.error_code !== 0));
    return {
      status: ok ? 200 : 502,
      body,
      setCookie,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      status: 502,
      body: { status: 0, msg: String(error && error.message ? error.message : error) },
      setCookie: [],
      headers: {}
    };
  }
}
__name(kugouRequest, "kugouRequest");
function parseSetCookie(raw) {
  return String(raw).replace(/\s*(Domain|domain|path|expires|Expires|Max-Age)=[^(;|$)]+;*/g, "").replace(/;HttpOnly/g, "").replace(/;Secure/g, "").trim();
}
__name(parseSetCookie, "parseSetCookie");
function cookieArrayToObject(list = []) {
  const out = {};
  for (const item of list) {
    const index = item.indexOf("=");
    if (index <= 0) continue;
    out[item.slice(0, index).trim()] = item.slice(index + 1).trim();
  }
  return out;
}
__name(cookieArrayToObject, "cookieArrayToObject");

// src/lib/rsa.js
var PUBLIC_RSA_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDIAG7QOELSYoIJvTFJhMpe1s/gbjDJX51HBNnEl5HXqTW6lQ7LC8jr9fWZTwusknp+sVGzwd40MwP6U5yDE27M/X1+UR4tvOGOqp94TJtQ1EPnWGWXngpeIW5GxoQGao1rmYWAu6oi1z9XkChrsUdC6DJE5E221wf/4WLFxwAtRQIDAQAB
-----END PUBLIC KEY-----`;
function readTLV(bytes, offset) {
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let headerLength = 2;
  if (length & 128) {
    const count = length & 127;
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[offset + 2 + i];
    headerLength = 2 + count;
  }
  return {
    tag,
    length,
    valueStart: offset + headerLength,
    valueEnd: offset + headerLength + length
  };
}
__name(readTLV, "readTLV");
function pemToDer(pem) {
  const body = String(pem).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return base64ToBytes(body);
}
__name(pemToDer, "pemToDer");
var cache = null;
function parsePublicKey(pem = PUBLIC_RSA_KEY) {
  if (cache && cache.pem === pem) return cache;
  const der = pemToDer(pem);
  const outer = readTLV(der, 0);
  const algorithm = readTLV(der, outer.valueStart);
  const bitString = readTLV(der, algorithm.valueEnd);
  const rsaSequence = readTLV(der, bitString.valueStart + 1);
  const modulus = readTLV(der, rsaSequence.valueStart);
  const exponent = readTLV(der, modulus.valueEnd);
  const n = BigInt("0x" + toHex(der.subarray(modulus.valueStart, modulus.valueEnd)));
  const e = BigInt("0x" + toHex(der.subarray(exponent.valueStart, exponent.valueEnd)));
  cache = {
    pem,
    der,
    n,
    e,
    keyLength: Math.ceil(n.toString(2).length / 8)
  };
  return cache;
}
__name(parsePublicKey, "parsePublicKey");
function modPow(base, exponent, modulus) {
  let result = 1n;
  let b = base % modulus;
  let exp = exponent;
  while (exp > 0n) {
    if (exp & 1n) result = result * b % modulus;
    b = b * b % modulus;
    exp >>= 1n;
  }
  return result;
}
__name(modPow, "modPow");
function bytesToBigInt(bytes) {
  if (!bytes || bytes.length === 0) return 0n;
  return BigInt("0x" + toHex(bytes));
}
__name(bytesToBigInt, "bytesToBigInt");
function rsaRawEncrypt(data, pem = PUBLIC_RSA_KEY) {
  const key = parsePublicKey(pem);
  const buffer = normalizeToBytes(data);
  if (buffer.length > key.keyLength) throw new Error("Data length exceeds key size");
  let padded = buffer;
  if (buffer.length < key.keyLength) {
    padded = new Uint8Array(key.keyLength);
    padded.set(buffer);
  }
  const encrypted = modPow(bytesToBigInt(padded), key.e, key.n);
  return encrypted.toString(16).padStart(key.keyLength * 2, "0");
}
__name(rsaRawEncrypt, "rsaRawEncrypt");
function rsaPkcs1Encrypt(data, pem = PUBLIC_RSA_KEY) {
  const key = parsePublicKey(pem);
  const message = normalizeToBytes(data);
  const k = key.keyLength;
  if (message.length > k - 11) throw new Error("Data length exceeds key size");
  const psLength = k - message.length - 3;
  const block = new Uint8Array(k);
  block[0] = 0;
  block[1] = 2;
  const sample = new Uint8Array(1);
  let written = 0;
  while (written < psLength) {
    crypto.getRandomValues(sample);
    if (sample[0] !== 0) block[2 + written++] = sample[0];
  }
  block[2 + psLength] = 0;
  block.set(message, 3 + psLength);
  const encrypted = modPow(bytesToBigInt(block), key.e, key.n);
  return encrypted.toString(16).padStart(k * 2, "0");
}
__name(rsaPkcs1Encrypt, "rsaPkcs1Encrypt");

// src/api/auth.js
var TOKEN_KEY = "90b8382a1bb4ccdcf063102053fd75b8";
var TOKEN_IV = "f063102053fd75b8";
var ERROR_MESSAGES = {
  34175: "\u8BE5\u624B\u673A\u53F7\u7ED1\u5B9A\u4E86\u591A\u4E2A\u8D26\u53F7\uFF0C\u9177\u72D7\u6682\u4E0D\u652F\u6301\u624B\u673A\u53F7\u767B\u5F55\uFF0C\u8BF7\u6539\u7528\u626B\u7801\u767B\u5F55",
  20010: "\u9A8C\u8BC1\u7801\u9519\u8BEF\u6216\u5DF2\u8FC7\u671F",
  20001: "\u624B\u673A\u53F7\u683C\u5F0F\u4E0D\u6B63\u786E"
};
function errorMessage(body) {
  const code = body && (body.error_code ?? body.errcode);
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return body && (body.error_msg || body.errmsg || body.msg) || "\u9177\u72D7\u63A5\u53E3\u8FD4\u56DE\u5931\u8D25";
}
__name(errorMessage, "errorMessage");
function extractLoginPayload(response, decryptKey) {
  const body = response.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: { code: -1, message: "\u63A5\u53E3\u8FD4\u56DE\u683C\u5F0F\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", raw: body } };
  }
  if (body.status !== 1) {
    return { ok: false, error: { code: body.error_code ?? body.errcode ?? body.status, message: errorMessage(body), raw: body } };
  }
  let data = Object.assign({}, body.data || {});
  if (data.secu_params) {
    const decrypted = cryptoAesDecrypt(data.secu_params, decryptKey);
    if (decrypted && typeof decrypted === "object") data = Object.assign(data, decrypted);
    else data.token = decrypted;
    delete data.secu_params;
  }
  const cookies = cookieArrayToObject(response.setCookie);
  const token = data.token || cookies.token || "";
  const userid = data.userid || cookies.userid || 0;
  if (!token) {
    return { ok: false, error: { code: body.error_code ?? -1, message: "\u767B\u5F55\u6210\u529F\u4F46\u672A\u83B7\u53D6\u5230 token\uFF0C\u8BF7\u91CD\u8BD5", raw: body } };
  }
  return {
    ok: true,
    account: {
      userid: Number(userid) || userid,
      token,
      t1: data.t1 || cookies.t1 || "",
      vipType: Number(data.vip_type || cookies.vip_type || 0),
      vipToken: data.vip_token || cookies.vip_token || "",
      nickname: data.nickname || "",
      dfid: data.dfid || cookies.dfid || ""
    },
    raw: data
  };
}
__name(extractLoginPayload, "extractLoginPayload");
async function sendSmsCode(device, mobile) {
  const response = await kugouRequest({
    baseURL: "http://login.user.kugou.com",
    url: "/v7/send_mobile_code",
    method: "POST",
    data: { businessid: 5, mobile: `${mobile}`, plat: 3 },
    encryptType: "android",
    cookie: { KUGOU_API_MID: device.mid }
  });
  const body = response.body;
  if (body && body.status === 1) return { ok: true };
  return { ok: false, error: { code: body && body.error_code, message: errorMessage(body), raw: body } };
}
__name(sendSmsCode, "sendSmsCode");
async function loginByVerifyCode(device, { mobile, code }) {
  const dateTime = Date.now();
  const encrypt = cryptoAesEncrypt({ mobile: mobile || "", code: code || "" });
  const maskedMobile = mobile ? `${mobile.substring(0, 2)}*****${mobile.substring(10, 11)}` : "";
  const dfid = device.dfid || randomString(24);
  const dataMap = {
    plat: 1,
    support_multi: 1,
    t1: 0,
    t2: 0,
    clienttime_ms: dateTime,
    mobile: maskedMobile,
    key: signParamsKey(dateTime),
    pk: rsaRawEncrypt({ clienttime_ms: dateTime, key: encrypt.key }).toUpperCase(),
    params: encrypt.str,
    t3: "MCwwLDAsMCwwLDAsMCwwLDA="
  };
  const response = await kugouRequest({
    baseURL: "https://loginserviceretry.kugou.com",
    url: "/v7/login_by_verifycode",
    method: "POST",
    data: dataMap,
    encryptType: "android",
    headers: { "support-calm": "1", "User-Agent": UA_LOGIN },
    cookie: deviceCookie(device, { dfid })
  });
  return extractLoginPayload(response, encrypt.key);
}
__name(loginByVerifyCode, "loginByVerifyCode");
async function loginByToken(device, { token, userid, t1 }) {
  const dateNow = Date.now();
  const encrypt = cryptoAesEncrypt(
    { clienttime: Math.floor(dateNow / 1e3), token },
    { key: TOKEN_KEY, iv: TOKEN_IV }
  );
  const encryptParams = cryptoAesEncrypt({});
  const pk = rsaRawEncrypt({ clienttime_ms: dateNow, key: encryptParams.key });
  const dataMap = {
    dfid: device.dfid || "-",
    p3: encrypt,
    plat: 1,
    t1: 0,
    t2: 0,
    t3: "MCwwLDAsMCwwLDAsMCwwLDA=",
    pk,
    params: encryptParams.str,
    userid,
    clienttime_ms: dateNow
  };
  const response = await kugouRequest({
    baseURL: "http://login.user.kugou.com",
    url: "/v5/login_by_token",
    method: "POST",
    data: dataMap,
    encryptType: "android",
    cookie: deviceCookie(device, { token, userid, t1 })
  });
  return extractLoginPayload(response, encryptParams.key);
}
__name(loginByToken, "loginByToken");
async function createQrCode(device) {
  const response = await kugouRequest({
    baseURL: "https://login-user.kugou.com",
    url: "/v2/qrcode",
    method: "GET",
    params: {
      appid: 1001,
      type: 1,
      plat: 4,
      qrcode_txt: `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=${SRCAPPID}&`,
      srcappid: SRCAPPID
    },
    encryptType: "web",
    cookie: deviceCookie(device)
  });
  const data = response.body && response.body.data || {};
  if (!data.qrcode) {
    return { ok: false, error: { message: "\u4E8C\u7EF4\u7801\u83B7\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", raw: response.body } };
  }
  return {
    ok: true,
    key: data.qrcode,
    img: data.qrcode_img || "",
    url: `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${data.qrcode}`
  };
}
__name(createQrCode, "createQrCode");
async function checkQrCode(device, key) {
  const response = await kugouRequest({
    baseURL: "https://login-user.kugou.com",
    url: "/v2/get_userinfo_qrcode",
    method: "GET",
    params: { plat: 4, appid: APPID, srcappid: SRCAPPID, qrcode: key },
    encryptType: "web",
    cookie: deviceCookie(device)
  });
  const body = response.body || {};
  const data = body.data || {};
  const status = Number(data.status);
  const STATUS_TEXT = {
    0: "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6",
    1: "\u7B49\u5F85\u626B\u7801",
    2: "\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4",
    4: "\u6388\u6743\u6210\u529F"
  };
  if (status === 4) {
    if (!data.token) return { ok: false, status, message: "\u6388\u6743\u6210\u529F\u4F46\u672A\u8FD4\u56DE token\uFF0C\u8BF7\u91CD\u8BD5" };
    return {
      ok: true,
      status,
      message: STATUS_TEXT[status],
      account: {
        userid: Number(data.userid) || data.userid,
        token: data.token,
        t1: "",
        nickname: data.nickname || "",
        vipType: Number(data.vip_type || 0),
        vipToken: data.vip_token || "",
        dfid: device.dfid || ""
      }
    };
  }
  return { ok: true, status, message: STATUS_TEXT[status] || "\u672A\u77E5\u72B6\u6001", pending: status === 1 || status === 2, expired: status === 0 };
}
__name(checkQrCode, "checkQrCode");
async function registerDevice(device, { token = "", userid = 0 } = {}) {
  const guid = device.guid;
  const dataMap = {
    availableRamSize: 4983533568,
    availableRomSize: 48114719,
    availableSDSize: 48114717,
    basebandVer: "",
    batteryLevel: 100,
    batteryStatus: 3,
    brand: "Redmi",
    buildSerial: "unknown",
    device: "marble",
    imei: guid,
    imsi: "",
    manufacturer: "Xiaomi",
    uuid: guid,
    accelerometer: false,
    accelerometerValue: "",
    gravity: false,
    gravityValue: "",
    gyroscope: false,
    gyroscopeValue: "",
    light: false,
    lightValue: "",
    magnetic: false,
    magneticValue: "",
    orientation: false,
    orientationValue: "",
    pressure: false,
    pressureValue: "",
    step_counter: false,
    step_counterValue: "",
    temperature: false,
    temperatureValue: ""
  };
  const aesEncrypt = playlistAesEncrypt(dataMap);
  const p = rsaPkcs1Encrypt({ aes: aesEncrypt.key, uid: userid, token });
  const response = await kugouRequest({
    baseURL: "https://userservice.kugou.com",
    url: "/risk/v2/r_register_dev",
    method: "POST",
    data: aesEncrypt.str,
    params: { part: 1, platid: 1, p },
    encryptType: "android",
    cookie: deviceCookie(device, { token, userid }),
    responseType: "arrayBuffer"
  });
  const bytes = response.body;
  if (!bytes || typeof bytes === "string") {
    return { ok: false, error: { message: "\u8BBE\u5907\u6CE8\u518C\u5931\u8D25\uFF1A\u54CD\u5E94\u5F02\u5E38", raw: bytes } };
  }
  const decoded = playlistAesDecrypt({ str: base64FromBytes(bytes), key: aesEncrypt.key });
  if (decoded && decoded.status === 1 && decoded.data && decoded.data.dfid) {
    return { ok: true, dfid: decoded.data.dfid, raw: decoded };
  }
  return { ok: false, error: { message: "\u8BBE\u5907\u6CE8\u518C\u5931\u8D25", raw: decoded } };
}
__name(registerDevice, "registerDevice");
function base64FromBytes(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
__name(base64FromBytes, "base64FromBytes");

// src/api/checkin.js
var AD_ID = 12307537187;
var MIX_SONG_ID = 666075191;
async function fetchUserDetail(device, account) {
  const clienttime = Math.floor(Date.now() / 1e3);
  const pk = rsaRawEncrypt({ token: account.token, clienttime }).toUpperCase();
  const response = await kugouRequest({
    url: "/v3/get_my_info",
    method: "POST",
    data: {
      visit_time: clienttime,
      usertype: 1,
      p: pk,
      userid: Number(account.userid) || 0
    },
    params: { plat: 1 },
    encryptType: "android",
    headers: { "x-router": "usercenter.kugou.com" },
    cookie: deviceCookie(device, account)
  });
  return response.body;
}
__name(fetchUserDetail, "fetchUserDetail");
async function reportListenSong(device, account) {
  const response = await kugouRequest({
    url: "/youth/v2/report/listen_song",
    method: "POST",
    data: { mixsongid: MIX_SONG_ID },
    params: { clientver: 10566 },
    encryptType: "android",
    headers: {
      "user-agent": UA_REPORT,
      "content-type": "application/json; charset=utf-8"
    },
    cookie: deviceCookie(device, account)
  });
  return response.body;
}
__name(reportListenSong, "reportListenSong");
async function reportAdPlay(device, account) {
  const time = Date.now();
  const response = await kugouRequest({
    url: "/youth/v1/ad/play_report",
    method: "POST",
    data: {
      ad_id: AD_ID,
      play_end: time,
      play_start: time - 3e4
    },
    encryptType: "android",
    cookie: deviceCookie(device, account)
  });
  return response.body;
}
__name(reportAdPlay, "reportAdPlay");
async function fetchVipDetail(device, account) {
  const response = await kugouRequest({
    baseURL: "https://kugouvip.kugou.com",
    url: "/v1/get_union_vip",
    method: "GET",
    params: { busi_type: "concept" },
    encryptType: "android",
    cookie: deviceCookie(device, account)
  });
  return response.body;
}
__name(fetchVipDetail, "fetchVipDetail");

// src/lib/secure.js
var VERSION = "v1";
async function deriveKey(secret) {
  const digest = await crypto.subtle.digest("SHA-256", utf8Encode(`kg-qiandao:${secret}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
__name(deriveKey, "deriveKey");
function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}
__name(isEncrypted, "isEncrypted");
async function encryptSecret(plain, secret) {
  if (!plain) return "";
  if (!secret) return plain;
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8Encode(plain));
  return `${VERSION}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipher))}`;
}
__name(encryptSecret, "encryptSecret");
async function decryptSecret(value, secret) {
  if (!value) return "";
  if (!isEncrypted(value)) return value;
  if (!secret) return "";
  try {
    const [, ivPart, dataPart] = value.split(":");
    const key = await deriveKey(secret);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivPart) },
      key,
      base64ToBytes(dataPart)
    );
    return utf8Decode(new Uint8Array(plain));
  } catch {
    return "";
  }
}
__name(decryptSecret, "decryptSecret");

// src/store.js
var ACCOUNTS_KEY = "kg:accounts";
var DEVICE_KEY = "kg:device";
var SETTINGS_KEY = "kg:settings";
var LOGS_KEY = "kg:logs";
var MAX_LOGS = 100;
var LEGACY_KEYS = {
  [ACCOUNTS_KEY]: "kg_accounts",
  [DEVICE_KEY]: "kg_device",
  [SETTINGS_KEY]: "kg_settings",
  [LOGS_KEY]: "kg_logs"
};
var RUNNING_STALE_MS = 3 * 60 * 1e3;
var DEFAULT_SETTINGS = {
  /** 新账号默认签到时间（北京时间 HH:MM） */
  defaultSignTime: "01:15",
  /** 每日广告领取最大次数 */
  adRounds: 8,
  /** 广告领取之间的间隔秒数 */
  adIntervalSeconds: 30,
  /** 是否每周日自动刷新 token */
  autoRefreshToken: true,
  /** 是否在错过签到时间后补签 */
  catchUp: false,
  /** 是否调用设备注册接口获取 dfid（默认关闭，与参考项目一致） */
  enableDeviceRegister: false,
  /** 最近一次自动刷新 token 的日期（YYYY-MM-DD），用于避免定时任务重复刷新 */
  lastRefreshDate: ""
};
function kv(env) {
  return env.KG_KV || env.KG_ACCOUNTS_KV;
}
__name(kv, "kv");
function requireKv(env) {
  const store = kv(env);
  if (!store) {
    throw new Error(
      '\u672A\u7ED1\u5B9A KV \u547D\u540D\u7A7A\u95F4\uFF0C\u8BF7\u5728 wrangler.toml \u4E2D\u914D\u7F6E [[kv_namespaces]] binding = "KG_KV"'
    );
  }
  return store;
}
__name(requireKv, "requireKv");
async function readJson(env, key, fallback) {
  const store = requireKv(env);
  const raw = await store.get(key);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  const legacyKey = LEGACY_KEYS[key];
  if (!legacyKey) return fallback;
  const legacyRaw = await store.get(legacyKey);
  if (!legacyRaw) return fallback;
  let value;
  try {
    value = JSON.parse(legacyRaw);
  } catch {
    return fallback;
  }
  try {
    await store.put(key, legacyRaw);
    if (typeof store.delete === "function") await store.delete(legacyKey);
  } catch {
  }
  return value;
}
__name(readJson, "readJson");
async function writeJson(env, key, value) {
  await requireKv(env).put(key, JSON.stringify(value));
}
__name(writeJson, "writeJson");
async function getSettings(env) {
  const stored = await readJson(env, SETTINGS_KEY, {});
  return Object.assign({}, DEFAULT_SETTINGS, stored);
}
__name(getSettings, "getSettings");
async function saveSettings(env, patch) {
  const current = await getSettings(env);
  const next = Object.assign({}, current, patch);
  next.adRounds = Math.min(20, Math.max(0, Number(next.adRounds) || 0));
  next.adIntervalSeconds = Math.min(
    120,
    Math.max(0, Number(next.adIntervalSeconds) || 0)
  );
  await writeJson(env, SETTINGS_KEY, next);
  return next;
}
__name(saveSettings, "saveSettings");
var DEVICE_REQUIRED_FIELDS = ["guid", "mid", "dev", "mac", "webgl"];
async function getDevice(env) {
  const stored = await readJson(env, DEVICE_KEY, null);
  const device = normalizeDeviceIdentity(stored);
  const needsWrite = !stored || DEVICE_REQUIRED_FIELDS.some((field) => !stored[field]);
  if (needsWrite) {
    await writeJson(env, DEVICE_KEY, device);
  }
  return device;
}
__name(getDevice, "getDevice");
function secretOf(env) {
  return env.SECRET_KEY || env.ADMIN_TOKEN || "";
}
__name(secretOf, "secretOf");
var TOKEN_LOCK = /* @__PURE__ */ Symbol("tokenLock");
var VIP_TOKEN_LOCK = /* @__PURE__ */ Symbol("vipTokenLock");
async function decryptField(value, secret, lockSymbol, account) {
  if (!isEncrypted(value)) return value;
  const plain = await decryptSecret(value, secret);
  if (plain) return plain;
  account[lockSymbol] = value;
  return "";
}
__name(decryptField, "decryptField");
async function decryptAccount(account, secret) {
  const out = Object.assign({}, account);
  out.token = await decryptField(account.token, secret, TOKEN_LOCK, out);
  out.vipToken = await decryptField(
    account.vipToken,
    secret,
    VIP_TOKEN_LOCK,
    out
  );
  return out;
}
__name(decryptAccount, "decryptAccount");
async function encryptAccount(account, secret) {
  const out = Object.assign({}, account);
  out.token = account.token ? await encryptSecret(account.token, secret) : account[TOKEN_LOCK] || "";
  out.vipToken = account.vipToken ? await encryptSecret(account.vipToken, secret) : account[VIP_TOKEN_LOCK] || "";
  return out;
}
__name(encryptAccount, "encryptAccount");
async function getAccounts(env) {
  const list = await readJson(env, ACCOUNTS_KEY, []);
  const secret = secretOf(env);
  const out = [];
  for (const item of list) out.push(await decryptAccount(item, secret));
  return out;
}
__name(getAccounts, "getAccounts");
async function saveAccounts(env, accounts) {
  const secret = secretOf(env);
  const out = [];
  for (const item of accounts) out.push(await encryptAccount(item, secret));
  await writeJson(env, ACCOUNTS_KEY, out);
  return accounts;
}
__name(saveAccounts, "saveAccounts");
var accountsWriteChain = Promise.resolve();
async function updateAccounts(env, mutator) {
  const task = accountsWriteChain.then(async () => {
    const accounts = await getAccounts(env);
    const result = await mutator(accounts);
    const next = Array.isArray(result) ? result : accounts;
    await saveAccounts(env, next);
    return next;
  });
  accountsWriteChain = task.then(
    () => void 0,
    () => void 0
  );
  return task;
}
__name(updateAccounts, "updateAccounts");
function newAccountId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "acc_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(newAccountId, "newAccountId");
function upsertAccount(accounts, incoming) {
  const index = accounts.findIndex(
    (a) => String(a.userid) === String(incoming.userid)
  );
  if (index >= 0) {
    const merged = Object.assign({}, accounts[index], incoming, {
      id: accounts[index].id,
      createdAt: accounts[index].createdAt
    });
    accounts[index] = merged;
    return { accounts, account: merged, created: false };
  }
  accounts.push(incoming);
  return { accounts, account: incoming, created: true };
}
__name(upsertAccount, "upsertAccount");
function publicAccount(account) {
  let lastStatus = account.lastStatus || "idle";
  let lastMessage = account.lastMessage || "";
  const runningSince = account.lastRunAt ? Date.parse(account.lastRunAt) : NaN;
  if (lastStatus === "running" && Number.isFinite(runningSince) && Date.now() - runningSince > RUNNING_STALE_MS) {
    lastStatus = "failed";
    lastMessage = "\u4E0A\u6B21\u6267\u884C\u88AB\u4E2D\u65AD\uFF08\u8D85\u51FA\u5355\u6B21\u8FD0\u884C\u65F6\u9650\uFF09\uFF0C\u7A0D\u540E\u4F1A\u81EA\u52A8\u91CD\u8BD5";
  }
  return {
    id: account.id,
    name: account.name,
    userid: account.userid,
    enabled: account.enabled !== false,
    signTime: account.signTime,
    source: account.source,
    createdAt: account.createdAt,
    lastRunAt: account.lastRunAt || null,
    lastRunDate: account.lastRunDate || "",
    lastStatus,
    lastMessage,
    lastSteps: account.lastSteps || [],
    vipEndTime: account.vipEndTime || "",
    vipType: account.vipType || 0,
    /** 账号类型：old=有广告领取活动 / new=无该活动 / unknown=尚未判定 */
    adTier: account.adTier || "unknown",
    /** 广告次数尚未领完，等待定时任务续跑 */
    pendingAds: !!account.pendingAds,
    /** 听歌未领到，等待定时任务重试 */
    pendingClaim: !!account.pendingClaim,
    hasToken: !!account.token,
    progress: account.progress || null
  };
}
__name(publicAccount, "publicAccount");
function newAccountRecord({
  userid,
  token,
  t1,
  nickname,
  vipType,
  vipToken,
  dfid,
  source,
  signTime,
  name
}) {
  const providedName = String(name || "").trim();
  return {
    id: newAccountId(),
    name: providedName || nickname || `\u8D26\u53F7 ${userid}`,
    /** 是否由用户手动指定名称（true 时不会被酷狗昵称覆盖） */
    customName: !!providedName,
    userid,
    token: token || "",
    t1: t1 || "",
    vipType: vipType || 0,
    vipToken: vipToken || "",
    dfid: dfid || "",
    enabled: true,
    signTime: signTime || DEFAULT_SETTINGS.defaultSignTime,
    source: source || "manual",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastRunAt: null,
    lastRunDate: "",
    lastStatus: "idle",
    lastMessage: "\u7B49\u5F85\u9996\u6B21\u6267\u884C",
    lastSteps: [],
    vipEndTime: "",
    /** 账号类型，首次执行后由接口返回自动判定 */
    adTier: "unknown",
    /** 广告次数尚未领完，等待定时任务续跑 */
    pendingAds: false,
    /** 听歌未领到，等待定时任务重试 */
    pendingClaim: false
  };
}
__name(newAccountRecord, "newAccountRecord");
async function appendLog(env, entry) {
  const logs = await readJson(env, LOGS_KEY, []);
  logs.unshift(Object.assign({ at: (/* @__PURE__ */ new Date()).toISOString() }, entry));
  await writeJson(env, LOGS_KEY, logs.slice(0, MAX_LOGS));
}
__name(appendLog, "appendLog");
async function getLogs(env) {
  return readJson(env, LOGS_KEY, []);
}
__name(getLogs, "getLogs");
async function clearLogs(env) {
  await writeJson(env, LOGS_KEY, []);
}
__name(clearLogs, "clearLogs");

// src/tasks.js
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");
var MAX_ATTEMPTS_PER_DAY = 3;
var MANUAL_BUDGET_MS = 45e3;
var CRON_BUDGET_MS = 12e4;
var BATCH_TOTAL_BUDGET_MS = 55e3;
var LOCK_RETRY_DELAY_MS = 3e3;
var MAX_RUNS_PER_DAY = 20;
var PROGRESS_WRITE_INTERVAL_MS = 3e4;
var MAX_PROGRESS_WRITES = 2;
function isFreshRunning(lastRunAt) {
  const startedAt = lastRunAt ? Date.parse(lastRunAt) : NaN;
  return Number.isFinite(startedAt) && Date.now() - startedAt < RUNNING_STALE_MS;
}
__name(isFreshRunning, "isFreshRunning");
function shanghaiNow(date = /* @__PURE__ */ new Date(), offsetHours = 8) {
  const shifted = new Date(date.getTime() + offsetHours * 3600 * 1e3);
  const yyyy = shifted.getUTCFullYear();
  const MM = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const DD = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = shifted.getUTCHours();
  const mm = shifted.getUTCMinutes();
  return {
    date: `${yyyy}-${MM}-${DD}`,
    time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    minutes: hh * 60 + mm,
    weekday: shifted.getUTCDay()
  };
}
__name(shanghaiNow, "shanghaiNow");
function toMinutes(value) {
  const [h, m] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
__name(toMinutes, "toMinutes");
function isTimeMatch(target, currentMinutes, window = 5) {
  const diff = Math.abs(currentMinutes - toMinutes(target));
  return diff < window || diff > 1440 - window;
}
__name(isTimeMatch, "isTimeMatch");
function isPast(target, currentMinutes) {
  return currentMinutes >= toMinutes(target);
}
__name(isPast, "isPast");
function describeError(body, fallback = "\u672A\u77E5\u9519\u8BEF") {
  if (!body || typeof body !== "object") return fallback;
  const code = body.error_code ?? body.errcode ?? body.status;
  const text = body.error_msg || body.errmsg || body.msg || body.message || "";
  if (code === void 0 || code === null) return text || fallback;
  return text ? `error_code=${code} ${text}` : `error_code=${code}`;
}
__name(describeError, "describeError");
function isLockError(body) {
  if (!body || typeof body !== "object") return false;
  if (Number(body.error_code ?? body.errcode) !== 30002) return false;
  const text = String(body.error_msg || body.errmsg || body.msg || body.message || "");
  return /lock/i.test(text);
}
__name(isLockError, "isLockError");
var runningAccounts = /* @__PURE__ */ new Set();
async function patchAccount(env, id, patch) {
  await updateAccounts(env, (accounts) => {
    const account = accounts.find((a) => a.id === id);
    if (account) Object.assign(account, patch);
    return accounts;
  });
}
__name(patchAccount, "patchAccount");
async function performCheckin(env, account, settings, hooks = {}) {
  const device = await getDevice(env);
  const steps = [];
  const runtime = Object.assign({}, account);
  const budgetMs = Number(hooks.budgetMs) > 0 ? Number(hooks.budgetMs) : MANUAL_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  const api = Object.assign({
    registerDevice,
    fetchUserDetail,
    reportListenSong,
    reportAdPlay,
    fetchVipDetail
  }, hooks.api || {});
  const record = /* @__PURE__ */ __name(async (name, ok, message) => {
    steps.push({ name, ok, message, at: (/* @__PURE__ */ new Date()).toISOString() });
    if (hooks.onProgress) await hooks.onProgress(steps.slice());
  }, "record");
  if (settings.enableDeviceRegister && !runtime.dfid) {
    try {
      const reg = await api.registerDevice(device, { token: runtime.token, userid: runtime.userid });
      if (reg.ok) {
        runtime.dfid = reg.dfid;
        await record("\u8BBE\u5907\u6CE8\u518C", true, "dfid \u83B7\u53D6\u6210\u529F");
      } else {
        await record("\u8BBE\u5907\u6CE8\u518C", false, reg.error && reg.error.message || "\u83B7\u53D6\u5931\u8D25");
      }
    } catch (error) {
      await record("\u8BBE\u5907\u6CE8\u518C", false, String(error.message || error));
    }
  }
  let detail = null;
  try {
    detail = await api.fetchUserDetail(device, runtime);
  } catch (error) {
    await record("\u767B\u5F55\u6821\u9A8C", false, `\u8BF7\u6C42\u5F02\u5E38\uFF1A${error.message || error}`);
    return { ok: false, steps, nickname: runtime.name, message: "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25", dfid: runtime.dfid };
  }
  const nickname = detail && detail.status === 1 && detail.data ? detail.data.nickname : "";
  if (!nickname) {
    await record("\u767B\u5F55\u6821\u9A8C", false, `token \u5931\u6548\u6216\u8D26\u53F7\u5F02\u5E38\uFF08${describeError(detail)}\uFF09`);
    return {
      ok: false,
      tokenInvalid: true,
      steps,
      nickname: runtime.name,
      message: "token \u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55",
      dfid: runtime.dfid
    };
  }
  await record("\u767B\u5F55\u6821\u9A8C", true, `\u8D26\u53F7\uFF1A${nickname}`);
  let listenState = "failed";
  let listenDetail = "";
  let listenRetried = false;
  try {
    let listen = await api.reportListenSong(device, runtime);
    if (!(listen && listen.status === 1) && !(listen && Number(listen.error_code) === 130012) && (isLockError(listen) || Number(listen && listen.error_code) === 30002)) {
      listenRetried = true;
      await sleep(LOCK_RETRY_DELAY_MS);
      listen = await api.reportListenSong(device, runtime);
    }
    if (listen && listen.status === 1) {
      listenState = "claimed";
      listenDetail = listenRetried ? "\u91CD\u8BD5\u540E\u9886\u53D6\u6210\u529F" : "\u9886\u53D6\u6210\u529F";
    } else if (listen && Number(listen.error_code) === 130012) {
      listenState = "already";
      listenDetail = "\u4ECA\u65E5\u5DF2\u9886\u53D6";
    } else {
      listenDetail = `\u5931\u8D25\uFF08${describeError(listen)}\uFF09`;
    }
  } catch (error) {
    listenDetail = `\u8BF7\u6C42\u5F02\u5E38\uFF1A${error.message || error}`;
  }
  await record("\u542C\u6B4C\u9886\u53D6", listenState !== "failed", listenDetail);
  let adSuccess = 0;
  let adExhausted = false;
  let adPending = false;
  let adTier = runtime.adTier === "old" || runtime.adTier === "new" ? runtime.adTier : "unknown";
  const rounds = Number(settings.adRounds) || 0;
  const interval = (Number(settings.adIntervalSeconds) || 0) * 1e3;
  for (let i = 1; i <= rounds; i++) {
    if (Date.now() >= deadline) {
      adPending = true;
      await record("\u5E7F\u544A\u9886\u53D6", true, `\u672C\u6B21\u5DF2\u9886\u53D6 ${adSuccess} \u6B21\uFF0C\u5269\u4F59\u6B21\u6570\u5C06\u5728\u4E0B\u6B21\u5B9A\u65F6\u4EFB\u52A1\u81EA\u52A8\u7EE7\u7EED`);
      break;
    }
    try {
      const ad = await api.reportAdPlay(device, runtime);
      if (ad && ad.status === 1) {
        adSuccess++;
        adTier = "old";
        await record(`\u5E7F\u544A\u9886\u53D6 #${i}`, true, "\u9886\u53D6\u6210\u529F");
      } else if (ad && Number(ad.error_code) === 30002) {
        if (isLockError(ad)) {
          adPending = true;
          await record(`\u5E7F\u544A\u9886\u53D6 #${i}`, true, "\u9047\u5230\u5E76\u53D1\u9501\u7ADE\u4E89\uFF0C\u5269\u4F59\u6B21\u6570\u7A0D\u540E\u81EA\u52A8\u7EED\u8DD1");
          break;
        }
        adExhausted = true;
        adTier = "old";
        await record(`\u5E7F\u544A\u9886\u53D6 #${i}`, true, "\u4ECA\u65E5\u6B21\u6570\u5DF2\u7528\u5C3D");
        break;
      } else if (ad && ad.error_code === 20028) {
        adTier = "new";
        await record("\u5E7F\u544A\u9886\u53D6", true, "\u8BE5\u8D26\u53F7\u65E0\u5E7F\u544A\u9886\u53D6\u6D3B\u52A8\uFF08\u65B0\u8D26\u53F7\uFF09");
        break;
      } else {
        await record(`\u5E7F\u544A\u9886\u53D6 #${i}`, false, `\u5931\u8D25\uFF08${describeError(ad)}\uFF09`);
        break;
      }
    } catch (error) {
      await record(`\u5E7F\u544A\u9886\u53D6 #${i}`, false, `\u8BF7\u6C42\u5F02\u5E38\uFF1A${error.message || error}`);
      break;
    }
    if (i < rounds && interval > 0) {
      if (Date.now() + interval >= deadline) {
        adPending = true;
        await record("\u5E7F\u544A\u9886\u53D6", true, `\u672C\u6B21\u5DF2\u9886\u53D6 ${adSuccess} \u6B21\uFF0C\u5269\u4F59\u6B21\u6570\u5C06\u5728\u4E0B\u6B21\u5B9A\u65F6\u4EFB\u52A1\u81EA\u52A8\u7EE7\u7EED`);
        break;
      }
      await sleep(interval);
    }
  }
  let vipEndTime = runtime.vipEndTime || "";
  try {
    const vip = await api.fetchVipDetail(device, runtime);
    const first = vip && vip.status === 1 && vip.data && Array.isArray(vip.data.busi_vip) ? vip.data.busi_vip[0] : null;
    if (first && first.vip_end_time) {
      vipEndTime = first.vip_end_time;
      await record("VIP \u4FE1\u606F", true, `\u5230\u671F\u65F6\u95F4\uFF1A${vipEndTime}`);
    } else {
      await record("VIP \u4FE1\u606F", false, `\u83B7\u53D6\u5931\u8D25\uFF08${describeError(vip)}\uFF09`);
    }
  } catch (error) {
    await record("VIP \u4FE1\u606F", false, `\u8BF7\u6C42\u5F02\u5E38\uFF1A${error.message || error}`);
  }
  const failedSteps = steps.filter((s) => !s.ok).length;
  const listenStep = steps.find((s) => s.name === "\u542C\u6B4C\u9886\u53D6");
  const listenDone = listenState === "claimed" || listenState === "already";
  const listenText = listenState === "already" ? "\u542C\u6B4C\u4ECA\u65E5\u5DF2\u9886\u53D6" : listenState === "claimed" ? "\u542C\u6B4C\u9886\u53D6\u6210\u529F" : "\u542C\u6B4C\u9886\u53D6\u5931\u8D25";
  const adText = adExhausted ? `\u5E7F\u544A ${adSuccess} \u6B21\uFF08\u4ECA\u65E5\u5DF2\u7528\u5C3D\uFF09` : adTier === "new" ? "\u5E7F\u544A\u4E0D\u9002\u7528\uFF08\u65B0\u8D26\u53F7\uFF09" : adPending ? `\u5E7F\u544A ${adSuccess} \u6B21\uFF08\u5F85\u7EED\u8DD1\uFF09` : `\u5E7F\u544A ${adSuccess} \u6B21`;
  return {
    ok: true,
    nickname,
    steps,
    listenState,
    listenDetail,
    adSuccess,
    adTier,
    adPending,
    // 听歌没领到 → 本次不算完成，交给定时任务重试
    pendingClaim: !listenDone,
    vipEndTime,
    dfid: runtime.dfid,
    message: `${listenText} \xB7 ${adText}${failedSteps ? ` \xB7 ${failedSteps} \u6B65\u5F02\u5E38` : ""}`
  };
}
__name(performCheckin, "performCheckin");
async function runCheckinForAccount(env, accountId, options = {}) {
  const trigger = options.trigger || "manual";
  const budgetMs = Number(options.budgetMs) > 0 ? Number(options.budgetMs) : MANUAL_BUDGET_MS;
  const settings = await getSettings(env);
  const accounts = await getAccounts(env);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, message: "\u8D26\u53F7\u4E0D\u5B58\u5728" };
  if (account.enabled === false) return { ok: false, message: "\u8D26\u53F7\u5DF2\u505C\u7528" };
  if (runningAccounts.has(accountId)) {
    return { ok: false, skipped: true, message: "\u8BE5\u8D26\u53F7\u6B63\u5728\u6267\u884C\u4E2D\uFF0C\u5DF2\u8DF3\u8FC7\u672C\u6B21\u91CD\u590D\u6267\u884C" };
  }
  if (account.lastStatus === "running" && isFreshRunning(account.lastRunAt)) {
    return { ok: false, skipped: true, message: "\u8BE5\u8D26\u53F7\u6B63\u5728\u6267\u884C\u4E2D\uFF0C\u5DF2\u8DF3\u8FC7\u672C\u6B21\u91CD\u590D\u6267\u884C" };
  }
  runningAccounts.add(accountId);
  try {
    return await executeCheckin(env, accountId, account, settings, { trigger, budgetMs, api: options.api });
  } finally {
    runningAccounts.delete(accountId);
  }
}
__name(runCheckinForAccount, "runCheckinForAccount");
async function executeCheckin(env, accountId, account, settings, { trigger, budgetMs, api }) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const today = shanghaiNow().date;
  const attemptsToday = account.lastAttemptDate === today ? Number(account.attemptsToday) || 0 : 0;
  const runsToday = (account.lastRunDay === today ? Number(account.runsToday) || 0 : 0) + 1;
  await patchAccount(env, accountId, {
    lastStatus: "running",
    lastRunAt: startedAt,
    lastMessage: "\u6267\u884C\u4E2D\u2026",
    lastRunDay: today,
    runsToday,
    progress: { startedAt, trigger, steps: [] }
  });
  let progressWrites = 0;
  let lastProgressAt = Date.now();
  const onProgress = /* @__PURE__ */ __name(async (steps) => {
    if (progressWrites >= MAX_PROGRESS_WRITES) return;
    const nowMs = Date.now();
    if (nowMs - lastProgressAt < PROGRESS_WRITE_INTERVAL_MS) return;
    progressWrites++;
    lastProgressAt = nowMs;
    await patchAccount(env, accountId, { progress: { startedAt, trigger, steps } });
  }, "onProgress");
  let result;
  try {
    result = await performCheckin(env, account, settings, {
      budgetMs,
      api,
      onProgress
    });
  } catch (error) {
    result = { ok: false, steps: [], nickname: account.name, message: `\u6267\u884C\u5F02\u5E38\uFF1A${error.message || error}` };
  }
  const listenDone = result.listenState === "claimed" || result.listenState === "already";
  const finished = result.tokenInvalid || result.ok && listenDone && !result.adPending;
  const countedAsFailure = !result.tokenInvalid && !finished && !result.adPending;
  const nextAttempts = countedAsFailure ? attemptsToday + 1 : attemptsToday;
  const patch = {
    lastRunAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastStatus: result.tokenInvalid ? "token_invalid" : result.ok && listenDone ? "success" : "failed",
    lastMessage: result.message || (result.ok ? "\u5B8C\u6210" : "\u5931\u8D25"),
    lastSteps: result.steps || [],
    progress: null,
    // 广告次数未领完 / 听歌未领到：保留标记，交由下一次定时任务自动续跑
    pendingAds: !!result.adPending,
    pendingClaim: !result.tokenInvalid && !listenDone
  };
  if (countedAsFailure) {
    patch.lastAttemptDate = today;
    patch.attemptsToday = nextAttempts;
  }
  if (result.nickname && !account.customName) patch.name = result.nickname;
  if (result.adTier && result.adTier !== "unknown") patch.adTier = result.adTier;
  if (result.vipEndTime) patch.vipEndTime = result.vipEndTime;
  if (result.dfid) patch.dfid = result.dfid;
  if (finished || nextAttempts >= MAX_ATTEMPTS_PER_DAY) patch.lastRunDate = today;
  await patchAccount(env, accountId, patch);
  await appendLog(env, {
    accountId,
    name: patch.name || account.name,
    trigger,
    status: patch.lastStatus,
    message: patch.lastMessage,
    adSuccess: result.adSuccess || 0,
    vipEndTime: result.vipEndTime || "",
    steps: result.steps || []
  });
  return Object.assign({ accountId, name: patch.name || account.name }, result);
}
__name(executeCheckin, "executeCheckin");
async function runBatch(env, ids, trigger, options = {}) {
  const concurrency = options.concurrency || 3;
  const totalBudgetMs = options.totalBudgetMs || 10 * 60 * 1e3;
  const accountBudgetMs = options.accountBudgetMs || CRON_BUDGET_MS;
  const results = [];
  const queue = ids.slice();
  const deadline = Date.now() + totalBudgetMs;
  async function worker() {
    while (queue.length) {
      if (Date.now() > deadline) {
        results.push({ ok: false, skipped: true, message: "\u8D85\u51FA\u5355\u6B21\u6267\u884C\u65F6\u95F4\u9884\u7B97\uFF0C\u5269\u4F59\u8D26\u53F7\u5C06\u5728\u4E0B\u6B21\u5B9A\u65F6\u4EFB\u52A1\u4E2D\u8865\u8DD1" });
        return;
      }
      const id = queue.shift();
      try {
        results.push(await runCheckinForAccount(env, id, { trigger, budgetMs: accountBudgetMs, api: options.api }));
      } catch (error) {
        results.push({ ok: false, accountId: id, message: String(error.message || error) });
      }
    }
  }
  __name(worker, "worker");
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return results;
}
__name(runBatch, "runBatch");
async function runAllAccounts(env, trigger = "manual") {
  const accounts = await getAccounts(env);
  const ids = accounts.filter((a) => a.enabled !== false).map((a) => a.id);
  if (!ids.length) return { ok: true, total: 0, message: "\u6CA1\u6709\u542F\u7528\u7684\u8D26\u53F7" };
  const results = await runBatch(env, ids, trigger, {
    concurrency: 4,
    totalBudgetMs: BATCH_TOTAL_BUDGET_MS,
    accountBudgetMs: MANUAL_BUDGET_MS
  });
  const done = results.filter((r) => r && r.ok).length;
  const skipped = results.filter((r) => r && r.skipped).length;
  return {
    ok: true,
    total: ids.length,
    done,
    skipped,
    results,
    message: skipped ? `\u5DF2\u6267\u884C ${done} \u4E2A\u8D26\u53F7\uFF0C\u5269\u4F59 ${skipped} \u4E2A\u5C06\u5728\u4E0B\u6B21\u5B9A\u65F6\u4EFB\u52A1\u7EE7\u7EED` : `\u5DF2\u6267\u884C ${done} \u4E2A\u8D26\u53F7`
  };
}
__name(runAllAccounts, "runAllAccounts");
async function refreshTokens(env) {
  const device = await getDevice(env);
  const accounts = await getAccounts(env);
  const refreshed = [];
  for (const account of accounts) {
    if (account.enabled === false || !account.token) continue;
    try {
      const res = await loginByToken(device, { token: account.token, userid: account.userid, t1: account.t1 });
      if (res.ok && res.account.token && res.account.token !== account.token) {
        await patchAccount(env, account.id, {
          token: res.account.token,
          t1: res.account.t1 || account.t1,
          vipType: res.account.vipType || account.vipType,
          vipToken: res.account.vipToken || account.vipToken
        });
        refreshed.push({ accountId: account.id, name: account.name, changed: true });
      } else if (res.ok) {
        refreshed.push({ accountId: account.id, name: account.name, changed: false });
      } else {
        refreshed.push({ accountId: account.id, name: account.name, changed: false, message: res.error?.message });
      }
    } catch (error) {
      refreshed.push({ accountId: account.id, name: account.name, changed: false, message: String(error.message || error) });
    }
  }
  await appendLog(env, { trigger: "refresh", status: "info", name: "token \u5237\u65B0", message: `\u5DF2\u5904\u7406 ${refreshed.length} \u4E2A\u8D26\u53F7`, details: refreshed });
  return { ok: true, refreshed };
}
__name(refreshTokens, "refreshTokens");
async function handleScheduled(env, options = {}) {
  const settings = await getSettings(env);
  const now = options.now || shanghaiNow();
  const accounts = await getAccounts(env);
  const targets = accounts.filter((account) => {
    if (account.enabled === false) return false;
    if (account.lastRunDate === now.date) return false;
    if (account.lastStatus === "running" && isFreshRunning(account.lastRunAt)) return false;
    if (account.lastRunDay === now.date && (Number(account.runsToday) || 0) >= MAX_RUNS_PER_DAY) return false;
    if (account.lastAttemptDate === now.date && (Number(account.attemptsToday) || 0) >= MAX_ATTEMPTS_PER_DAY) return false;
    if (account.pendingAds || account.pendingClaim) return true;
    if (isTimeMatch(account.signTime, now.minutes)) return true;
    if (settings.catchUp && isPast(account.signTime, now.minutes)) return true;
    return false;
  });
  let results = [];
  if (targets.length) {
    results = await runBatch(env, targets.map((a) => a.id), "cron", {
      concurrency: 3,
      totalBudgetMs: 10 * 60 * 1e3,
      accountBudgetMs: CRON_BUDGET_MS,
      api: options.api
    });
  }
  if (settings.autoRefreshToken && now.weekday === 0 && settings.lastRefreshDate !== now.date) {
    await refreshTokens(env);
    await saveSettings(env, { lastRefreshDate: now.date });
  }
  return { ok: true, time: `${now.date} ${now.time}`, matched: targets.length, results };
}
__name(handleScheduled, "handleScheduled");

// src/web/ui.js
var CONSOLE_STYLES = `
  :root {
    color-scheme: dark;
    --bg: #121212;
    --panel: #1e1e1e;
    --panel-2: #262626;
    --panel-3: #2f2f2f;
    --border: #2a2a2a;
    --border-strong: #3a3a3a;
    --text: #e0e0e0;
    --text-dim: #a0a0a0;
    --muted: #707070;
    --primary: #3b82f6;
    --primary-hover: #2563eb;
    --green: #4ade80;
    --red: #f87171;
    --orange: #fbbf24;
    --radius: 8px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--primary); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .wrap { max-width: 1220px; margin: 0 auto; padding: 22px 16px 60px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
  .brand { display: flex; align-items: center; gap: 11px; }
  .logo {
    width: 38px; height: 38px; border-radius: var(--radius);
    background: var(--primary); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 17px;
  }
  h1 { font-size: 18px; margin: 0; letter-spacing: .2px; }
  h2 { font-size: 15px; margin: 0 0 12px; }
  .sub { color: var(--text-dim); font-size: 12px; }
  .muted { color: var(--muted); }

  /* \u6241\u5E73\u5316\uFF1A\u65E0\u9634\u5F71\u3001\u65E0\u6E10\u53D8\uFF0C\u4EC5\u9760 1px \u63CF\u8FB9\u4E0E\u5C42\u6B21\u8272\u533A\u5206 */
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 14px;
  }
  .card > h2:first-child { margin-top: 0; }

  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }

  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 16px; flex-wrap: wrap; }
  .tab {
    padding: 9px 14px; border: none; background: none;
    color: var(--text-dim); cursor: pointer; font-size: 14px;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }

  button { font-family: inherit; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    border: 1px solid var(--border-strong);
    background: var(--panel-2);
    color: var(--text);
    padding: 7px 14px; border-radius: var(--radius);
    cursor: pointer; font-size: 13px; line-height: 1.2;
    white-space: nowrap;
    transition: background-color .2s ease, border-color .2s ease, transform .1s ease;
  }
  .btn:hover:not(:disabled) { background: var(--panel-3); border-color: #4a4a4a; }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: var(--primary-hover); border-color: var(--primary-hover); }
  /* \u53EF\u63D0\u4EA4\u72B6\u6001\u7528\u7EFF\u8272\uFF0C\u660E\u786E\u63D0\u793A\u300C\u8FD9\u91CC\u53EF\u4EE5\u70B9\u300D */
  .btn-success { background: var(--green); border-color: var(--green); color: #10251a; font-weight: 600; }
  .btn-success:hover:not(:disabled) { background: #6ee7a0; border-color: #6ee7a0; }
  .btn-danger { color: var(--red); border-color: #4a2a2a; background: transparent; }
  .btn-danger:hover:not(:disabled) { background: #2a1a1a; border-color: #6b3a3a; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }

  input, select {
    padding: 8px 11px; border: 1px solid var(--border-strong);
    border-radius: var(--radius); font-size: 14px; font-family: inherit;
    background: #181818; color: var(--text); width: 100%;
  }
  input::placeholder { color: #6f6f6f; }
  input:focus, select:focus { outline: none; border-color: var(--primary); }
  .field { display: block; margin-bottom: 12px; }
  .field > span { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 5px; }

  table { width: 100%; border-collapse: collapse; min-width: 1010px; }
  th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--border); vertical-align: middle; white-space: nowrap; }
  th { font-size: 12px; color: var(--text-dim); font-weight: 600; background: #181818; }
  tr:last-child td { border-bottom: none; }

  .pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 4px; font-size: 12px; white-space: nowrap; }
  .pill-success { background: #14301f; color: var(--green); }
  .pill-failed { background: #33191b; color: var(--red); }
  .pill-invalid { background: #33260f; color: var(--orange); }
  .pill-running { background: #16243f; color: var(--primary); }
  .pill-idle, .pill-off { background: #262626; color: var(--text-dim); }

  .tag {
    display: inline-block; font-size: 11px; line-height: 1.5;
    border: 1px solid var(--border-strong); border-radius: 4px;
    padding: 0 6px; color: var(--text-dim); white-space: nowrap;
  }
  .tag-old { border-color: #2a4a3a; background: #14301f; color: var(--green); }
  .tag-new { border-color: #3a3a3a; background: #262626; color: var(--text-dim); }
  .tag-pending { border-color: #4a3a1f; background: #2c2313; color: var(--orange); }
  .tag-unknown { border-style: dashed; color: var(--muted); }

  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
  .truncate { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }

  /* \u8BF4\u660E\u9762\u677F */
  .notice {
    background: var(--panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    border-radius: var(--radius);
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .notice.warn { border-left-color: var(--orange); }
  .notice-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .notice-body p { margin: 0 0 6px; font-size: 12.5px; color: var(--text-dim); }
  .notice-body p:last-child { margin-bottom: 0; }
  .notice-body b { color: var(--text); font-weight: 600; }
  code { background: #262626; padding: 1px 5px; border-radius: 3px; font-size: 12px; color: #d4d4d4; }

  .mask { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 50; }
  .modal { background: var(--panel); border: 1px solid var(--border-strong); border-radius: var(--radius); width: 100%; max-width: 520px; max-height: 90vh; overflow: auto; padding: 20px; }
  .modal h3 { margin: 0 0 14px; font-size: 16px; }

  .qr-box { text-align: center; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: #181818; }
  .qr-box img { width: 200px; height: 200px; background: #fff; padding: 8px; border-radius: 4px; image-rendering: pixelated; }
  .qr-status { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 10px; color: var(--text-dim); font-size: 12.5px; }

  .steps { margin: 8px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--text-dim); }
  .steps li { margin-bottom: 3px; }
  .step-ok { color: var(--green); }
  .step-fail { color: var(--red); }

  .logs-item { border-bottom: 1px solid var(--border); padding: 12px 0; }
  .logs-item:last-child { border-bottom: none; }

  .toast {
    position: fixed; left: 50%; transform: translateX(-50%); bottom: 26px;
    background: var(--panel-3); border: 1px solid var(--border-strong);
    color: var(--text); padding: 10px 18px; border-radius: var(--radius);
    font-size: 13px; z-index: 99; max-width: 90vw;
  }
  .toast.error { border-color: #6b3a3e; background: #2a1a1c; color: #ffb4b4; }

  .empty { text-align: center; color: var(--muted); padding: 34px 0; }
  .center-load { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; color: var(--text-dim); }

  /* \u52A0\u8F7D\u52A8\u753B */
  .spinner {
    display: inline-block; width: 13px; height: 13px;
    border: 2px solid rgba(255,255,255,.18);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: kg-spin .7s linear infinite;
    flex: none;
  }
  .spinner-xs { width: 10px; height: 10px; border-width: 1.5px; }
  .spinner-lg { width: 26px; height: 26px; border-width: 2.5px; color: var(--primary); }
  .spinner-primary { color: var(--primary); }
  @keyframes kg-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 1.6s; } }

  @media (max-width: 640px) {
    .hide-sm { display: none; }
    th, td { padding: 9px 6px; }
    .wrap { padding: 16px 12px 48px; }
  }
`;
var AUTH_STYLES = `
  .auth-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .auth-card {
    background-color: #1e1e1e;
    border: 1px solid #2a2a2a;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    padding: 40px 30px;
    width: 100%;
    max-width: 400px;
    text-align: center;
  }
  .auth-badge {
    font-size: 4.5rem;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 20px;
    background: linear-gradient(135deg, #60a5fa, #3b82f6);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .auth-logo {
    display: flex;
    justify-content: center;
    margin-bottom: 20px;
  }
  .auth-logo svg { width: 76px; height: 76px; display: block; }
  .auth-card h1 {
    font-size: 1.5rem;
    margin: 0 0 12px;
    color: #e0e0e0;
  }
  .auth-card > p {
    color: #a0a0a0;
    font-size: 0.95rem;
    line-height: 1.6;
    margin: 0 0 26px;
  }
  .auth-input {
    width: 100%;
    background-color: #121212;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 0.95rem;
    font-family: inherit;
    padding: 12px 14px;
    margin-bottom: 12px;
    text-align: center;
  }
  .auth-input::placeholder { color: #6f6f6f; }
  .auth-input:focus { outline: none; border-color: #3b82f6; }
  .auth-input:disabled { opacity: .6; }
  .auth-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    background-color: #3b82f6;
    color: #ffffff;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 0.95rem;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background-color .2s ease, transform .1s ease;
  }
  .auth-btn:hover:not(:disabled) { background-color: #2563eb; }
  .auth-btn:active:not(:disabled) { transform: scale(.97); }
  .auth-btn:disabled { opacity: .7; cursor: not-allowed; }
  .auth-note {
    color: #707070;
    font-size: 12px;
    line-height: 1.6;
    margin-top: 18px;
  }
  .auth-code {
    background-color: #121212;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    padding: 12px;
    text-align: left;
    overflow-x: auto;
  }
  .auth-code code { background: none; color: #a0a0a0; font-size: 12px; white-space: nowrap; }
`;
function renderNotFound() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="icon" href="${FAVICON}" />
    <title>404 - \u9875\u9762\u672A\u627E\u5230</title>
    <style>
      :root {
        --bg-color: #121212;
        --card-bg: #1e1e1e;
        --text-main: #e0e0e0;
        --text-sub: #a0a0a0;
        --accent: #3b82f6;
        --accent-hover: #2563eb;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background-color: var(--bg-color);
        color: var(--text-main);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
      }
      .container {
        background-color: var(--card-bg);
        padding: 40px 30px;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        text-align: center;
        max-width: 400px;
        width: 100%;
        border: 1px solid #2a2a2a;
      }
      .error-code {
        font-size: 6rem;
        font-weight: 800;
        line-height: 1;
        margin-bottom: 20px;
        background: linear-gradient(135deg, #f87171, #ef4444);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      h1 { font-size: 1.5rem; margin-bottom: 12px; color: var(--text-main); }
      p { color: var(--text-sub); font-size: 0.95rem; line-height: 1.6; margin-bottom: 30px; }
      .btn {
        display: inline-block;
        background-color: var(--accent);
        color: #ffffff;
        text-decoration: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: 500;
        transition: background-color 0.2s ease, transform 0.1s ease;
      }
      .btn:hover { background-color: var(--accent-hover); }
      .btn:active { transform: scale(0.97); }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="error-code">404</div>
      <h1>\u9875\u9762\u672A\u627E\u5230</h1>
      <p>\u62B1\u6B49\uFF0C\u60A8\u8BBF\u95EE\u7684\u5185\u5BB9\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u79FB\u9664\u3002</p>
      <a href="/" class="btn">\u8FD4\u56DE\u9996\u9875</a>
    </div>
  </body>
</html>`;
}
__name(renderNotFound, "renderNotFound");
var ROBOTS_TXT = "User-agent: *\nDisallow: /\n";
var LOGO_SVG = '<svg viewBox="0 0 32 32" role="img" aria-label="logo"><circle cx="16" cy="16" r="14.3" fill="none" stroke="#ffffff" stroke-width="1.7"/><path d="M11.7 8.4 V23.6 M21.6 8.6 L12.7 16 L21.6 23.4" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%233b82f6'/%3E%3Cpath d='M11.7 8.4V23.6M21.6 8.6L12.7 16L21.6 23.4' fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";
var APP_JS = String.raw`
(function () {
  var TOKEN_KEY = 'kg_worker_token';
  var state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    status: null,
    accounts: [],
    logs: [],
    settings: null,
    tab: 'accounts',
    modal: null,
    modalTab: 'qr',
    qr: null,
    qrTimer: null,
    smsCountdown: 0,
    smsTimer: null,
    expanded: {},
    booting: true,
    loggingIn: false
  };

  var app = document.getElementById('app');

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function spinner(extraClass) {
    return '<span class="spinner ' + (extraClass || '') + '"></span>';
  }

  /** 按钮进入加载态，执行完成后恢复 */
  function withButtonLoading(node, task, loadingHtml) {
    if (!node) return Promise.resolve().then(task);
    var original = node.innerHTML;
    var wasDisabled = node.disabled;
    node.disabled = true;
    node.innerHTML = spinner() + '<span>' + (loadingHtml || '处理中…') + '</span>';
    function restore() {
      node.innerHTML = original;
      node.disabled = wasDisabled;
    }
    return Promise.resolve().then(task).then(
      function (result) { restore(); return result; },
      function (error) { restore(); throw error; }
    );
  }

  function api(path, options) {
    options = options || {};
    var headers = options.headers || {};
    if (state.token) headers['X-Admin-Token'] = state.token;
    if (options.body) headers['Content-Type'] = 'application/json';
    return fetch(path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.ok === false) {
          var err = new Error(data.message || data.error || ('请求失败 (' + res.status + ')'));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function toast(message, isError) {
    var node = document.createElement('div');
    node.className = 'toast' + (isError ? ' error' : '');
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(function () { node.remove(); }, 3000);
  }

  function formatTime(iso) {
    if (!iso) return '-';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  var STATUS_TEXT = {
    success: ['成功', 'pill-success'],
    failed: ['失败', 'pill-failed'],
    token_invalid: ['登录失效', 'pill-invalid'],
    running: ['执行中', 'pill-running'],
    idle: ['未执行', 'pill-idle']
  };

  function statusPill(status) {
    var item = STATUS_TEXT[status] || STATUS_TEXT.idle;
    var icon = status === 'running' ? spinner('spinner-xs') : '';
    return '<span class="pill ' + item[1] + '">' + icon + item[0] + '</span>';
  }

  /** 账号类型标签：老账号=有广告活动，新账号=无该活动 */
  function tierTag(tier) {
    if (tier === 'old') return '<span class="tag tag-old" title="拥有「看广告领 VIP」活动">老账号</span>';
    if (tier === 'new') return '<span class="tag tag-new" title="没有「看广告领 VIP」活动，仅能听歌领取">新账号</span>';
    return '<span class="tag tag-unknown" title="首次执行后自动判定">类型未知</span>';
  }
  // ============ 数据加载 ============

  function loadStatus() {
    return api('/api/status').then(function (data) {
      state.status = data;
      if (data.authenticated) return loadAll();
      return null;
    });
  }

  function loadAll() {
    return Promise.all([
      api('/api/accounts').then(function (d) { state.accounts = d.accounts || []; }),
      api('/api/settings').then(function (d) { state.settings = d.settings; }),
      api('/api/logs').then(function (d) { state.logs = d.logs || []; })
    ]);
  }

  function refresh(silent) {
    return loadAll().then(render).catch(function (error) {
      if (!silent) toast(error.message, true);
    });
  }

  // ============ 视图 ============

  function render() {
    if (state.booting) {
      app.innerHTML = '<div class="wrap"><div class="center-load">' + spinner('spinner-lg') + '<div>正在加载控制台…</div></div></div>';
      return;
    }
    if (!state.status) { app.innerHTML = '<div class="wrap"><div class="card empty">加载失败</div></div>'; return; }

    if (!state.status.adminConfigured) {
      app.innerHTML = authShell({
        badge: '!',
        title: '需要先配置管理口令',
        desc: '请在 Cloudflare Worker 中设置环境变量 ADMIN_TOKEN，否则接口出于安全考虑不可用。',
        extra: '<div class="auth-code"><code>npx wrangler secret put ADMIN_TOKEN</code></div>',
      });
      return;
    }

    if (!state.token || !state.status.authenticated) {
      app.innerHTML = loginView();
      bindLogin();
      return;
    }

    app.innerHTML = mainView();
    bindMain();
  }

  /** 登录 / 提示页外壳：与 404 页同一套视觉（圆角卡片 + 渐变标题 + 实心按钮） */
  function authShell(opts) {
    return '<div class="auth-wrap"><div class="auth-card">' +
      (opts.logo ? '<div class="auth-logo">' + opts.logo + '</div>' : '<div class="auth-badge">' + esc(opts.badge) + '</div>') +
      '<h1>' + esc(opts.title) + '</h1>' +
      '<p>' + esc(opts.desc) + '</p>' +
      (opts.body || '') +
      (opts.extra || '') +
      '</div></div>';
  }

  function loginView() {
    var button = state.loggingIn
      ? '<button class="auth-btn" disabled>' + spinner() + '<span>验证中…</span></button>'
      : '<button class="auth-btn" id="login-btn">进入控制台</button>';
    var body = '<input class="auth-input" id="token-input" type="password" placeholder="请输入 ADMIN_TOKEN"' +
      ' autocomplete="current-password"' + (state.loggingIn ? ' disabled' : '') + '>' +
      button;
    return authShell({
      logo: ${JSON.stringify(LOGO_SVG)},
      title: '酷狗概念版自动签到',
      desc: 'Cloudflare Workers 多账号托管控制台',
      body: body,
      extra: '<div class="auth-note">口令仅保存在本机浏览器 localStorage，用于调用你自己的 Worker 接口。</div>',
    });
  }

  function bindLogin() {
    var input = document.getElementById('token-input');
    var button = document.getElementById('login-btn');
    if (!input || !button) return;
    var submit = function () {
      var value = input.value.trim();
      if (!value) { toast('请输入管理口令', true); return; }
      state.loggingIn = true;
      state.token = value;
      render();
      api('/api/status').then(function (data) {
        state.status = data;
        if (!data.authenticated) {
          state.token = '';
          localStorage.removeItem(TOKEN_KEY);
          throw new Error('口令不正确');
        }
        localStorage.setItem(TOKEN_KEY, value);
        return loadAll();
      }).then(function () {
        state.loggingIn = false;
        render();
        toast('登录成功');
      }).catch(function (error) {
        state.loggingIn = false;
        state.status = Object.assign({}, state.status, { authenticated: false });
        render();
        toast(error.message, true);
      });
    };
    button.addEventListener('click', submit);
    input.addEventListener('keydown', function (event) { if (event.key === 'Enter') submit(); });
    input.focus();
  }

  function mainView() {
    var tabs = [['accounts', '账号列表'], ['logs', '运行日志'], ['settings', '设置']];
    var nav = tabs.map(function (item) {
      return '<button class="tab' + (state.tab === item[0] ? ' active' : '') + '" data-tab="' + item[0] + '">' + item[1] + '</button>';
    }).join('');

    var body = state.tab === 'accounts' ? accountsView() : state.tab === 'logs' ? logsView() : settingsView();

    return '<div class="wrap">' +
      '<div class="topbar"><div class="brand"><div class="logo">K</div><div><h1>酷狗概念版自动签到</h1>' +
      '<div class="sub">Cloudflare Workers · 多账号托管 · 北京时间 ' + esc((state.status && state.status.beijingTime) || '') + '</div></div></div>' +
      '<div class="row"><button class="btn" data-action="run-all">全部执行</button>' +
      '<button class="btn" data-action="logout">退出</button></div></div>' +
      '<div class="tabs">' + nav + '</div>' + body + '</div>' +
      (state.modal ? modalView() : '');
  }

  /** 首页说明：新老账号差异 + 手机号绑定多账号限制 + 客户端下载 */
  function noticesView() {
    return '<div class="notice">' +
      '<div class="notice-title">关于「新账号 / 老账号」</div>' +
      '<div class="notice-body">' +
      '<p><span class="tag tag-old">老账号</span> 拥有「看广告领 VIP」活动：除听歌领取外，每天还可通过广告额外领取（默认最多 8 次）。</p>' +
      '<p><span class="tag tag-new">新账号</span> 没有该活动：广告接口会返回 <code>20028</code>，每天只能靠听歌领取，属于账号本身的差异，不是执行失败。</p>' +
      '<p>系统会根据接口实际返回<b>自动判定并标记</b>每个账号的类型，无需手动设置；账号类型标注在下方列表的账号名旁。</p>' +
      '</div></div>' +
      '<div class="notice warn">' +
      '<div class="notice-title">关于「一个手机号绑定多个账号无法登录」</div>' +
      '<div class="notice-body">' +
      '<p>酷狗官方限制：同一个手机号绑定多个账号时，<b>无法使用手机验证码登录</b>（错误码 <code>34175</code>），这是平台规则而非本项目限制。</p>' +
      '<p>遇到该提示请改用 <b>扫码登录</b>：点击「添加账号 → 扫码登录」，用手机酷狗 App 扫描二维码并在手机上确认即可，不受手机号绑定数量限制。</p>' +
      '</div></div>' +
      '<div class="notice">' +
      '<div class="notice-title">关于「酷狗概念版客户端」</div>' +
      '<div class="notice-body">' +
      '<p>扫码登录与签到都需要使用 <b>酷狗概念版</b>（不是普通酷狗音乐）；领取结果可在 App 的「活动中心 → 天天签到领 VIP」中查看。</p>' +
      '<p>桌面版：<a href="https://github.com/hoowhoami/EchoMusic" target="_blank" rel="noopener noreferrer">EchoMusic</a>（GitHub 开源项目）。</p>' +
      '<p>手机版：推荐使用 <b>2.4.5</b> 版本。</p>' +
      '</div></div>';
  }

  function accountsView() {
    var head = noticesView() +
      '<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:12px;">' +
      '<h2 style="margin:0;">托管账号（' + state.accounts.length + '）</h2>' +
      '<button class="btn btn-primary btn-sm" data-action="open-add">+ 添加账号</button></div>';

    if (!state.accounts.length) {
      return head + '<div class="empty">还没有托管账号，点击右上角「添加账号」使用扫码 / 手机验证码 / Cookie 登录。</div></div>';
    }

    var rows = state.accounts.map(function (account) {
      var steps = '';
      if (state.expanded[account.id]) {
        var list = (account.lastSteps || []).map(function (step) {
          return '<li class="' + (step.ok ? 'step-ok' : 'step-fail') + '">' + (step.ok ? '\u2713' : '\u2717') + ' ' +
            esc(step.name) + '：' + esc(step.message) + '</li>';
        }).join('');
        steps = '<tr><td colspan="6"><ul class="steps">' + (list || '<li>暂无执行记录</li>') + '</ul></td></tr>';
      }
      var source = account.source === 'qr' ? '扫码' : account.source === 'sms' ? '验证码' : '手动';
      var vipDate = account.vipEndTime ? String(account.vipEndTime).slice(0, 10) : '';
      var subline = 'UID ' + esc(account.userid) + (vipDate ? ' · VIP 至 ' + esc(vipDate) : '');
      var pendingTag = account.pendingClaim
        ? '<span class="tag tag-pending" title="听歌未领到，定时任务会自动重试">待重试</span>'
        : account.pendingAds
          ? '<span class="tag tag-pending" title="广告次数未领完，定时任务会自动续跑">待续跑</span>'
          : '';
      return '<tr>' +
        '<td><div class="row" style="gap:6px;flex-wrap:nowrap;"><strong>' + esc(account.name) + '</strong>' +
        tierTag(account.adTier) + pendingTag + '<span class="tag">' + source + '</span></div>' +
        '<div class="sub mono truncate" title="' + subline + '">' + subline + '</div></td>' +
        '<td><div class="row" style="gap:6px;flex-wrap:nowrap;">' +
        '<input type="time" value="' + esc(account.signTime) + '" data-time-input data-id="' + account.id + '" style="width:98px;">' +
        '<button class="btn btn-sm" data-action="save-time" data-id="' + account.id + '" disabled title="确认修改签到时间">确认</button>' +
        '</div></td>' +
        '<td>' + statusPill(account.lastStatus) + '</td>' +
        '<td class="hide-sm" style="max-width:220px;"><div>' + esc(formatTime(account.lastRunAt)) + '</div>' +
        '<div class="sub truncate" title="' + esc(account.lastMessage) + '">' + esc(account.lastMessage) + '</div></td>' +
        '<td><label class="row" style="gap:6px;cursor:pointer;flex-wrap:nowrap;"><input type="checkbox" style="width:auto;" data-action="toggle" data-id="' + account.id + '"' + (account.enabled ? ' checked' : '') + '><span class="sub">启用</span></label></td>' +
        '<td><div class="row" style="gap:6px;flex-wrap:nowrap;">' +
        '<button class="btn btn-sm btn-primary" data-action="run" data-id="' + account.id + '">执行</button>' +
        '<button class="btn btn-sm" data-action="detail" data-id="' + account.id + '">日志</button>' +
        '<button class="btn btn-sm" data-action="refresh-token" data-id="' + account.id + '">续期</button>' +
        '<button class="btn btn-sm btn-danger" data-action="delete" data-id="' + account.id + '">删除</button>' +
        '</div></td></tr>' + steps;
    }).join('');

    return head + '<div style="overflow-x:auto;"><table><thead><tr>' +
      '<th>账号</th><th>签到时间</th><th>状态</th><th class="hide-sm">最近执行</th><th>启用</th><th>操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function logsView() {
    if (!state.logs.length) return '<div class="card"><div class="empty">暂无运行日志</div></div>';
    var items = state.logs.map(function (log) {
      var steps = (log.steps || []).map(function (step) {
        return '<li class="' + (step.ok ? 'step-ok' : 'step-fail') + '">' + (step.ok ? '\u2713' : '\u2717') + ' ' +
          esc(step.name) + '：' + esc(step.message) + '</li>';
      }).join('');
      return '<div class="logs-item">' +
        '<div class="row" style="justify-content:space-between;">' +
        '<div class="row" style="gap:6px;">' + statusPill(log.status) + '<strong>' + esc(log.name) + '</strong> ' +
        '<span class="tag">' + (log.trigger === 'cron' ? '定时' : log.trigger === 'refresh' ? '续期' : '手动') + '</span></div>' +
        '<span class="sub">' + esc(formatTime(log.at)) + '</span></div>' +
        '<div class="sub" style="margin-top:4px;">' + esc(log.message) + '</div>' +
        (steps ? '<ul class="steps">' + steps + '</ul>' : '') +
        '</div>';
    }).join('');
    return '<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px;">' +
      '<h2 style="margin:0;">运行日志</h2>' +
      '<button class="btn btn-sm btn-danger" data-action="clear-logs">清空日志</button></div>' + items + '</div>';
  }

  function settingsView() {
    var s = state.settings || {};
    return '<div class="card"><h2>全局设置</h2><div class="grid">' +
      '<div class="field"><span>新账号默认签到时间（北京时间）</span>' +
      '<div class="row" style="gap:6px;flex-wrap:nowrap;">' +
      '<input id="set-time" data-setting-time type="time" value="' + esc(s.defaultSignTime) + '" style="max-width:200px;">' +
      '<button class="btn" data-action="save-default-time" disabled title="确认修改默认签到时间">确认</button>' +
      '</div></div>' +
      '<label class="field"><span>每日广告领取次数（0-20）</span><input id="set-rounds" type="number" min="0" max="20" value="' + esc(s.adRounds) + '"></label>' +
      '<label class="field"><span>广告领取间隔（秒）</span><input id="set-interval" type="number" min="0" max="120" value="' + esc(s.adIntervalSeconds) + '"></label>' +
      '</div>' +
      '<label class="row" style="gap:8px;cursor:pointer;"><input id="set-refresh" type="checkbox" style="width:auto;"' + (s.autoRefreshToken ? ' checked' : '') + '><span>每周日自动刷新 token</span></label>' +
      '<label class="row" style="gap:8px;cursor:pointer;margin-top:8px;"><input id="set-catchup" type="checkbox" style="width:auto;"' + (s.catchUp ? ' checked' : '') + '><span>错过签到时间后自动补签</span></label>' +
      '<label class="row" style="gap:8px;cursor:pointer;margin-top:8px;"><input id="set-device" type="checkbox" style="width:auto;"' + (s.enableDeviceRegister ? ' checked' : '') + '><span>执行前调用设备注册接口获取 dfid（更接近真实客户端，可能因风控失败）</span></label>' +
      '<div class="row" style="margin-top:16px;"><button class="btn btn-primary" data-action="save-settings">保存设置</button></div>' +
      '<p class="muted" style="margin:14px 0 0;font-size:12px;">定时任务每 5 分钟检查一次：账号到达设定的签到时间且当天未执行过时，自动领取概念 VIP。' +
      (state.status && state.status.secretConfigured ? '' : ' 提示：未配置 SECRET_KEY，token 以明文保存在 KV 中。') + '</p>' +
      '</div>' +
      '<div class="card"><h2>关于</h2><p class="muted" style="margin:0;font-size:12.5px;">本项目仅供学习交流，请勿用于商业用途；音乐平台不易，请支持正版。</p></div>';
  }

  function modalView() {
    if (state.modal === 'add') return addModalView();
    return '';
  }

  function addModalView() {
    var tabs = [['qr', '扫码登录'], ['sms', '手机验证码'], ['cookie', 'Cookie 导入']];
    var nav = tabs.map(function (item) {
      return '<button class="tab' + (state.modalTab === item[0] ? ' active' : '') + '" data-modaltab="' + item[0] + '">' + item[1] + '</button>';
    }).join('');

    var body = '';
    if (state.modalTab === 'qr') {
      var qr = state.qr;
      var inner;
      if (!qr) {
        inner = '<button class="btn btn-primary" data-action="qr-create">获取登录二维码</button>';
      } else if (qr.loading) {
        inner = spinner('spinner-lg') + '<div class="qr-status">正在获取二维码…</div>';
      } else if (qr.done) {
        inner = '<div style="color:var(--green);font-weight:600;margin:12px 0;">登录成功，账号已添加</div>';
      } else if (qr.expired) {
        inner = '<div class="qr-status" style="color:var(--orange);">' + esc(qr.message || '二维码已过期') + '</div>' +
          '<div style="margin-top:12px;"><button class="btn btn-sm" data-action="qr-create">刷新二维码</button></div>';
      } else {
        inner = '<img src="' + esc(qr.img) + '" alt="二维码">' +
          '<div class="qr-status">' + spinner('spinner-xs spinner-primary') + esc(qr.message || '请使用酷狗 App 扫描二维码') + '</div>';
      }
      body = '<div class="qr-box">' + inner + '</div>' +
        '<p class="muted" style="margin-top:12px;font-size:12.5px;">用手机酷狗 App「扫一扫」扫码并在手机上确认，即可自动添加账号（推荐，不受手机号绑定多账号限制）。</p>';
    } else if (state.modalTab === 'sms') {
      body = '<label class="field"><span>手机号</span><div class="row" style="flex-wrap:nowrap;">' +
        '<input id="sms-phone" placeholder="请输入 11 位手机号" inputmode="numeric">' +
        '<button class="btn" id="sms-send"' + (state.smsCountdown > 0 ? ' disabled' : '') + ' style="white-space:nowrap;">' +
        (state.smsCountdown > 0 ? state.smsCountdown + 's' : '获取验证码') + '</button>' +
        '</div></label>' +
        '<label class="field"><span>短信验证码</span><input id="sms-code" placeholder="请输入 6 位验证码" inputmode="numeric"></label>' +
        '<label class="field"><span>备注名称（可选）</span><input id="sms-name" placeholder="例如：主账号"></label>' +
        '<label class="field"><span>每日签到时间</span><input id="sms-time" type="time" value="' + esc((state.settings && state.settings.defaultSignTime) || '01:15') + '"></label>' +
        '<button class="btn btn-primary" style="width:100%;" data-action="sms-login">登录并加入托管</button>' +
        '<p class="muted" style="margin-top:12px;font-size:12.5px;">注意：酷狗限制「一个手机号绑定多个账号」时无法使用验证码登录（错误码 34175），请改用<b>扫码登录</b>。</p>';
    } else {
      body = '<label class="field"><span>备注名称</span><input id="ck-name" placeholder="例如：小号"></label>' +
        '<label class="field"><span>userid</span><input id="ck-userid" placeholder="账号 userid（数字）"></label>' +
        '<label class="field"><span>token</span><input id="ck-token" placeholder="登录 token"></label>' +
        '<label class="field"><span>每日签到时间</span><input id="ck-time" type="time" value="' + esc((state.settings && state.settings.defaultSignTime) || '01:15') + '"></label>' +
        '<button class="btn btn-primary" style="width:100%;" data-action="cookie-save">保存账号</button>' +
        '<p class="muted" style="margin-top:12px;font-size:12.5px;">适合已经抓包拿到 <code>token</code> 与 <code>userid</code> 的场景。</p>';
    }

    return '<div class="mask" data-action="close-modal"><div class="modal" data-stop="1">' +
      '<h3>添加账号</h3><div class="tabs">' + nav + '</div>' + body +
      '<div class="row" style="margin-top:14px;"><button class="btn" style="width:100%;" data-action="close-modal">关闭</button></div>' +
      '</div></div>';
  }

  // ============ 事件绑定 ============

  function bindMain() {
    app.querySelectorAll('[data-tab]').forEach(function (node) {
      node.addEventListener('click', function () {
        state.tab = node.getAttribute('data-tab');
        render();
      });
    });

    app.querySelectorAll('[data-modaltab]').forEach(function (node) {
      node.addEventListener('click', function () {
        state.modalTab = node.getAttribute('data-modaltab');
        render();
      });
    });

    // 签到时间：改动后才启用「确认」按钮，由用户显式提交
    app.querySelectorAll('[data-time-input]').forEach(function (input) {
      var id = input.getAttribute('data-id');
      var account = state.accounts.filter(function (a) { return a.id === id; })[0];
      var original = account ? account.signTime : input.value;
      var button = app.querySelector('[data-action="save-time"][data-id="' + id + '"]');
      var sync = function () {
        var changed = !!input.value && input.value !== original;
        if (button) {
          button.disabled = !changed;
          // 可以点击时显示绿色，明确提示有改动待提交
          button.classList.toggle('btn-success', changed);
        }
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && button && !button.disabled) button.dispatchEvent(new window.Event('click'));
      });
      sync();
    });

    // 全局设置里的默认签到时间：同样需要确认，可提交时显示绿色
    app.querySelectorAll('[data-setting-time]').forEach(function (input) {
      var original = (state.settings && state.settings.defaultSignTime) || '';
      var button = app.querySelector('[data-action="save-default-time"]');
      var sync = function () {
        var changed = !!input.value && input.value !== original;
        if (button) {
          button.disabled = !changed;
          button.classList.toggle('btn-success', changed);
        }
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && button && !button.disabled) button.dispatchEvent(new window.Event('click'));
      });
      sync();
    });

    app.querySelectorAll('[data-action]').forEach(function (node) {
      var action = node.getAttribute('data-action');
      var id = node.getAttribute('data-id');

      if (action === 'save-time') {
        node.addEventListener('click', function () {
          var input = app.querySelector('[data-time-input][data-id="' + id + '"]');
          var value = input ? input.value : '';
          if (!value) { toast('请选择签到时间', true); return; }
          withButtonLoading(node, function () {
            return api('/api/accounts/' + id, { method: 'PATCH', body: { signTime: value } }).then(function () {
              toast('签到时间已更新为 ' + value);
              return refresh(true);
            });
          }, '保存中').catch(function (error) { toast(error.message, true); });
        });
        return;
      }
      if (action === 'save-default-time') {
        node.addEventListener('click', function () {
          var input = app.querySelector('[data-setting-time]');
          var value = input ? input.value : '';
          if (!value) { toast('请选择时间', true); return; }
          withButtonLoading(node, function () {
            return api('/api/settings', { method: 'POST', body: { defaultSignTime: value } }).then(function (data) {
              state.settings = data.settings;
              toast('默认签到时间已更新为 ' + value);
              render();
            });
          }, '保存中').catch(function (error) { toast(error.message, true); });
        });
        return;
      }
      if (action === 'toggle') {
        node.addEventListener('change', function () {
          api('/api/accounts/' + id, { method: 'PATCH', body: { enabled: node.checked } })
            .then(function () { toast(node.checked ? '已启用' : '已停用'); return refresh(true); })
            .catch(function (error) { toast(error.message, true); });
        });
        return;
      }

      node.addEventListener('click', function (event) {
        if (node.getAttribute('data-stop') === '1') { event.stopPropagation(); return; }
        handleAction(action, id, node, event);
      });
    });

    if (state.modalTab === 'sms' && state.modal === 'add') {
      var sendBtn = document.getElementById('sms-send');
      if (sendBtn) sendBtn.addEventListener('click', function () { sendSmsCode(sendBtn); });
    }
  }

  function handleAction(action, id, node, event) {
    if (action === 'logout') {
      state.token = '';
      localStorage.removeItem(TOKEN_KEY);
      // 保留 status 结构，只把鉴权状态置为 false，否则会渲染成「加载失败」
      state.status = Object.assign({}, state.status || {}, { authenticated: false });
      state.modal = null;
      state.booting = false;
      render();
      return;
    }
    if (action === 'open-add') {
      state.modal = 'add';
      state.modalTab = 'qr';
      state.qr = null;
      render();
      return;
    }
    if (action === 'close-modal') {
      if (event && event.target !== node && node.classList.contains('mask')) return;
      closeModal();
      return;
    }
    if (action === 'qr-create') { createQr(); return; }
    if (action === 'sms-login') { smsLogin(node); return; }
    if (action === 'cookie-save') { cookieSave(node); return; }
    if (action === 'run-all') {
      if (!confirm('立即执行全部启用账号？执行过程最多约 1 分钟。')) return;
      withButtonLoading(node, function () {
        return api('/api/accounts/run-all', { method: 'POST' }).then(function (data) {
          toast(data.message || '执行完成');
          return refresh(true);
        });
      }, '执行中…').catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'run') {
      withButtonLoading(node, function () {
        return api('/api/accounts/' + id + '/run', { method: 'POST' }).then(function (data) {
          // 直接拿到本次执行的真实结果，不再需要「稍后刷新」
          toast(data.message || '执行完成');
          return refresh(true);
        });
      }, '执行中…').catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'refresh-token') {
      withButtonLoading(node, function () {
        return api('/api/accounts/' + id + '/refresh-token', { method: 'POST' }).then(function (data) {
          toast(data.message || 'token 已续期');
          return refresh(true);
        });
      }).catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'delete') {
      if (!confirm('确认删除该账号？')) return;
      withButtonLoading(node, function () {
        return api('/api/accounts/' + id, { method: 'DELETE' }).then(function () {
          toast('已删除');
          return refresh(true);
        });
      }).catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'detail') {
      state.expanded[id] = !state.expanded[id];
      render();
      return;
    }
    if (action === 'clear-logs') {
      if (!confirm('确认清空全部日志？')) return;
      withButtonLoading(node, function () {
        return api('/api/logs', { method: 'DELETE' }).then(function () {
          toast('日志已清空');
          return refresh(true);
        });
      }).catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'save-settings') { saveSettings(node); return; }
  }

  function closeModal() {
    state.modal = null;
    state.qr = null;
    if (state.qrTimer) { clearInterval(state.qrTimer); state.qrTimer = null; }
    render();
  }

  function createQr() {
    if (state.qrTimer) { clearInterval(state.qrTimer); state.qrTimer = null; }
    state.qr = { loading: true };
    render();
    api('/api/auth/qr/create').then(function (data) {
      state.qr = {
        key: data.key,
        img: data.img,
        message: data.img ? '等待扫码…' : '请用酷狗 App 扫描：' + data.url
      };
      render();
      state.qrTimer = setInterval(pollQr, 2500);
    }).catch(function (error) {
      state.qr = { message: error.message, expired: true };
      render();
    });
  }

  function pollQr() {
    if (!state.qr || !state.qr.key || state.qr.done) return;
    api('/api/auth/qr/check?key=' + encodeURIComponent(state.qr.key)).then(function (data) {
      if (data.status === 4) {
        if (state.qrTimer) { clearInterval(state.qrTimer); state.qrTimer = null; }
        state.qr = { done: true, message: '登录成功' };
        render();
        toast('登录成功，账号已添加');
        return refresh(true);
      }
      if (data.status === 0) {
        if (state.qrTimer) { clearInterval(state.qrTimer); state.qrTimer = null; }
        state.qr = { message: '二维码已过期', expired: true };
        render();
        return;
      }
      if (data.message && state.qr && state.qr.message !== data.message && !state.qr.expired) {
        state.qr.message = data.message;
        render();
      }
    }).catch(function () { /* 轮询失败忽略，等待下一次 */ });
  }

  function startSmsCountdown() {
    state.smsCountdown = 60;
    if (state.smsTimer) clearInterval(state.smsTimer);
    state.smsTimer = setInterval(function () {
      state.smsCountdown -= 1;
      if (state.smsCountdown <= 0) {
        clearInterval(state.smsTimer);
        state.smsTimer = null;
        state.smsCountdown = 0;
      }
      var btn = document.getElementById('sms-send');
      if (btn) {
        btn.textContent = state.smsCountdown > 0 ? state.smsCountdown + 's' : '获取验证码';
        btn.disabled = state.smsCountdown > 0;
      }
    }, 1000);
  }

  function sendSmsCode(button) {
    var phone = (document.getElementById('sms-phone') || {}).value || '';
    if (!/^\d{6,15}$/.test(phone.trim())) { toast('请输入正确的手机号', true); return; }
    withButtonLoading(button, function () {
      return api('/api/auth/sms/send', { method: 'POST', body: { phone: phone.trim() } }).then(function () {
        toast('验证码已发送');
        startSmsCountdown();
      });
    }, '发送中').catch(function (error) {
      toast(error.message, true);
    });
  }

  function smsLogin(node) {
    var phone = ((document.getElementById('sms-phone') || {}).value || '').trim();
    var code = ((document.getElementById('sms-code') || {}).value || '').trim();
    var name = ((document.getElementById('sms-name') || {}).value || '').trim();
    var time = ((document.getElementById('sms-time') || {}).value || '').trim();
    if (!phone || !code) { toast('请填写手机号和验证码', true); return; }
    withButtonLoading(node, function () {
      return api('/api/auth/sms/login', { method: 'POST', body: { phone: phone, code: code, name: name, signTime: time } })
        .then(function (data) {
          toast(data.message || '登录成功');
          closeModal();
          return refresh(true);
        });
    }, '登录中…').catch(function (error) { toast(error.message, true); });
  }

  function cookieSave(node) {
    var name = ((document.getElementById('ck-name') || {}).value || '').trim();
    var userid = ((document.getElementById('ck-userid') || {}).value || '').trim();
    var token = ((document.getElementById('ck-token') || {}).value || '').trim();
    var time = ((document.getElementById('ck-time') || {}).value || '').trim();
    if (!token) { toast('请填写 token', true); return; }
    withButtonLoading(node, function () {
      return api('/api/accounts', { method: 'POST', body: { name: name, userid: userid, token: token, signTime: time } })
        .then(function (data) {
          toast(data.message || '保存成功');
          closeModal();
          return refresh(true);
        });
    }, '保存中…').catch(function (error) { toast(error.message, true); });
  }

  function saveSettings(node) {
    var body = {
      defaultSignTime: (document.getElementById('set-time') || {}).value,
      adRounds: Number((document.getElementById('set-rounds') || {}).value),
      adIntervalSeconds: Number((document.getElementById('set-interval') || {}).value),
      autoRefreshToken: !!(document.getElementById('set-refresh') || {}).checked,
      catchUp: !!(document.getElementById('set-catchup') || {}).checked,
      enableDeviceRegister: !!(document.getElementById('set-device') || {}).checked
    };
    withButtonLoading(node, function () {
      return api('/api/settings', { method: 'POST', body: body }).then(function (data) {
        state.settings = data.settings;
        toast('设置已保存');
        render();
      });
    }, '保存中…').catch(function (error) { toast(error.message, true); });
  }

  // ============ 启动 ============

  render();
  loadStatus().then(function () {
    state.booting = false;
    render();
  }).catch(function () {
    state.booting = false;
    render();
  });
  setInterval(function () {
    if (state.token && state.status && state.status.authenticated && !state.modal) refresh(true);
  }, 30000);
})();
`;
function renderPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="${FAVICON}">
<title>\u9177\u72D7\u6982\u5FF5\u7248\u81EA\u52A8\u7B7E\u5230</title>
<style>${CONSOLE_STYLES}${AUTH_STYLES}</style>
</head>
<body>
<div id="app"></div>
<script>${APP_JS}<\/script>
</body>
</html>`;
}
__name(renderPage, "renderPage");

// src/index.js
var VERSION2 = "1.0.0";
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, ctx, url);
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(renderPage(), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
        });
      }
      if (url.pathname === "/favicon.ico") {
        return new Response(null, { status: 204, headers: { "Cache-Control": "public, max-age=86400" } });
      }
      if (url.pathname === "/robots.txt") {
        return new Response(ROBOTS_TXT, {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" }
        });
      }
      return new Response(renderNotFound(), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
      });
    } catch (error) {
      return json({ ok: false, message: String(error && error.message || error) }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      handleScheduled(env).catch((error) => {
        console.error("scheduled task failed:", error && error.stack ? error.stack : error);
      })
    );
  }
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(json, "json");
function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
function isAuthenticated(request, env, url) {
  if (!env.ADMIN_TOKEN) return false;
  const header = request.headers.get("Authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const provided = bearer || request.headers.get("X-Admin-Token") || url.searchParams.get("token") || "";
  return timingSafeEqual(provided, env.ADMIN_TOKEN);
}
__name(isAuthenticated, "isAuthenticated");
async function readBody(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}
__name(readBody, "readBody");
async function handleApi(request, env, ctx, url) {
  const path = url.pathname.length > 4 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const method = request.method.toUpperCase();
  if (path === "/api/status" && method === "GET") {
    const authenticated = isAuthenticated(request, env, url);
    let accountCount = 0;
    if (authenticated) {
      try {
        accountCount = (await getAccounts(env)).length;
      } catch {
        accountCount = 0;
      }
    }
    const now = shanghaiNow();
    return json({
      ok: true,
      version: VERSION2,
      adminConfigured: !!env.ADMIN_TOKEN,
      secretConfigured: !!(env.SECRET_KEY || env.ADMIN_TOKEN),
      authenticated,
      accountCount,
      beijingTime: `${now.date} ${now.time}`
    });
  }
  if (!env.ADMIN_TOKEN) {
    return json({ ok: false, message: "\u670D\u52A1\u7AEF\u672A\u914D\u7F6E ADMIN_TOKEN\uFF0C\u63A5\u53E3\u5DF2\u7981\u7528\uFF08npx wrangler secret put ADMIN_TOKEN\uFF09" }, 403);
  }
  if (!isAuthenticated(request, env, url)) {
    return json({ ok: false, message: "\u7BA1\u7406\u53E3\u4EE4\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" }, 401);
  }
  if (path === "/api/accounts" && method === "GET") {
    const accounts = await getAccounts(env);
    return json({ ok: true, accounts: accounts.map(publicAccount) });
  }
  if (path === "/api/accounts" && method === "POST") {
    const body = await readBody(request);
    const token = String(body.token || "").trim();
    const userid = String(body.userid || "").trim();
    if (!token) return json({ ok: false, message: "\u8BF7\u586B\u5199 token" }, 400);
    if (!userid) return json({ ok: false, message: "\u8BF7\u586B\u5199 userid" }, 400);
    const settings = await getSettings(env);
    const device = await getDevice(env);
    const providedName = String(body.name || "").trim();
    const account = newAccountRecord({
      userid,
      token,
      name: providedName || void 0,
      signTime: body.signTime || settings.defaultSignTime,
      source: "cookie"
    });
    let warning = "";
    try {
      const detail = await fetchUserDetail(device, account);
      if (detail && detail.status === 1 && detail.data && detail.data.nickname) {
        if (!providedName) account.name = detail.data.nickname;
        account.lastMessage = `\u5DF2\u5BFC\u5165\uFF0C\u8D26\u53F7\uFF1A${detail.data.nickname}`;
      } else {
        account.lastStatus = "token_invalid";
        account.lastMessage = "token \u6821\u9A8C\u672A\u901A\u8FC7\uFF0C\u8BF7\u786E\u8BA4 token \u4E0E userid \u662F\u5426\u6B63\u786E";
        warning = account.lastMessage;
      }
    } catch (error) {
      warning = `token \u6821\u9A8C\u8BF7\u6C42\u5931\u8D25\uFF1A${error.message || error}`;
    }
    let created = false;
    await updateAccounts(env, (accounts) => {
      const result = upsertAccount(accounts, account);
      created = result.created;
      return result.accounts;
    });
    await appendLog(env, {
      accountId: account.id,
      name: account.name,
      trigger: "manual",
      status: warning ? "token_invalid" : "info",
      message: warning || "\u8D26\u53F7\u5BFC\u5165\u6210\u529F"
    });
    return json({
      ok: true,
      created,
      account: publicAccount(account),
      message: warning || (created ? "\u8D26\u53F7\u5DF2\u6DFB\u52A0" : "\u8D26\u53F7\u5DF2\u66F4\u65B0")
    });
  }
  const accountMatch = path.match(/^\/api\/accounts\/([^/]+)(?:\/(run|refresh-token))?$/);
  if (accountMatch) {
    const id = decodeURIComponent(accountMatch[1]);
    const action = accountMatch[2];
    if (method === "PATCH" && !action) {
      const body = await readBody(request);
      const patch = {};
      if (body.signTime !== void 0) {
        if (!/^\d{1,2}:\d{2}$/.test(String(body.signTime))) {
          return json({ ok: false, message: "\u7B7E\u5230\u65F6\u95F4\u683C\u5F0F\u5E94\u4E3A HH:MM" }, 400);
        }
        patch.signTime = body.signTime;
      }
      if (body.enabled !== void 0) patch.enabled = !!body.enabled;
      if (body.name !== void 0) patch.name = String(body.name).slice(0, 60);
      let found = false;
      await updateAccounts(env, (accounts) => {
        const account = accounts.find((a) => a.id === id);
        if (account) {
          Object.assign(account, patch);
          found = true;
        }
        return accounts;
      });
      if (!found) return json({ ok: false, message: "\u8D26\u53F7\u4E0D\u5B58\u5728" }, 404);
      return json({ ok: true, message: "\u5DF2\u66F4\u65B0" });
    }
    if (method === "DELETE" && !action) {
      let found = false;
      await updateAccounts(env, (accounts) => {
        const next = accounts.filter((a) => a.id !== id);
        found = next.length !== accounts.length;
        return next;
      });
      if (!found) return json({ ok: false, message: "\u8D26\u53F7\u4E0D\u5B58\u5728" }, 404);
      return json({ ok: true, message: "\u8D26\u53F7\u5DF2\u5220\u9664" });
    }
    if (method === "POST" && action === "run") {
      const accounts = await getAccounts(env);
      const account = accounts.find((a) => a.id === id);
      if (!account) return json({ ok: false, message: "\u8D26\u53F7\u4E0D\u5B58\u5728" }, 404);
      const result = await runCheckinForAccount(env, id, { trigger: "manual" });
      return json({
        ok: true,
        result: {
          status: result.tokenInvalid ? "token_invalid" : result.ok ? "success" : "failed",
          message: result.message || "",
          adSuccess: result.adSuccess || 0,
          adPending: !!result.adPending,
          vipEndTime: result.vipEndTime || "",
          steps: result.steps || []
        },
        message: result.message || "\u6267\u884C\u5B8C\u6210"
      });
    }
    if (method === "POST" && action === "refresh-token") {
      const accounts = await getAccounts(env);
      const account = accounts.find((a) => a.id === id);
      if (!account) return json({ ok: false, message: "\u8D26\u53F7\u4E0D\u5B58\u5728" }, 404);
      const device = await getDevice(env);
      const result = await loginByToken(device, { token: account.token, userid: account.userid, t1: account.t1 });
      if (!result.ok) return json({ ok: false, message: result.error && result.error.message || "token \u7EED\u671F\u5931\u8D25" }, 400);
      const patch = {
        t1: result.account.t1 || account.t1,
        vipType: result.account.vipType || account.vipType,
        vipToken: result.account.vipToken || account.vipToken
      };
      if (result.account.token && result.account.token !== account.token) patch.token = result.account.token;
      await updateAccounts(env, (list) => {
        const target = list.find((a) => a.id === id);
        if (target) Object.assign(target, patch);
        return list;
      });
      return json({ ok: true, message: patch.token ? "token \u5DF2\u5237\u65B0" : "token \u4ECD\u7136\u6709\u6548\uFF0C\u65E0\u9700\u5237\u65B0" });
    }
  }
  if (path === "/api/accounts/run-all" && method === "POST") {
    const result = await runAllAccounts(env, "manual");
    return json({ ok: true, message: result.message || "\u6267\u884C\u5B8C\u6210", total: result.total || 0, done: result.done || 0, skipped: result.skipped || 0 });
  }
  if (path === "/api/auth/sms/send" && method === "POST") {
    const body = await readBody(request);
    const phone = String(body.phone || "").trim();
    if (!/^\d{6,15}$/.test(phone)) return json({ ok: false, message: "\u8BF7\u8F93\u5165\u6B63\u786E\u7684\u624B\u673A\u53F7" }, 400);
    const device = await getDevice(env);
    const result = await sendSmsCode(device, phone);
    if (!result.ok) return json({ ok: false, message: result.error && result.error.message || "\u9A8C\u8BC1\u7801\u53D1\u9001\u5931\u8D25" }, 400);
    return json({ ok: true, message: "\u9A8C\u8BC1\u7801\u5DF2\u53D1\u9001" });
  }
  if (path === "/api/auth/sms/login" && method === "POST") {
    const body = await readBody(request);
    const phone = String(body.phone || "").trim();
    const code = String(body.code || "").trim();
    if (!phone || !code) return json({ ok: false, message: "\u8BF7\u586B\u5199\u624B\u673A\u53F7\u548C\u9A8C\u8BC1\u7801" }, 400);
    const device = await getDevice(env);
    const result = await loginByVerifyCode(device, { mobile: phone, code });
    if (!result.ok) return json({ ok: false, message: result.error && result.error.message || "\u767B\u5F55\u5931\u8D25" }, 400);
    const settings = await getSettings(env);
    const account = newAccountRecord({
      userid: result.account.userid,
      token: result.account.token,
      t1: result.account.t1,
      nickname: result.account.nickname,
      vipType: result.account.vipType,
      vipToken: result.account.vipToken,
      dfid: result.account.dfid,
      name: String(body.name || "").trim() || void 0,
      signTime: body.signTime || settings.defaultSignTime,
      source: "sms"
    });
    const upserted = await updateAccounts(env, (accounts) => upsertAccount(accounts, account).accounts);
    await appendLog(env, {
      accountId: account.id,
      name: account.name,
      trigger: "manual",
      status: "info",
      message: `\u624B\u673A\u9A8C\u8BC1\u7801\u767B\u5F55\u6210\u529F\uFF08\u5171 ${upserted.length} \u4E2A\u8D26\u53F7\uFF09`
    });
    return json({ ok: true, account: publicAccount(account), message: "\u767B\u5F55\u6210\u529F\uFF0C\u5DF2\u52A0\u5165\u6258\u7BA1" });
  }
  if (path === "/api/auth/qr/create" && method === "GET") {
    const device = await getDevice(env);
    const result = await createQrCode(device);
    if (!result.ok) return json({ ok: false, message: result.error && result.error.message || "\u4E8C\u7EF4\u7801\u83B7\u53D6\u5931\u8D25" }, 400);
    return json({ ok: true, key: result.key, img: result.img, url: result.url });
  }
  if (path === "/api/auth/qr/check" && method === "GET") {
    const key = url.searchParams.get("key") || "";
    if (!key) return json({ ok: false, message: "\u7F3A\u5C11 key" }, 400);
    const device = await getDevice(env);
    const result = await checkQrCode(device, key);
    if (!result.ok) return json({ ok: false, message: result.message, status: result.status }, 400);
    if (result.status === 4 && result.account) {
      const settings = await getSettings(env);
      const account = newAccountRecord({
        userid: result.account.userid,
        token: result.account.token,
        nickname: result.account.nickname,
        vipType: result.account.vipType,
        vipToken: result.account.vipToken,
        source: "qr",
        signTime: settings.defaultSignTime
      });
      await updateAccounts(env, (accounts) => upsertAccount(accounts, account).accounts);
      await appendLog(env, {
        accountId: account.id,
        name: account.name,
        trigger: "manual",
        status: "info",
        message: "\u626B\u7801\u767B\u5F55\u6210\u529F\uFF0C\u5DF2\u52A0\u5165\u6258\u7BA1"
      });
      return json({ ok: true, status: 4, message: "\u767B\u5F55\u6210\u529F", account: publicAccount(account) });
    }
    return json({ ok: true, status: result.status, message: result.message });
  }
  if (path === "/api/settings" && method === "GET") {
    return json({ ok: true, settings: await getSettings(env) });
  }
  if (path === "/api/settings" && method === "POST") {
    const body = await readBody(request);
    const allowed = {};
    for (const key of ["defaultSignTime", "adRounds", "adIntervalSeconds", "autoRefreshToken", "catchUp", "enableDeviceRegister"]) {
      if (body[key] !== void 0) allowed[key] = body[key];
    }
    return json({ ok: true, settings: await saveSettings(env, allowed) });
  }
  if (path === "/api/logs" && method === "GET") {
    return json({ ok: true, logs: await getLogs(env) });
  }
  if (path === "/api/logs" && method === "DELETE") {
    await clearLogs(env);
    return json({ ok: true, message: "\u65E5\u5FD7\u5DF2\u6E05\u7A7A" });
  }
  if (path === "/api/run-scheduled" && method === "POST") {
    ctx.waitUntil(handleScheduled(env).catch((error) => console.error("scheduled failed:", error)));
    return json({ ok: true, message: "\u5DF2\u89E6\u53D1\u5B9A\u65F6\u4EFB\u52A1\u68C0\u67E5" });
  }
  if (path === "/api/refresh-tokens" && method === "POST") {
    const result = await refreshTokens(env);
    return json({ ok: true, message: `\u5DF2\u5904\u7406 ${result.refreshed.length} \u4E2A\u8D26\u53F7`, details: result.refreshed });
  }
  return json({ ok: false, message: "\u63A5\u53E3\u4E0D\u5B58\u5728" }, 404);
}
__name(handleApi, "handleApi");
export {
  index_default as default
};
