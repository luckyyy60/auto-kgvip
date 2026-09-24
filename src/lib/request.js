/**
 * 酷狗接口 HTTP 请求封装（对齐原项目 api/util/request.js）
 *
 * 关键点：
 * 1. 默认参数 dfid / mid / uuid / appid / clientver / clienttime 会自动注入并参与签名
 * 2. 已登录时 token / userid 同样进入查询参数（酷狗网关用查询参数鉴权）
 * 3. signature 由 encryptType 决定：android / web / register
 * 4. 请求体统一为 JSON 字符串，签名使用同一份字符串
 */

import { APPID, CLIENTVER, UA_DEFAULT } from './config.js'
import { signatureAndroidParams, signatureRegisterParams, signatureWebParams } from './sign.js'

const DEFAULT_BASE = 'https://gateway.kugou.com'

/**
 * @typedef {Object} KugouResponse
 * @property {number} status 200 表示 HTTP 成功，502 表示业务失败或网络错误
 * @property {any} body 响应体
 * @property {string[]} setCookie 响应 Set-Cookie
 * @property {Record<string,string>} headers 响应头
 */

/**
 * 发送酷狗接口请求
 *
 * @param {object} options
 * @param {'GET'|'POST'} [options.method]
 * @param {string} [options.baseURL]
 * @param {string} options.url
 * @param {Record<string, any>} [options.params]
 * @param {object|string} [options.data]
 * @param {Record<string, string>} [options.headers]
 * @param {Record<string, any>} [options.cookie]
 * @param {'android'|'web'|'register'} [options.encryptType]
 * @param {boolean} [options.notSignature]
 * @param {'json'|'arrayBuffer'|'text'} [options.responseType]
 * @returns {Promise<KugouResponse>}
 */
export async function kugouRequest(options) {
  const cookie = options.cookie || {}
  const dfid = cookie.dfid || '-'
  const mid = `${cookie.KUGOU_API_MID || ''}`
  const uuid = '-'
  const token = cookie.token || ''
  const userid = cookie.userid || 0
  const clienttime = Math.floor(Date.now() / 1000)

  const headers = {
    dfid,
    clienttime,
    mid,
    'kg-rc': '1',
    'kg-thash': '5d816a0',
    'kg-rec': '1',
    'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
  }

  const defaultParams = {
    dfid,
    mid,
    uuid,
    appid: APPID,
    clientver: CLIENTVER,
    clienttime,
  }
  if (token) defaultParams.token = token
  if (userid && userid !== 0) defaultParams.userid = userid

  const params = Object.assign({}, defaultParams, options.params || {})
  headers.clienttime = params.clienttime

  // 与原实现（axios）保持一致：
  // - 对象体 -> JSON 字符串，Content-Type: application/json
  // - 字符串体 -> 原样发送，不主动设置 Content-Type
  const isObjectBody = typeof options.data === 'object' && options.data !== null && !(options.data instanceof Uint8Array)
  const data = isObjectBody ? JSON.stringify(options.data) : (options.data || '')

  if (!params.signature && !options.notSignature) {
    switch (options.encryptType) {
      case 'register':
        params.signature = signatureRegisterParams(params)
        break
      case 'web':
        params.signature = signatureWebParams(params)
        break
      case 'android':
      default:
        params.signature = signatureAndroidParams(params, data)
        break
    }
  }

  const baseURL = options.baseURL || DEFAULT_BASE
  const query = new URLSearchParams()
  for (const key of Object.keys(params)) {
    query.append(key, typeof params[key] === 'object' ? JSON.stringify(params[key]) : String(params[key]))
  }
  const url = `${baseURL}${options.url}?${query.toString()}`

  const finalHeaders = Object.assign(
    { 'User-Agent': UA_DEFAULT },
    options.headers || {},
    { dfid, clienttime: params.clienttime, mid },
    headers,
  )

  const method = (options.method || 'GET').toUpperCase()
  const init = { method, headers: finalHeaders }
  if (method !== 'GET' && method !== 'HEAD' && data !== '') {
    init.body = data
    if (isObjectBody && !finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
      init.headers = Object.assign({ 'Content-Type': 'application/json' }, finalHeaders)
    }
  }

  try {
    const response = await fetch(url, init)
    const setCookie = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie().map(parseSetCookie)
      : []

    let body
    if (options.responseType === 'arrayBuffer') {
      body = new Uint8Array(await response.arrayBuffer())
    } else {
      const text = await response.text()
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }

    const ok = !(body && typeof body === 'object' && (body.status === 0 || (body.error_code && body.error_code !== 0)))
    return {
      status: ok ? 200 : 502,
      body,
      setCookie,
      headers: Object.fromEntries(response.headers.entries()),
    }
  } catch (error) {
    return {
      status: 502,
      body: { status: 0, msg: String(error && error.message ? error.message : error) },
      setCookie: [],
      headers: {},
    }
  }
}

/** 去掉 Domain/path/expires 等属性，仅保留 key=value */
function parseSetCookie(raw) {
  return String(raw)
    .replace(/\s*(Domain|domain|path|expires|Expires|Max-Age)=[^(;|$)]+;*/g, '')
    .replace(/;HttpOnly/g, '')
    .replace(/;Secure/g, '')
    .trim()
}

/** 将 Set-Cookie 数组解析为对象 */
export function cookieArrayToObject(list = []) {
  const out = {}
  for (const item of list) {
    const index = item.indexOf('=')
    if (index <= 0) continue
    out[item.slice(0, index).trim()] = item.slice(index + 1).trim()
  }
  return out
}
