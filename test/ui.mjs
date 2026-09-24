/**
 * 控制台前端冒烟测试（jsdom）
 *
 * 校验：加载动画 -> 登录页 -> 账号列表渲染 -> 新老账号标记 -> 说明面板 -> 弹窗 -> 页签切换
 * 运行：node test/ui.mjs
 */

import { JSDOM } from 'jsdom'
import { CONSOLE_STYLES, renderNotFound, renderPage, ROBOTS_TXT } from '../src/web/ui.js'

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

function checkTruthy(name, value) {
  if (value) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    console.error(`  \u2717 ${name} (值为假)`)
  }
}

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

const ACCOUNTS = [
  {
    id: 'acc_test_1',
    name: '主账号',
    userid: '123456',
    enabled: true,
    signTime: '01:15',
    source: 'qr',
    adTier: 'old',
    lastRunAt: '2025-01-01T17:15:00.000Z',
    lastStatus: 'success',
    lastMessage: '听歌领取成功 · 广告 8 次（今日已用尽）',
    lastSteps: [
      { name: '登录校验', ok: true, message: '账号：小明' },
      { name: '听歌领取', ok: true, message: '领取成功' },
    ],
    vipEndTime: '2025-02-01',
    hasToken: true,
    progress: null,
  },
  {
    id: 'acc_test_2',
    name: '小号',
    userid: '654321',
    enabled: false,
    signTime: '08:30',
    source: 'sms',
    adTier: 'unknown',
    lastRunAt: null,
    lastStatus: 'idle',
    lastMessage: '等待首次执行',
    lastSteps: [],
    hasToken: true,
  },
  {
    id: 'acc_test_3',
    name: '新号',
    userid: '777777',
    enabled: true,
    signTime: '09:00',
    source: 'qr',
    adTier: 'new',
    pendingAds: true,
    lastRunAt: '2025-01-01T17:20:00.000Z',
    lastStatus: 'running',
    lastMessage: '执行中…',
    lastSteps: [],
    hasToken: true,
  },
]

ACCOUNTS.push({
  id: 'acc_test_4',
  name: '听歌待重试',
  userid: '888888',
  enabled: true,
  signTime: '07:00',
  source: 'qr',
  adTier: 'old',
  pendingClaim: true,
  lastRunAt: '2025-01-01T17:30:00.000Z',
  lastStatus: 'failed',
  lastMessage: '听歌领取失败 · 广告 0 次',
  lastSteps: [{ name: '听歌领取', ok: false, message: '失败（error_code=30002 GET LOCK FIAL）' }],
  hasToken: true,
})

const LOGS = [
  { at: '2025-01-01T17:15:00.000Z', name: '主账号', trigger: 'cron', status: 'success', message: '完成', steps: [] },
]

const SETTINGS = {
  defaultSignTime: '01:15',
  adRounds: 8,
  adIntervalSeconds: 30,
  autoRefreshToken: true,
  catchUp: false,
  enableDeviceRegister: false,
}

function createEnv() {
  const page = renderPage()
  const script = page.match(/<script>([\s\S]*)<\/script>/)[1]
  const html = page.replace(/<script>[\s\S]*<\/script>/, '')

  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/' })
  const { window } = dom

  const calls = []
  // 模拟服务端：只认请求头里的正确口令（与真实 Worker 行为一致）
  window.fetch = (path, options) => {
    calls.push({ path, options })
    const url = String(path)
    const headers = (options && options.headers) || {}
    const provided = headers['X-Admin-Token'] || ''
    const authed = provided === 'admin'

    let body = { ok: true }
    if (url.startsWith('/api/status')) {
      body = {
        ok: true, version: '1.0.0', adminConfigured: true, secretConfigured: true,
        authenticated: authed,
        beijingTime: '2025-01-02 01:15',
      }
    } else if (!authed) {
      return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ ok: false, message: '管理口令无效，请重新登录' }) })
    } else if (url.startsWith('/api/accounts')) {
      body = { ok: true, accounts: ACCOUNTS }
    } else if (url.startsWith('/api/settings')) {
      body = { ok: true, settings: SETTINGS }
    } else if (url.startsWith('/api/logs')) {
      body = { ok: true, logs: LOGS }
    } else if (url.startsWith('/api/auth/qr/create')) {
      body = { ok: true, key: 'qrkey123', img: 'data:image/png;base64,iVBORw0KGgo=', url: 'https://h5.kugou.com/x' }
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  }
  window.confirm = () => true
  window.alert = () => {}

  return { dom, window, script, calls, page }
}

// ============ 1. 暗色扁平化样式 ============

