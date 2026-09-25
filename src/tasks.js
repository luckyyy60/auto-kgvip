/**
 * 签到任务编排 + 定时调度
 */

import { loginByToken, registerDevice } from './api/auth.js'
import { fetchUserDetail, fetchVipDetail, reportAdPlay, reportListenSong } from './api/checkin.js'
import { appendLog, getAccounts, getDevice, getSettings, saveSettings, RUNNING_STALE_MS, updateAccounts } from './store.js'

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 同一账号每天最多的自动尝试次数（仅统计失败，不含正常续跑） */
const MAX_ATTEMPTS_PER_DAY = 3

/**
 * 单次执行的广告领取时间预算。
 *
 * 背景：8 次广告领取 × 30 秒间隔 ≈ 3.5 分钟，远超 HTTP 请求与 ctx.waitUntil 的
 * 后台存活时限，因此单次执行只领取一部分，剩余次数由下一次定时任务自动续跑
 * （账号会被标记 pendingAds，无需人工干预）。
 */
const MANUAL_BUDGET_MS = 45000
const CRON_BUDGET_MS = 120000
const BATCH_TOTAL_BUDGET_MS = 55000

/** 遇到并发锁竞争后，重试前的等待时间 */
const LOCK_RETRY_DELAY_MS = 3000
/** 同一账号每天的自动执行次数上限（含广告续跑），防止异常情况下无休止重试 */
const MAX_RUNS_PER_DAY = 20

/**
 * 执行中「进度」写回 KV 的策略。
 *
 * KV 免费额度每天只有 1000 次**写**操作，而一次签到会产生十多个步骤；
 * 若每一步都写回一次（旧实现），几个账号就能吃掉大半额度。
 * 现在改为：开始执行的 running 状态与最终结果始终即时写入，
 * 中间进度最多写 MAX_PROGRESS_WRITES 次、且两次之间至少间隔 PROGRESS_WRITE_INTERVAL_MS，
 * 界面依旧能看到「执行中」与最终分步明细，只是中间步骤刷新频率降低。
 */
const PROGRESS_WRITE_INTERVAL_MS = 30000
const MAX_PROGRESS_WRITES = 2

/** 判断 running 状态是否仍在有效期内（用于避免重复并发执行） */
function isFreshRunning(lastRunAt) {
  const startedAt = lastRunAt ? Date.parse(lastRunAt) : NaN
  return Number.isFinite(startedAt) && Date.now() - startedAt < RUNNING_STALE_MS
}

/** 换算成北京时间（默认 UTC+8） */
export function shanghaiNow(date = new Date(), offsetHours = 8) {
  const shifted = new Date(date.getTime() + offsetHours * 3600 * 1000)
  const yyyy = shifted.getUTCFullYear()
  const MM = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const DD = String(shifted.getUTCDate()).padStart(2, '0')
  const hh = shifted.getUTCHours()
  const mm = shifted.getUTCMinutes()
  return {
    date: `${yyyy}-${MM}-${DD}`,
    time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    minutes: hh * 60 + mm,
    weekday: shifted.getUTCDay(),
  }
}

