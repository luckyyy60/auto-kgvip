/**
 * KV 数据层测试（加密存储 / 换 key 不丢数据 / 去重 / 脱敏）
 * 运行：node test/store.mjs
 */

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

/** 内存版 KV */
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
    _dump: (key) => map.get(key),
    _set: (key, value) => { map.set(key, value) },
  }
}

console.log('1. 加密写入 / 解密读取')
{
  const env = fakeEnv('secret-A')
  const account = store.newAccountRecord({ userid: '888', token: 'TOKEN_PLAINTEXT_A', name: '测试', signTime: '02:00', source: 'qr' })
  await store.updateAccounts(env, (list) => {
    list.push(account)
    return list
  })

  const raw = env._dump('kg:accounts')
  check('KV 中不出现明文 token', raw.includes('TOKEN_PLAINTEXT_A'), false)
  check('KV 中存在加密标记', raw.includes('"token":"v1:'), true)

  const list = await store.getAccounts(env)
  check('读取时自动解密', list[0].token, 'TOKEN_PLAINTEXT_A')
  check('写入字段完整', `${list[0].name}/${list[0].signTime}/${list[0].source}`, '测试/02:00/qr')
}

console.log('\n2. 更换 SECRET_KEY 不会清空数据')
{
  const env = fakeEnv('secret-A')
  await store.updateAccounts(env, (list) => {
    list.push(store.newAccountRecord({ userid: '999', token: 'TOKEN_B', name: '二号', source: 'sms' }))
    return list
  })
  const cipherBefore = JSON.parse(env._dump('kg:accounts'))[0].token

  // 用错误的 key 读取：token 解不出来，但只改了签到时间
  env.SECRET_KEY = 'secret-WRONG'
  const broken = await store.getAccounts(env)
  check('错误 key 下 token 为空', broken[0].token, '')

  await store.updateAccounts(env, (list) => {
    list[0].signTime = '09:30'
    return list
  })
  const afterRaw = JSON.parse(env._dump('kg:accounts'))[0]
  check('原始密文被保留（未被清空）', afterRaw.token, cipherBefore)
  check('其它字段正常写入', afterRaw.signTime, '09:30')

  // 换回正确 key，数据完好
  env.SECRET_KEY = 'secret-A'
  const restored = await store.getAccounts(env)
  check('换回正确 key 后可解密', restored[0].token, 'TOKEN_B')

  // 主动设置新 token 时应覆盖旧密文
  await store.updateAccounts(env, (list) => {
    list[0].token = 'TOKEN_NEW'
    return list
  })
  const replaced = await store.getAccounts(env)
  check('新 token 可正常覆盖', replaced[0].token, 'TOKEN_NEW')
}

console.log('\n3. 未配置密钥时明文存储')
{
  const env = fakeEnv('')
  env.SECRET_KEY = ''
  env.ADMIN_TOKEN = ''
  await store.updateAccounts(env, (list) => {
    list.push(store.newAccountRecord({ userid: '1', token: 'PLAIN_OK', source: 'cookie' }))
    return list
  })
  const raw = env._dump('kg:accounts')
  check('明文写入', raw.includes('PLAIN_OK'), true)
  const list = await store.getAccounts(env)
  check('明文读取', list[0].token, 'PLAIN_OK')
}

console.log('\n4. 账号去重与脱敏')
{
  const accounts = []
  accounts.push(store.newAccountRecord({ userid: '100', token: 't1', source: 'qr' }))
  const first = store.upsertAccount(accounts, store.newAccountRecord({ userid: '100', token: 't2', source: 'sms' }))
  check('相同 userid 不重复添加', accounts.length, 1)
  check('返回 created=false', first.created, false)
  check('保留原 id', first.account.id, accounts[0].id)
  check('更新为最新 token', first.account.token, 't2')

  store.upsertAccount(accounts, store.newAccountRecord({ userid: '200', token: 't3', source: 'qr' }))
  check('不同 userid 新增', accounts.length, 2)

  const view = store.publicAccount(accounts[0])
  check('对外不返回 token 字段', 'token' in view, false)
  check('对外返回 hasToken', view.hasToken, true)
}

console.log('\n5. 设置读写与边界保护')
{
  const env = fakeEnv()
  const defaults = await store.getSettings(env)
  check('默认签到时间', defaults.defaultSignTime, '01:15')
  check('默认广告次数', defaults.adRounds, 8)

  const saved = await store.saveSettings(env, { adRounds: 999, adIntervalSeconds: -5, catchUp: true })
  check('广告次数上限保护', saved.adRounds, 20)
  check('间隔下限保护', saved.adIntervalSeconds, 0)
  check('布尔值写入', saved.catchUp, true)
  check('未提供字段保持默认', saved.defaultSignTime, '01:15')

  const reread = await store.getSettings(env)
  check('设置已持久化', reread.catchUp, true)
}