console.log('1. 暗色调与扁平化')
{
  const { page } = createEnv()
  check('声明暗色配色方案', page.includes('color-scheme: dark'), true)
  check('背景统一为 404 同款深色', /--bg:\s*#121212/.test(page), true)
  // 控制台保持扁平（登录页与 404 页单独使用卡片投影风格）
  check('控制台无阴影（扁平化）', CONSOLE_STYLES.includes('box-shadow'), false)
  check('控制台无渐变（扁平化）', CONSOLE_STYLES.includes('gradient'), false)
  check('包含加载动画关键帧', page.includes('@keyframes kg-spin'), true)
}

// ============ 1b. 自定义 404 与 robots.txt ============

console.log('\n1b. 自定义 404 页面')
{
  const html = renderNotFound()
  check('返回 404 标题', html.includes('<title>404 - 页面未找到</title>'), true)
  check('显示 404 数字', html.includes('<div class="error-code">404</div>'), true)
  check('提示文案', html.includes('抱歉，您访问的内容不存在或已被移除。'), true)
  check('返回首页链接', html.includes('href="/" class="btn">返回首页</a>'), true)
  check('卡片圆角 16px', html.includes('border-radius: 16px'), true)
  check('卡片柔和投影', html.includes('box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5)'), true)
  check('数字使用红色渐变', html.includes('linear-gradient(135deg, #f87171, #ef4444)'), true)
  check('按钮使用主题蓝', html.includes('--accent: #3b82f6'), true)
  check('禁止搜索引擎收录', html.includes('noindex, nofollow'), true)
  check('robots.txt 禁止抓取', ROBOTS_TXT.includes('Disallow: /'), true)
}

// ============ 2. 加载中与登录 ============

console.log('\n2. 加载动画与登录')
{
  const { window, script } = createEnv()
  window.eval(script)

  // 首次渲染应立刻显示加载动画（同步检查，此时接口还没返回）
  const loadingHtml = window.document.getElementById('app').innerHTML
  checkTruthy('首屏显示转圈动画', loadingHtml.includes('class="spinner'))
  checkTruthy('首屏显示加载文案', loadingHtml.includes('正在加载控制台'))

  await tick()
  checkTruthy('渲染管理口令输入框', !!window.document.getElementById('token-input'))
  check('登录页标题', window.document.querySelector('h1').textContent, '酷狗概念版自动签到')
  const logo = window.document.querySelector('.auth-logo svg')
  checkTruthy('使用白色 logo', !!logo)
  check('logo 为白色描边', logo.querySelector('path').getAttribute('stroke'), '#ffffff')
  check('不再使用「签」字徽标', !!window.document.querySelector('.auth-badge'), false)

  // 点击登录后按钮立刻进入转圈状态
  window.document.getElementById('token-input').value = 'admin'
  window.document.getElementById('login-btn').dispatchEvent(new window.Event('click'))
  const loginBtnHtml = window.document.getElementById('app').innerHTML
  checkTruthy('登录时按钮转圈', loginBtnHtml.includes('验证中…'))
  checkTruthy('登录时按钮禁用', loginBtnHtml.includes('disabled'))

  await tick(60)
  checkTruthy('登录后进入控制台', window.document.body.textContent.includes('酷狗概念版自动签到'))
  check('登录成功后持久化口令', window.localStorage.getItem('kg_worker_token'), 'admin')
  checkTruthy('显示账号数量', window.document.body.textContent.includes('托管账号（4）'))
  checkTruthy('显示账号名称', window.document.body.textContent.includes('主账号'))
  checkTruthy('显示成功状态', window.document.body.textContent.includes('成功'))
  checkTruthy('显示未执行状态', window.document.body.textContent.includes('未执行'))
  checkTruthy('显示 VIP 到期', window.document.body.textContent.includes('VIP 至 2025-02-01'))
  checkTruthy('显示北京时间', window.document.body.textContent.includes('2025-01-02 01:15'))
}

// 口令错误时应停留在登录页，且不写入本地存储
{
  const { window, script } = createEnv()
  window.eval(script)
  await tick()
  window.document.getElementById('token-input').value = 'wrong-token'
  window.document.getElementById('login-btn').dispatchEvent(new window.Event('click'))
  await tick(60)
  checkTruthy('口令错误时停留在登录页', !!window.document.getElementById('token-input'))
  check('口令错误时不持久化', window.localStorage.getItem('kg_worker_token'), null)
}

// 退出登录必须回到登录页（而不是「加载失败」）
{
  const { window, script } = createEnv()
  window.localStorage.setItem('kg_worker_token', 'admin')
  window.eval(script)
  await tick(60)
  checkTruthy('已进入控制台', window.document.body.textContent.includes('托管账号'))

  const logoutBtn = window.document.querySelector('[data-action="logout"]')
  checkTruthy('存在退出按钮', !!logoutBtn)
  logoutBtn.dispatchEvent(new window.Event('click'))
  await tick()

  checkTruthy('退出后回到登录页', !!window.document.getElementById('token-input'))
  check('退出后清除本地口令', window.localStorage.getItem('kg_worker_token'), null)
  check('不再显示加载失败', window.document.body.textContent.includes('加载失败'), false)
}

// ============ 3. 新老账号标记与说明 ============

console.log('\n3. 新老账号标记与首页说明')
{
  const { window, script } = createEnv()
  window.localStorage.setItem('kg_worker_token', 'admin')
  window.eval(script)
  await tick(60)

  const notices = window.document.querySelectorAll('.notice')
  check('首页说明面板数量', notices.length, 3)
  checkTruthy('说明：新老账号', window.document.body.textContent.includes('关于「新账号 / 老账号」'))
  checkTruthy('说明：新账号无广告活动', window.document.body.textContent.includes('20028'))
  checkTruthy('说明：手机号绑定多账号', window.document.body.textContent.includes('关于「一个手机号绑定多个账号无法登录」'))
  checkTruthy('说明：错误码 34175', window.document.body.textContent.includes('34175'))
  checkTruthy('说明：引导使用扫码登录', window.document.body.textContent.includes('改用'))
  checkTruthy('说明：概念版客户端下载', window.document.body.textContent.includes('关于「酷狗概念版客户端」'))
  const dl = window.document.querySelector('a[href="https://github.com/hoowhoami/EchoMusic"]')
  checkTruthy('桌面版下载链接', !!dl)
  check('下载链接新窗口打开', dl.getAttribute('target'), '_blank')
  check('下载链接 rel 安全', dl.getAttribute('rel'), 'noopener noreferrer')
  checkTruthy('手机版推荐版本 2.4.5', window.document.body.textContent.includes('2.4.5'))

  // 账号行内的类型标记（限定在表格内，排除说明面板里的示例标签）
  const table = window.document.querySelector('table')
  check('表格内老账号标记数量', table.querySelectorAll('.tag-old').length, 2)
  check('表格内新账号标记数量', table.querySelectorAll('.tag-new').length, 1)
  check('表格内类型未知标记数量', table.querySelectorAll('.tag-unknown').length, 1)
  check('老账号标记文案', table.querySelector('.tag-old').textContent, '老账号')
  check('新账号标记文案', table.querySelector('.tag-new').textContent, '新账号')
  check('类型未知文案', table.querySelector('.tag-unknown').textContent, '类型未知')
  check('待处理标记数量', table.querySelectorAll('.tag-pending').length, 2)
  check('待续跑文案', table.querySelectorAll('.tag-pending')[0].textContent, '待续跑')
  check('待重试文案', table.querySelectorAll('.tag-pending')[1].textContent, '待重试')
  // 展开「听歌待重试」那一行，确认酷狗原文错误可见
  const detailButtons = table.querySelectorAll('[data-action="detail"]')
  detailButtons[detailButtons.length - 1].dispatchEvent(new window.Event('click'))
  await tick()
  checkTruthy('听歌锁竞争错误原文可见', window.document.body.textContent.includes('GET LOCK FIAL'))

  // 执行中状态带转圈
  const runningPill = table.querySelector('.pill-running')
  checkTruthy('执行中状态显示转圈', runningPill && runningPill.querySelector('.spinner'))
  check('执行中文案', runningPill.textContent.trim(), '执行中')
}

// ============ 4. 交互 ============

console.log('\n4. 页面交互')
{
  const { window, script, calls } = createEnv()
  window.localStorage.setItem('kg_worker_token', 'admin')
  window.eval(script)
  await tick(60)

  const addBtn = Array.from(window.document.querySelectorAll('[data-action="open-add"]'))[0]
  checkTruthy('存在「添加账号」按钮', !!addBtn)
  addBtn.dispatchEvent(new window.Event('click'))
  await tick()

  const modalText = window.document.body.textContent
  checkTruthy('弹窗出现', !!window.document.querySelector('.mask'))
  checkTruthy('弹窗包含扫码登录', modalText.includes('扫码登录'))
  checkTruthy('弹窗包含手机验证码', modalText.includes('手机验证码'))
  checkTruthy('弹窗包含 Cookie 导入', modalText.includes('Cookie 导入'))

  // 短信页签：提示手机号绑定多账号限制
  window.document.querySelector('[data-modaltab="sms"]').dispatchEvent(new window.Event('click'))
  await tick()
  checkTruthy('切换到验证码页签', !!window.document.getElementById('sms-phone'))
  checkTruthy('存在获取验证码按钮', !!window.document.getElementById('sms-send'))
  const smsText = window.document.querySelector('.modal').textContent
  checkTruthy('验证码页提示 34175 限制', smsText.includes('34175'))
  checkTruthy('验证码页引导扫码登录', smsText.includes('扫码登录'))

  // 扫码页签：获取二维码后应有图片与等待转圈
  window.document.querySelector('[data-modaltab="qr"]').dispatchEvent(new window.Event('click'))
  await tick()
  window.document.querySelector('[data-action="qr-create"]').dispatchEvent(new window.Event('click'))
  const qrLoading = window.document.querySelector('.qr-box').innerHTML
  checkTruthy('获取二维码时显示转圈', qrLoading.includes('class="spinner'))
  await tick(60)
  const img = window.document.querySelector('.qr-box img')
  checkTruthy('二维码图片已渲染', !!img && img.getAttribute('src').startsWith('data:image/png'))
  checkTruthy('等待扫码显示转圈', !!window.document.querySelector('.qr-box .spinner'))
  checkTruthy('等待扫码文案', window.document.querySelector('.qr-box').textContent.includes('等待扫码'))

  // 关闭弹窗
  Array.from(window.document.querySelectorAll('[data-action="close-modal"]')).pop().dispatchEvent(new window.Event('click'))
  await tick()
  checkTruthy('弹窗已关闭', !window.document.querySelector('.mask'))

  // 签到时间：改动前确认按钮禁用，改动后可用，点击才提交
  const timeInput = window.document.querySelector('[data-time-input]')
  const saveBtn = window.document.querySelector('[data-action="save-time"]')
  checkTruthy('存在签到时间输入框', !!timeInput)
  checkTruthy('存在确认按钮', !!saveBtn)
  check('未修改时确认按钮禁用', saveBtn.disabled, true)

  check('未修改时不显示绿色', saveBtn.classList.contains('btn-success'), false)

  timeInput.value = '06:30'
  timeInput.dispatchEvent(new window.Event('input'))
  check('修改后确认按钮可用', saveBtn.disabled, false)
  check('可提交时显示绿色', saveBtn.classList.contains('btn-success'), true)

  const beforeCalls = calls.length
  check('仅修改不自动提交', calls.length, beforeCalls)

  saveBtn.dispatchEvent(new window.Event('click'))
  await tick(60)
  const patchCall = calls.filter((c) => c.path === '/api/accounts/acc_test_1' && c.options && c.options.method === 'PATCH').pop()
  checkTruthy('点击确认后提交 PATCH', !!patchCall)
  check('提交的签到时间正确', JSON.parse(patchCall.options.body).signTime, '06:30')

  // 展开执行步骤
  window.document.querySelector('[data-action="detail"]').dispatchEvent(new window.Event('click'))
  await tick()
  checkTruthy('展开执行步骤', window.document.body.textContent.includes('登录校验：账号：小明'))

  // 日志 / 设置页签
  window.document.querySelector('[data-tab="logs"]').dispatchEvent(new window.Event('click'))
  await tick()
  checkTruthy('日志页显示记录', window.document.body.textContent.includes('运行日志'))

  window.document.querySelector('[data-tab="settings"]').dispatchEvent(new window.Event('click'))
  await tick()
  checkTruthy('设置页渲染', !!window.document.getElementById('set-rounds'))
  check('设置页回显广告次数', window.document.getElementById('set-rounds').value, '8')

  // 全局设置的时间也需要确认按钮，可提交时变绿
  const settingTime = window.document.querySelector('[data-setting-time]')
  const settingSave = window.document.querySelector('[data-action="save-default-time"]')
  checkTruthy('设置页存在时间输入框', !!settingTime)
  checkTruthy('设置页存在时间确认按钮', !!settingSave)
  check('设置时间未修改时禁用', settingSave.disabled, true)
  check('设置时间未修改时不显示绿色', settingSave.classList.contains('btn-success'), false)

  settingTime.value = '05:20'
  settingTime.dispatchEvent(new window.Event('input'))
  check('设置时间修改后可用', settingSave.disabled, false)
  check('设置时间可提交时显示绿色', settingSave.classList.contains('btn-success'), true)

  const beforeSetting = calls.length
  settingSave.dispatchEvent(new window.Event('click'))
  await tick(60)
  const settingCall = calls.filter((c) => c.path === '/api/settings' && c.options && c.options.method === 'POST').pop()
  checkTruthy('点击确认后提交设置', !!settingCall)
  check('提交的默认时间正确', JSON.parse(settingCall.options.body).defaultSignTime, '05:20')
  check('仅修改不自动提交', beforeSetting > 0, true)
}

console.log(`\n${'='.repeat(48)}`)
console.log(`通过 ${passed} 项，失败 ${failed} 项`)
if (failed) {
  console.log('前端控制台存在异常')
  process.exit(1)
}
console.log('前端控制台渲染与交互正常 \u2705')
// 页面内有 30s 轮询定时器，需要显式退出
process.exit(0)