function toMinutes(value) {
  const [h, m] = String(value || '00:00').split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/** 当前时间是否落在目标签到时间的 ±window 分钟内 */
export function isTimeMatch(target, currentMinutes, window = 5) {
  const diff = Math.abs(currentMinutes - toMinutes(target))
  return diff < window || diff > 1440 - window
}

/** 是否已经过了目标签到时间（补签用） */
export function isPast(target, currentMinutes) {
  return currentMinutes >= toMinutes(target)
}

/** 把酷狗返回体里的错误码与原文拼成可读信息（便于排查业务错误） */
function describeError(body, fallback = '未知错误') {
  if (!body || typeof body !== 'object') return fallback
  const code = body.error_code ?? body.errcode ?? body.status
  const text = body.error_msg || body.errmsg || body.msg || body.message || ''
  if (code === undefined || code === null) return text || fallback
  return text ? `error_code=${code} ${text}` : `error_code=${code}`
}

/**
 * 是否为酷狗的「并发锁竞争」错误。
 *
 * 同一个账号同时发起多个领取请求时，服务端会返回 error_code=30002 且文案形如
 * `GET LOCK FIAL`（酷狗原文拼写错误，实为 FAIL）。这属于**可重试的临时错误**，
 * 而不是失败，更不等于「次数已用尽」。
 *
 * 注意：30002 是通用错误码，在广告接口上「次数已用尽」也用 30002，
 * 因此必须结合文案判断，不能只看错误码。
 */
export function isLockError(body) {
  if (!body || typeof body !== 'object') return false
  if (Number(body.error_code ?? body.errcode) !== 30002) return false
  const text = String(body.error_msg || body.errmsg || body.msg || body.message || '')
  return /lock/i.test(text)
}

/** 同账号并发执行的内存锁（同一 isolate 内有效，配合 KV 状态检查使用） */
const runningAccounts = new Set()

async function patchAccount(env, id, patch) {
  await updateAccounts(env, (accounts) => {
    const account = accounts.find((a) => a.id === id)
    if (account) Object.assign(account, patch)
    return accounts
  })
}

/**
 * 执行单个账号的签到流程
 * @param {object} env
 * @param {object} account
 * @param {object} settings
 * @param {{budgetMs?: number, onProgress?: (steps: object[]) => Promise<void>|void, api?: object}} [hooks]
 */
export async function performCheckin(env, account, settings, hooks = {}) {
  const device = await getDevice(env)
  const steps = []
  const runtime = Object.assign({}, account)
  const budgetMs = Number(hooks.budgetMs) > 0 ? Number(hooks.budgetMs) : MANUAL_BUDGET_MS
  const deadline = Date.now() + budgetMs
  // 允许注入接口实现，便于测试与将来替换
  const api = Object.assign({
    registerDevice,
    fetchUserDetail,
    reportListenSong,
    reportAdPlay,
    fetchVipDetail,
  }, hooks.api || {})

  const record = async (name, ok, message) => {
    steps.push({ name, ok, message, at: new Date().toISOString() })
    if (hooks.onProgress) await hooks.onProgress(steps.slice())
  }

  // 0. 可选：设备注册拿 dfid
  if (settings.enableDeviceRegister && !runtime.dfid) {
    try {
      const reg = await api.registerDevice(device, { token: runtime.token, userid: runtime.userid })
      if (reg.ok) {
        runtime.dfid = reg.dfid
        await record('设备注册', true, 'dfid 获取成功')
      } else {
        await record('设备注册', false, (reg.error && reg.error.message) || '获取失败')
      }
    } catch (error) {
      await record('设备注册', false, String(error.message || error))
    }
  }

  // 1. 登录态校验
  let detail = null
  try {
    detail = await api.fetchUserDetail(device, runtime)
  } catch (error) {
    await record('登录校验', false, `请求异常：${error.message || error}`)
    return { ok: false, steps, nickname: runtime.name, message: '网络请求失败', dfid: runtime.dfid }
  }

  const nickname = detail && detail.status === 1 && detail.data ? detail.data.nickname : ''
  if (!nickname) {
    await record('登录校验', false, `token 失效或账号异常（${describeError(detail)}）`)
    return {
      ok: false,
      tokenInvalid: true,
      steps,
      nickname: runtime.name,
      message: 'token 已失效，请重新登录',
      dfid: runtime.dfid,
    }
  }
  await record('登录校验', true, `账号：${nickname}`)

  // 2. 听歌领取
  //    listenState: claimed=本次领到 / already=今日已领 / failed=失败
  let listenState = 'failed'
  let listenDetail = ''
  let listenRetried = false
  try {
    let listen = await api.reportListenSong(device, runtime)
    // 并发锁竞争（30002 + LOCK 文案）属于临时错误，稍等后重试一次
    if (!(listen && listen.status === 1) && !(listen && Number(listen.error_code) === 130012) &&
        (isLockError(listen) || Number(listen && listen.error_code) === 30002)) {
      listenRetried = true
      await sleep(LOCK_RETRY_DELAY_MS)
      listen = await api.reportListenSong(device, runtime)
    }

    if (listen && listen.status === 1) {
      listenState = 'claimed'
      listenDetail = listenRetried ? '重试后领取成功' : '领取成功'
    } else if (listen && Number(listen.error_code) === 130012) {
      listenState = 'already'
      listenDetail = '今日已领取'
    } else {
      listenDetail = `失败（${describeError(listen)}）`
    }
  } catch (error) {
    listenDetail = `请求异常：${error.message || error}`
  }

  await record('听歌领取', listenState !== 'failed', listenDetail)

  // 3. 广告领取（每天最多 adRounds 次）
  let adSuccess = 0
  let adExhausted = false
  let adPending = false
  // 账号类型：老账号有「看广告领 VIP」活动，新账号没有（接口返回 20028）
  let adTier = runtime.adTier === 'old' || runtime.adTier === 'new' ? runtime.adTier : 'unknown'
  const rounds = Number(settings.adRounds) || 0
  const interval = (Number(settings.adIntervalSeconds) || 0) * 1000

  for (let i = 1; i <= rounds; i++) {
    // 超出本次时间预算：保留进度，交给下次定时任务续跑
    if (Date.now() >= deadline) {
      adPending = true
      await record('广告领取', true, `本次已领取 ${adSuccess} 次，剩余次数将在下次定时任务自动继续`)
      break
    }
    try {
      const ad = await api.reportAdPlay(device, runtime)
      if (ad && ad.status === 1) {
        adSuccess++
        adTier = 'old'
        await record(`广告领取 #${i}`, true, '领取成功')
      } else if (ad && Number(ad.error_code) === 30002) {
        if (isLockError(ad)) {
          // 并发锁竞争：不是「次数已用尽」，本次先停，交给下一次续跑
          adPending = true
          await record(`广告领取 #${i}`, true, '遇到并发锁竞争，剩余次数稍后自动续跑')
          break
        }
        adExhausted = true
        adTier = 'old'
        await record(`广告领取 #${i}`, true, '今日次数已用尽')
        break
      } else if (ad && ad.error_code === 20028) {
        // 该账号没有广告活动，属于账号属性而非执行失败
        adTier = 'new'
        await record('广告领取', true, '该账号无广告领取活动（新账号）')
        break
      } else {
        await record(`广告领取 #${i}`, false, `失败（${describeError(ad)}）`)
        break
      }
    } catch (error) {
      await record(`广告领取 #${i}`, false, `请求异常：${error.message || error}`)
      break
    }
    // 剩余等待时间不足以再领一次时，同样交给下次续跑
    if (i < rounds && interval > 0) {
      if (Date.now() + interval >= deadline) {
        adPending = true
        await record('广告领取', true, `本次已领取 ${adSuccess} 次，剩余次数将在下次定时任务自动继续`)
        break
      }
      await sleep(interval)
    }
  }

  // 4. VIP 到期时间
  let vipEndTime = runtime.vipEndTime || ''
  try {
    const vip = await api.fetchVipDetail(device, runtime)
    const first = vip && vip.status === 1 && vip.data && Array.isArray(vip.data.busi_vip) ? vip.data.busi_vip[0] : null
    if (first && first.vip_end_time) {
      vipEndTime = first.vip_end_time
      await record('VIP 信息', true, `到期时间：${vipEndTime}`)
    } else {
      await record('VIP 信息', false, `获取失败（${describeError(vip)}）`)
    }
  } catch (error) {
    await record('VIP 信息', false, `请求异常：${error.message || error}`)
  }

  const failedSteps = steps.filter((s) => !s.ok).length
  const listenStep = steps.find((s) => s.name === '听歌领取')
  const listenDone = listenState === 'claimed' || listenState === 'already'
  const listenText = listenState === 'already'
    ? '听歌今日已领取'
    : listenState === 'claimed'
      ? '听歌领取成功'
      : '听歌领取失败'
  const adText = adExhausted
    ? `广告 ${adSuccess} 次（今日已用尽）`
    : adTier === 'new'
      ? '广告不适用（新账号）'
      : adPending
        ? `广告 ${adSuccess} 次（待续跑）`
        : `广告 ${adSuccess} 次`

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
    message: `${listenText} · ${adText}${failedSteps ? ` · ${failedSteps} 步异常` : ''}`,
  }
}

