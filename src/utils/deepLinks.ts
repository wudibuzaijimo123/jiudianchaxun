import { HotelItem } from '../types/hotel';

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

export interface PlatformLinks {
  amapDetail: string;
  amapNav: string;
  baiduNav: string;
  ctripWeb: string;
  meituanApp: string;
  meituanPc: string;
  douyinApp: string;
  douyinWeb: string;
  appleMaps: string;
}

export function buildPlatformLinks(hotel: HotelItem): PlatformLinks {
  const cleanCity = (hotel.city || '').replace(/市$/, '');
  const searchQuery = cleanCity ? `${cleanCity} ${hotel.name}` : hotel.name;
  const douyinQuery = `${searchQuery} 酒店团购`;
  const isOfficialAmapId = /^[A-Z0-9]{8,}$/i.test(hotel.id);

  return {
    amapDetail: isOfficialAmapId
      ? `https://ditu.amap.com/place/${encodeURIComponent(hotel.id)}`
      : `https://uri.amap.com/marker?position=${hotel.lng},${hotel.lat}&name=${encodeURIComponent(
          hotel.name
        )}&src=jiudianchaxun-pwa&coordinate=gaode&callnative=0`,
    amapNav: `https://uri.amap.com/marker?position=${hotel.lng},${hotel.lat}&name=${encodeURIComponent(
      hotel.name
    )}&src=jiudianchaxun-pwa&coordinate=gaode&callnative=1`,
    // 百度地图官方打点与全景导航（Windows 电脑网页端 100% 可用，支持自动纠偏 gcj02）
    baiduNav: `https://api.map.baidu.com/marker?location=${hotel.lat},${hotel.lng}&title=${encodeURIComponent(
      hotel.name
    )}&content=${encodeURIComponent(hotel.address)}&output=html&coord_type=gcj02&src=jiudianchaxun`,
    ctripWeb: `https://hotels.ctrip.com/hotels/list?keyword=${encodeURIComponent(hotel.name)}`,
    // 美团 App 唤起协议
    meituanApp: `imeituan://www.meituan.com/search?q=${encodeURIComponent(hotel.name)}`,
    meituanPc: `https://hotel.meituan.com/`,
    douyinApp: `snssdk1128://search?keyword=${encodeURIComponent(douyinQuery)}`,
    douyinWeb: `https://www.douyin.com/search/${encodeURIComponent(douyinQuery)}?type=general`,
    // iOS / macOS 原生 Apple 地图标准坐标打点参数（去掉会导致解析报错的复杂 address 参数）
    appleMaps: `https://maps.apple.com/?ll=${hotel.lat},${hotel.lng}&q=${encodeURIComponent(
      hotel.name
    )}`,
  };
}

/**
 * 直达美团预订购买页
 */
export async function launchMeituanPurchase(
  hotel: HotelItem,
  serpApiKey = '',
  onToast?: (msg: string) => void
): Promise<void> {
  const links = buildPlatformLinks(hotel);
  await copyTextSilently(hotel.name);

  if (isMobileDevice()) {
    onToast?.(`正在唤起美团 App 直达「${hotel.name}」购买页`);
    window.location.href = links.meituanApp;
    return;
  }

  const win = window.open('about:blank', '_blank');
  if (win) {
    win.document.write(
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>正在直达美团购买页...</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:90vh;background:#fffbeb;color:#1c1917;"><h3>🛒 正在为您直达「${hotel.name}」美团购买页面（店名已自动复制）...</h3></body></html>`
    );
  }

  try {
    if (serpApiKey.trim()) {
      const resp = await fetch(
        `/api/meituan-url?api_key=${encodeURIComponent(
          serpApiKey.trim()
        )}&hotel=${encodeURIComponent(hotel.name)}&city=${encodeURIComponent(hotel.city || '')}`
      );
      const data = await resp.json();
      if (data?.url) {
        if (data.matched) {
          onToast?.(`已精准直达「${hotel.name}」美团门店购买页！`);
        } else {
          onToast?.(`已打开美团酒店频道（店名「${hotel.name}」已复制，直接 Ctrl+V 搜索购买）`);
        }
        if (win) {
          win.location.href = data.url;
        } else {
          window.open(data.url, '_blank', 'noopener,noreferrer');
        }
        return;
      }
    }
  } catch {
    // ignore
  }

  onToast?.(`已打开美团酒店官网（店名「${hotel.name}」已自动复制，粘贴即买）`);
  if (win) {
    win.location.href = links.meituanPc;
  } else {
    window.open(links.meituanPc, '_blank', 'noopener,noreferrer');
  }
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
  const mobile = isMobileDevice();
  await copyTextSilently(hotel.name);

  if (platform === 'amap_detail') {
    onToast?.(`正在打开「${hotel.name}」高德全网房型聚合详情`);
    window.open(links.amapDetail, '_blank', 'noopener,noreferrer');
    return;
  }

  if (platform === 'douyin') {
    if (mobile) {
      onToast?.(`正在唤起抖音 App 搜「${hotel.name}」团购券`);
      window.location.href = links.douyinApp;
    } else {
      onToast?.(`正在打开抖音网页版查看「${hotel.name}」团购与实拍`);
      window.open(links.douyinWeb, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  if (platform === 'ctrip') {
    onToast?.(`正在打开携程查看「${hotel.name}」预订页`);
    window.open(links.ctripWeb, '_blank', 'noopener,noreferrer');
    return;
  }

  if (platform === 'baidu') {
    onToast?.(`正在打开百度地图定位「${hotel.name}」`);
    window.open(links.baiduNav, '_blank', 'noopener,noreferrer');
    return;
  }

  if (platform === 'apple') {
    if (!isAppleDevice()) {
      onToast?.('苹果网页版地图不支持中国大陆定位，已自动为您切换高德精准定位');
      window.open(links.amapNav, '_blank', 'noopener,noreferrer');
      return;
    }
    onToast?.(`正在唤起 Apple 地图定位「${hotel.name}」`);
    window.open(links.appleMaps, '_blank', 'noopener,noreferrer');
    return;
  }

  if (platform === 'amap') {
    onToast?.(`正在打开高德地图路线规划`);
    window.open(links.amapNav, '_blank', 'noopener,noreferrer');
  }
}