console.log('\n6. 设备指纹持久化')
{
  const env = fakeEnv()
  const device = await store.getDevice(env)
  check('mid 为十进制大整数', /^\d+$/.test(device.mid), true)
  check('guid 为 32 位 md5', /^[0-9a-f]{32}$/.test(device.guid), true)
  const again = await store.getDevice(env)
  check('二次读取保持不变', again.mid, device.mid)
}

console.log('\n7. 历史下划线键自动迁移')
{
  // 模拟「导入了旧版 KV 数据」：只有 kg_accounts / kg_settings / kg_device / kg_logs
  const env = fakeEnv('secret-A')

  const seed = fakeEnv('secret-A')
  await store.updateAccounts(seed, (list) => {
    list.push(store.newAccountRecord({ userid: '777', token: 'OLD_TOKEN', name: '旧账号', source: 'qr' }))
    return list
  })
  env._set('kg_accounts', seed._dump('kg:accounts'))
  env._set('kg_settings', JSON.stringify({ defaultSignTime: '03:03', catchUp: true }))
  env._set('kg_device', JSON.stringify({ guid: 'abc', mid: '123', dev: 'DEV', mac: '02:00:00:00:00:00', webgl: '9', dfid: 'dfid-old' }))
  env._set('kg_logs', JSON.stringify([{ at: '2026-01-01T00:00:00.000Z', name: '旧日志', status: 'success' }]))

  check('正式键此时不存在', env._dump('kg:accounts'), undefined)

  const list = await store.getAccounts(env)
  check('读到旧键账号', list[0].token, 'OLD_TOKEN')
  check('迁移写入正式键', typeof env._dump('kg:accounts'), 'string')
  check('迁移删除旧键', env._dump('kg_accounts'), undefined)

  const settings = await store.getSettings(env)
  check('旧键设置生效', settings.defaultSignTime, '03:03')
  check('旧键设置已迁移', JSON.parse(env._dump('kg:settings')).catchUp, true)

  const device = await store.getDevice(env)
  check('旧键设备指纹生效', device.dfid, 'dfid-old')
  check('旧键设备已迁移', env._dump('kg_device'), undefined)

  const logs = await store.getLogs(env)
  check('旧键日志生效', logs[0].name, '旧日志')
  check('旧键日志已迁移', env._dump('kg_logs'), undefined)

  // 正式键存在时以正式键为准，不再回退历史键
  env._set('kg_accounts', JSON.stringify([{ userid: '1', token: 'STALE' }]))
  const preferred = await store.getAccounts(env)
  check('正式键优先于历史键', preferred[0].token, 'OLD_TOKEN')
}

console.log('\n8. 历史绑定名 KG_ACCOUNTS_KV 兼容')
{
  const env = fakeEnv()
  env.KG_KV = undefined
  env.KG_ACCOUNTS_KV = {
    get: async () => JSON.stringify([store.newAccountRecord({ userid: '555', token: 'T', source: 'qr' })]),
    put: async () => {},
    delete: async () => {},
  }
  const list = await store.getAccounts(env)
  check('从 KG_ACCOUNTS_KV 读取账号', list[0].userid, '555')
}

console.log('\n9. 设备指纹不重复写回（节省 KV 写额度）')
{
  const env = fakeEnv()
  const device = await store.getDevice(env)
  check('首次生成并持久化', !!(env._dump('kg:device') || env._dump('kg_device')), true)

  // 之后每次读取都不应再产生 KV 写
  const puts = []
  const rawPut = env.KG_KV.put
  env.KG_KV.put = async (key, value) => { puts.push(key); return rawPut(key, value) }

  await store.getDevice(env)
  check('完整设备指纹不再写回', puts.length, 0)

  // 历史遗留的额外字段 / 字段顺序变化也不该触发写回
  env._set('kg:device', JSON.stringify(Object.assign({ extra: 'x' }, JSON.parse(env._dump('kg:device')))))
  await store.getDevice(env)
  check('有额外字段也不写回', puts.length, 0)

  // 缺必要字段时必须补写一次
  env._set('kg:device', JSON.stringify({ guid: device.guid }))
  const repaired = await store.getDevice(env)
  check('缺字段时补写一次', puts.length, 1)
  check('补全后的 mid 可用', /^\d+$/.test(repaired.mid), true)
}

console.log(`\n${'='.repeat(48)}`)
console.log(`通过 ${passed} 项，失败 ${failed} 项`)
if (failed) process.exitCode = 1
else console.log('KV 数据层行为正确 \u2705')
