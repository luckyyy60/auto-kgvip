/**
 * 签到流程测试（注入假的酷狗接口，不联网）
 *
 * 重点覆盖「执行不再卡在转圈」的修复：
 * - 单次执行受时间预算约束，领不完的广告次数会标记 pendingAds 交给定时任务续跑
 * - 新账号（20028）不记为失败，老账号次数用尽（30002）正常收尾
 * - token 失效不计入失败重试次数
 *
 * 运行：node test/checkin.mjs
 */

import { handleScheduled, performCheckin, runCheckinForAccount, shanghaiNow } from '../src/tasks.js'
import * as store from '../src/store.js'

let passed = 0
let failed = 0

function check(name, actual, expected) {
  if (actual === expected) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    console.error(`  \u2717 ${name}\n      实际: ${JSON.stringify(actual)}\n      期望: ${JSON.stringify(expected)}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function fakeEnv(secret = 'test-secret') {
  const map = new Map()
  return {
    SECRET_KEY: secret,
    ADMIN_TOKEN: 'admin',
    KG_KV: {
      get: async (key) => (map.has(key) ? map.get(key) : null),
      put: async (key, value) => { map.set(key, value) },
      delete: async (key) => { map.delete(key) },
    },
  }
}

const SETTINGS = {
  defaultSignTime: '01:15',
  adRounds: 8,
  adIntervalSeconds: 0,
  autoRefreshToken: false,
  catchUp: false,
  enableDeviceRegister: false,
}

const ACCOUNT = {
  id: 'acc_1',
  name: '测试账号',
  userid: '1000',
  token: 'token-abc',
  enabled: true,
  signTime: '01:15',
  adTier: 'unknown',
}

/** 构造可控的假接口 */
function fakeApi(overrides = {}) {
  const calls = { ad: 0, listen: 0, detail: 0, vip: 0 }
  return {
    calls,
    async fetchUserDetail() {
      calls.detail++
      if (overrides.detailDelayMs) await sleep(overrides.detailDelayMs)
      if (overrides.detail) return overrides.detail()
      return { status: 1, data: { nickname: '测试昵称' } }
    },
    async reportListenSong() {
      calls.listen++
      return { status: 1 }
    },
    async reportAdPlay() {
      calls.ad++
      if (overrides.ad) return overrides.ad(calls.ad)
      return { status: 0, error_code: 30002 }
    },
    async fetchVipDetail() {
      calls.vip++
      return { status: 1, data: { busi_vip: [{ vip_end_time: '2026-10-01 00:00:00' }] } }
    },
    async registerDevice() {
      return { ok: true, dfid: 'dfid-1' }
    },
  }
}

// ============ 1. 时间预算与续跑标记 ============

console.log('1. 单次执行时间预算')
{
  // 登录校验耗时 30ms，预算只有 10ms —— 进入广告循环时已超时，一次都不领
  const env = fakeEnv()
  const api = fakeApi({ detailDelayMs: 30, ad: () => ({ status: 1 }) })
  const result = await performCheckin(env, ACCOUNT, SETTINGS, { budgetMs: 10, api })
  check('预算耗尽时不领广告', result.adSuccess, 0)
  check('标记待续跑', result.adPending, true)
  check('调用广告接口 0 次', api.calls.ad, 0)
  check('提示剩余次数将自动继续', result.message.includes('待续跑'), true)
}
{
  // 间隔 1 秒、预算 1.5 秒：可以领 2 次，之后因为等待时间不够而待续跑（时序有 0.5 秒余量）
  const env = fakeEnv()
  const settings = Object.assign({}, SETTINGS, { adIntervalSeconds: 1 })
  const api = fakeApi({ ad: () => ({ status: 1 }) })
  const result = await performCheckin(env, ACCOUNT, settings, { budgetMs: 1500, api })
  check('已领取次数', result.adSuccess, 2)
  check('标记待续跑', result.adPending, true)
  check('老账号判定', result.adTier, 'old')
  check('未领满 8 次', api.calls.ad < 8, true)
}
{
  // 预算充足且 8 次全部成功：正常收尾
  const env = fakeEnv()
  const api = fakeApi({ ad: () => ({ status: 1 }) })
  const result = await performCheckin(env, ACCOUNT, SETTINGS, { budgetMs: 60000, api })
  check('领满 8 次', result.adSuccess, 8)
  check('不标记待续跑', result.adPending, false)
  check('摘要显示 8 次', result.message.includes('广告 8 次'), true)
}
{
  // 第 5 次返回「次数已用尽」：正常结束
  const env = fakeEnv()
  const api = fakeApi({ ad: (n) => (n >= 5 ? { status: 0, error_code: 30002 } : { status: 1 }) })
  const result = await performCheckin(env, ACCOUNT, SETTINGS, { budgetMs: 60000, api })
  check('用尽前领取次数', result.adSuccess, 4)
  check('不标记待续跑', result.adPending, false)
  check('摘要显示今日已用尽', result.message.includes('今日已用尽'), true)
}

// ============ 2. 新老账号判定 ============

console.log('\n2. 新老账号判定')
{
  const env = fakeEnv()
  const api = fakeApi({ ad: () => ({ status: 0, error_code: 20028 }) })
  const result = await performCheckin(env, ACCOUNT, SETTINGS, { budgetMs: 60000, api })
  check('判定为新账号', result.adTier, 'new')
  check('新账号不算失败', result.ok, true)
  check('新账号无待续跑', result.adPending, false)
  check('摘要说明不适用', result.message.includes('广告不适用'), true)
  check('只调用一次广告接口', api.calls.ad, 1)
  check('无异常步骤', result.steps.filter((s) => !s.ok).length, 0)
}
{
  // 老账号：即使本次没领到，只要返回「次数已用尽」也判定为老账号
  const env = fakeEnv()
  const api = fakeApi({ ad: () => ({ status: 0, error_code: 30002 }) })
  const result = await performCheckin(env, ACCOUNT, SETTINGS, { budgetMs: 60000, api })
  check('判定为老账号', result.adTier, 'old')
}

// ============ 3. token 失效 ============

console.log('\n3. token 失效')
{
  const env = fakeEnv()
  const api = fakeApi({ detail: () => ({ status: 0, error_code: 20018 }) })
  const result = await performCheckin(env, ACCOUNT, SETTINGS, { budgetMs: 60000, api })
  check('标记 tokenInvalid', result.tokenInvalid, true)
  check('不继续听歌', api.calls.listen, 0)
  check('提示重新登录', result.message, 'token 已失效，请重新登录')
}

// ============ 4. 落库行为（执行不再卡住） ============

console.log('\n4. 落库与续跑状态')
{
  const env = fakeEnv()
  await store.saveSettings(env, { adRounds: 8, adIntervalSeconds: 30, catchUp: false })
  await store.updateAccounts(env, (list) => {
    list.push(store.newAccountRecord({ userid: '1000', token: 't', source: 'qr' }))
    return list
  })
  const id = (await store.getAccounts(env))[0].id
  const api = fakeApi({ ad: () => ({ status: 1 }) })

  const result = await runCheckinForAccount(env, id, { trigger: 'manual', budgetMs: 1000, api })
  check('返回待续跑', result.adPending, true)

  const account = (await store.getAccounts(env))[0]
  check('状态不是 running', account.lastStatus, 'success')
  check('已标记 pendingAds', account.pendingAds, true)
  check('未写 lastRunDate（等待续跑）', account.lastRunDate, '')
  check('失败次数未累加', account.attemptsToday || 0, 0)

  const view = store.publicAccount(account)
  check('对外暴露 pendingAds', view.pendingAds, true)
  check('对外状态正常', view.lastStatus, 'success')
}
{
  // 全部领完：写 lastRunDate，清除 pendingAds
  const env = fakeEnv()
  await store.saveSettings(env, { adRounds: 8, adIntervalSeconds: 0 })
  await store.updateAccounts(env, (list) => {
    list.push(store.newAccountRecord({ userid: '2000', token: 't', source: 'qr' }))
    return list
  })
  const id = (await store.getAccounts(env))[0].id
  const api = fakeApi({ ad: () => ({ status: 1 }) })

  await runCheckinForAccount(env, id, { trigger: 'manual', budgetMs: 60000, api })
  const account = (await store.getAccounts(env))[0]
  check('已写 lastRunDate', account.lastRunDate, shanghaiNow().date)
  check('已清除 pendingAds', account.pendingAds, false)
  check('状态为成功', account.lastStatus, 'success')
}
{
  // 失败应累计失败次数，用于限制补签重试
  const env = fakeEnv()
  await store.saveSettings(env, { adRounds: 8, adIntervalSeconds: 0 })
  await store.updateAccounts(env, (list) => {
    list.push(store.newAccountRecord({ userid: '4000', token: 't', source: 'qr' }))
    return list
  })
  const id = (await store.getAccounts(env))[0].id
  const api = fakeApi({ detail: () => { throw new Error('network down') } })

  await runCheckinForAccount(env, id, { trigger: 'cron', budgetMs: 5000, api })
  const account = (await store.getAccounts(env))[0]
  check('状态为失败', account.lastStatus, 'failed')
  check('累计失败次数', account.attemptsToday, 1)
  check('未写 lastRunDate（允许重试）', account.lastRunDate, '')
}

// ============ 5. 定时任务自动续跑 ============

console.log('\n5. 定时任务续跑')
{
  const env = fakeEnv()
  await store.saveSettings(env, { adRounds: 8, adIntervalSeconds: 0, catchUp: false })
  await store.updateAccounts(env, (list) => {
    // 签到时间设在凌晨，正常情况下不会被当前时间窗口匹配
    list.push(store.newAccountRecord({ userid: '3000', token: 't', source: 'qr', signTime: '00:01' }))
    return list
  })
  await store.updateAccounts(env, (list) => {
    list[0].pendingAds = true
    return list
  })

  const api = fakeApi({ ad: () => ({ status: 1 }) })
  const scheduled = await handleScheduled(env, { api })
  check('定时任务匹配到待续跑账号', scheduled.matched, 1)

  const account = (await store.getAccounts(env))[0]
  check('续跑完成并清除标记', account.pendingAds, false)
  check('续跑后写入 lastRunDate', account.lastRunDate, shanghaiNow().date)
  check('续跑领取 8 次', account.lastSteps.filter((s) => s.name.startsWith('广告领取') && s.ok).length >= 8, true)
}

// ============ 6. 卡住的 running 状态会被自动纠正 ============

console.log('\n6. 中断状态自愈')
{
  const stale = store.publicAccount({
    id: 'x', name: 'x', userid: '1', signTime: '01:15',
    lastStatus: 'running',
    lastRunAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  })
  check('超时的 running 显示为失败', stale.lastStatus, 'failed')
  check('给出中断提示', stale.lastMessage.includes('被中断'), true)

  const fresh = store.publicAccount({
    id: 'x', name: 'x', userid: '1', signTime: '01:15',
    lastStatus: 'running',
    lastRunAt: new Date().toISOString(),
  })
  check('正常执行中保持 running', fresh.lastStatus, 'running')
}

// ============ 7. 并发锁竞争（30002 GET LOCK FAIL） ============

console.log('\n7. 并发锁竞争处理')
{
  // 听歌首次返回锁错误、重试后成功
  const env = fakeEnv()
  let listenCalls = 0
  const api = fakeApi()
  api.reportListenSong = async () => {
    listenCalls++
    if (listenCalls === 1) return { status: 0, error_code: 30002, error_msg: 'GET LOCK FIAL' }
    return { status: 1 }
  }
  const result = await performCheckin(env, ACCOUNT, SETTINGS, { budgetMs: 60000, api })
  check('听歌重试后成功', result.listenState, 'claimed')
  check('听歌调用 2 次', listenCalls, 2)
  check('步骤记录重试', result.steps.find((s) => s.name === '听歌领取').message, '重试后领取成功')
  check('不算待重试', result.pendingClaim, false)
}
{
  // 听歌持续锁冲突：本次算未完成，交给定时任务重试
  const env = fakeEnv()
  let listenCalls = 0
  const api = fakeApi()
  api.reportListenSong = async () => {
    listenCalls++
    return { status: 0, error_code: 30002, error_msg: 'GET LOCK FIAL' }
  }
  const result = await performCheckin(env, ACCOUNT, SETTINGS, { budgetMs: 60000, api })
  check('听歌最终失败', result.listenState, 'failed')
  check('听歌调用 2 次后放弃', listenCalls, 2)
  check('标记待重试', result.pendingClaim, true)
  check('原文错误码保留', result.steps.find((s) => s.name === '听歌领取').message.includes('GET LOCK FIAL'), true)
}
{
  // 广告接口的 30002：带 LOCK 文案是并发锁 → 续跑；不带 LOCK 才是次数用尽
  const envLock = fakeEnv()
  const lockApi = fakeApi({ ad: () => ({ status: 0, error_code: 30002, error_msg: 'GET LOCK FIAL' }) })
  const lockResult = await performCheckin(envLock, ACCOUNT, SETTINGS, { budgetMs: 60000, api: lockApi })
  check('广告锁冲突标记续跑', lockResult.adPending, true)
  check('广告锁冲突不判为用尽', lockResult.message.includes('今日已用尽'), false)

  const envUsed = fakeEnv()
  const usedApi = fakeApi({ ad: () => ({ status: 0, error_code: 30002, error_msg: '今日次数已用尽' }) })
  const usedResult = await performCheckin(envUsed, ACCOUNT, SETTINGS, { budgetMs: 60000, api: usedApi })
  check('无 LOCK 文案判为用尽', usedResult.message.includes('今日已用尽'), true)
  check('不标记续跑', usedResult.adPending, false)
}

// ============ 8. 同账号并发保护 ============

console.log('\n8. 同账号并发保护')
{
  // 落库状态为 running 且很新 → 直接跳过，避免触发酷狗锁竞争
  const env = fakeEnv()
  await store.saveSettings(env, { adRounds: 8, adIntervalSeconds: 0 })
  await store.updateAccounts(env, (list) => {
    list.push(store.newAccountRecord({ userid: '5000', token: 't', source: 'qr' }))
    return list
  })
  const id = (await store.getAccounts(env))[0].id
  await store.updateAccounts(env, (list) => {
    list[0].lastStatus = 'running'
    list[0].lastRunAt = new Date().toISOString()
    return list
  })

  const api = fakeApi()
  const result = await runCheckinForAccount(env, id, { trigger: 'manual', budgetMs: 5000, api })
  check('跳过重复执行', result.skipped, true)
  check('提示正在执行中', result.message.includes('正在执行中'), true)
  check('未调用任何接口', api.calls.detail, 0)
}

console.log(`\n${'='.repeat(48)}`)
console.log(`通过 ${passed} 项，失败 ${failed} 项`)
if (failed) process.exitCode = 1
else console.log('签到流程与续跑逻辑正确 \u2705')
