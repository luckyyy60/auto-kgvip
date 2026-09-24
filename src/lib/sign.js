/**
 * 酷狗接口签名算法（与 api/util/helper.js 完全一致）
 */

import { md5, md5Parts } from './md5.js'
import {
  APPID,
  CLIENTVER,
  SALT_ANDROID,
  SALT_REGISTER,
  SALT_SIGN,
  SALT_SIGN_KEY,
  SALT_WEB,
} from './config.js'

/**
 * Web 版签名：md5(盐 + 排序后的 key=value 拼接 + 盐)
 * @param {Record<string, any>} params
 */
export function signatureWebParams(params) {
  const paramsString = Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .sort()
    .join('')
  return md5(`${SALT_WEB}${paramsString}${SALT_WEB}`)
}

/**
 * Android 版签名：md5(盐 + 排序后的 key=value 拼接 + data + 盐)
 * @param {Record<string, any>} params
 * @param {string|Uint8Array} [data]
 */
export function signatureAndroidParams(params, data) {
  const paramsString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key]}`)
    .join('')

  if (data instanceof Uint8Array) {
    return md5Parts(SALT_ANDROID, paramsString, data, SALT_ANDROID)
  }
  return md5(`${SALT_ANDROID}${paramsString}${data || ''}${SALT_ANDROID}`)
}

/**
 * 设备注册接口签名：md5("1014" + 排序后的参数值拼接 + "1014")
 * @param {Record<string, any>} params
 */
export function signatureRegisterParams(params) {
  const paramsString = Object.keys(params)
    .map((key) => params[key])
    .sort()
    .join('')
  return md5(`${SALT_REGISTER}${paramsString}${SALT_REGISTER}`)
}

/**
 * 通用 sign 签名：md5(排序后的 key+value 拼接 + data + 盐)
 * @param {Record<string, any>} params
 * @param {string} [data]
 */
export function signParams(params, data) {
  const paramsString = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('')
  return md5(`${paramsString}${data || ''}${SALT_SIGN}`)
}

/**
 * 请求密钥签名：md5(hash + 盐 + appid + mid + userid)
 */
export function signKey(hash, mid, userid, appid) {
  return md5(`${hash}${SALT_SIGN_KEY}${appid || APPID}${mid}${userid || 0}`)
}

/**
 * 参数密钥签名：md5(appid + 盐 + clientver + data)
 */
export function signParamsKey(data, appid, clientver) {
  return md5(`${appid || APPID}${SALT_ANDROID}${clientver || CLIENTVER}${data}`)
}
