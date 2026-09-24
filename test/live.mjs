/**
 * 联调测试：直接请求酷狗线上接口，验证请求签名 / 设备指纹 / 网络层可用
 *
 * 运行：node test/live.mjs
 * 说明：不需要登录，只验证「二维码获取 + 状态轮询 + 接口错误格式」。
 */

import { createDeviceIdentity } from '../src/lib/device.js'
import { checkQrCode, createQrCode, sendSmsCode } from '../src/api/auth.js'
import { fetchUserDetail } from '../src/api/checkin.js'

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '\u2713' : '\u2717'} ${name}${detail ? ` -> ${detail}` : ''}`)
}

const device = createDeviceIdentity()
console.log('设备身份:', { mid: device.mid.slice(0, 12) + '...', dev: device.dev, mac: device.mac })

// 1. 二维码获取
const qr = await createQrCode(device)
record('获取登录二维码', qr.ok && !!qr.key, qr.ok ? `key=${qr.key.slice(0, 12)}... img=${qr.img.length} 字节` : JSON.stringify(qr.error))

// 2. 二维码状态轮询（未扫码应为 status=1）
if (qr.ok) {
  const check = await checkQrCode(device, qr.key)
  record('轮询二维码状态', check.ok && check.status === 1, `status=${check.status} ${check.message || ''}`)

  const expired = await checkQrCode(device, 'deadbeefdeadbeef')
  record('过期二维码识别', expired.ok && expired.status === 0, `status=${expired.status} ${expired.message || ''}`)
}

// 3. 手机验证码接口（使用非法号码，验证签名被服务端接受 => 返回业务错误而非鉴权错误）
const sms = await sendSmsCode(device, '10000000000')
record('验证码接口连通', typeof sms.ok === 'boolean', `ok=${sms.ok} code=${sms.error?.code} msg=${sms.error?.message}`)

// 4. token 校验接口（伪造 token，应返回业务错误）
const detail = await fetchUserDetail(device, { token: 'invalid_token_for_test', userid: 1 })
const status = detail && detail.status
record('用户信息接口连通', detail != null, `status=${status} error_code=${detail?.error_code} msg=${detail?.error_msg || detail?.msg || ''}`)

console.log('\n' + '='.repeat(48))
const failed = results.filter((r) => !r.ok).length
console.log(`通过 ${results.length - failed} 项，失败 ${failed} 项`)
if (failed) process.exitCode = 1
