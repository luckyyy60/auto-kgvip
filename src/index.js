/**
 * Cloudflare Worker 入口
 *
 * - fetch    : 图形化控制台页面 + REST 接口
 * - scheduled: 每 5 分钟轮询，到点自动签到
 */

import { checkQrCode, createQrCode, loginByVerifyCode, loginByToken, sendSmsCode } from './api/auth.js'
import { fetchUserDetail } from './api/checkin.js'
import * as store from './store.js'
import { handleScheduled, refreshTokens, runAllAccounts, runCheckinForAccount, shanghaiNow } from './tasks.js'
import { renderNotFound, renderPage, ROBOTS_TXT } from './web/ui.js'

const VERSION = '1.0.0'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, ctx, url)
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(renderPage(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        })
      }
      if (url.pathname === '/favicon.ico') {
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=86400' } })
      }
      if (url.pathname === '/robots.txt') {
        return new Response(ROBOTS_TXT, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
        })
      }
      // 其余路径统一返回自定义 404 页面
      return new Response(renderNotFound(), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      return json({ ok: false, message: String((error && error.message) || error) }, 500)
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      handleScheduled(env).catch((error) => {
        console.error('scheduled task failed:', error && error.stack ? error.stack : error)
      }),
    )
  },
}

// ============ 工具 ============

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function timingSafeEqual(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

function isAuthenticated(request, env, url) {
  if (!env.ADMIN_TOKEN) return false
  const header = request.headers.get('Authorization') || ''
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const provided = bearer || request.headers.get('X-Admin-Token') || url.searchParams.get('token') || ''
  return timingSafeEqual(provided, env.ADMIN_TOKEN)
}

async function readBody(request) {
  try {
    const data = await request.json()
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

// ============ 路由 ============

async function handleApi(request, env, ctx, url) {
  const path = url.pathname.length > 4 ? url.pathname.replace(/\/+$/, '') : url.pathname
  const method = request.method.toUpperCase()

  // ---- 公开接口 ----
  if (path === '/api/status' && method === 'GET') {
    const authenticated = isAuthenticated(request, env, url)
    let accountCount = 0
    if (authenticated) {
      try {
        accountCount = (await store.getAccounts(env)).length
      } catch {
        accountCount = 0
      }
    }
    const now = shanghaiNow()
    return json({
      ok: true,
      version: VERSION,
      adminConfigured: !!env.ADMIN_TOKEN,
      secretConfigured: !!(env.SECRET_KEY || env.ADMIN_TOKEN),
      authenticated,
      accountCount,
      beijingTime: `${now.date} ${now.time}`,
    })
  }

  // ---- 以下接口均需鉴权 ----
  if (!env.ADMIN_TOKEN) {
    return json({ ok: false, message: '服务端未配置 ADMIN_TOKEN，接口已禁用（npx wrangler secret put ADMIN_TOKEN）' }, 403)
  }
  if (!isAuthenticated(request, env, url)) {
    return json({ ok: false, message: '管理口令无效，请重新登录' }, 401)
  }

  // ---- 账号列表 ----
  if (path === '/api/accounts' && method === 'GET') {
    const accounts = await store.getAccounts(env)
    return json({ ok: true, accounts: accounts.map(store.publicAccount) })
  }

  // ---- 手动新增 / 更新账号（Cookie 导入）----
  if (path === '/api/accounts' && method === 'POST') {
    const body = await readBody(request)
    const token = String(body.token || '').trim()
    const userid = String(body.userid || '').trim()
    if (!token) return json({ ok: false, message: '请填写 token' }, 400)
    if (!userid) return json({ ok: false, message: '请填写 userid' }, 400)

    const settings = await store.getSettings(env)
    const device = await store.getDevice(env)
    const providedName = String(body.name || '').trim()
    const account = store.newAccountRecord({
      userid,
      token,
      name: providedName || undefined,
      signTime: body.signTime || settings.defaultSignTime,
      source: 'cookie',
    })

    // 尝试验证 token 有效性与昵称
    let warning = ''
    try {
      const detail = await fetchUserDetail(device, account)
      if (detail && detail.status === 1 && detail.data && detail.data.nickname) {
        if (!providedName) account.name = detail.data.nickname
        account.lastMessage = `已导入，账号：${detail.data.nickname}`
      } else {
        account.lastStatus = 'token_invalid'
        account.lastMessage = 'token 校验未通过，请确认 token 与 userid 是否正确'
        warning = account.lastMessage
      }
    } catch (error) {
      warning = `token 校验请求失败：${error.message || error}`
    }

    let created = false
    await store.updateAccounts(env, (accounts) => {
      const result = store.upsertAccount(accounts, account)
      created = result.created
      return result.accounts
    })
    await store.appendLog(env, {
      accountId: account.id,
      name: account.name,
      trigger: 'manual',
      status: warning ? 'token_invalid' : 'info',
      message: warning || '账号导入成功',
    })
    return json({
      ok: true,
      created,
      account: store.publicAccount(account),
      message: warning || (created ? '账号已添加' : '账号已更新'),
    })
  }

  // ---- 账号更新 / 删除 / 执行 ----
  const accountMatch = path.match(/^\/api\/accounts\/([^/]+)(?:\/(run|refresh-token))?$/)
  if (accountMatch) {
    const id = decodeURIComponent(accountMatch[1])
    const action = accountMatch[2]

    if (method === 'PATCH' && !action) {
      const body = await readBody(request)
      const patch = {}
      if (body.signTime !== undefined) {
        if (!/^\d{1,2}:\d{2}$/.test(String(body.signTime))) {
          return json({ ok: false, message: '签到时间格式应为 HH:MM' }, 400)
        }
        patch.signTime = body.signTime
      }
      if (body.enabled !== undefined) patch.enabled = !!body.enabled
      if (body.name !== undefined) patch.name = String(body.name).slice(0, 60)

      let found = false
      await store.updateAccounts(env, (accounts) => {
        const account = accounts.find((a) => a.id === id)
        if (account) {
          Object.assign(account, patch)
          found = true
        }
        return accounts
      })
      if (!found) return json({ ok: false, message: '账号不存在' }, 404)
      return json({ ok: true, message: '已更新' })
    }

    if (method === 'DELETE' && !action) {
      let found = false
      await store.updateAccounts(env, (accounts) => {
        const next = accounts.filter((a) => a.id !== id)
        found = next.length !== accounts.length
        return next
      })
      if (!found) return json({ ok: false, message: '账号不存在' }, 404)
      return json({ ok: true, message: '账号已删除' })
    }

    if (method === 'POST' && action === 'run') {
      const accounts = await store.getAccounts(env)
      const account = accounts.find((a) => a.id === id)
      if (!account) return json({ ok: false, message: '账号不存在' }, 404)
      // 直接等待执行结果：一次执行受时间预算约束（约 45 秒内返回），
      // 既不会让前端一直转圈，也避免 ctx.waitUntil 被平台中断后状态卡死。
      const result = await runCheckinForAccount(env, id, { trigger: 'manual' })
      return json({
        ok: true,
        result: {
          status: result.tokenInvalid ? 'token_invalid' : result.ok ? 'success' : 'failed',
          message: result.message || '',
          adSuccess: result.adSuccess || 0,
          adPending: !!result.adPending,
          vipEndTime: result.vipEndTime || '',
          steps: result.steps || [],
        },
        message: result.message || '执行完成',
      })
    }

    if (method === 'POST' && action === 'refresh-token') {
      const accounts = await store.getAccounts(env)
      const account = accounts.find((a) => a.id === id)
      if (!account) return json({ ok: false, message: '账号不存在' }, 404)
      const device = await store.getDevice(env)
      const result = await loginByToken(device, { token: account.token, userid: account.userid, t1: account.t1 })
      if (!result.ok) return json({ ok: false, message: (result.error && result.error.message) || 'token 续期失败' }, 400)

      const patch = {
        t1: result.account.t1 || account.t1,
        vipType: result.account.vipType || account.vipType,
        vipToken: result.account.vipToken || account.vipToken,
      }
      if (result.account.token && result.account.token !== account.token) patch.token = result.account.token
      await store.updateAccounts(env, (list) => {
        const target = list.find((a) => a.id === id)
        if (target) Object.assign(target, patch)
        return list
      })
      return json({ ok: true, message: patch.token ? 'token 已刷新' : 'token 仍然有效，无需刷新' })
    }
  }

  // ---- 批量执行 ----
  if (path === '/api/accounts/run-all' && method === 'POST') {
    // 同样直接返回结果，总时长受 BATCH_TOTAL_BUDGET_MS 约束
    const result = await runAllAccounts(env, 'manual')
    return json({ ok: true, message: result.message || '执行完成', total: result.total || 0, done: result.done || 0, skipped: result.skipped || 0 })
  }

  // ---- 短信验证码登录 ----
  if (path === '/api/auth/sms/send' && method === 'POST') {
    const body = await readBody(request)
    const phone = String(body.phone || '').trim()
    if (!/^\d{6,15}$/.test(phone)) return json({ ok: false, message: '请输入正确的手机号' }, 400)
    const device = await store.getDevice(env)
    const result = await sendSmsCode(device, phone)
    if (!result.ok) return json({ ok: false, message: (result.error && result.error.message) || '验证码发送失败' }, 400)
    return json({ ok: true, message: '验证码已发送' })
  }

  if (path === '/api/auth/sms/login' && method === 'POST') {
    const body = await readBody(request)
    const phone = String(body.phone || '').trim()
    const code = String(body.code || '').trim()
    if (!phone || !code) return json({ ok: false, message: '请填写手机号和验证码' }, 400)

    const device = await store.getDevice(env)
    const result = await loginByVerifyCode(device, { mobile: phone, code })
    if (!result.ok) return json({ ok: false, message: (result.error && result.error.message) || '登录失败' }, 400)

    const settings = await store.getSettings(env)
    const account = store.newAccountRecord({
      userid: result.account.userid,
      token: result.account.token,
      t1: result.account.t1,
      nickname: result.account.nickname,
      vipType: result.account.vipType,
      vipToken: result.account.vipToken,
      dfid: result.account.dfid,
      name: String(body.name || '').trim() || undefined,
      signTime: body.signTime || settings.defaultSignTime,
      source: 'sms',
    })

    const upserted = await store.updateAccounts(env, (accounts) => store.upsertAccount(accounts, account).accounts)
    await store.appendLog(env, {
      accountId: account.id,
      name: account.name,
      trigger: 'manual',
      status: 'info',
      message: `手机验证码登录成功（共 ${upserted.length} 个账号）`,
    })
    return json({ ok: true, account: store.publicAccount(account), message: '登录成功，已加入托管' })
  }

  // ---- 扫码登录 ----
  if (path === '/api/auth/qr/create' && method === 'GET') {
    const device = await store.getDevice(env)
    const result = await createQrCode(device)
    if (!result.ok) return json({ ok: false, message: (result.error && result.error.message) || '二维码获取失败' }, 400)
    return json({ ok: true, key: result.key, img: result.img, url: result.url })
  }

  if (path === '/api/auth/qr/check' && method === 'GET') {
    const key = url.searchParams.get('key') || ''
    if (!key) return json({ ok: false, message: '缺少 key' }, 400)
    const device = await store.getDevice(env)
    const result = await checkQrCode(device, key)
    if (!result.ok) return json({ ok: false, message: result.message, status: result.status }, 400)

    if (result.status === 4 && result.account) {
      const settings = await store.getSettings(env)
      const account = store.newAccountRecord({
        userid: result.account.userid,
        token: result.account.token,
        nickname: result.account.nickname,
        vipType: result.account.vipType,
        vipToken: result.account.vipToken,
        source: 'qr',
        signTime: settings.defaultSignTime,
      })
      await store.updateAccounts(env, (accounts) => store.upsertAccount(accounts, account).accounts)
      await store.appendLog(env, {
        accountId: account.id,
        name: account.name,
        trigger: 'manual',
        status: 'info',
        message: '扫码登录成功，已加入托管',
      })
      return json({ ok: true, status: 4, message: '登录成功', account: store.publicAccount(account) })
    }

    return json({ ok: true, status: result.status, message: result.message })
  }

  // ---- 设置 ----
  if (path === '/api/settings' && method === 'GET') {
    return json({ ok: true, settings: await store.getSettings(env) })
  }

  if (path === '/api/settings' && method === 'POST') {
    const body = await readBody(request)
    const allowed = {}
    for (const key of ['defaultSignTime', 'adRounds', 'adIntervalSeconds', 'autoRefreshToken', 'catchUp', 'enableDeviceRegister']) {
      if (body[key] !== undefined) allowed[key] = body[key]
    }
    return json({ ok: true, settings: await store.saveSettings(env, allowed) })
  }

  // ---- 日志 ----
  if (path === '/api/logs' && method === 'GET') {
    return json({ ok: true, logs: await store.getLogs(env) })
  }

  if (path === '/api/logs' && method === 'DELETE') {
    await store.clearLogs(env)
    return json({ ok: true, message: '日志已清空' })
  }

  // ---- 立即执行定时逻辑（调试用）----
  if (path === '/api/run-scheduled' && method === 'POST') {
    ctx.waitUntil(handleScheduled(env).catch((error) => console.error('scheduled failed:', error)))
    return json({ ok: true, message: '已触发定时任务检查' })
  }

  // ---- 刷新全部 token ----
  if (path === '/api/refresh-tokens' && method === 'POST') {
    const result = await refreshTokens(env)
    return json({ ok: true, message: `已处理 ${result.refreshed.length} 个账号`, details: result.refreshed })
  }

  return json({ ok: false, message: '接口不存在' }, 404)
}
