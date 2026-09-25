/**
 * 控制台页面预览生成器
 *
 * 生成一个注入了假数据的静态 HTML，方便直接用浏览器打开查看 UI 效果，
 * 无需启动 Worker、无需登录。
 *
 *   node test/preview.mjs            # 输出到 /tmp/kg-preview.html
 *   open /tmp/kg-preview.html
 *
 * 也可以用无头 Chrome 直接截图：
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --headless=new --disable-gpu --user-data-dir=/tmp/kg-chrome \
 *     --window-size=1200,1500 --virtual-time-budget=4000 \
 *     --screenshot=/tmp/kg-preview.png file:///tmp/kg-preview.html
 */

import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { renderNotFound, renderPage } from '../src/web/ui.js'

/**
 * 生成一张「看起来像二维码」的占位图（含三个定位角 + 定时图案），
 * 仅用于截图展示，不是真实可扫描的二维码。
 */
function fakeQrDataUrl(modules = 29, seedInit = 20240925) {
  let seed = seedInit
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const isFinder = (r, c, br, bc) => {
    const dr = r - br
    const dc = c - bc
    if (dr < 0 || dr > 6 || dc < 0 || dc > 6) return null
    const ring = dr === 0 || dr === 6 || dc === 0 || dc === 6
    const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
    return ring || core
  }
  let path = ''
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      const finder = isFinder(r, c, 0, 0) ?? isFinder(r, c, 0, modules - 7) ?? isFinder(r, c, modules - 7, 0)
      const timing = (r === 6 || c === 6)
      const dark = finder === null ? (timing ? (r + c) % 2 === 0 : rnd() > 0.52) : finder
      if (dark) path += `M${c} ${r}h1v1h-1z`
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules} ${modules}" shape-rendering="crispEdges">` +
    `<rect width="${modules}" height="${modules}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#121212"/></svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

const FAKE_QR = fakeQrDataUrl()

const ACCOUNTS = [
  {
    id: 'acc_demo_1',
    name: '雾散风起',
    userid: '800000001',
    enabled: true,
    signTime: '01:15',
    source: 'sms',
    adTier: 'new',
    lastRunAt: '2025-01-01T17:15:00.000Z',
    lastStatus: 'success',
    lastMessage: '听歌领取成功 · 广告不适用（新账号）',
    lastSteps: [
      { name: '登录校验', ok: true, message: '账号：雾散风起' },
      { name: '听歌领取', ok: true, message: '领取成功' },
      { name: '广告领取', ok: true, message: '该账号无广告领取活动（新账号）' },
      { name: 'VIP 信息', ok: true, message: '到期时间：2025-01-20 16:06:15' },
    ],
    vipEndTime: '2025-01-20 16:06:15',
    hasToken: true,
  },
  {
    id: 'acc_demo_2',
    name: '夜航星',
    userid: '800000002',
    enabled: true,
    signTime: '01:15',
    source: 'qr',
    adTier: 'old',
    lastRunAt: '2025-01-01T17:45:50.000Z',
    lastStatus: 'success',
    lastMessage: '听歌今日已领取 · 广告 0 次（今日已用尽）',
    lastSteps: [
      { name: '登录校验', ok: true, message: '账号：夜航星' },
      { name: '听歌领取', ok: true, message: '今日已领取' },
      { name: '广告领取 #1', ok: true, message: '今日次数已用尽' },
      { name: 'VIP 信息', ok: true, message: '到期时间：2025-01-20 16:06:15' },
    ],
    vipEndTime: '2025-01-20 16:06:15',
    hasToken: true,
  },
  {
    id: 'acc_demo_3',
    name: '新号（执行中）',
    userid: '7777777',
    enabled: true,
    signTime: '09:30',
    source: 'qr',
    adTier: 'unknown',
    pendingAds: true,
    lastRunAt: '2025-01-01T17:50:00.000Z',
    lastStatus: 'running',
    lastMessage: '执行中…',
    lastSteps: [],
    hasToken: true,
  },
  {
    id: 'acc_demo_4',
    name: '失效账号',
    userid: '9999999',
    enabled: false,
    signTime: '20:00',
    source: 'cookie',
    adTier: 'unknown',
    lastRunAt: '2025-01-01T12:00:00.000Z',
    lastStatus: 'token_invalid',
    lastMessage: 'token 已失效，请重新登录',
    lastSteps: [{ name: '登录校验', ok: false, message: 'token 失效或账号异常（error_code=20018）' }],
    hasToken: true,
  },
]

const LOGS = [
  {
    at: '2025-01-01T17:45:50.000Z', name: '夜航星', trigger: 'cron', status: 'success',
    message: '听歌今日已领取 · 广告 0 次（今日已用尽）',
    steps: [
      { name: '登录校验', ok: true, message: '账号：夜航星' },
      { name: '听歌领取', ok: true, message: '今日已领取' },
      { name: '广告领取 #1', ok: true, message: '今日次数已用尽' },
    ],
  },
  {
    at: '2025-01-01T17:15:00.000Z', name: '雾散风起', trigger: 'cron', status: 'success',
    message: '听歌领取成功 · 广告不适用（新账号）',
    steps: [
      { name: '听歌领取', ok: true, message: '领取成功' },
      { name: '广告领取', ok: true, message: '该账号无广告领取活动（新账号）' },
    ],
  },
  {
    at: '2025-01-01T12:00:00.000Z', name: '失效账号', trigger: 'manual', status: 'token_invalid',
    message: 'token 已失效，请重新登录',
    steps: [{ name: '登录校验', ok: false, message: 'token 失效或账号异常（error_code=20018）' }],
  },
]

const SETTINGS = {
  defaultSignTime: '01:15',
  adRounds: 8,
  adIntervalSeconds: 30,
  autoRefreshToken: true,
  catchUp: false,
  enableDeviceRegister: false,
}

const STUB = `
<script>
(function () {
  if (!window.__KG_NO_LOGIN__) localStorage.setItem('kg_worker_token', 'preview-token');
  var ACCOUNTS = ${JSON.stringify(ACCOUNTS)};
  var LOGS = ${JSON.stringify(LOGS)};
  var SETTINGS = ${JSON.stringify(SETTINGS)};
  window.fetch = function (path) {
    var url = String(path);
    var body = { ok: true };
    if (url.indexOf('/api/status') === 0) {
      body = { ok: true, version: 'preview', adminConfigured: true, secretConfigured: true, authenticated: true, beijingTime: '2025-01-02 01:15' };
    } else if (url.indexOf('/api/accounts') === 0) {
      body = { ok: true, accounts: ACCOUNTS };
    } else if (url.indexOf('/api/settings') === 0) {
      body = { ok: true, settings: SETTINGS };
    } else if (url.indexOf('/api/logs') === 0) {
      body = { ok: true, logs: LOGS };
    } else if (url.indexOf('/api/auth/qr/create') === 0) {
      body = { ok: true, key: 'k', img: ${JSON.stringify(FAKE_QR)}, url: 'https://h5.kugou.com/x' };
    }
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(body); } });
  };
  window.confirm = function () { return true; };
})();
</script>
`

/**
 * 生成预览页 HTML
 * @param {'console'|'login'|'404'|'qr'|'sms'|'settings'|'logs'} mode
 */
export function buildPreview(mode = 'console') {
  if (mode === '404') return renderNotFound()

  const injection = {
    // 打开「添加账号」弹窗（默认扫码页签）
    qr: "document.querySelector('[data-action=\"open-add\"]').click();" +
      "setTimeout(function(){document.querySelector('[data-action=\"qr-create\"]').click();},250);",
    // 打开弹窗并切到手机验证码
    sms: "document.querySelector('[data-action=\"open-add\"]').click();" +
      "setTimeout(function(){document.querySelector('[data-modaltab=\"sms\"]').click();},200);",
    settings: "document.querySelector('[data-tab=\"settings\"]').click();",
    logs: "document.querySelector('[data-tab=\"logs\"]').click();",
  }[mode] || ''

  const noLogin = mode === 'login' ? '<script>window.__KG_NO_LOGIN__=1;<\/script>' : ''
  const tail = injection
    ? '<script>setTimeout(function(){' + injection + '},450);<\/script>'
    : ''

  let page = renderPage().replace('<script>', noLogin + STUB + '<script>')
  if (tail) page = page.replace('</body>', tail + '</body>')
  return page
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  const out = process.argv[2] || '/tmp/kg-preview.html'
  const mode = process.argv[3] || 'console'
  writeFileSync(out, buildPreview(mode))
  console.log(`预览页已生成：${out}（模式：${mode}）`)
  console.log('可用模式：console | login | 404 | qr | sms | settings | logs')
}
