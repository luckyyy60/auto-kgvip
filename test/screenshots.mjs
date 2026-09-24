/**
 * 功能截图生成器
 *
 * 用无头 Chrome 渲染各界面并输出 PNG，供 README 展示使用。
 *
 *   node test/screenshots.mjs [输出目录]         # 默认 screenshots/
 *   CHROME_PATH=/path/to/chrome node test/screenshots.mjs [输出目录]
 *
 * 截图内容为注入的演示数据，不含任何真实账号信息。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPreview } from './preview.mjs'

const CHROME = process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const OUT_DIR = process.argv[2] || 'screenshots'
const SCALE = process.env.SHOT_SCALE || '2'

/** 截图清单：文件名 -> 预览模式 / 视口尺寸 */
const SHOTS = [
  { file: '01-login.png', mode: 'login', width: 1000, height: 700, title: '登录页' },
  { file: '02-dashboard.png', mode: 'console', width: 1300, height: 1150, title: '账号列表（控制台首页）' },
  { file: '03-qr-login.png', mode: 'qr', width: 1100, height: 820, title: '扫码登录' },
  { file: '04-sms-login.png', mode: 'sms', width: 1100, height: 880, title: '手机验证码登录' },
  { file: '05-logs.png', mode: 'logs', width: 1180, height: 780, title: '运行日志' },
  { file: '06-settings.png', mode: 'settings', width: 1180, height: 720, title: '全局设置' },
  { file: '07-404.png', mode: '404', width: 1000, height: 700, title: '自定义 404' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 启动 Chrome 截图，等到文件落地后结束进程 */
async function capture(shot, index) {
  const htmlPath = join(tmpdir(), `kg-shot-${index}.html`)
  const pngPath = join(OUT_DIR, shot.file)
  const profile = join(tmpdir(), `kg-shot-profile-${index}`)

  writeFileSync(htmlPath, buildPreview(shot.mode))
  rmSync(pngPath, { force: true })
  rmSync(profile, { recursive: true, force: true })

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-extensions',
    '--hide-scrollbars',
    `--force-device-scale-factor=${SCALE}`,
    `--user-data-dir=${profile}`,
    `--window-size=${shot.width},${shot.height}`,
    '--virtual-time-budget=4000',
    `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ]

  const child = spawn(CHROME, args, { stdio: 'ignore', detached: true })

  const deadline = Date.now() + 40000
  while (Date.now() < deadline) {
    if (existsSync(pngPath) && statSync(pngPath).size > 1024) break
    await sleep(250)
  }
  await sleep(400)

  try { process.kill(-child.pid, 'SIGKILL') } catch { /* 进程可能已退出 */ }
  try { child.kill('SIGKILL') } catch { /* 同上 */ }

  rmSync(profile, { recursive: true, force: true })
  rmSync(htmlPath, { force: true })

  if (!existsSync(pngPath)) throw new Error(`${shot.file} 生成失败`)
  return statSync(pngPath).size
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`未找到 Chrome：${CHROME}`)
    console.error('可通过环境变量指定：CHROME_PATH=/path/to/chrome node test/screenshots.mjs')
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`输出目录：${OUT_DIR}（缩放 ${SCALE}x）\n`)

  let total = 0
  for (let i = 0; i < SHOTS.length; i++) {
    const shot = SHOTS[i]
    process.stdout.write(`${shot.file.padEnd(20)} ${shot.title} … `)
    try {
      const size = await capture(shot, i)
      total += size
      console.log(`${(size / 1024).toFixed(0)} KB`)
    } catch (error) {
      console.log(`失败：${error.message}`)
      process.exitCode = 1
    }
  }

  console.log(`\n共 ${SHOTS.length} 张，合计 ${(total / 1024 / 1024).toFixed(2)} MB`)
  console.log('所有截图均为演示数据，不含真实账号信息')
}

main()
