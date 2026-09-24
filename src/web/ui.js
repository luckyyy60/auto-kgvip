/**
 * 图形化控制台（单页、零依赖、离线可用）
 *
 * 说明：为了让页面可以直接内嵌在 Worker 中返回，前端脚本统一使用字符串拼接，
 * 不使用模板字符串，避免与外层模板冲突。
 */

/**
 * 控制台样式（保持扁平：无阴影、无渐变）
 * 配色与 404 页 / 登录页统一为同一套暗色系。
 */
export const CONSOLE_STYLES = `
  :root {
    color-scheme: dark;
    --bg: #121212;
    --panel: #1e1e1e;
    --panel-2: #262626;
    --panel-3: #2f2f2f;
    --border: #2a2a2a;
    --border-strong: #3a3a3a;
    --text: #e0e0e0;
    --text-dim: #a0a0a0;
    --muted: #707070;
    --primary: #3b82f6;
    --primary-hover: #2563eb;
    --green: #4ade80;
    --red: #f87171;
    --orange: #fbbf24;
    --radius: 8px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--primary); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .wrap { max-width: 1220px; margin: 0 auto; padding: 22px 16px 60px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
  .brand { display: flex; align-items: center; gap: 11px; }
  .logo {
    width: 38px; height: 38px; border-radius: var(--radius);
    background: var(--primary); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 17px;
  }
  h1 { font-size: 18px; margin: 0; letter-spacing: .2px; }
  h2 { font-size: 15px; margin: 0 0 12px; }
  .sub { color: var(--text-dim); font-size: 12px; }
  .muted { color: var(--muted); }

  /* 扁平化：无阴影、无渐变，仅靠 1px 描边与层次色区分 */
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 14px;
  }
  .card > h2:first-child { margin-top: 0; }

  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }

  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 16px; flex-wrap: wrap; }
  .tab {
    padding: 9px 14px; border: none; background: none;
    color: var(--text-dim); cursor: pointer; font-size: 14px;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }

  button { font-family: inherit; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    border: 1px solid var(--border-strong);
    background: var(--panel-2);
    color: var(--text);
    padding: 7px 14px; border-radius: var(--radius);
    cursor: pointer; font-size: 13px; line-height: 1.2;
    white-space: nowrap;
    transition: background-color .2s ease, border-color .2s ease, transform .1s ease;
  }
  .btn:hover:not(:disabled) { background: var(--panel-3); border-color: #4a4a4a; }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: var(--primary-hover); border-color: var(--primary-hover); }
  /* 可提交状态用绿色，明确提示「这里可以点」 */
  .btn-success { background: var(--green); border-color: var(--green); color: #10251a; font-weight: 600; }
  .btn-success:hover:not(:disabled) { background: #6ee7a0; border-color: #6ee7a0; }
  .btn-danger { color: var(--red); border-color: #4a2a2a; background: transparent; }
  .btn-danger:hover:not(:disabled) { background: #2a1a1a; border-color: #6b3a3a; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }

  input, select {
    padding: 8px 11px; border: 1px solid var(--border-strong);
    border-radius: var(--radius); font-size: 14px; font-family: inherit;
    background: #181818; color: var(--text); width: 100%;
  }
  input::placeholder { color: #6f6f6f; }
  input:focus, select:focus { outline: none; border-color: var(--primary); }
  .field { display: block; margin-bottom: 12px; }
  .field > span { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 5px; }

  table { width: 100%; border-collapse: collapse; min-width: 1010px; }
  th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--border); vertical-align: middle; white-space: nowrap; }
  th { font-size: 12px; color: var(--text-dim); font-weight: 600; background: #181818; }
  tr:last-child td { border-bottom: none; }

  .pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 4px; font-size: 12px; white-space: nowrap; }
  .pill-success { background: #14301f; color: var(--green); }
  .pill-failed { background: #33191b; color: var(--red); }
  .pill-invalid { background: #33260f; color: var(--orange); }
  .pill-running { background: #16243f; color: var(--primary); }
  .pill-idle, .pill-off { background: #262626; color: var(--text-dim); }

  .tag {
    display: inline-block; font-size: 11px; line-height: 1.5;
    border: 1px solid var(--border-strong); border-radius: 4px;
    padding: 0 6px; color: var(--text-dim); white-space: nowrap;
  }
  .tag-old { border-color: #2a4a3a; background: #14301f; color: var(--green); }
  .tag-new { border-color: #3a3a3a; background: #262626; color: var(--text-dim); }
  .tag-pending { border-color: #4a3a1f; background: #2c2313; color: var(--orange); }
  .tag-unknown { border-style: dashed; color: var(--muted); }

  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
  .truncate { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }

  /* 说明面板 */
  .notice {
    background: var(--panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    border-radius: var(--radius);
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .notice.warn { border-left-color: var(--orange); }
  .notice-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .notice-body p { margin: 0 0 6px; font-size: 12.5px; color: var(--text-dim); }
  .notice-body p:last-child { margin-bottom: 0; }
  .notice-body b { color: var(--text); font-weight: 600; }
  code { background: #262626; padding: 1px 5px; border-radius: 3px; font-size: 12px; color: #d4d4d4; }

  .mask { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 50; }
  .modal { background: var(--panel); border: 1px solid var(--border-strong); border-radius: var(--radius); width: 100%; max-width: 520px; max-height: 90vh; overflow: auto; padding: 20px; }
  .modal h3 { margin: 0 0 14px; font-size: 16px; }

  .qr-box { text-align: center; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: #181818; }
  .qr-box img { width: 200px; height: 200px; background: #fff; padding: 8px; border-radius: 4px; image-rendering: pixelated; }
  .qr-status { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 10px; color: var(--text-dim); font-size: 12.5px; }

  .steps { margin: 8px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--text-dim); }
  .steps li { margin-bottom: 3px; }
  .step-ok { color: var(--green); }
  .step-fail { color: var(--red); }

  .logs-item { border-bottom: 1px solid var(--border); padding: 12px 0; }
  .logs-item:last-child { border-bottom: none; }

  .toast {
    position: fixed; left: 50%; transform: translateX(-50%); bottom: 26px;
    background: var(--panel-3); border: 1px solid var(--border-strong);
    color: var(--text); padding: 10px 18px; border-radius: var(--radius);
    font-size: 13px; z-index: 99; max-width: 90vw;
  }
  .toast.error { border-color: #6b3a3e; background: #2a1a1c; color: #ffb4b4; }

  .empty { text-align: center; color: var(--muted); padding: 34px 0; }
  .center-load { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; color: var(--text-dim); }

  /* 加载动画 */
  .spinner {
    display: inline-block; width: 13px; height: 13px;
    border: 2px solid rgba(255,255,255,.18);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: kg-spin .7s linear infinite;
    flex: none;
  }
  .spinner-xs { width: 10px; height: 10px; border-width: 1.5px; }
  .spinner-lg { width: 26px; height: 26px; border-width: 2.5px; color: var(--primary); }
  .spinner-primary { color: var(--primary); }
  @keyframes kg-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 1.6s; } }

  @media (max-width: 640px) {
    .hide-sm { display: none; }
    th, td { padding: 9px 6px; }
    .wrap { padding: 16px 12px 48px; }
  }
`

