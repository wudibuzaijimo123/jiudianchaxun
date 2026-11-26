import { HotelItem } from '../types/hotel';

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent);
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
    // 高德官方 POI 聚合详情页（含美团/携程/飞猪/同程多平台聚合报价，不报404）
    amapDetail: isOfficialAmapId
      ? `https://ditu.amap.com/place/${encodeURIComponent(hotel.id)}`
      : `https://uri.amap.com/marker?position=${hotel.lng},${hotel.lat}&name=${encodeURIComponent(
          hotel.name
        )}&src=jiudianchaxun-pwa&coordinate=gaode&callnative=0`,
    // 高德导航路线
    amapNav: `https://uri.amap.com/marker?position=${hotel.lng},${hotel.lat}&name=${encodeURIComponent(
      hotel.name
    )}&src=jiudianchaxun-pwa&coordinate=gaode&callnative=1`,
    // 携程酒店搜索（原生适配电脑宽屏与手机，免登录可看房型价）
    ctripWeb: `https://hotels.ctrip.com/hotels/list?keyword=${encodeURIComponent(hotel.name)}`,
    // 美团手机 App 原生直搜（旧版 i.meituan.com/s/ 已下线会报信息未找到，电脑端改跳 hotel.meituan.com）
    meituanApp: `imeituan://www.meituan.com/search?q=${encodeURIComponent(hotel.name)}`,
    meituanPc: `https://hotel.meituan.com/`,
    // 抖音
    douyinApp: `snssdk1128://search?keyword=${encodeURIComponent(douyinQuery)}`,
    douyinWeb: `https://www.douyin.com/search/${encodeURIComponent(douyinQuery)}?type=general`,
    // Apple 地图
    appleMaps: `https://maps.apple.com/?q=${encodeURIComponent(hotel.name)}&ll=${hotel.lat},${
      hotel.lng
    }&address=${encodeURIComponent(hotel.address)}`,
  };
}

export async function smartLaunchPlatform(
  hotel: HotelItem,
  platform: 'amap_detail' | 'meituan' | 'douyin' | 'ctrip' | 'amap' | 'apple',
  onToast?: (msg: string) => void
): Promise<void> {
  const links = buildPlatformLinks(hotel);
  const mobile = isMobileDevice();

  await copyTextSilently(hotel.name);

  if (platform === 'amap_detail') {
    onToast?.(`正在打开「${hotel.name}」高德全网房型聚合比价详情`);
    window.open(links.amapDetail, '_blank', 'noopener,noreferrer');
    return;
  }

  if (platform === 'meituan') {
    if (mobile) {
      onToast?.(`正在唤起美团 App 搜「${hotel.name}」`);
      window.location.href = links.meituanApp;
    } else {
      onToast?.(`已复制「${hotel.name}」，美团旧移动网页已停用，请在美团酒店官网粘贴搜索或用手机扫码`);
      window.open(links.meituanPc, '_blank', 'noopener,noreferrer');
    }
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
    onToast?.(`正在打开携程查看「${hotel.name}」细分房型实时报价`);
    window.open(links.ctripWeb, '_blank', 'noopener,noreferrer');
    return;
  }

  if (platform === 'apple') {
    onToast?.(`正在打开 Apple 地图定位「${hotel.name}」`);
    window.open(links.appleMaps, '_blank', 'noopener,noreferrer');
    return;
  }

  if (platform === 'amap') {
    onToast?.(`正在打开高德地图路线规划`);
    window.open(links.amapNav, '_blank', 'noopener,noreferrer');
  }
}
