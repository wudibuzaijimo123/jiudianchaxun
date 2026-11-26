import { isNativePackagedApp } from '../services/standaloneClient';
import { openExternalUrl } from './nativeBridge';

export interface AmapTarget {
  /** 地点名，如「阳光花园」 */
  name: string;
  /** 详细地址，用于关键词搜索兜底 */
  address?: string;
  city?: string;
  /** GCJ-02 坐标（高德坐标系，直接用） */
  lng?: number;
  lat?: number;
  /** 坐标是按距离推算的近似值：不要用它导航，改用关键词搜索 */
  approx?: boolean;
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function cleanCity(city?: string): string {
  return String(city || '').replace(/市$/, '');
}

function hasPreciseCoord(t: AmapTarget): boolean {
  return !t.approx && typeof t.lng === 'number' && typeof t.lat === 'number' && !!t.lng && !!t.lat;
}

function searchKeyword(t: AmapTarget): string {
  const parts = [cleanCity(t.city), t.name].filter(Boolean);
  return (parts.join(' ') || t.address || '').trim();
}

/** 高德网页版路线规划/定位 URI：有坐标走路线导航，无坐标走关键词检索（callnative=1 尝试唤起高德 App） */
export function buildAmapWebUrl(t: AmapTarget): string {
  if (hasPreciseCoord(t)) {
    return (
      `https://uri.amap.com/navigation?to=${t.lng},${t.lat},${encodeURIComponent(t.name)}` +
      `&mode=car&policy=1&src=jiudianchaxun&coordinate=gaode&callnative=1`
    );
  }
  const kw = searchKeyword(t);
  const city = cleanCity(t.city);
  return (
    `https://uri.amap.com/search?keyword=${encodeURIComponent(kw)}` +
    (city ? `&city=${encodeURIComponent(city)}` : '') +
    '&src=jiudianchaxun&callnative=1&coordinate=gaode'
  );
}

/**
 * 高德 App 的 URL Scheme（仅原生壳内使用，需 Info.plist 声明 iosamap）。
 * 有精确坐标走 path 直接进入高德「路线规划」（支持驾车/公交/步行切换），无坐标走 poi 关键词搜索。
 */
export function buildAmapAppUrl(t: AmapTarget): string {
  const scheme = isAndroid()
    ? 'androidamap://'
    : 'iosamap://';

  if (hasPreciseCoord(t)) {
    return (
      `${scheme}path?sourceApplication=jiudianchaxun` +
      `&dlat=${t.lat}&dlon=${t.lng}&dname=${encodeURIComponent(t.name)}&dev=0&t=0`
    );
  }

  const kw = searchKeyword(t);
  const city = cleanCity(t.city);
  return (
    `${scheme}poi?sourceApplication=jiudianchaxun&keywords=${encodeURIComponent(kw)}` +
    (city ? `&city=${encodeURIComponent(city)}` : '')
  );
}

/**
 * 在高德地图里打开某个地点 / 路线规划。
 * - 独立 IPA：先试 iosamap://path（若未装高德或失败自动退回系统 Safari 打开 uri.amap.com/navigation）；
 * - 手机浏览器 / PWA：直接打开 uri.amap.com（带 callnative=1，装了高德会跳 App）；
 * - 桌面：新标签打开路线页。
 */
export async function openInAmap(t: AmapTarget): Promise<'app' | 'web'> {
  const webUrl = buildAmapWebUrl(t);

  if (isNativePackagedApp()) {
    const ok = await openExternalUrl(buildAmapAppUrl(t));
    if (ok) return 'app';
    await openExternalUrl(webUrl);
    return 'web';
  }

  if (isIOS() || isAndroid()) {
    window.location.href = webUrl;
    return 'web';
  }

  window.open(webUrl, '_blank', 'noopener,noreferrer');
  return 'web';
}

/** 从一条房源/酒店信息构造高德目标 */
export function amapTargetFrom(input: {
  name?: string;
  community?: string;
  address?: string;
  city?: string;
  lng?: number;
  lat?: number;
  geoApprox?: boolean;
}): AmapTarget {
  return {
    name: input.name || input.community || '目标地点',
    address: input.address,
    city: input.city,
    lng: input.lng,
    lat: input.lat,
    approx: input.geoApprox,
  };
}