/**
 * 执行指定账号并落库 / 记日志
 * @param {object} env
 * @param {string} accountId
 * @param {{trigger?: string}} [options]
 */
export async function runCheckinForAccount(env, accountId, options = {}) {
  const trigger = options.trigger || 'manual'
  const budgetMs = Number(options.budgetMs) > 0 ? Number(options.budgetMs) : MANUAL_BUDGET_MS
  const settings = await getSettings(env)
  const accounts = await getAccounts(env)
  const account = accounts.find((a) => a.id === accountId)

  if (!account) return { ok: false, message: '账号不存在' }
  if (account.enabled === false) return { ok: false, message: '账号已停用' }

  // 同一账号严禁并发执行：并发会触发酷狗的锁竞争（30002 GET LOCK FAIL）
  if (runningAccounts.has(accountId)) {
    return { ok: false, skipped: true, message: '该账号正在执行中，已跳过本次重复执行' }
  }
  if (account.lastStatus === 'running' && isFreshRunning(account.lastRunAt)) {
    return { ok: false, skipped: true, message: '该账号正在执行中，已跳过本次重复执行' }
  }

  runningAccounts.add(accountId)
  try {
    return await executeCheckin(env, accountId, account, settings, { trigger, budgetMs, api: options.api })
  } finally {
    runningAccounts.delete(accountId)
  }
}

