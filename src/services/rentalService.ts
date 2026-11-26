import { LlmConfig, SearchCenter } from '../types/hotel';
import {
  RentalFilterState,
  RentalKind,
  RentalListing,
  RentalSearchResult,
} from '../types/rental';
import { extractJsonFromText, isNativePackagedApp, resolveApiUrl } from './standaloneClient';
import { calcDistanceMeters } from '../utils/coordTransform';
import { anjukeCitySlug } from '../utils/citySlug';

const CACHE_KEY = 'jdcx_rental_cache_v3';
const CACHE_TTL = 30 * 60 * 1000;

export interface GroundedCommunityPoi {
  name: string;
  district: string;
  address: string;
  distanceMeters: number;
  lng: number;
  lat: number;
  photos: string[];
}

const RENTAL_KINDS: RentalKind[] = ['整租', '合租', '单间', '床位', '日租', '公寓'];

export const RENTAL_KIND_OPTIONS: { label: string; value: 'all' | RentalKind }[] = [
  { label: '全部', value: 'all' },
  { label: '整租', value: '整租' },
  { label: '合租', value: '合租' },
  { label: '单间', value: '单间' },
  { label: '床位', value: '床位' },
  { label: '日租/短租', value: '日租' },
  { label: '公寓', value: '公寓' },
];

export const RENT_RANGE_OPTIONS: {
  label: string;
  value: RentalFilterState['rentRange'];
}[] = [
  { label: '不限租金', value: 'all' },
  { label: '1000以下', value: 'under1000' },
  { label: '1000-2000', value: '1000to2000' },
  { label: '2000-3500', value: '2000to3500' },
  { label: '3500以上', value: 'over3500' },
];

function normalizeKind(input: unknown): RentalKind {
  const s = String(input || '');
  for (const k of RENTAL_KINDS) {
    if (s.includes(k)) return k;
  }
  if (/合租|床位|隔断/.test(s)) return '合租';
  if (/日租|短租|钟点|按天/.test(s)) return '日租';
  if (/公寓|loft|LOFT/i.test(s)) return '公寓';
  return '整租';
}

function toNum(input: unknown): number | null {
  const n = Number(String(input ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function shortHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) % 100000007;
  }
  return h.toString(36);
}

/** 把 AI 返回的一条房源规范化为 RentalListing（字段缺失时给出可读兜底） */
function normalizeListing(raw: any, idx: number, fallbackDistrict?: string): RentalListing | null {
  if (!raw || typeof raw !== 'object') return null;
  const community = String(raw.community || raw.小区 || raw.name || '').trim();
  const layout = String(raw.layout || raw.户型 || '').trim();
  const areaNum = toNum(raw.area);
  const rentMonthly = toNum(raw.rentMonthly) ?? toNum(raw.rent);
  const rentDaily = toNum(raw.rentDaily) ?? toNum(raw.dailyRent);
  if (!community && !layout) return null;
  if (rentMonthly === null && rentDaily === null) return null;

  const kind = normalizeKind(raw.kind || raw.rentalType || raw.type);
  const title =
    String(raw.title || '').trim() ||
    `${kind}·${community || '个人房源'}${layout ? ` ${layout}` : ''}${areaNum ? ` ${areaNum}㎡` : ''}`;

  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 5)
    : [];
  const facilities = Array.isArray(raw.facilities)
    ? raw.facilities.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 10)
    : [];

  return {
    id: `rt_${shortHash(`${title}-${idx}`)}`,
    title,
    community: community || '未标明小区',
    district: String(raw.district || fallbackDistrict || '').trim() || undefined,
    address: String(raw.address || raw.addr || community || '').trim() || '地址待核实',
    kind,
    layout: layout || '户型待核实',
    area: areaNum,
    floor: String(raw.floor || '').trim() || undefined,
    orientation: String(raw.orientation || '').trim() || undefined,
    decoration: String(raw.decoration || raw.fitment || '').trim() || undefined,
    rentMonthly,
    rentDaily,
    payMethod: String(raw.payMethod || raw.deposit || '').trim() || undefined,
    minLease: String(raw.minLease || raw.leaseTerm || '').trim() || undefined,
    tags,
    facilities,
    distanceMeters: Math.max(20, Math.round(toNum(raw.distanceMeters) ?? 300 + idx * 120)),
    photos: [],
    basis: String(raw.basis || '').trim() || undefined,
    riskNote: String(raw.riskNote || '').trim() || undefined,
    priceSource: 'ai_search',
  };
}

