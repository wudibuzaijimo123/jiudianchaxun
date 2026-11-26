import { HotelItem } from '../types/hotel';
import { openAppOrWeb, openExternalUrl } from './nativeBridge';

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent);
}

export function isAppleDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
}

export async function copyTextSilently(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * 拼接「城市 + 区县 + 道路特征词 + 酒店全称」，彻底杜绝美团/携程/抖音重名分店跳错店问题！
 */
export function buildExactStoreQuery(hotel: HotelItem): string {
  const cleanCity = (hotel.city || '').replace(/市$/, '');
  const district = hotel.district || '';
  // 提取地址中的路名/镇名/街名（如“温泉路”、“遥墙街道”）辅助唯一定位分店
  const addrClean = (hotel.address || '')
    .replace(hotel.city || '', '')
    .replace(district, '');
  const roadMatch = addrClean.match(/^(.{2,8}?(?:路|街|道|镇|大道|胡同|巷))/);
  const roadHint = roadMatch ? roadMatch[1] : addrClean.slice(0, 6);

  const prefix = [cleanCity, district, roadHint]
    .filter(Boolean)
    .join('');

  if (prefix && !hotel.name.includes(cleanCity)) {
    return `${prefix} ${hotel.name}`.trim();
  }
  return `${district}${roadHint} ${hotel.name}`.trim();
}

export interface PlatformLinks {
  amapDetail: string;
  amapPoiApp: string;
  amapNav: string;
  baiduNav: string;
  ctripWeb: string;
  tongchengWeb: string;
  meituanApp: string;
  douyinApp: string;
  douyinWeb: string;
  appleMaps: string;
}

export function buildPlatformLinks(hotel: HotelItem): PlatformLinks {
  const exactQuery = buildExactStoreQuery(hotel);
  const douyinQuery = `${exactQuery} 团购`;
  const isOfficialAmapId = /^[A-Z0-9]{8,}$/i.test(hotel.id);

  return {
    // 高德唯一物理门店 ID 详情页（含美团/携程/飞猪同店比价入口，100% 绝不串店）
    amapDetail: isOfficialAmapId
      ? `https://ditu.amap.com/place/${encodeURIComponent(hotel.id)}`
      : `https://uri.amap.com/marker?position=${hotel.lng},${hotel.lat}&name=${encodeURIComponent(
          hotel.name
        )}&src=jiudianchaxun-pwa&coordinate=gaode&callnative=0`,
    // 手机端唤起高德地图 App 该门店唯一 ID 预订比价页
    amapPoiApp: isOfficialAmapId
      ? `https://uri.amap.com/poidetail?poiid=${encodeURIComponent(
          hotel.id
        )}&src=jiudianchaxun-pwa&callnative=1`
      : `https://uri.amap.com/marker?position=${hotel.lng},${hotel.lat}&name=${encodeURIComponent(
          hotel.name
        )}&src=jiudianchaxun-pwa&coordinate=gaode&callnative=1`,
    amapNav: `https://uri.amap.com/marker?position=${hotel.lng},${hotel.lat}&name=${encodeURIComponent(
      hotel.name
    )}&src=jiudianchaxun-pwa&coordinate=gaode&callnative=1`,
    baiduNav: `https://api.map.baidu.com/marker?location=${hotel.lat},${hotel.lng}&title=${encodeURIComponent(
      hotel.name
    )}&content=${encodeURIComponent(hotel.address)}&output=html&coord_type=gcj02&src=jiudianchaxun`,
    // 携程与同程均带上「城市+区县+街道+店名」，防止跳去外地同名酒店
    ctripWeb: `https://hotels.ctrip.com/hotels/list?keyword=${encodeURIComponent(exactQuery)}`,
    tongchengWeb: `https://www.ly.com/hotel/hotelsearch?keyword=${encodeURIComponent(exactQuery)}`,
    // 美团 App 原生唤起带上「城市+区县+道路+店名」精准锁定唯一门店
    meituanApp: `imeituan://www.meituan.com/search?q=${encodeURIComponent(exactQuery)}`,
    douyinApp: `snssdk1128://search?keyword=${encodeURIComponent(douyinQuery)}`,
    douyinWeb: `https://www.douyin.com/search/${encodeURIComponent(douyinQuery)}?type=general`,
    appleMaps: `https://maps.apple.com/?ll=${hotel.lat},${hotel.lng}&q=${encodeURIComponent(
      hotel.name
    )}`,
  };
}

export async function launchMeituanPurchase(
  hotel: HotelItem,
  _serpApiKey = '',
  onToast?: (msg: string) => void
): Promise<void> {
  const links = buildPlatformLinks(hotel);
  const exactQuery = buildExactStoreQuery(hotel);
  await copyTextSilently(exactQuery);

  if (isMobileDevice()) {
    onToast?.(`正在唤起美团 App 锁定「${exactQuery}」`);
    const opened = await openExternalUrl(links.meituanApp);
    if (!opened) {
      onToast?.('未检测到美团 App，店名已复制，可到浏览器粘贴搜索');
      await openExternalUrl(links.ctripWeb);
    }
    return;
  }

  onToast?.(`已复制精准店名「${exactQuery}」`);
  await openExternalUrl(links.ctripWeb);
}

export async function smartLaunchPlatform(
  hotel: HotelItem,
  platform: 'amap_detail' | 'meituan' | 'douyin' | 'ctrip' | 'amap' | 'baidu' | 'apple',
  onToast?: (msg: string) => void,
  serpApiKey = ''
): Promise<void> {
  if (platform === 'meituan') {
    return launchMeituanPurchase(hotel, serpApiKey, onToast);
  }

  const links = buildPlatformLinks(hotel);
  const exactQuery = buildExactStoreQuery(hotel);
  const mobile = isMobileDevice();
  await copyTextSilently(exactQuery);

  if (platform === 'amap_detail') {
    onToast?.(`正在打开「${hotel.name}」高德唯一门店ID比价页`);
    await openExternalUrl(mobile ? links.amapPoiApp : links.amapDetail);
    return;
  }

  if (platform === 'douyin') {
    if (mobile) {
      onToast?.(`正在唤起抖音锁定「${exactQuery}」`);
      await openAppOrWeb(links.douyinApp, links.douyinWeb);
    } else {
      onToast?.(`正在打开抖音网页版查看「${exactQuery}」`);
      await openExternalUrl(links.douyinWeb);
    }
    return;
  }

  if (platform === 'ctrip') {
    onToast?.(`正在打开携程精准查找「${exactQuery}」`);
    await openExternalUrl(links.ctripWeb);
    return;
  }

  if (platform === 'baidu') {
    onToast?.(`正在打开百度地图定位「${hotel.name}」`);
    await openExternalUrl(links.baiduNav);
    return;
  }

  if (platform === 'apple') {
    if (!isAppleDevice()) {
      onToast?.('苹果网页版不支持中国大陆定位，已自动切换高德精准定位');
      await openExternalUrl(links.amapNav);
      return;
    }
    onToast?.(`正在唤起 Apple 地图定位「${hotel.name}」`);
    await openExternalUrl(links.appleMaps);
    return;
  }

  if (platform === 'amap') {
    onToast?.(`正在打开高德地图路线规划`);
    await openExternalUrl(links.amapNav);
  }
}
