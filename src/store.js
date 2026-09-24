/**
 * KV 数据访问层
 *
 * KV 结构：
 *   kg:accounts  -> 账号列表（token 视配置加密）
 *   kg:device    -> Worker 级设备指纹
 *   kg:settings  -> 全局设置
 *   kg:logs      -> 最近运行日志（最多 100 条）
 */

import { createDeviceIdentity, normalizeDeviceIdentity } from './lib/device.js'
import { decryptSecret, encryptSecret, isEncrypted } from './lib/secure.js'

const ACCOUNTS_KEY = 'kg:accounts'
const DEVICE_KEY = 'kg:device'
const SETTINGS_KEY = 'kg:settings'
const LOGS_KEY = 'kg:logs'
const MAX_LOGS = 100

/**
 * 执行状态超过该时长仍停留在 running，视为任务被平台中断（例如超出后台存活时限），
 * 前端展示时按失败处理，避免一直转圈。
 */
export const RUNNING_STALE_MS = 3 * 60 * 1000

export const DEFAULT_SETTINGS = {
  /** 新账号默认签到时间（北京时间 HH:MM） */
  defaultSignTime: '01:15',
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
}

function kv(env) {
  return env.KG_KV || env.KG_ACCOUNTS_KV
}

function requireKv(env) {
  const store = kv(env)
  if (!store) {
    throw new Error('未绑定 KV 命名空间，请在 wrangler.toml 中配置 [[kv_namespaces]] binding = "KG_KV"')
  }
  return store
}