/* ============ 高德 POI 实景图 + 坐标 ============ */

export interface AmapPoiMedia {
  poiName: string;
  photos: string[];
  lng: number;
  lat: number;
}

/** 同一次会话内同一小区只查一次高德，避免重复消耗配额 */
const mediaCache = new Map<string, AmapPoiMedia | null>();

/**
 * 用高德 POI 检索小区的实景图与坐标（v5/place/text + show_fields=photos）。
 * 高德图是小区/周边实景，不是这套房的室内实拍，界面上会明确标注来源。
 */
export async function fetchAmapPoiMedia(
  keyword: string,
  city: string,
  amapKey: string
): Promise<AmapPoiMedia | null> {
  const key = amapKey.trim();
  const kw = keyword.trim();
  if (!key || !kw) return null;

  const cacheKey = `${city}|${kw}`;
  if (mediaCache.has(cacheKey)) return mediaCache.get(cacheKey) ?? null;

  try {
    const region = String(city || '').replace(/市$/, '');

    const query = async (withRegion: boolean) => {
      const url =
        `https://restapi.amap.com/v5/place/text?key=${encodeURIComponent(key)}` +
        `&keywords=${encodeURIComponent(kw)}` +
        (withRegion && region
          ? `&region=${encodeURIComponent(region)}&city_limit=true`
          : '') +
        '&page_size=5&show_fields=photos';
      const r = await fetch(url);
      return r.json();
    };

    // 先按城市限定搜；查不到（小区名与城市对不上、简称等）再放开城市全国搜，
    // 但后面仍会用距离校验挡掉外地同名小区
    let data = await query(true);
    let pois: any[] = data?.status === '1' && Array.isArray(data.pois) ? data.pois : [];
    if (pois.length === 0) {
      data = await query(false);
      pois = data?.status === '1' && Array.isArray(data.pois) ? data.pois : [];
    }
    if (pois.length === 0) {
      mediaCache.set(cacheKey, null);
      return null;
    }

    // 优先选名称最贴近的 POI（高德按相关度返回，第一条通常就是小区本身）
    const poi = pois[0];
    const [lngStr, latStr] = String(poi.location || '').split(',');
    const lng = Number(lngStr);
    const lat = Number(latStr);

    const urls: string[] = (Array.isArray(poi.photos) ? poi.photos : [])
      .map((p: any) => String(p?.url || '').replace(/^http:\/\//i, 'https://'))
      .filter((u: string) => /^https:\/\//i.test(u));
    const photos = Array.from(new Set<string>(urls)).slice(0, 6);

    const media: AmapPoiMedia = {
      poiName: String(poi.name || kw),
      photos,
      lng: Number.isFinite(lng) ? lng : 0,
      lat: Number.isFinite(lat) ? lat : 0,
    };
    mediaCache.set(cacheKey, media);
    return media;
  } catch {
    mediaCache.set(cacheKey, null);
    return null;
  }
}

/** 按「距搜索中心的距离 + 序号」推一个稳定但不精确的坐标，保证地图上有落点且不会全挤在一处 */
function approximateCoord(
  center: SearchCenter,
  distanceMeters: number,
  seed: string,
  idx = 0
): { lng: number; lat: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 60;
  const angle = ((idx * 137.5 + h) * Math.PI) / 180;
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = (distanceMeters * Math.cos(angle)) / 111320;
  const dLng = (distanceMeters * Math.sin(angle)) / (111320 * Math.cos(latRad) || 111320);
  return {
    lng: Number((center.lng + dLng).toFixed(6)),
    lat: Number((center.lat + dLat).toFixed(6)),
  };
}

/**
 * 给房源补齐图片与坐标：
 * 1. 先给每条房源落一个按距离推算的近似坐标（地图打点兜底）；
 * 2. 再用高德 POI 实景图覆盖图片，POI 坐标在合理范围内时替换近似坐标。
 */
export async function enrichRentalMedia(
  listings: RentalListing[],
  center: SearchCenter,
  radius: number,
  amapKey: string
): Promise<RentalListing[]> {
  const maxDist = Math.max(radius * 3, 5000);

  const out: RentalListing[] = listings.map((item, idx) => {
    const hasCoord = typeof item.lng === 'number' && typeof item.lat === 'number';
    const approx = approximateCoord(center, item.distanceMeters, item.id || item.title, idx);
    return {
      ...item,
      photos: (item.photos || []).filter((u) => /^https?:\/\//i.test(u)),
      lng: hasCoord ? item.lng : approx.lng,
      lat: hasCoord ? item.lat : approx.lat,
      geoApprox: hasCoord ? Boolean(item.geoApprox) : true,
    };
  });

  if (!amapKey.trim()) return out;

  let cursor = 0;
  const worker = async () => {
    while (cursor < out.length) {
      const idx = cursor++;
      const item = out[idx];
      const media = await fetchAmapPoiMedia(item.community, center.city, amapKey);
      if (!media) continue;

      // 同名小区全国很多，只有 POI 落在合理范围内才认为匹配上了，
      // 否则宁可不用这张图，也不能把外地小区的照片贴到这条房源上
      const nearEnough =
        Boolean(media.lng && media.lat) &&
        calcDistanceMeters(center.lng, center.lat, media.lng, media.lat) <= maxDist;
      if (!nearEnough) continue;

      out[idx] = {
        ...item,
        photos: media.photos.length > 0 ? media.photos : item.photos,
        lng: media.lng,
        lat: media.lat,
        geoApprox: false,
      };
    }
  };

  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

/** 使用高德周边搜索检索搜索点周围真实的住宅小区/公寓/商住楼（防 AI 幻觉编造小区） */
export async function fetchNearbyRealCommunities(
  center: SearchCenter,
  radius: number,
  amapKey: string
): Promise<GroundedCommunityPoi[]> {
  const key = amapKey.trim();
  if (!key) return [];
  try {
    const rMeters = Math.min(Math.max(radius, 1000), 10000);
    const url =
      `https://restapi.amap.com/v5/place/around?key=${encodeURIComponent(key)}` +
      `&location=${center.lng},${center.lat}&types=120000|120200|120300&radius=${rMeters}` +
      '&page_size=22&page_num=1&sortrule=distance&show_fields=photos';
    const resp = await fetch(url);
    const data = await resp.json();
    if (data?.status !== '1' || !Array.isArray(data.pois)) return [];

    const seen = new Set<string>();
    const list: GroundedCommunityPoi[] = [];
    for (const poi of data.pois) {
      const name = String(poi.name || '').trim();
      if (!name || seen.has(name)) continue;
      if (
        /门$|入口|停车场|垃圾|物业|售楼|公厕|宿舍|教工楼|职工楼|学生公寓|教学楼|实验楼/.test(
          name
        )
      ) {
        continue;
      }
      const [lngStr, latStr] = String(poi.location || '').split(',');
      const lng = Number(lngStr);
      const lat = Number(latStr);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

      seen.add(name);
      const dist = Number(poi.distance) > 0
        ? Math.round(Number(poi.distance))
        : calcDistanceMeters(center.lng, center.lat, lng, lat);
      const district = String(poi.adname || '').trim();
      const rawAddr = String(poi.address || '').trim();
      const address = rawAddr
        ? district && !rawAddr.startsWith(district)
          ? `${district}${rawAddr}`
          : rawAddr
        : `${district}${name}`;
      const photos = (Array.isArray(poi.photos) ? poi.photos : [])
        .map((p: any) => String(p?.url || '').replace(/^http:\/\//i, 'https://'))
        .filter((u: string) => /^https:\/\//i.test(u))
        .slice(0, 4);

      list.push({ name, district, address, distanceMeters: dist, lng, lat, photos });
    }
    return list;
  } catch {
    return [];
  }
}

/** 半径越大给的条数越多，避免「换成 5km 还是同一批房子」 */
export function rentalCountForRadius(radius: number): number {
  if (radius <= 1000) return 8;
  if (radius <= 2000) return 10;
  if (radius <= 3000) return 12;
  if (radius <= 5000) return 16;
  return 20;
}

export function buildRentalPrompt(
  center: SearchCenter,
  radius: number,
  count = rentalCountForRadius(3000),
  maxRent: number | null = null,
  realPois: GroundedCommunityPoi[] = []
): string {
  const cleanCity = String(center.city || '').replace(/市$/, '');
  const rangeText = radius >= 1000 ? `${Math.round(radius / 1000)}km` : `${radius}m`;
  const near = Math.max(150, Math.round(radius * 0.08));
  const mid = Math.max(near + 200, Math.round(radius * 0.4));
  const poiBlock =
    realPois.length > 0
      ? `【高德实测真实小区/公寓名单（必须严格从中选点，原样使用小区名、区县、地址和距离，严禁编造虚构小区名！）】：\n${realPois
          .slice(0, 18)
          .map(
            (p, i) =>
              `${i + 1}. 小区名="${p.name}" | 区县="${p.district}" | 真实地址="${p.address}" | 距中心=${p.distanceMeters}m`
          )
          .join('\n')}\n\n`
      : '';

  return `你是中国本地租房信息检索引擎。请检索「${cleanCity} ${center.name}」周边 ${rangeText} 内的真实可租房源，参照安居客/58同城/贝壳该地段的挂牌特征，输出约 ${count} 条。

${poiBlock}硬性要求（很重要）：
1. 同一小区最多 2 条且户型不同；标题用「类型·小区名 户型」的形式，不要每条都以「${center.name}」开头；
2. ${
    realPois.length > 0
      ? 'community、district、address、distanceMeters 必须严格与上方实测真实小区一致；'
      : `距离铺满整个 ${rangeText} 范围：约 1/3 在 ${near}-${mid}m，约 1/3 在 ${mid}m-${Math.round(
          radius * 0.8
        )}m，其余接近上限；`
  }
3. 租金分低、中、高三档，符合该城市该地段的真实行情${maxRent ? `，月租尽量不超过 ${maxRent} 元` : ''}；
4. 类型混合整租、合租、单间、床位、日租、公寓；高校/县城周边多给单间、合租等实用选项；
5. 不要编造房东手机号，不要输出联系方式字段。

严格只返回 JSON 数组，不要任何解释文字，每项字段如下：
[
  {
    "title": "整租·阳光花园 2室1厅",
    "community": "阳光花园",
    "district": "城关区",
    "address": "城关区建设路 88 号",
    "kind": "整租",
    "layout": "2室1厅1卫",
    "area": 89,
    "floor": "中楼层/18层",
    "orientation": "南",
    "decoration": "精装",
    "rentMonthly": 1800,
    "rentDaily": null,
    "payMethod": "押一付三",
    "minLease": "一年起租",
    "tags": ["近地铁", "有电梯", "可拎包入住"],
    "facilities": ["空调", "洗衣机", "热水器", "宽带", "独卫"],
    "distanceMeters": 420,
    "basis": "${realPois.length > 0 ? '高德实测小区·地段行情' : '该地段挂牌行情'}",
    "riskNote": "合租需确认是否独卫"
  }
]`;
}

export async function callDirectClientRentals(
  llm: LlmConfig,
  center: SearchCenter,
  radius: number,
  realPois: GroundedCommunityPoi[] = []
): Promise<any[]> {
  const cleanBase = (llm.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: llm.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: '只输出合法的纯 JSON 数组，禁止任何多余解释。' },
        {
          role: 'user',
          content: buildRentalPrompt(center, radius, rentalCountForRadius(radius), null, realPois),
        },
      ],
      temperature: realPois.length > 0 ? 0.5 : 0.8,
      max_tokens: 3600,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `HTTP ${resp.status}`);
  }
  const parsed = extractJsonFromText(String(data?.choices?.[0]?.message?.content || ''));
  return Array.isArray(parsed) ? parsed : [];
}

/** 未配置大模型 Key 时的示例房源，用于先看清界面（卡片会标注「示例」） */
const DEMO_RENTALS: Omit<RentalListing, 'priceSource' | 'photos'>[] = [
  {
    id: 'rt_demo_1',
    title: '整租·阳光花园 2室1厅',
    community: '阳光花园',
    district: '城关区',
    address: '城关区建设路 88 号',
    kind: '整租',
    layout: '2室1厅1卫',
    area: 89,
    floor: '中楼层/18层',
    orientation: '南',
    decoration: '精装',
    rentMonthly: 1800,
    rentDaily: null,
    payMethod: '押一付三',
    minLease: '一年起租',
    tags: ['有电梯', '近菜市场', '可拎包入住'],
    facilities: ['空调', '洗衣机', '热水器', '宽带', '独立卫生间'],
    distanceMeters: 420,
    basis: '示例数据',
    riskNote: '示例房源，配置 AI Key 后可检索真实行情',
  },
  {
    id: 'rt_demo_2',
    title: '合租·幸福里小区 主卧带独卫',
    community: '幸福里小区',
    district: '城关区',
    address: '城关区幸福路 12 号',
    kind: '合租',
    layout: '主卧 20㎡',
    area: 20,
    floor: '高楼层/6层',
    orientation: '东南',
    decoration: '简装',
    rentMonthly: 750,
    rentDaily: null,
    payMethod: '押一付一',
    minLease: '三个月起租',
    tags: ['独卫', '限女生', '含水电'],
    facilities: ['空调', '热水器', '宽带', '床'],
    distanceMeters: 260,
    basis: '示例数据',
  },
  {
    id: 'rt_demo_3',
    title: '单间·学府路自建房单间',
    community: '学府路自建房',
    district: '城关区',
    address: '学府路与文昌街交口',
    kind: '单间',
    layout: '单间 15㎡',
    area: 15,
    floor: '2层/4层',
    orientation: '东',
    decoration: '简装',
    rentMonthly: 450,
    rentDaily: 60,
    payMethod: '押一付一',
    minLease: '可月付',
    tags: ['可短租', '押一付一', '学生优先'],
    facilities: ['独卫', '热水器', 'WiFi'],
    distanceMeters: 180,
    basis: '示例数据',
  },
  {
    id: 'rt_demo_4',
    title: '日租·车站旁招待所 标准间',
    community: '车站招待所',
    district: '城关区',
    address: '火车站出站口东 200 米',
    kind: '日租',
    layout: '标准间 18㎡',
    area: 18,
    floor: '3层/5层',
    orientation: '北',
    decoration: '简装',
    rentMonthly: 900,
    rentDaily: 68,
    payMethod: '按天结算',
    minLease: '一天起租，月租可谈',
    tags: ['24小时热水', '可开发票', '近车站'],
    facilities: ['空调', '独卫', '电视', '热水'],
    distanceMeters: 520,
    basis: '示例数据',
  },
];

async function demoResult(
  center: SearchCenter,
  notice: string,
  amapKey = ''
): Promise<RentalSearchResult> {
  const cleanCity = String(center.city || '').replace(/市$/, '');
  const base = DEMO_RENTALS.map((d) => ({
    ...d,
    address: d.id === 'rt_demo_3' ? `${cleanCity}${center.name}附近` : `${cleanCity}${d.address}`,
    photos: [] as string[],
    priceSource: 'demo' as const,
  }));
  const listings = await enrichRentalMedia(base, center, 3000, amapKey);
  return { listings, mode: 'demo', notice };
}

interface CacheEntry {
  ts: number;
  key: string;
  listings: RentalListing[];
}

function readCache(key: string): RentalListing[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || parsed.key !== key) return null;
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    return Array.isArray(parsed.listings) ? parsed.listings : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, listings: RentalListing[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), key, listings }));
  } catch {
    // localStorage 满了就跳过缓存
  }
}

