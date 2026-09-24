/**
 * 定时调度逻辑测试（时间匹配 / 补签判定 / 日期换算）
 * 运行：node test/schedule.mjs
 */

import { isPast, isTimeMatch, shanghaiNow } from '../src/tasks.js'

let passed = 0
let failed = 0

function check(name, actual, expected) {
  if (actual === expected) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    console.error(`  \u2717 ${name}\n      实际: ${actual}\n      期望: ${expected}`)
  }
}

console.log('1. 北京时间换算')
{
  // 2025-01-01T17:15:00Z => 北京时间 2025-01-02 01:15（周四）
  const t = shanghaiNow(new Date('2025-01-01T17:15:00Z'))
  check('日期', t.date, '2025-01-02')
  check('时间', t.time, '01:15')
  check('分钟数', t.minutes, 75)
  check('星期（0=周日）', t.weekday, 4)

  const sunday = shanghaiNow(new Date('2025-01-05T02:00:00Z'))
  check('周日识别', sunday.weekday, 0)

  // 跨日边界：UTC 16:00 => 北京 00:00 次日
  const midnight = shanghaiNow(new Date('2025-01-01T16:00:00Z'))
  check('跨日边界日期', midnight.date, '2025-01-02')
  check('跨日边界时间', midnight.time, '00:00')
}

console.log('\n2. 签到时间匹配（窗口 ±5 分钟）')
{
  check('精确命中', isTimeMatch('01:15', 75), true)
  check('提前 4 分钟', isTimeMatch('01:15', 71), true)
  check('推迟 4 分钟', isTimeMatch('01:15', 79), true)
  check('提前 5 分钟（不命中）', isTimeMatch('01:15', 70), false)
  check('推迟 5 分钟（不命中）', isTimeMatch('01:15', 80), false)
  check('相差很远', isTimeMatch('01:15', 600), false)
  // 跨零点环绕：23:58 与 00:01 相差 3 分钟
  check('跨零点环绕', isTimeMatch('23:58', 1), true)
  check('跨零点环绕2', isTimeMatch('00:01', 1439), true)
}

console.log('\n3. 补签判定')
{
  check('已过签到时间', isPast('01:15', 200), true)
  check('恰好到点', isPast('01:15', 75), true)
  check('尚未到点', isPast('01:15', 30), false)
  check('跨零点（00:30 相对 01:15）', isPast('01:15', 30), false)
}

console.log(`\n${'='.repeat(48)}`)
console.log(`通过 ${passed} 项，失败 ${failed} 项`)
if (failed) process.exitCode = 1
else console.log('调度时间逻辑正确 \u2705')
