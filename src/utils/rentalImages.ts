import { JobListing } from '../types/job';
import { RentalKind, RentalListing } from '../types/rental';
import { isNativePackagedApp } from '../services/standaloneClient';

/** public 目录下的资源前缀，兼容网页与 Capacitor IPA 容器 */
const BASE = (import.meta.env.BASE_URL || './').replace(/\/+$/, '');

/**
 * 租房各户型 AI / 场景参考图集（高德实景图之外再附带多张参考图，兼顾室内格局与校外周边参考）
 */
export const RENTAL_FALLBACK_PHOTOS: Record<RentalKind, string[]> = {
  整租: [
    `${BASE}/rentals/whole.webp`,
    `${BASE}/rentals/apt.webp`,
    `${BASE}/ai-refs/campus-street.webp`,
  ],
  合租: [
    `${BASE}/rentals/shared.webp`,
    `${BASE}/rentals/single.webp`,
    `${BASE}/ai-refs/campus-street.webp`,
  ],
  单间: [
    `${BASE}/rentals/single.webp`,
    `${BASE}/ai-refs/hotel-king.webp`,
    `${BASE}/ai-refs/campus-street.webp`,
  ],
  床位: [
    `${BASE}/rentals/bed.webp`,
    `${BASE}/rentals/shared.webp`,
    `${BASE}/ai-refs/campus-street.webp`,
  ],
  日租: [
    `${BASE}/rentals/daily.webp`,
    `${BASE}/ai-refs/hotel-twin.webp`,
    `${BASE}/ai-refs/campus-street.webp`,
  ],
  公寓: [
    `${BASE}/rentals/apt.webp`,
    `${BASE}/rentals/whole.webp`,
    `${BASE}/ai-refs/campus-street.webp`,
  ],
};

/** 招聘行业场景 AI 参考图库 */
const JOB_AI_REFS = {
  catering: [`${BASE}/ai-refs/job-catering.webp`, `${BASE}/ai-refs/job-cafe.webp`],
  cafe: [`${BASE}/ai-refs/job-cafe.webp`, `${BASE}/ai-refs/job-catering.webp`],
  retail: [`${BASE}/ai-refs/job-retail.webp`, `${BASE}/ai-refs/campus-street.webp`],
  logistics: [`${BASE}/ai-refs/job-logistics.webp`, `${BASE}/ai-refs/campus-street.webp`],
  hotel: [`${BASE}/ai-refs/hotel-lobby.webp`, `${BASE}/ai-refs/hotel-twin.webp`],
  office: [`${BASE}/ai-refs/job-office.webp`, `${BASE}/ai-refs/campus-street.webp`],
  campus: [`${BASE}/ai-refs/campus-street.webp`, `${BASE}/ai-refs/job-retail.webp`],
};

function mergeUniquePhotos(amapUrls: string[], aiRefs: string[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...amapUrls, ...aiRefs]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

/** 取房源图集：高德实景图在前 + AI 多张户型与街景参考图同行 */
export function rentalPhotos(listing: Pick<RentalListing, 'photos' | 'kind'>): string[] {
  const own = (listing.photos || []).filter((u) => /^https?:\/\//i.test(u));
  const refs = RENTAL_FALLBACK_PHOTOS[listing.kind] || RENTAL_FALLBACK_PHOTOS.整租;
  return mergeUniquePhotos(own, refs, 6);
}

/** 根据岗位业态匹配 AI 场景参考图 + 高德实景图 */
export function jobAiReferencePhotos(
  job: Pick<JobListing, 'title' | 'company' | 'description'>
): string[] {
  const text = `${job.title} ${job.company} ${job.description || ''}`;
  if (/奶茶|咖啡|饮品|甜品|烘焙|茶百道|蜜雪|霸王|瑞幸|星巴克/.test(text)) {
    return JOB_AI_REFS.cafe;
  }
  if (/餐|厨|火锅|烧烤|服务员|小吃|美食|食堂|炒菜|面馆/.test(text)) {
    return JOB_AI_REFS.catering;
  }
  if (/超市|便利|店员|收银|理货|导购|百货|商超|零售|优品/.test(text)) {
    return JOB_AI_REFS.retail;
  }
  if (/快递|分拣|外卖|骑手|配送|物流|仓|司机|厂|普工|机械|车间|装配/.test(text)) {
    return JOB_AI_REFS.logistics;
  }
  if (/酒店|宾馆|前台|客房|保洁|民宿/.test(text)) {
    return JOB_AI_REFS.hotel;
  }
  if (/文员|客服|助教|培训|设计|办公|前端|运营|实习/.test(text)) {
    return JOB_AI_REFS.office;
  }
  return JOB_AI_REFS.campus;
}

/** 取岗位图集：高德单位实景图 + AI 行业工作环境参考图 */
export function jobPhotos(
  job: Pick<JobListing, 'photos' | 'title' | 'company' | 'description'>
): string[] {
  const own = (job.photos || []).filter((u) => /^https?:\/\//i.test(u));
  const refs = jobAiReferencePhotos(job);
  return mergeUniquePhotos(own, refs, 5);
}

/** 图片是否来自高德图床（用于标注图片来源） */
export function isAmapPhoto(url: string): boolean {
  return /autonavi\.com|amap\.com/i.test(url);
}

/** 是否为高德静态地图（不是实拍图） */
export function isStaticMapUrl(url: string): boolean {
  return /restapi\.amap\.com\/v3\/staticmap/i.test(url);
}

/** 判断图片标签：高德位置图 / 高德实景图 / AI参考图 */
export function getPhotoSourceLabel(url: string, fallback = 'AI参考图'): string {
  if (isStaticMapUrl(url)) return '高德位置图';
  if (isAmapPhoto(url)) return '高德实景图';
  if (/ai-refs\/campus-street/i.test(url)) return 'AI校园街景参考';
  if (/\/(ai-refs|rentals)\//i.test(url)) return 'AI参考图';
  return fallback;
}

/**
 * 图片实际请求地址。
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
 * 高德静态地图：给详情页补一张「位置定位图」。
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
