/**
 * 酷狗登录相关接口
 * 对应参考项目 api/module 中的 captcha_sent / login_cellphone / login_qr_* / login_token / register_dev
 */

import { cryptoAesDecrypt, cryptoAesEncrypt, playlistAesDecrypt, playlistAesEncrypt } from '../lib/aes.js'
import { APPID, SRCAPPID, UA_LOGIN } from '../lib/config.js'
import { deviceCookie } from '../lib/device.js'
import { randomString } from '../lib/random.js'
import { cookieArrayToObject, kugouRequest } from '../lib/request.js'
import { rsaPkcs1Encrypt, rsaRawEncrypt } from '../lib/rsa.js'
import { signParamsKey } from '../lib/sign.js'

/** login_by_token 使用的固定 AES key / iv */
const TOKEN_KEY = '90b8382a1bb4ccdcf063102053fd75b8'
const TOKEN_IV = 'f063102053fd75b8'

/** 已知错误码的友好提示 */
const ERROR_MESSAGES = {
  34175: '该手机号绑定了多个账号，酷狗暂不支持手机号登录，请改用扫码登录',
  20010: '验证码错误或已过期',
  20001: '手机号格式不正确',
}

function errorMessage(body) {
  const code = body && (body.error_code ?? body.errcode)
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  return (body && (body.error_msg || body.errmsg || body.msg)) || '酷狗接口返回失败'
}

/**
 * 从登录类响应中提取 token / userid（处理 secu_params 二次加密）
 */
function extractLoginPayload(response, decryptKey) {
  const body = response.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: { code: -1, message: '接口返回格式异常，请稍后重试', raw: body } }
  }
  if (body.status !== 1) {
    return { ok: false, error: { code: body.error_code ?? body.errcode ?? body.status, message: errorMessage(body), raw: body } }
  }

  let data = Object.assign({}, body.data || {})
  if (data.secu_params) {
    const decrypted = cryptoAesDecrypt(data.secu_params, decryptKey)
    if (decrypted && typeof decrypted === 'object') data = Object.assign(data, decrypted)
    else data.token = decrypted
    delete data.secu_params
  }

  const cookies = cookieArrayToObject(response.setCookie)
  const token = data.token || cookies.token || ''
  const userid = data.userid || cookies.userid || 0

  if (!token) {
    return { ok: false, error: { code: body.error_code ?? -1, message: '登录成功但未获取到 token，请重试', raw: body } }
  }

  return {
    ok: true,
    account: {
      userid: Number(userid) || userid,
      token,
      t1: data.t1 || cookies.t1 || '',
      vipType: Number(data.vip_type || cookies.vip_type || 0),
      vipToken: data.vip_token || cookies.vip_token || '',
      nickname: data.nickname || '',
      dfid: data.dfid || cookies.dfid || '',
    },
    raw: data,
  }
}

/**
 * 发送手机验证码
 * @param {object} device
 * @param {string} mobile
 */
export async function sendSmsCode(device, mobile) {
  const response = await kugouRequest({
    baseURL: 'http://login.user.kugou.com',
    url: '/v7/send_mobile_code',
    method: 'POST',
    data: { businessid: 5, mobile: `${mobile}`, plat: 3 },
    encryptType: 'android',
    cookie: { KUGOU_API_MID: device.mid },
  })

  const body = response.body
  if (body && body.status === 1) return { ok: true }
  return { ok: false, error: { code: body && body.error_code, message: errorMessage(body), raw: body } }
}

/**
 * 手机验证码登录
 * @param {object} device
 * @param {{mobile: string, code: string}} params
 */
export async function loginByVerifyCode(device, { mobile, code }) {
  const dateTime = Date.now()
  const encrypt = cryptoAesEncrypt({ mobile: mobile || '', code: code || '' })
  const maskedMobile = mobile ? `${mobile.substring(0, 2)}*****${mobile.substring(10, 11)}` : ''
  const dfid = device.dfid || randomString(24)

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
    t3: 'MCwwLDAsMCwwLDAsMCwwLDA=',
  }

  const response = await kugouRequest({
    baseURL: 'https://loginserviceretry.kugou.com',
    url: '/v7/login_by_verifycode',
    method: 'POST',
    data: dataMap,
    encryptType: 'android',
    headers: { 'support-calm': '1', 'User-Agent': UA_LOGIN },
    cookie: deviceCookie(device, { dfid }),
  })

  return extractLoginPayload(response, encrypt.key)
}

/**
 * token 登录 / 刷新 token
 * @param {object} device
 * @param {{token: string, userid: string|number, t1?: string}} params
 */