export interface RentalQueryOptions {
  center: SearchCenter;
  radius: number;
  llm: LlmConfig;
  /** 高德 Web 服务 Key：用于给每条房源补实景图与地图坐标 */
  amapKey?: string;
  serpApiKey?: string;
  serverBaseUrl?: string;
  maxRent?: number | null;
  force?: boolean;
}

/**
 * 联网检索周边租房房源：优先走后端代理（带 SerpApi 公开摘要实证），
 * 后端不可达 / 独立 IPA 未配服务器时自动降级为端侧直连大模型。
 */
export async function searchRentals(options: RentalQueryOptions): Promise<RentalSearchResult> {
  const {
    center,
    radius,
    llm,
    amapKey = '',
    serpApiKey = '',
    serverBaseUrl = '',
    maxRent = null,
    force,
  } = options;
  const cacheKey = `${center.city}|${center.name}|${radius}|${maxRent ?? ''}|${amapKey ? 'amap' : 'no'}`;

  if (!force) {
    const cached = readCache(cacheKey);
    if (cached && cached.length > 0) {
      // 旧缓存可能没有图片/坐标，补一次再返回
      const needsMedia = cached.some(
        (item) => !item.photos?.length || typeof item.lng !== 'number' || typeof item.lat !== 'number'
      );
      const listings = needsMedia
        ? await enrichRentalMedia(cached, center, radius, amapKey)
        : cached;
      return { listings, mode: 'ai', notice: '' };
    }
  }

  if (!llm.apiKey.trim()) {
    return demoResult(
      center,
      '当前展示的是示例房源：在「接口/扫码」里填好大模型 Key 后，会自动联网检索该地段的真实租房行情。',
      amapKey
    );
  }

  // 先查高德周边真实小区名单（有高德 Key 时可大幅提升小区、地址、实景图和坐标准确性）
  const realPois = await fetchNearbyRealCommunities(center, radius, amapKey);
  const realPoiMap = new Map(realPois.map((p) => [p.name, p]));

  const finish = async (rawList: any[], notice = ''): Promise<RentalSearchResult> => {
    const seen = new Set<string>();
    const normalized = rawList
      .map((raw, idx) => normalizeListing(raw, idx))
      .filter((l): l is RentalListing => Boolean(l))
      .map((l) => {
        const matched =
          realPoiMap.get(l.community) ||
          realPois.find((p) => p.name.includes(l.community) || l.community.includes(p.name));
        if (!matched) return l;
        return {
          ...l,
          community: matched.name,
          district: matched.district || l.district,
          address: matched.address || l.address,
          distanceMeters: matched.distanceMeters,
          lng: matched.lng,
          lat: matched.lat,
          geoApprox: false,
          photos: matched.photos.length > 0 ? matched.photos : l.photos,
        };
      })
      // 同名小区 + 同户型只保留一条，避免一张列表全是「XX小区」
      .filter((l) => {
        const key = `${l.community}|${l.kind}|${l.layout}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    if (normalized.length === 0) {
      return demoResult(center, 'AI 本次没有返回可用房源，先展示示例数据，可稍后点「重新检索」。', amapKey);
    }
    const listings = await enrichRentalMedia(normalized, center, radius, amapKey);
    writeCache(cacheKey, listings);
    const mergedNotice =
      notice ||
      (realPois.length > 0 ? `已锚定周边 ${realPois.length} 个高德真实小区定位与实景图` : '');
    return { listings, mode: 'ai', notice: mergedNotice };
  };

  let firstError = '';

  if (!(isNativePackagedApp() && !serverBaseUrl)) {
    try {
      const resp = await fetch(resolveApiUrl('/api/ai-rentals', serverBaseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm,
          serpApiKey,
          city: center.city,
          centerName: center.name,
          radius,
          maxRent,
          count: rentalCountForRadius(radius),
          realPois: realPois.map((p) => ({
            name: p.name,
            district: p.district,
            address: p.address,
            distanceMeters: p.distanceMeters,
          })),
        }),
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data?.listings) && data.listings.length > 0) {
        return finish(data.listings, data.notice || '');
      }
      firstError = data?.error || `后端返回 ${resp.status}`;
    } catch (err: any) {
      firstError = err?.message || '后端不可达';
    }
  }

  try {
    const direct = await callDirectClientRentals(llm, center, radius, realPois);
    return finish(direct, '');
  } catch (err: any) {
    const msg = err?.message || firstError || '网络异常';
    return demoResult(center, `租房检索失败（${msg}），当前为示例数据。`, amapKey);
  }
}

/** 复制给用户去平台内粘贴搜索的关键词 */
export function buildRentalSearchKeyword(
  center: SearchCenter,
  listing?: RentalListing | null
): string {
  const cleanCity = String(center.city || '').replace(/市$/, '');
  return (
    listing
      ? `${cleanCity} ${listing.community} ${listing.layout !== '户型待核实' ? listing.layout : ''} 租房`
      : `${cleanCity} ${center.name} 租房`
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** 安居客直达链接：实测 <slug>.zu.anjuke.com/fangyuan/?kw=... 在 PC 与 iPhone 均直通 200 且锁定对应城市与小区 */
export function buildAnjukeMobileUrl(city: string, listing?: RentalListing | null): string {
  const slug = anjukeCitySlug(city);
  const kw = listing ? listing.community : '租房';
  if (slug) {
    return `https://${slug}.zu.anjuke.com/fangyuan/?kw=${encodeURIComponent(kw)}`;
  }
  return 'https://zu.anjuke.com/fangyuan/';
}

/**
 * 各平台租房跳转（基于实测 HTTP 状态码，区分电脑直跳 / 手机直达）。
 */
export function buildRentalPlatformLinks(center: SearchCenter, listing?: RentalListing | null) {
  const cleanCity = String(center.city || '').replace(/市$/, '');
  const slug = anjukeCitySlug(center.city);
  const kw = listing ? listing.community.trim() : center.name.trim();
  const fullKw = listing ? `${cleanCity} ${listing.community}`.trim() : `${cleanCity} ${center.name}`.trim();
  const encodedKw = encodeURIComponent(kw);
  const encodedFull = encodeURIComponent(fullKw);
  const addr = listing ? `${cleanCity} ${listing.address}` : `${cleanCity} ${center.name}`;

  return {
    anjuke: buildAnjukeMobileUrl(center.city, listing),
    wuba: `https://m.58.com/${slug ? `${slug}/` : ''}chuzu/?key=${encodedKw}`,
    wubaPc: `https://${slug ? `${slug}.` : 'www.'}58.com/chuzu/?key=${encodedKw}`,
    beike: slug ? `https://${slug}.zu.ke.com/zufang/` : `https://m.ke.com/cz/?keyword=${encodedFull}`,
    beikeMobile: slug ? `https://m.ke.com/chuzu/${slug}/zufang/` : `https://m.ke.com/cz/`,
    amap: `https://uri.amap.com/search?keyword=${encodeURIComponent(addr)}&city=${encodeURIComponent(
      cleanCity
    )}&src=jiudianchaxun&callnative=1&coordinate=gaode`,
    baidu: `https://www.baidu.com/s?wd=${encodeURIComponent(`${fullKw} 租房 月租`)}`,
  };
}

/** 前端筛选 + 排序 */
export function applyRentalFilters(
  listings: RentalListing[],
  filters: RentalFilterState
): RentalListing[] {
  const kw = filters.keyword.trim().toLowerCase();

  const list = listings.filter((item) => {
    if (filters.kind !== 'all' && item.kind !== filters.kind) return false;
    if (item.distanceMeters > filters.radius) return false;

    if (filters.rentRange !== 'all') {
      const rent = item.rentMonthly;
      if (rent === null) return false;
      if (filters.rentRange === 'under1000' && rent >= 1000) return false;
      if (filters.rentRange === '1000to2000' && (rent < 1000 || rent > 2000)) return false;
      if (filters.rentRange === '2000to3500' && (rent < 2000 || rent > 3500)) return false;
      if (filters.rentRange === 'over3500' && rent < 3500) return false;
    }

    if (kw) {
      const hay = `${item.title} ${item.community} ${item.address} ${item.district || ''} ${
        item.tags.join(' ')
      }`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  const sorted = [...list];
  if (filters.sortBy === 'distance') {
    sorted.sort((a, b) => a.distanceMeters - b.distanceMeters);
  } else if (filters.sortBy === 'rent_asc') {
    sorted.sort((a, b) => (a.rentMonthly ?? 999999) - (b.rentMonthly ?? 999999));
  } else if (filters.sortBy === 'area_desc') {
    sorted.sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
  }
  return sorted;
}