async function readJson(env, key, fallback) {
  const raw = await requireKv(env).get(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJson(env, key, value) {
  await requireKv(env).put(key, JSON.stringify(value))
}

// ============ 全局设置 ============

export async function getSettings(env) {
  const stored = await readJson(env, SETTINGS_KEY, {})
  return Object.assign({}, DEFAULT_SETTINGS, stored)
}

export async function saveSettings(env, patch) {
  const current = await getSettings(env)
  const next = Object.assign({}, current, patch)
  // 数值字段做一次保护
  next.adRounds = Math.min(20, Math.max(0, Number(next.adRounds) || 0))
  next.adIntervalSeconds = Math.min(120, Math.max(0, Number(next.adIntervalSeconds) || 0))
  await writeJson(env, SETTINGS_KEY, next)
  return next
}

// ============ 设备指纹 ============

export async function getDevice(env) {
  const stored = await readJson(env, DEVICE_KEY, null)
  const device = normalizeDeviceIdentity(stored)
  if (!stored || JSON.stringify(stored) !== JSON.stringify(device)) {
    await writeJson(env, DEVICE_KEY, device)
  }
  return device
}

export async function updateDevice(env, patch) {
  const device = await getDevice(env)
  const next = Object.assign({}, device, patch)
  await writeJson(env, DEVICE_KEY, next)
  return next
}

// ============ 账号 ============

function secretOf(env) {
  return env.SECRET_KEY || env.ADMIN_TOKEN || ''
}

// 解密失败（例如更换了 SECRET_KEY）时把原始密文挂在 Symbol 上保留，
// Symbol 不会被 JSON.stringify 序列化，既不会泄露也不会写坏数据。
const TOKEN_LOCK = Symbol('tokenLock')
const VIP_TOKEN_LOCK = Symbol('vipTokenLock')

async function decryptField(value, secret, lockSymbol, account) {
  if (!isEncrypted(value)) return value
  const plain = await decryptSecret(value, secret)
  if (plain) return plain
  account[lockSymbol] = value
  return ''
}

async function decryptAccount(account, secret) {
  const out = Object.assign({}, account)
  out.token = await decryptField(account.token, secret, TOKEN_LOCK, out)
  out.vipToken = await decryptField(account.vipToken, secret, VIP_TOKEN_LOCK, out)
  return out
}

async function encryptAccount(account, secret) {
  const out = Object.assign({}, account)
  // token 为空且存在未解密的原始密文时，原样保留，避免换 key 后把数据清空
  out.token = account.token ? await encryptSecret(account.token, secret) : account[TOKEN_LOCK] || ''
  out.vipToken = account.vipToken ? await encryptSecret(account.vipToken, secret) : account[VIP_TOKEN_LOCK] || ''
  return out
}

/** 读取账号列表（已解密） */
export async function getAccounts(env) {
  const list = await readJson(env, ACCOUNTS_KEY, [])
  const secret = secretOf(env)
  const out = []
  for (const item of list) out.push(await decryptAccount(item, secret))
  return out
}

/** 覆盖写入账号列表（写入前加密） */
export async function saveAccounts(env, accounts) {
  const secret = secretOf(env)
  const out = []
  for (const item of accounts) out.push(await encryptAccount(item, secret))
  await writeJson(env, ACCOUNTS_KEY, out)
  return accounts
}

/** 读-改-写 */
export async function updateAccounts(env, mutator) {
  const accounts = await getAccounts(env)
  const result = await mutator(accounts)
  const next = Array.isArray(result) ? result : accounts
  await saveAccounts(env, next)
  return next
}

/** 生成账号 ID */
export function newAccountId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return 'acc_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 合并重复账号（按 userid 去重，后者覆盖前者） */
export function upsertAccount(accounts, incoming) {
  const index = accounts.findIndex((a) => String(a.userid) === String(incoming.userid))
  if (index >= 0) {
    const merged = Object.assign({}, accounts[index], incoming, {
      id: accounts[index].id,
      createdAt: accounts[index].createdAt,
    })
    accounts[index] = merged
    return { accounts, account: merged, created: false }
  }
  accounts.push(incoming)
  return { accounts, account: incoming, created: true }
}

/** 对外输出时隐藏 token */
export function publicAccount(account) {
  // 被中断的执行不应让界面一直显示「执行中」
  let lastStatus = account.lastStatus || 'idle'
  let lastMessage = account.lastMessage || ''
  const runningSince = account.lastRunAt ? Date.parse(account.lastRunAt) : NaN
  if (lastStatus === 'running' && Number.isFinite(runningSince) && Date.now() - runningSince > RUNNING_STALE_MS) {
    lastStatus = 'failed'
    lastMessage = '上次执行被中断（超出单次运行时限），稍后会自动重试'
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
    lastRunDate: account.lastRunDate || '',
    lastStatus,
    lastMessage,
    lastSteps: account.lastSteps || [],
    vipEndTime: account.vipEndTime || '',
    vipType: account.vipType || 0,
    /** 账号类型：old=有广告领取活动 / new=无该活动 / unknown=尚未判定 */
    adTier: account.adTier || 'unknown',
    /** 广告次数尚未领完，等待定时任务续跑 */
    pendingAds: !!account.pendingAds,
    /** 听歌未领到，等待定时任务重试 */
    pendingClaim: !!account.pendingClaim,
    hasToken: !!account.token,
    progress: account.progress || null,
  }
}

export function newAccountRecord({ userid, token, t1, nickname, vipType, vipToken, dfid, source, signTime, name }) {
  const providedName = String(name || '').trim()
  return {
    id: newAccountId(),
    name: providedName || nickname || `账号 ${userid}`,
    /** 是否由用户手动指定名称（true 时不会被酷狗昵称覆盖） */
    customName: !!providedName,
    userid,
    token: token || '',
    t1: t1 || '',
    vipType: vipType || 0,
    vipToken: vipToken || '',
    dfid: dfid || '',
    enabled: true,
    signTime: signTime || DEFAULT_SETTINGS.defaultSignTime,
    source: source || 'manual',
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastRunDate: '',
    lastStatus: 'idle',
    lastMessage: '等待首次执行',
    lastSteps: [],
    vipEndTime: '',
    /** 账号类型，首次执行后由接口返回自动判定 */
    adTier: 'unknown',
    /** 广告次数尚未领完，等待定时任务续跑 */
    pendingAds: false,
    /** 听歌未领到，等待定时任务重试 */
    pendingClaim: false,
  }
}

// ============ 日志 ============

export async function appendLog(env, entry) {
  const logs = await readJson(env, LOGS_KEY, [])
  logs.unshift(Object.assign({ at: new Date().toISOString() }, entry))
  await writeJson(env, LOGS_KEY, logs.slice(0, MAX_LOGS))
}

export async function getLogs(env) {
  return readJson(env, LOGS_KEY, [])
}

export async function clearLogs(env) {
  await writeJson(env, LOGS_KEY, [])
}

export { createDeviceIdentity, LOGS_KEY }