export async function loginByToken(device, { token, userid, t1 }) {
  const dateNow = Date.now()
  const encrypt = cryptoAesEncrypt(
    { clienttime: Math.floor(dateNow / 1000), token },
    { key: TOKEN_KEY, iv: TOKEN_IV },
  )
  const encryptParams = cryptoAesEncrypt({})
  const pk = rsaRawEncrypt({ clienttime_ms: dateNow, key: encryptParams.key })

  const dataMap = {
    dfid: device.dfid || '-',
    p3: encrypt,
    plat: 1,
    t1: 0,
    t2: 0,
    t3: 'MCwwLDAsMCwwLDAsMCwwLDA=',
    pk,
    params: encryptParams.str,
    userid,
    clienttime_ms: dateNow,
  }

  const response = await kugouRequest({
    baseURL: 'http://login.user.kugou.com',
    url: '/v5/login_by_token',
    method: 'POST',
    data: dataMap,
    encryptType: 'android',
    cookie: deviceCookie(device, { token, userid, t1 }),
  })

  return extractLoginPayload(response, encryptParams.key)
}

/**
 * 生成二维码 key（酷狗会同时返回 base64 图片）
 * @param {object} device
 */
export async function createQrCode(device) {
  const response = await kugouRequest({
    baseURL: 'https://login-user.kugou.com',
    url: '/v2/qrcode',
    method: 'GET',
    params: {
      appid: 1001,
      type: 1,
      plat: 4,
      qrcode_txt: `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=${SRCAPPID}&`,
      srcappid: SRCAPPID,
    },
    encryptType: 'web',
    cookie: deviceCookie(device),
  })

  const data = (response.body && response.body.data) || {}
  if (!data.qrcode) {
    return { ok: false, error: { message: '二维码获取失败，请重试', raw: response.body } }
  }
  return {
    ok: true,
    key: data.qrcode,
    img: data.qrcode_img || '',
    url: `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${data.qrcode}`,
  }
}

/**
 * 轮询二维码状态
 * status: 0 已过期 / 1 等待扫码 / 2 待确认 / 4 授权成功
 */
export async function checkQrCode(device, key) {
  const response = await kugouRequest({
    baseURL: 'https://login-user.kugou.com',
    url: '/v2/get_userinfo_qrcode',
    method: 'GET',
    params: { plat: 4, appid: APPID, srcappid: SRCAPPID, qrcode: key },
    encryptType: 'web',
    cookie: deviceCookie(device),
  })

  const body = response.body || {}
  const data = body.data || {}
  const status = Number(data.status)

  const STATUS_TEXT = {
    0: '二维码已过期，请重新获取',
    1: '等待扫码',
    2: '已扫码，请在手机上确认',
    4: '授权成功',
  }

  if (status === 4) {
    if (!data.token) return { ok: false, status, message: '授权成功但未返回 token，请重试' }
    return {
      ok: true,
      status,
      message: STATUS_TEXT[status],
      account: {
        userid: Number(data.userid) || data.userid,
        token: data.token,
        t1: '',
        nickname: data.nickname || '',
        vipType: Number(data.vip_type || 0),
        vipToken: data.vip_token || '',
        dfid: device.dfid || '',
      },
    }
  }

  return { ok: true, status, message: STATUS_TEXT[status] || '未知状态', pending: status === 1 || status === 2, expired: status === 0 }
}

/**
 * 设备注册：获取 dfid（签到接口的风控依赖）
 * @param {object} device
 * @param {{token?: string, userid?: string|number}} params
 */
export async function registerDevice(device, { token = '', userid = 0 } = {}) {
  const guid = device.guid
  const dataMap = {
    availableRamSize: 4983533568,
    availableRomSize: 48114719,
    availableSDSize: 48114717,
    basebandVer: '',
    batteryLevel: 100,
    batteryStatus: 3,
    brand: 'Redmi',
    buildSerial: 'unknown',
    device: 'marble',
    imei: guid,
    imsi: '',
    manufacturer: 'Xiaomi',
    uuid: guid,
    accelerometer: false,
    accelerometerValue: '',
    gravity: false,
    gravityValue: '',
    gyroscope: false,
    gyroscopeValue: '',
    light: false,
    lightValue: '',
    magnetic: false,
    magneticValue: '',
    orientation: false,
    orientationValue: '',
    pressure: false,
    pressureValue: '',
    step_counter: false,
    step_counterValue: '',
    temperature: false,
    temperatureValue: '',
  }

  const aesEncrypt = playlistAesEncrypt(dataMap)
  const p = rsaPkcs1Encrypt({ aes: aesEncrypt.key, uid: userid, token })

  const response = await kugouRequest({
    baseURL: 'https://userservice.kugou.com',
    url: '/risk/v2/r_register_dev',
    method: 'POST',
    data: aesEncrypt.str,
    params: { part: 1, platid: 1, p },
    encryptType: 'android',
    cookie: deviceCookie(device, { token, userid }),
    responseType: 'arrayBuffer',
  })

  const bytes = response.body
  if (!bytes || typeof bytes === 'string') {
    return { ok: false, error: { message: '设备注册失败：响应异常', raw: bytes } }
  }

  const decoded = playlistAesDecrypt({ str: base64FromBytes(bytes), key: aesEncrypt.key })
  if (decoded && decoded.status === 1 && decoded.data && decoded.data.dfid) {
    return { ok: true, dfid: decoded.data.dfid, raw: decoded }
  }
  return { ok: false, error: { message: '设备注册失败', raw: decoded } }
}

function base64FromBytes(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
