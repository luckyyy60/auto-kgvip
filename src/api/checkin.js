/**
 * 酷狗概念版 VIP 领取（签到）相关接口
 * 对应参考项目 api/module 中的 user_detail / youth_listen_song / youth_vip / user_vip_detail
 */

import { UA_REPORT } from '../lib/config.js'
import { deviceCookie } from '../lib/device.js'
import { kugouRequest } from '../lib/request.js'
import { rsaRawEncrypt } from '../lib/rsa.js'

/** 领取用广告位 ID（与原项目一致） */
const AD_ID = 12307537187
/** 听歌上报使用的歌曲 ID */
const MIX_SONG_ID = 666075191

/** 获取当前账号信息（同时用于校验 token 是否有效） */
export async function fetchUserDetail(device, account) {
  const clienttime = Math.floor(Date.now() / 1000)
  const pk = rsaRawEncrypt({ token: account.token, clienttime }).toUpperCase()

  const response = await kugouRequest({
    url: '/v3/get_my_info',
    method: 'POST',
    data: {
      visit_time: clienttime,
      usertype: 1,
      p: pk,
      userid: Number(account.userid) || 0,
    },
    params: { plat: 1 },
    encryptType: 'android',
    headers: { 'x-router': 'usercenter.kugou.com' },
    cookie: deviceCookie(device, account),
  })

  return response.body
}

/** 听歌领取 VIP */
export async function reportListenSong(device, account) {
  const response = await kugouRequest({
    url: '/youth/v2/report/listen_song',
    method: 'POST',
    data: { mixsongid: MIX_SONG_ID },
    params: { clientver: 10566 },
    encryptType: 'android',
    headers: {
      'user-agent': UA_REPORT,
      'content-type': 'application/json; charset=utf-8',
    },
    cookie: deviceCookie(device, account),
  })

  return response.body
}

/** 观看广告领取 VIP（每次领取 1 天，每天最多 8 次） */
export async function reportAdPlay(device, account) {
  const time = Date.now()
  const response = await kugouRequest({
    url: '/youth/v1/ad/play_report',
    method: 'POST',
    data: {
      ad_id: AD_ID,
      play_end: time,
      play_start: time - 30000,
    },
    encryptType: 'android',
    cookie: deviceCookie(device, account),
  })

  return response.body
}

/** 查询概念版 VIP 到期时间 */
export async function fetchVipDetail(device, account) {
  const response = await kugouRequest({
    baseURL: 'https://kugouvip.kugou.com',
    url: '/v1/get_union_vip',
    method: 'GET',
    params: { busi_type: 'concept' },
    encryptType: 'android',
    cookie: deviceCookie(device, account),
  })

  return response.body
}
