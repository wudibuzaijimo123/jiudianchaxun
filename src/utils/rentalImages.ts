import { RentalKind, RentalListing } from '../types/rental';
import { isNativePackagedApp } from '../services/standaloneClient';

/** public 目录下的资源前缀，兼容部署到子路径的情况 */
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

/**
 * 内置房型兜底图（public/rentals/*.webp，已压缩到 40–65KB）。
 * 高德没收录该小区实景图、或高德图加载失败时使用，保证卡片不出现空白块。
 */
export const RENTAL_FALLBACK_PHOTOS: Record<RentalKind, string[]> = {
  整租: [`${BASE}/rentals/whole.webp`],
  合租: [`${BASE}/rentals/shared.webp`],
  单间: [`${BASE}/rentals/single.webp`],
  床位: [`${BASE}/rentals/bed.webp`],
  日租: [`${BASE}/rentals/daily.webp`],
  公寓: [`${BASE}/rentals/apt.webp`],
};

/** 取房源图集：有高德实景图就用，没有回落到内置房型图 */
export function rentalPhotos(listing: Pick<RentalListing, 'photos' | 'kind'>): string[] {
  const own = (listing.photos || []).filter((u) => /^https?:\/\//i.test(u));
  if (own.length > 0) return own;
  return RENTAL_FALLBACK_PHOTOS[listing.kind] || RENTAL_FALLBACK_PHOTOS.整租;
}

/** 图片是否来自高德图床（用于标注图片来源） */
export function isAmapPhoto(url: string): boolean {
  return /autonavi\.com|amap\.com/i.test(url);
}

/** 是否为高德静态地图（不是房源实拍） */
export function isStaticMapUrl(url: string): boolean {
  return /restapi\.amap\.com\/v3\/staticmap/i.test(url);
}

/**
 * 图片实际请求地址。
 *
 * 高德图床有相当一部分只给 http 源，在 https 页面会被浏览器当作混合内容拦掉，
 * 所以网页端统一走同源代理；独立 IPA 内没有后端，只能强制转 https 由 WebView 直连。
 */
export function photoSrc(url: string): string {
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  if (!/(autonavi|amap)\.com/i.test(url)) return url;
  if (isStaticMapUrl(url)) return url;
  if (isNativePackagedApp()) return url.replace(/^http:\/\//i, 'https://');
  return `/api/img-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * 高德静态地图：给详情页补一张「这套房大概在哪」的位置图。
 * 需要 Web 服务 Key；Key 无效时 img onError 会隐藏这张图。
 */
export function buildAmapStaticMapUrl(options: {
  lng?: number;
  lat?: number;
  amapKey: string;
  zoom?: number;
}): string {
  const { lng, lat, amapKey } = options;
  const key = amapKey.trim();
  if (!key || typeof lng !== 'number' || typeof lat !== 'number' || !lng || !lat) return '';

  const x = lng.toFixed(6);
  const y = lat.toFixed(6);
  return (
    `https://restapi.amap.com/v3/staticmap?location=${x},${y}` +
    `&zoom=${options.zoom ?? 15}&size=600*400&scale=2` +
    `&markers=mid,0xE11D48,A:${x},${y}` +
    `&key=${encodeURIComponent(key)}`
  );
}