async function executeCheckin(env, accountId, account, settings, { trigger, budgetMs, api }) {
  const startedAt = new Date().toISOString()
  const today = shanghaiNow().date
  // 失败次数按天累计，用于限制补签模式下的重试；正常续跑不计入
  const attemptsToday = account.lastAttemptDate === today ? Number(account.attemptsToday) || 0 : 0
  // 每天的总执行次数（含广告续跑），用于兜底防止无休止重试
  const runsToday = (account.lastRunDay === today ? Number(account.runsToday) || 0 : 0) + 1

  await patchAccount(env, accountId, {
    lastStatus: 'running',
    lastRunAt: startedAt,
    lastMessage: '执行中…',
    lastRunDay: today,
    runsToday,
    progress: { startedAt, trigger, steps: [] },
  })

  // 中间进度写回节流：把「十多个步骤 → 十多次 KV 写」压到最多 MAX_PROGRESS_WRITES 次。
  // 计时从开始执行算起，所以耗时很短的任务（例如只有登录 + 听歌）不会产生额外写操作。
  let progressWrites = 0
  let lastProgressAt = Date.now()
  const onProgress = async (steps) => {
    if (progressWrites >= MAX_PROGRESS_WRITES) return
    const nowMs = Date.now()
    if (nowMs - lastProgressAt < PROGRESS_WRITE_INTERVAL_MS) return
    progressWrites++
    lastProgressAt = nowMs
    await patchAccount(env, accountId, { progress: { startedAt, trigger, steps } })
  }

  let result
  try {
    result = await performCheckin(env, account, settings, {
      budgetMs,
      api,
      onProgress,
    })
  } catch (error) {
    result = { ok: false, steps: [], nickname: account.name, message: `执行异常：${error.message || error}` }
  }

  // 听歌没领到就不算完成（听歌是每天 1 天 VIP 的主要来源）
  const listenDone = result.listenState === 'claimed' || result.listenState === 'already'
  const finished = result.tokenInvalid || (result.ok && listenDone && !result.adPending)
  // 只有「真正的失败」才累计次数：广告续跑(pendingAds)属于正常流程，不计入
  const countedAsFailure = !result.tokenInvalid && !finished && !result.adPending
  const nextAttempts = countedAsFailure ? attemptsToday + 1 : attemptsToday

  const patch = {
    lastRunAt: new Date().toISOString(),
    lastStatus: result.tokenInvalid ? 'token_invalid' : result.ok && listenDone ? 'success' : 'failed',
    lastMessage: result.message || (result.ok ? '完成' : '失败'),
    lastSteps: result.steps || [],
    progress: null,
    // 广告次数未领完 / 听歌未领到：保留标记，交由下一次定时任务自动续跑
    pendingAds: !!result.adPending,
    pendingClaim: !result.tokenInvalid && !listenDone,
  }
  if (countedAsFailure) {
    patch.lastAttemptDate = today
    patch.attemptsToday = nextAttempts
  }
  // 未手动命名过的账号，用酷狗昵称补全
  if (result.nickname && !account.customName) patch.name = result.nickname
  if (result.adTier && result.adTier !== 'unknown') patch.adTier = result.adTier
  if (result.vipEndTime) patch.vipEndTime = result.vipEndTime
  if (result.dfid) patch.dfid = result.dfid
  // 已跑完（含新账号无广告活动）或 token 失效：当天不再重复；
  // 广告未领完：不写 lastRunDate，等定时任务续跑
  if (finished || nextAttempts >= MAX_ATTEMPTS_PER_DAY) patch.lastRunDate = today

  await patchAccount(env, accountId, patch)

  await appendLog(env, {
    accountId,
    name: patch.name || account.name,
    trigger,
    status: patch.lastStatus,
    message: patch.lastMessage,
    adSuccess: result.adSuccess || 0,
    vipEndTime: result.vipEndTime || '',
    steps: result.steps || [],
  })

  return Object.assign({ accountId, name: patch.name || account.name }, result)
}

