/**
 * 设备指纹：与原项目 server.js 的 Cookie 注入保持一致
 *
 * - guid : md5(随机 UUID)
 * - mid  : 将 guid 的 md5 当作 16 进制大整数转成 10 进制字符串
 * - dev  : 随机 10 位大写字符串
 * - mac  : 默认 02:00:00:00:00:00
 * - webgl: 随机 uint64 十进制（Workers 无 WebGL，使用随机值兜底）
 * - dfid : 设备注册接口返回，首次签到前自动获取
 */

import { md5 } from './md5.js'
import { getGuid, randomString, randomUint64Decimal } from './random.js'

/** 计算设备 MID（MD5 十六进制大整数 -> 十进制字符串） */
export function calculateMid(str) {
  return BigInt('0x' + md5(str)).toString()
}

/** 生成一个全新的设备身份 */
export function createDeviceIdentity(overrides = {}) {
  const guid = overrides.guid || md5(getGuid())
  return {
    guid,
    mid: overrides.mid || calculateMid(guid),
    dev: String(overrides.dev || randomString(10)).toUpperCase(),
    mac: String(overrides.mac || '02:00:00:00:00:00').toUpperCase(),
    webgl: overrides.webgl || randomUint64Decimal(),
    dfid: overrides.dfid || '',
  }
}

/** 补全历史数据中缺失的字段 */
export function normalizeDeviceIdentity(device) {
  if (!device || !device.guid) return createDeviceIdentity()
  return {
    guid: device.guid,
    mid: device.mid || calculateMid(device.guid),
    dev: device.dev || String(randomString(10)).toUpperCase(),
    mac: device.mac || '02:00:00:00:00:00',
    webgl: device.webgl || randomUint64Decimal(),
    dfid: device.dfid || '',
  }
}

/**
 * 设备身份 -> 酷狗接口使用的 cookie 对象
 * @param {object} device
 * @param {object} [account] 账号信息（token / userid / t1 / vip 等）
 */
export function deviceCookie(device, account = {}) {
  return {
    KUGOU_API_PLATFORM: 'standard',
    KUGOU_API_MID: device.mid,
    KUGOU_API_GUID: device.guid,
    KUGOU_API_DEV: device.dev,
    KUGOU_API_MAC: device.mac,
    KUGOU_API_WEBGL: device.webgl,
    dfid: account.dfid || device.dfid || '-',
    token: account.token || '',
    userid: account.userid || 0,
    t1: account.t1 || '',
    vip_type: account.vipType || 0,
    vip_token: account.vipToken || '',
  }
}
