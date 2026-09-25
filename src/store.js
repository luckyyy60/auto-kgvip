/**
 * KV 数据访问层
 *
 * KV 结构：
 *   kg:accounts  -> 账号列表（token 视配置加密）
 *   kg:device    -> Worker 级设备指纹
 *   kg:settings  -> 全局设置
 *   kg:logs      -> 最近运行日志（最多 100 条）
 *
 * 历史键名 kg_accounts / kg_device / kg_settings / kg_logs 仍可读取，
 * 首次读到时会自动迁移到上表的正式键名。
 */

import { createDeviceIdentity, normalizeDeviceIdentity } from './lib/device.js'
import { decryptSecret, encryptSecret, isEncrypted } from './lib/secure.js'

const ACCOUNTS_KEY = 'kg:accounts'
const DEVICE_KEY = 'kg:device'
const SETTINGS_KEY = 'kg:settings'
const LOGS_KEY = 'kg:logs'
const MAX_LOGS = 100

/**
 * 历史键名兼容。
 *
 * 早期版本（以及直接按导出文件名导入 KV 的场景）使用下划线键名，
 * 而正式键名是 `kg:accounts` 这类带冒号的写法。若只认正式键，
 * 已存在的旧数据在部署新版后会读不到（表现为「导入的原有 KV 数据无效」）。
 * 这里在正式键缺失时回退读取历史键，并顺手迁移到正式键。
 */
const LEGACY_KEYS = {
  [ACCOUNTS_KEY]: 'kg_accounts',
  [DEVICE_KEY]: 'kg_device',
  [SETTINGS_KEY]: 'kg_settings',
  [LOGS_KEY]: 'kg_logs',
}

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
  /** 最近一次自动刷新 token 的日期（YYYY-MM-DD），用于避免定时任务重复刷新 */
  lastRefreshDate: '',
}

function kv(env) {
  // KG_ACCOUNTS_KV 是历史绑定名，保留兼容，避免旧部署改名后读不到数据
  return env.KG_KV || env.KG_ACCOUNTS_KV
}

function requireKv(env) {
  const store = kv(env)
  if (!store) {
    throw new Error(
      '未绑定 KV 命名空间，请在 wrangler.toml 中配置 [[kv_namespaces]] binding = "KG_KV"',
    )
  }
  return store
}

async function readJson(env, key, fallback) {
  const store = requireKv(env)
  const raw = await store.get(key)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  const legacyKey = LEGACY_KEYS[key]
  if (!legacyKey) return fallback
  const legacyRaw = await store.get(legacyKey)
  if (!legacyRaw) return fallback

  let value
  try {
    value = JSON.parse(legacyRaw)
  } catch {
    return fallback
  }

  // 迁移到正式键：先写后删。迁移失败不影响本次读取，下次访问会重试。
  try {
    await store.put(key, legacyRaw)
    if (typeof store.delete === 'function') await store.delete(legacyKey)
  } catch {
    /* 忽略迁移失败，数据仍照常返回 */
  }
  return value
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
  next.adIntervalSeconds = Math.min(
    120,
    Math.max(0, Number(next.adIntervalSeconds) || 0),
  )
  await writeJson(env, SETTINGS_KEY, next)
  return next
}

// ============ 设备指纹 ============

/**
 * 设备指纹里必须持久化的字段。
 * dfid 允许为空（首次签到前会由设备注册补上），因此不参与「是否缺字段」的判断。
 */
const DEVICE_REQUIRED_FIELDS = ['guid', 'mid', 'dev', 'mac', 'webgl']

export async function getDevice(env) {
  const stored = await readJson(env, DEVICE_KEY, null)
  const device = normalizeDeviceIdentity(stored)
  // 只在缺少必要字段时写回。
  // 不能按 JSON 全量比较：字段顺序变化或存在历史遗留的额外字段都会让比较永远不相等，
  // 那样每次调用（含二维码轮询）都会产生一次 KV 写，很快吃掉每天 1000 次的写额度。
  const needsWrite = !stored || DEVICE_REQUIRED_FIELDS.some((field) => !stored[field])
  if (needsWrite) {
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
  out.vipToken = await decryptField(
    account.vipToken,
    secret,
    VIP_TOKEN_LOCK,
    out,
  )
  return out
}

async function encryptAccount(account, secret) {
  const out = Object.assign({}, account)
  // token 为空且存在未解密的原始密文时，原样保留，避免换 key 后把数据清空
  out.token = account.token
    ? await encryptSecret(account.token, secret)
    : account[TOKEN_LOCK] || ''
  out.vipToken = account.vipToken
    ? await encryptSecret(account.vipToken, secret)
    : account[VIP_TOKEN_LOCK] || ''
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

/**
 * 串行化账号列表的「读-改-写」。
 *
 * 定时任务会并发执行多个账号（runBatch 并发 3），若各自「读整个列表 → 改一个 → 写回」，
 * 并发时后写的结果会覆盖先写的，导致状态丢失，进而触发多余的重复执行、浪费 KV 写额度。
 * 这里用同 isolate 内的 Promise 链把写入排队。
 */
let accountsWriteChain = Promise.resolve()

/** 读-改-写 */
export async function updateAccounts(env, mutator) {
  const task = accountsWriteChain.then(async () => {
    const accounts = await getAccounts(env)
    const result = await mutator(accounts)
    const next = Array.isArray(result) ? result : accounts
    await saveAccounts(env, next)
    return next
  })
  // 链上吞掉异常，避免一次失败让后续写入全部被拒绝
  accountsWriteChain = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

/** 生成账号 ID */
export function newAccountId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return (
    'acc_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  )
}

/** 合并重复账号（按 userid 去重，后者覆盖前者） */
export function upsertAccount(accounts, incoming) {
  const index = accounts.findIndex(
    (a) => String(a.userid) === String(incoming.userid),
  )
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
  if (
    lastStatus === 'running' &&
    Number.isFinite(runningSince) &&
    Date.now() - runningSince > RUNNING_STALE_MS
  ) {
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

export function newAccountRecord({
  userid,
  token,
  t1,
  nickname,
  vipType,
  vipToken,
  dfid,
  source,
  signTime,
  name,
}) {
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