/** 带并发上限的批量执行 */
async function runBatch(env, ids, trigger, options = {}) {
  const concurrency = options.concurrency || 3
  const totalBudgetMs = options.totalBudgetMs || 10 * 60 * 1000
  const accountBudgetMs = options.accountBudgetMs || CRON_BUDGET_MS
  const results = []
  const queue = ids.slice()
  const deadline = Date.now() + totalBudgetMs

  async function worker() {
    while (queue.length) {
      if (Date.now() > deadline) {
        results.push({ ok: false, skipped: true, message: '超出单次执行时间预算，剩余账号将在下次定时任务中补跑' })
        return
      }
      const id = queue.shift()
      try {
        results.push(await runCheckinForAccount(env, id, { trigger, budgetMs: accountBudgetMs, api: options.api }))
      } catch (error) {
        results.push({ ok: false, accountId: id, message: String(error.message || error) })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
  return results
}

/**
 * 手动执行全部启用账号
 * 总时长受 BATCH_TOTAL_BUDGET_MS 限制，未跑完的账号会在下次定时任务继续。
 */
export async function runAllAccounts(env, trigger = 'manual') {
  const accounts = await getAccounts(env)
  const ids = accounts.filter((a) => a.enabled !== false).map((a) => a.id)
  if (!ids.length) return { ok: true, total: 0, message: '没有启用的账号' }
  const results = await runBatch(env, ids, trigger, {
    concurrency: 4,
    totalBudgetMs: BATCH_TOTAL_BUDGET_MS,
    accountBudgetMs: MANUAL_BUDGET_MS,
  })
  const done = results.filter((r) => r && r.ok).length
  const skipped = results.filter((r) => r && r.skipped).length
  return {
    ok: true,
    total: ids.length,
    done,
    skipped,
    results,
    message: skipped
      ? `已执行 ${done} 个账号，剩余 ${skipped} 个将在下次定时任务继续`
      : `已执行 ${done} 个账号`,
  }
}

/** 每周日刷新 token */
export async function refreshTokens(env) {
  const device = await getDevice(env)
  const accounts = await getAccounts(env)
  const refreshed = []

  for (const account of accounts) {
    if (account.enabled === false || !account.token) continue
    try {
      const res = await loginByToken(device, { token: account.token, userid: account.userid, t1: account.t1 })
      if (res.ok && res.account.token && res.account.token !== account.token) {
        await patchAccount(env, account.id, {
          token: res.account.token,
          t1: res.account.t1 || account.t1,
          vipType: res.account.vipType || account.vipType,
          vipToken: res.account.vipToken || account.vipToken,
        })
        refreshed.push({ accountId: account.id, name: account.name, changed: true })
      } else if (res.ok) {
        refreshed.push({ accountId: account.id, name: account.name, changed: false })
      } else {
        refreshed.push({ accountId: account.id, name: account.name, changed: false, message: res.error?.message })
      }
    } catch (error) {
      refreshed.push({ accountId: account.id, name: account.name, changed: false, message: String(error.message || error) })
    }
  }

  await appendLog(env, { trigger: 'refresh', status: 'info', name: 'token 刷新', message: `已处理 ${refreshed.length} 个账号`, details: refreshed })
  return { ok: true, refreshed }
}

/**
 * 定时任务入口：每 5 分钟触发一次
 *
 * 两类账号会被执行：
 * 1. 到了设定签到时间且当天未完成的账号
 * 2. 广告次数没领完（pendingAds）的账号 —— 单次执行有时间预算，
 *    剩余的广告领取由后续定时任务自动续跑，直到领满或返回「次数已用尽」
 */
export async function handleScheduled(env, options = {}) {
  const settings = await getSettings(env)
  const now = options.now || shanghaiNow()
  const accounts = await getAccounts(env)

  const targets = accounts.filter((account) => {
    if (account.enabled === false) return false
    if (account.lastRunDate === now.date) return false
    // 正在执行中的账号先跳过，避免并发触发酷狗的锁竞争
    if (account.lastStatus === 'running' && isFreshRunning(account.lastRunAt)) return false
    // 当天执行次数兜底，避免异常情况下无休止重试
    if (account.lastRunDay === now.date && (Number(account.runsToday) || 0) >= MAX_RUNS_PER_DAY) return false
    // 已重试满次数则当天不再尝试
    if (account.lastAttemptDate === now.date && (Number(account.attemptsToday) || 0) >= MAX_ATTEMPTS_PER_DAY) return false
    // 广告未领完 / 听歌未领到：不挑时间，直接续跑
    if (account.pendingAds || account.pendingClaim) return true
    if (isTimeMatch(account.signTime, now.minutes)) return true
    if (settings.catchUp && isPast(account.signTime, now.minutes)) return true
    return false
  })

  let results = []
  if (targets.length) {
    results = await runBatch(env, targets.map((a) => a.id), 'cron', {
      concurrency: 3,
      totalBudgetMs: 10 * 60 * 1000,
      accountBudgetMs: CRON_BUDGET_MS,
      api: options.api,
    })
  }

  // 周日刷新 token（北京时间）。
  // 用 settings.lastRefreshDate 去重：定时任务每 5 分钟触发一次，
  // 旧实现会在整个周日重复刷新 288 次，白白消耗 KV 写额度并频繁调用酷狗接口。
  if (settings.autoRefreshToken && now.weekday === 0 && settings.lastRefreshDate !== now.date) {
    await refreshTokens(env)
    await saveSettings(env, { lastRefreshDate: now.date })
  }

  return { ok: true, time: `${now.date} ${now.time}`, matched: targets.length, results }
}