/**
 * 登录 / 提示页样式：与 404 页保持一致（圆角卡片、柔和投影、渐变标题、实心按钮）。
 * 与控制台的扁平风格分开维护，避免两套设计互相干扰。
 */
export const AUTH_STYLES = `
  .auth-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .auth-card {
    background-color: #1e1e1e;
    border: 1px solid #2a2a2a;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    padding: 40px 30px;
    width: 100%;
    max-width: 400px;
    text-align: center;
  }
  .auth-badge {
    font-size: 4.5rem;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 20px;
    background: linear-gradient(135deg, #60a5fa, #3b82f6);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .auth-logo {
    display: flex;
    justify-content: center;
    margin-bottom: 20px;
  }
  .auth-logo svg { width: 76px; height: 76px; display: block; }
  .auth-card h1 {
    font-size: 1.5rem;
    margin: 0 0 12px;
    color: #e0e0e0;
  }
  .auth-card > p {
    color: #a0a0a0;
    font-size: 0.95rem;
    line-height: 1.6;
    margin: 0 0 26px;
  }
  .auth-input {
    width: 100%;
    background-color: #121212;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 0.95rem;
    font-family: inherit;
    padding: 12px 14px;
    margin-bottom: 12px;
    text-align: center;
  }
  .auth-input::placeholder { color: #6f6f6f; }
  .auth-input:focus { outline: none; border-color: #3b82f6; }
  .auth-input:disabled { opacity: .6; }
  .auth-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    background-color: #3b82f6;
    color: #ffffff;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 0.95rem;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background-color .2s ease, transform .1s ease;
  }
  .auth-btn:hover:not(:disabled) { background-color: #2563eb; }
  .auth-btn:active:not(:disabled) { transform: scale(.97); }
  .auth-btn:disabled { opacity: .7; cursor: not-allowed; }
  .auth-note {
    color: #707070;
    font-size: 12px;
    line-height: 1.6;
    margin-top: 18px;
  }
  .auth-code {
    background-color: #121212;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    padding: 12px;
    text-align: left;
    overflow-x: auto;
  }
  .auth-code code { background: none; color: #a0a0a0; font-size: 12px; white-space: nowrap; }
`

/** 独立的 404 页面（沿用用户提供的设计） */
export function renderNotFound() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="icon" href="${FAVICON}" />
    <title>404 - 页面未找到</title>
    <style>
      :root {
        --bg-color: #121212;
        --card-bg: #1e1e1e;
        --text-main: #e0e0e0;
        --text-sub: #a0a0a0;
        --accent: #3b82f6;
        --accent-hover: #2563eb;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background-color: var(--bg-color);
        color: var(--text-main);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
      }
      .container {
        background-color: var(--card-bg);
        padding: 40px 30px;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        text-align: center;
        max-width: 400px;
        width: 100%;
        border: 1px solid #2a2a2a;
      }
      .error-code {
        font-size: 6rem;
        font-weight: 800;
        line-height: 1;
        margin-bottom: 20px;
        background: linear-gradient(135deg, #f87171, #ef4444);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      h1 { font-size: 1.5rem; margin-bottom: 12px; color: var(--text-main); }
      p { color: var(--text-sub); font-size: 0.95rem; line-height: 1.6; margin-bottom: 30px; }
      .btn {
        display: inline-block;
        background-color: var(--accent);
        color: #ffffff;
        text-decoration: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: 500;
        transition: background-color 0.2s ease, transform 0.1s ease;
      }
      .btn:hover { background-color: var(--accent-hover); }
      .btn:active { transform: scale(0.97); }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="error-code">404</div>
      <h1>页面未找到</h1>
      <p>抱歉，您访问的内容不存在或已被移除。</p>
      <a href="/" class="btn">返回首页</a>
    </div>
  </body>
</html>`
}

/** robots.txt：控制台属于私有服务，禁止搜索引擎抓取 */
export const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n'

/** 白色 logo（圆环 + K），用于登录页；深色卡片上保证足够对比度 */
export const LOGO_SVG = '<svg viewBox="0 0 32 32" role="img" aria-label="logo">' +
  '<circle cx="16" cy="16" r="14.3" fill="none" stroke="#ffffff" stroke-width="1.7"/>' +
  '<path d="M11.7 8.4 V23.6 M21.6 8.6 L12.7 16 L21.6 23.4" fill="none" stroke="#ffffff"' +
  ' stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>'

/** 内联 SVG favicon（蓝色圆角方块 + 白色 K），避免额外请求 */
export const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%233b82f6'/%3E%3Cpath d='M11.7 8.4V23.6M21.6 8.6L12.7 16L21.6 23.4' fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"

const APP_JS = String.raw`
(function () {
  var TOKEN_KEY = 'kg_worker_token';
  var state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    status: null,
    accounts: [],
    logs: [],
    settings: null,
    tab: 'accounts',
    modal: null,
    modalTab: 'qr',
    qr: null,
    qrTimer: null,
    smsCountdown: 0,
    smsTimer: null,
    expanded: {},
    booting: true,
    loggingIn: false
  };

  var app = document.getElementById('app');

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function spinner(extraClass) {
    return '<span class="spinner ' + (extraClass || '') + '"></span>';
  }

  /** 按钮进入加载态，执行完成后恢复 */
  function withButtonLoading(node, task, loadingHtml) {
    if (!node) return Promise.resolve().then(task);
    var original = node.innerHTML;
    var wasDisabled = node.disabled;
    node.disabled = true;
    node.innerHTML = spinner() + '<span>' + (loadingHtml || '处理中…') + '</span>';
    function restore() {
      node.innerHTML = original;
      node.disabled = wasDisabled;
    }
    return Promise.resolve().then(task).then(
      function (result) { restore(); return result; },
      function (error) { restore(); throw error; }
    );
  }

  function api(path, options) {
    options = options || {};
    var headers = options.headers || {};
    if (state.token) headers['X-Admin-Token'] = state.token;
    if (options.body) headers['Content-Type'] = 'application/json';
    return fetch(path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.ok === false) {
          var err = new Error(data.message || data.error || ('请求失败 (' + res.status + ')'));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function toast(message, isError) {
    var node = document.createElement('div');
    node.className = 'toast' + (isError ? ' error' : '');
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(function () { node.remove(); }, 3000);
  }

  function formatTime(iso) {
    if (!iso) return '-';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  var STATUS_TEXT = {
    success: ['成功', 'pill-success'],
    failed: ['失败', 'pill-failed'],
    token_invalid: ['登录失效', 'pill-invalid'],
    running: ['执行中', 'pill-running'],
    idle: ['未执行', 'pill-idle']
  };

  function statusPill(status) {
    var item = STATUS_TEXT[status] || STATUS_TEXT.idle;
    var icon = status === 'running' ? spinner('spinner-xs') : '';
    return '<span class="pill ' + item[1] + '">' + icon + item[0] + '</span>';
  }

  /** 账号类型标签：老账号=有广告活动，新账号=无该活动 */
  function tierTag(tier) {
    if (tier === 'old') return '<span class="tag tag-old" title="拥有「看广告领 VIP」活动">老账号</span>';
    if (tier === 'new') return '<span class="tag tag-new" title="没有「看广告领 VIP」活动，仅能听歌领取">新账号</span>';
    return '<span class="tag tag-unknown" title="首次执行后自动判定">类型未知</span>';
  }
  // ============ 数据加载 ============

  function loadStatus() {
    return api('/api/status').then(function (data) {
      state.status = data;
      if (data.authenticated) return loadAll();
      return null;
    });
  }

  function loadAll() {
    return Promise.all([
      api('/api/accounts').then(function (d) { state.accounts = d.accounts || []; }),
      api('/api/settings').then(function (d) { state.settings = d.settings; }),
      api('/api/logs').then(function (d) { state.logs = d.logs || []; })
    ]);
  }

  function refresh(silent) {
    return loadAll().then(render).catch(function (error) {
      if (!silent) toast(error.message, true);
    });
  }

  // ============ 视图 ============

  function render() {
    if (state.booting) {
      app.innerHTML = '<div class="wrap"><div class="center-load">' + spinner('spinner-lg') + '<div>正在加载控制台…</div></div></div>';
      return;
    }
    if (!state.status) { app.innerHTML = '<div class="wrap"><div class="card empty">加载失败</div></div>'; return; }

    if (!state.status.adminConfigured) {
      app.innerHTML = authShell({
        badge: '!',
        title: '需要先配置管理口令',
        desc: '请在 Cloudflare Worker 中设置环境变量 ADMIN_TOKEN，否则接口出于安全考虑不可用。',
        extra: '<div class="auth-code"><code>npx wrangler secret put ADMIN_TOKEN</code></div>',
      });
      return;
    }

    if (!state.token || !state.status.authenticated) {
      app.innerHTML = loginView();
      bindLogin();
      return;
    }

    app.innerHTML = mainView();
    bindMain();
  }

  /** 登录 / 提示页外壳：与 404 页同一套视觉（圆角卡片 + 渐变标题 + 实心按钮） */
  function authShell(opts) {
    return '<div class="auth-wrap"><div class="auth-card">' +
      (opts.logo ? '<div class="auth-logo">' + opts.logo + '</div>' : '<div class="auth-badge">' + esc(opts.badge) + '</div>') +
      '<h1>' + esc(opts.title) + '</h1>' +
      '<p>' + esc(opts.desc) + '</p>' +
      (opts.body || '') +
      (opts.extra || '') +
      '</div></div>';
  }

  function loginView() {
    var button = state.loggingIn
      ? '<button class="auth-btn" disabled>' + spinner() + '<span>验证中…</span></button>'
      : '<button class="auth-btn" id="login-btn">进入控制台</button>';
    var body = '<input class="auth-input" id="token-input" type="password" placeholder="请输入 ADMIN_TOKEN"' +
      ' autocomplete="current-password"' + (state.loggingIn ? ' disabled' : '') + '>' +
      button;
    return authShell({
      logo: ${JSON.stringify(LOGO_SVG)},
      title: '酷狗概念版自动签到',
      desc: 'Cloudflare Workers 多账号托管控制台',
      body: body,
      extra: '<div class="auth-note">口令仅保存在本机浏览器 localStorage，用于调用你自己的 Worker 接口。</div>',
    });
  }

  function bindLogin() {
    var input = document.getElementById('token-input');
    var button = document.getElementById('login-btn');
    if (!input || !button) return;
    var submit = function () {
      var value = input.value.trim();
      if (!value) { toast('请输入管理口令', true); return; }
      state.loggingIn = true;
      state.token = value;
      render();
      api('/api/status').then(function (data) {
        state.status = data;
        if (!data.authenticated) {
          state.token = '';
          localStorage.removeItem(TOKEN_KEY);
          throw new Error('口令不正确');
        }
        localStorage.setItem(TOKEN_KEY, value);
        return loadAll();
      }).then(function () {
        state.loggingIn = false;
        render();
        toast('登录成功');
      }).catch(function (error) {
        state.loggingIn = false;
        state.status = Object.assign({}, state.status, { authenticated: false });
        render();
        toast(error.message, true);
      });
    };
    button.addEventListener('click', submit);
    input.addEventListener('keydown', function (event) { if (event.key === 'Enter') submit(); });
    input.focus();
  }

  function mainView() {
    var tabs = [['accounts', '账号列表'], ['logs', '运行日志'], ['settings', '设置']];
    var nav = tabs.map(function (item) {
      return '<button class="tab' + (state.tab === item[0] ? ' active' : '') + '" data-tab="' + item[0] + '">' + item[1] + '</button>';
    }).join('');

    var body = state.tab === 'accounts' ? accountsView() : state.tab === 'logs' ? logsView() : settingsView();

    return '<div class="wrap">' +
      '<div class="topbar"><div class="brand"><div class="logo">K</div><div><h1>酷狗概念版自动签到</h1>' +
      '<div class="sub">Cloudflare Workers · 多账号托管 · 北京时间 ' + esc((state.status && state.status.beijingTime) || '') + '</div></div></div>' +
      '<div class="row"><button class="btn" data-action="run-all">全部执行</button>' +
      '<button class="btn" data-action="logout">退出</button></div></div>' +
      '<div class="tabs">' + nav + '</div>' + body + '</div>' +
      (state.modal ? modalView() : '');
  }

  /** 首页说明：新老账号差异 + 手机号绑定多账号限制 + 客户端下载 */
  function noticesView() {
    return '<div class="notice">' +
      '<div class="notice-title">关于「新账号 / 老账号」</div>' +
      '<div class="notice-body">' +
      '<p><span class="tag tag-old">老账号</span> 拥有「看广告领 VIP」活动：除听歌领取外，每天还可通过广告额外领取（默认最多 8 次）。</p>' +
      '<p><span class="tag tag-new">新账号</span> 没有该活动：广告接口会返回 <code>20028</code>，每天只能靠听歌领取，属于账号本身的差异，不是执行失败。</p>' +
      '<p>系统会根据接口实际返回<b>自动判定并标记</b>每个账号的类型，无需手动设置；账号类型标注在下方列表的账号名旁。</p>' +
      '</div></div>' +
      '<div class="notice warn">' +
      '<div class="notice-title">关于「一个手机号绑定多个账号无法登录」</div>' +
      '<div class="notice-body">' +
      '<p>酷狗官方限制：同一个手机号绑定多个账号时，<b>无法使用手机验证码登录</b>（错误码 <code>34175</code>），这是平台规则而非本项目限制。</p>' +
      '<p>遇到该提示请改用 <b>扫码登录</b>：点击「添加账号 → 扫码登录」，用手机酷狗 App 扫描二维码并在手机上确认即可，不受手机号绑定数量限制。</p>' +
      '</div></div>' +
      '<div class="notice">' +
      '<div class="notice-title">关于「酷狗概念版客户端」</div>' +
      '<div class="notice-body">' +
      '<p>扫码登录与签到都需要使用 <b>酷狗概念版</b>（不是普通酷狗音乐）；领取结果可在 App 的「活动中心 → 天天签到领 VIP」中查看。</p>' +
      '<p>桌面版：<a href="https://github.com/hoowhoami/EchoMusic" target="_blank" rel="noopener noreferrer">EchoMusic</a>（GitHub 开源项目）。</p>' +
      '<p>手机版：推荐使用 <b>2.4.5</b> 版本。</p>' +
      '</div></div>';
  }

  function accountsView() {
    var head = noticesView() +
      '<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:12px;">' +
      '<h2 style="margin:0;">托管账号（' + state.accounts.length + '）</h2>' +
      '<button class="btn btn-primary btn-sm" data-action="open-add">+ 添加账号</button></div>';

    if (!state.accounts.length) {
      return head + '<div class="empty">还没有托管账号，点击右上角「添加账号」使用扫码 / 手机验证码 / Cookie 登录。</div></div>';
    }

    var rows = state.accounts.map(function (account) {
      var steps = '';
      if (state.expanded[account.id]) {
        var list = (account.lastSteps || []).map(function (step) {
          return '<li class="' + (step.ok ? 'step-ok' : 'step-fail') + '">' + (step.ok ? '\u2713' : '\u2717') + ' ' +
            esc(step.name) + '：' + esc(step.message) + '</li>';
        }).join('');
        steps = '<tr><td colspan="6"><ul class="steps">' + (list || '<li>暂无执行记录</li>') + '</ul></td></tr>';
      }
      var source = account.source === 'qr' ? '扫码' : account.source === 'sms' ? '验证码' : '手动';
      var vipDate = account.vipEndTime ? String(account.vipEndTime).slice(0, 10) : '';
      var subline = 'UID ' + esc(account.userid) + (vipDate ? ' · VIP 至 ' + esc(vipDate) : '');
      var pendingTag = account.pendingClaim
        ? '<span class="tag tag-pending" title="听歌未领到，定时任务会自动重试">待重试</span>'
        : account.pendingAds
          ? '<span class="tag tag-pending" title="广告次数未领完，定时任务会自动续跑">待续跑</span>'
          : '';
      return '<tr>' +
        '<td><div class="row" style="gap:6px;flex-wrap:nowrap;"><strong>' + esc(account.name) + '</strong>' +
        tierTag(account.adTier) + pendingTag + '<span class="tag">' + source + '</span></div>' +
        '<div class="sub mono truncate" title="' + subline + '">' + subline + '</div></td>' +
        '<td><div class="row" style="gap:6px;flex-wrap:nowrap;">' +
        '<input type="time" value="' + esc(account.signTime) + '" data-time-input data-id="' + account.id + '" style="width:98px;">' +
        '<button class="btn btn-sm" data-action="save-time" data-id="' + account.id + '" disabled title="确认修改签到时间">确认</button>' +
        '</div></td>' +
        '<td>' + statusPill(account.lastStatus) + '</td>' +
        '<td class="hide-sm" style="max-width:220px;"><div>' + esc(formatTime(account.lastRunAt)) + '</div>' +
        '<div class="sub truncate" title="' + esc(account.lastMessage) + '">' + esc(account.lastMessage) + '</div></td>' +
        '<td><label class="row" style="gap:6px;cursor:pointer;flex-wrap:nowrap;"><input type="checkbox" style="width:auto;" data-action="toggle" data-id="' + account.id + '"' + (account.enabled ? ' checked' : '') + '><span class="sub">启用</span></label></td>' +
        '<td><div class="row" style="gap:6px;flex-wrap:nowrap;">' +
        '<button class="btn btn-sm btn-primary" data-action="run" data-id="' + account.id + '">执行</button>' +
        '<button class="btn btn-sm" data-action="detail" data-id="' + account.id + '">日志</button>' +
        '<button class="btn btn-sm" data-action="refresh-token" data-id="' + account.id + '">续期</button>' +
        '<button class="btn btn-sm btn-danger" data-action="delete" data-id="' + account.id + '">删除</button>' +
        '</div></td></tr>' + steps;
    }).join('');

    return head + '<div style="overflow-x:auto;"><table><thead><tr>' +
      '<th>账号</th><th>签到时间</th><th>状态</th><th class="hide-sm">最近执行</th><th>启用</th><th>操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function logsView() {
    if (!state.logs.length) return '<div class="card"><div class="empty">暂无运行日志</div></div>';
    var items = state.logs.map(function (log) {
      var steps = (log.steps || []).map(function (step) {
        return '<li class="' + (step.ok ? 'step-ok' : 'step-fail') + '">' + (step.ok ? '\u2713' : '\u2717') + ' ' +
          esc(step.name) + '：' + esc(step.message) + '</li>';
      }).join('');
      return '<div class="logs-item">' +
        '<div class="row" style="justify-content:space-between;">' +
        '<div class="row" style="gap:6px;">' + statusPill(log.status) + '<strong>' + esc(log.name) + '</strong> ' +
        '<span class="tag">' + (log.trigger === 'cron' ? '定时' : log.trigger === 'refresh' ? '续期' : '手动') + '</span></div>' +
        '<span class="sub">' + esc(formatTime(log.at)) + '</span></div>' +
        '<div class="sub" style="margin-top:4px;">' + esc(log.message) + '</div>' +
        (steps ? '<ul class="steps">' + steps + '</ul>' : '') +
        '</div>';
    }).join('');
    return '<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px;">' +
      '<h2 style="margin:0;">运行日志</h2>' +
      '<button class="btn btn-sm btn-danger" data-action="clear-logs">清空日志</button></div>' + items + '</div>';
  }

  function settingsView() {
    var s = state.settings || {};
    return '<div class="card"><h2>全局设置</h2><div class="grid">' +
      '<div class="field"><span>新账号默认签到时间（北京时间）</span>' +
      '<div class="row" style="gap:6px;flex-wrap:nowrap;">' +
      '<input id="set-time" data-setting-time type="time" value="' + esc(s.defaultSignTime) + '" style="max-width:200px;">' +
      '<button class="btn" data-action="save-default-time" disabled title="确认修改默认签到时间">确认</button>' +
      '</div></div>' +
      '<label class="field"><span>每日广告领取次数（0-20）</span><input id="set-rounds" type="number" min="0" max="20" value="' + esc(s.adRounds) + '"></label>' +
      '<label class="field"><span>广告领取间隔（秒）</span><input id="set-interval" type="number" min="0" max="120" value="' + esc(s.adIntervalSeconds) + '"></label>' +
      '</div>' +
      '<label class="row" style="gap:8px;cursor:pointer;"><input id="set-refresh" type="checkbox" style="width:auto;"' + (s.autoRefreshToken ? ' checked' : '') + '><span>每周日自动刷新 token</span></label>' +
      '<label class="row" style="gap:8px;cursor:pointer;margin-top:8px;"><input id="set-catchup" type="checkbox" style="width:auto;"' + (s.catchUp ? ' checked' : '') + '><span>错过签到时间后自动补签</span></label>' +
      '<label class="row" style="gap:8px;cursor:pointer;margin-top:8px;"><input id="set-device" type="checkbox" style="width:auto;"' + (s.enableDeviceRegister ? ' checked' : '') + '><span>执行前调用设备注册接口获取 dfid（更接近真实客户端，可能因风控失败）</span></label>' +
      '<div class="row" style="margin-top:16px;"><button class="btn btn-primary" data-action="save-settings">保存设置</button></div>' +
      '<p class="muted" style="margin:14px 0 0;font-size:12px;">定时任务每 5 分钟检查一次：账号到达设定的签到时间且当天未执行过时，自动领取概念 VIP。' +
      (state.status && state.status.secretConfigured ? '' : ' 提示：未配置 SECRET_KEY，token 以明文保存在 KV 中。') + '</p>' +
      '</div>' +
      '<div class="card"><h2>关于</h2><p class="muted" style="margin:0;font-size:12.5px;">本项目仅供学习交流，请勿用于商业用途；音乐平台不易，请支持正版。</p></div>';
  }

  function modalView() {
    if (state.modal === 'add') return addModalView();
    return '';
  }

  function addModalView() {
    var tabs = [['qr', '扫码登录'], ['sms', '手机验证码'], ['cookie', 'Cookie 导入']];
    var nav = tabs.map(function (item) {
      return '<button class="tab' + (state.modalTab === item[0] ? ' active' : '') + '" data-modaltab="' + item[0] + '">' + item[1] + '</button>';
    }).join('');

    var body = '';
    if (state.modalTab === 'qr') {
      var qr = state.qr;
      var inner;
      if (!qr) {
        inner = '<button class="btn btn-primary" data-action="qr-create">获取登录二维码</button>';
      } else if (qr.loading) {
        inner = spinner('spinner-lg') + '<div class="qr-status">正在获取二维码…</div>';
      } else if (qr.done) {
        inner = '<div style="color:var(--green);font-weight:600;margin:12px 0;">登录成功，账号已添加</div>';
      } else if (qr.expired) {
        inner = '<div class="qr-status" style="color:var(--orange);">' + esc(qr.message || '二维码已过期') + '</div>' +
          '<div style="margin-top:12px;"><button class="btn btn-sm" data-action="qr-create">刷新二维码</button></div>';
      } else {
        inner = '<img src="' + esc(qr.img) + '" alt="二维码">' +
          '<div class="qr-status">' + spinner('spinner-xs spinner-primary') + esc(qr.message || '请使用酷狗 App 扫描二维码') + '</div>';
      }
      body = '<div class="qr-box">' + inner + '</div>' +
        '<p class="muted" style="margin-top:12px;font-size:12.5px;">用手机酷狗 App「扫一扫」扫码并在手机上确认，即可自动添加账号（推荐，不受手机号绑定多账号限制）。</p>';
    } else if (state.modalTab === 'sms') {
      body = '<label class="field"><span>手机号</span><div class="row" style="flex-wrap:nowrap;">' +
        '<input id="sms-phone" placeholder="请输入 11 位手机号" inputmode="numeric">' +
        '<button class="btn" id="sms-send"' + (state.smsCountdown > 0 ? ' disabled' : '') + ' style="white-space:nowrap;">' +
        (state.smsCountdown > 0 ? state.smsCountdown + 's' : '获取验证码') + '</button>' +
        '</div></label>' +
        '<label class="field"><span>短信验证码</span><input id="sms-code" placeholder="请输入 6 位验证码" inputmode="numeric"></label>' +
        '<label class="field"><span>备注名称（可选）</span><input id="sms-name" placeholder="例如：主账号"></label>' +
        '<label class="field"><span>每日签到时间</span><input id="sms-time" type="time" value="' + esc((state.settings && state.settings.defaultSignTime) || '01:15') + '"></label>' +
        '<button class="btn btn-primary" style="width:100%;" data-action="sms-login">登录并加入托管</button>' +
        '<p class="muted" style="margin-top:12px;font-size:12.5px;">注意：酷狗限制「一个手机号绑定多个账号」时无法使用验证码登录（错误码 34175），请改用<b>扫码登录</b>。</p>';
    } else {
      body = '<label class="field"><span>备注名称</span><input id="ck-name" placeholder="例如：小号"></label>' +
        '<label class="field"><span>userid</span><input id="ck-userid" placeholder="账号 userid（数字）"></label>' +
        '<label class="field"><span>token</span><input id="ck-token" placeholder="登录 token"></label>' +
        '<label class="field"><span>每日签到时间</span><input id="ck-time" type="time" value="' + esc((state.settings && state.settings.defaultSignTime) || '01:15') + '"></label>' +
        '<button class="btn btn-primary" style="width:100%;" data-action="cookie-save">保存账号</button>' +
        '<p class="muted" style="margin-top:12px;font-size:12.5px;">适合已经抓包拿到 <code>token</code> 与 <code>userid</code> 的场景。</p>';
    }

    return '<div class="mask" data-action="close-modal"><div class="modal" data-stop="1">' +
      '<h3>添加账号</h3><div class="tabs">' + nav + '</div>' + body +
      '<div class="row" style="margin-top:14px;"><button class="btn" style="width:100%;" data-action="close-modal">关闭</button></div>' +
      '</div></div>';
  }

  // ============ 事件绑定 ============

  function bindMain() {
    app.querySelectorAll('[data-tab]').forEach(function (node) {
      node.addEventListener('click', function () {
        state.tab = node.getAttribute('data-tab');
        render();
      });
    });

    app.querySelectorAll('[data-modaltab]').forEach(function (node) {
      node.addEventListener('click', function () {
        state.modalTab = node.getAttribute('data-modaltab');
        render();
      });
    });

    // 签到时间：改动后才启用「确认」按钮，由用户显式提交
    app.querySelectorAll('[data-time-input]').forEach(function (input) {
      var id = input.getAttribute('data-id');
      var account = state.accounts.filter(function (a) { return a.id === id; })[0];
      var original = account ? account.signTime : input.value;
      var button = app.querySelector('[data-action="save-time"][data-id="' + id + '"]');
      var sync = function () {
        var changed = !!input.value && input.value !== original;
        if (button) {
          button.disabled = !changed;
          // 可以点击时显示绿色，明确提示有改动待提交
          button.classList.toggle('btn-success', changed);
        }
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && button && !button.disabled) button.dispatchEvent(new window.Event('click'));
      });
      sync();
    });

    // 全局设置里的默认签到时间：同样需要确认，可提交时显示绿色
    app.querySelectorAll('[data-setting-time]').forEach(function (input) {
      var original = (state.settings && state.settings.defaultSignTime) || '';
      var button = app.querySelector('[data-action="save-default-time"]');
      var sync = function () {
        var changed = !!input.value && input.value !== original;
        if (button) {
          button.disabled = !changed;
          button.classList.toggle('btn-success', changed);
        }
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && button && !button.disabled) button.dispatchEvent(new window.Event('click'));
      });
      sync();
    });

    app.querySelectorAll('[data-action]').forEach(function (node) {
      var action = node.getAttribute('data-action');
      var id = node.getAttribute('data-id');

      if (action === 'save-time') {
        node.addEventListener('click', function () {
          var input = app.querySelector('[data-time-input][data-id="' + id + '"]');
          var value = input ? input.value : '';
          if (!value) { toast('请选择签到时间', true); return; }
          withButtonLoading(node, function () {
            return api('/api/accounts/' + id, { method: 'PATCH', body: { signTime: value } }).then(function () {
              toast('签到时间已更新为 ' + value);
              return refresh(true);
            });
          }, '保存中').catch(function (error) { toast(error.message, true); });
        });
        return;
      }
      if (action === 'save-default-time') {
        node.addEventListener('click', function () {
          var input = app.querySelector('[data-setting-time]');
          var value = input ? input.value : '';
          if (!value) { toast('请选择时间', true); return; }
          withButtonLoading(node, function () {
            return api('/api/settings', { method: 'POST', body: { defaultSignTime: value } }).then(function (data) {
              state.settings = data.settings;
              toast('默认签到时间已更新为 ' + value);
              render();
            });
          }, '保存中').catch(function (error) { toast(error.message, true); });
        });
        return;
      }
      if (action === 'toggle') {
        node.addEventListener('change', function () {
          api('/api/accounts/' + id, { method: 'PATCH', body: { enabled: node.checked } })
            .then(function () { toast(node.checked ? '已启用' : '已停用'); return refresh(true); })
            .catch(function (error) { toast(error.message, true); });
        });
        return;
      }

      node.addEventListener('click', function (event) {
        if (node.getAttribute('data-stop') === '1') { event.stopPropagation(); return; }
        handleAction(action, id, node, event);
      });
    });

    if (state.modalTab === 'sms' && state.modal === 'add') {
      var sendBtn = document.getElementById('sms-send');
      if (sendBtn) sendBtn.addEventListener('click', function () { sendSmsCode(sendBtn); });
    }
  }

  function handleAction(action, id, node, event) {
    if (action === 'logout') {
      state.token = '';
      localStorage.removeItem(TOKEN_KEY);
      // 保留 status 结构，只把鉴权状态置为 false，否则会渲染成「加载失败」
      state.status = Object.assign({}, state.status || {}, { authenticated: false });
      state.modal = null;
      state.booting = false;
      render();
      return;
    }
    if (action === 'open-add') {
      state.modal = 'add';
      state.modalTab = 'qr';
      state.qr = null;
      render();
      return;
    }
    if (action === 'close-modal') {
      if (event && event.target !== node && node.classList.contains('mask')) return;
      closeModal();
      return;
    }
    if (action === 'qr-create') { createQr(); return; }
    if (action === 'sms-login') { smsLogin(node); return; }
    if (action === 'cookie-save') { cookieSave(node); return; }
    if (action === 'run-all') {
      if (!confirm('立即执行全部启用账号？执行过程最多约 1 分钟。')) return;
      withButtonLoading(node, function () {
        return api('/api/accounts/run-all', { method: 'POST' }).then(function (data) {
          toast(data.message || '执行完成');
          return refresh(true);
        });
      }, '执行中…').catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'run') {
      withButtonLoading(node, function () {
        return api('/api/accounts/' + id + '/run', { method: 'POST' }).then(function (data) {
          // 直接拿到本次执行的真实结果，不再需要「稍后刷新」
          toast(data.message || '执行完成');
          return refresh(true);
        });
      }, '执行中…').catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'refresh-token') {
      withButtonLoading(node, function () {
        return api('/api/accounts/' + id + '/refresh-token', { method: 'POST' }).then(function (data) {
          toast(data.message || 'token 已续期');
          return refresh(true);
        });
      }).catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'delete') {
      if (!confirm('确认删除该账号？')) return;
      withButtonLoading(node, function () {
        return api('/api/accounts/' + id, { method: 'DELETE' }).then(function () {
          toast('已删除');
          return refresh(true);
        });
      }).catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'detail') {
      state.expanded[id] = !state.expanded[id];
      render();
      return;
    }
    if (action === 'clear-logs') {
      if (!confirm('确认清空全部日志？')) return;
      withButtonLoading(node, function () {
        return api('/api/logs', { method: 'DELETE' }).then(function () {
          toast('日志已清空');
          return refresh(true);
        });
      }).catch(function (error) { toast(error.message, true); });
      return;
    }
    if (action === 'save-settings') { saveSettings(node); return; }
  }

  function closeModal() {
    state.modal = null;
    state.qr = null;
    if (state.qrTimer) { clearInterval(state.qrTimer); state.qrTimer = null; }
    render();
  }

  function createQr() {
    if (state.qrTimer) { clearInterval(state.qrTimer); state.qrTimer = null; }
    state.qr = { loading: true };
    render();
    api('/api/auth/qr/create').then(function (data) {
      state.qr = {
        key: data.key,
        img: data.img,
        message: data.img ? '等待扫码…' : '请用酷狗 App 扫描：' + data.url
      };
      render();
      state.qrTimer = setInterval(pollQr, 2500);
    }).catch(function (error) {
      state.qr = { message: error.message, expired: true };
      render();
    });
  }

  function pollQr() {
    if (!state.qr || !state.qr.key || state.qr.done) return;
    api('/api/auth/qr/check?key=' + encodeURIComponent(state.qr.key)).then(function (data) {
      if (data.status === 4) {
        if (state.qrTimer) { clearInterval(state.qrTimer); state.qrTimer = null; }
        state.qr = { done: true, message: '登录成功' };
        render();
        toast('登录成功，账号已添加');
        return refresh(true);
      }
      if (data.status === 0) {
        if (state.qrTimer) { clearInterval(state.qrTimer); state.qrTimer = null; }
        state.qr = { message: '二维码已过期', expired: true };
        render();
        return;
      }
      if (data.message && state.qr && state.qr.message !== data.message && !state.qr.expired) {
        state.qr.message = data.message;
        render();
      }
    }).catch(function () { /* 轮询失败忽略，等待下一次 */ });
  }

  function startSmsCountdown() {
    state.smsCountdown = 60;
    if (state.smsTimer) clearInterval(state.smsTimer);
    state.smsTimer = setInterval(function () {
      state.smsCountdown -= 1;
      if (state.smsCountdown <= 0) {
        clearInterval(state.smsTimer);
        state.smsTimer = null;
        state.smsCountdown = 0;
      }
      var btn = document.getElementById('sms-send');
      if (btn) {
        btn.textContent = state.smsCountdown > 0 ? state.smsCountdown + 's' : '获取验证码';
        btn.disabled = state.smsCountdown > 0;
      }
    }, 1000);
  }

  function sendSmsCode(button) {
    var phone = (document.getElementById('sms-phone') || {}).value || '';
    if (!/^\d{6,15}$/.test(phone.trim())) { toast('请输入正确的手机号', true); return; }
    withButtonLoading(button, function () {
      return api('/api/auth/sms/send', { method: 'POST', body: { phone: phone.trim() } }).then(function () {
        toast('验证码已发送');
        startSmsCountdown();
      });
    }, '发送中').catch(function (error) {
      toast(error.message, true);
    });
  }

  function smsLogin(node) {
    var phone = ((document.getElementById('sms-phone') || {}).value || '').trim();
    var code = ((document.getElementById('sms-code') || {}).value || '').trim();
    var name = ((document.getElementById('sms-name') || {}).value || '').trim();
    var time = ((document.getElementById('sms-time') || {}).value || '').trim();
    if (!phone || !code) { toast('请填写手机号和验证码', true); return; }
    withButtonLoading(node, function () {
      return api('/api/auth/sms/login', { method: 'POST', body: { phone: phone, code: code, name: name, signTime: time } })
        .then(function (data) {
          toast(data.message || '登录成功');
          closeModal();
          return refresh(true);
        });
    }, '登录中…').catch(function (error) { toast(error.message, true); });
  }

  function cookieSave(node) {
    var name = ((document.getElementById('ck-name') || {}).value || '').trim();
    var userid = ((document.getElementById('ck-userid') || {}).value || '').trim();
    var token = ((document.getElementById('ck-token') || {}).value || '').trim();
    var time = ((document.getElementById('ck-time') || {}).value || '').trim();
    if (!token) { toast('请填写 token', true); return; }
    withButtonLoading(node, function () {
      return api('/api/accounts', { method: 'POST', body: { name: name, userid: userid, token: token, signTime: time } })
        .then(function (data) {
          toast(data.message || '保存成功');
          closeModal();
          return refresh(true);
        });
    }, '保存中…').catch(function (error) { toast(error.message, true); });
  }

  function saveSettings(node) {
    var body = {
      defaultSignTime: (document.getElementById('set-time') || {}).value,
      adRounds: Number((document.getElementById('set-rounds') || {}).value),
      adIntervalSeconds: Number((document.getElementById('set-interval') || {}).value),
      autoRefreshToken: !!(document.getElementById('set-refresh') || {}).checked,
      catchUp: !!(document.getElementById('set-catchup') || {}).checked,
      enableDeviceRegister: !!(document.getElementById('set-device') || {}).checked
    };
    withButtonLoading(node, function () {
      return api('/api/settings', { method: 'POST', body: body }).then(function (data) {
        state.settings = data.settings;
        toast('设置已保存');
        render();
      });
    }, '保存中…').catch(function (error) { toast(error.message, true); });
  }

  // ============ 启动 ============

  render();
  loadStatus().then(function () {
    state.booting = false;
    render();
  }).catch(function () {
    state.booting = false;
    render();
  });
  setInterval(function () {
    if (state.token && state.status && state.status.authenticated && !state.modal) refresh(true);
  }, 30000);
})();
`

export function renderPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="${FAVICON}">
<title>酷狗概念版自动签到</title>
<style>${CONSOLE_STYLES}${AUTH_STYLES}</style>
</head>
<body>
<div id="app"></div>
<script>${APP_JS}</script>
</body>
</html>`
}
