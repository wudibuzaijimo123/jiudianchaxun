import { LlmConfig, SearchCenter } from '../types/hotel';
import {
  JobFilterState,
  JobListing,
  JobPriceUnit,
  JobSearchResult,
  JobType,
} from '../types/job';
import { extractJsonFromText, isNativePackagedApp, resolveApiUrl } from './standaloneClient';
import { fetchAmapPoiMedia } from './rentalService';
import { calcDistanceMeters } from '../utils/coordTransform';
import { anjukeCitySlug, bossCityCode } from '../utils/citySlug';

const CACHE_KEY = 'jdcx_job_cache_v2';
const CACHE_TTL = 30 * 60 * 1000;

export interface GroundedEmployerPoi {
  name: string;
  category: string;
  district: string;
  address: string;
  distanceMeters: number;
  lng: number;
  lat: number;
  photos: string[];
}

const JOB_TYPES: JobType[] = ['全职', '兼职', '实习', '日结', '钟点工'];

export const JOB_TYPE_OPTIONS: { label: string; value: 'all' | JobType }[] = [
  { label: '全部', value: 'all' },
  { label: '全职', value: '全职' },
  { label: '兼职', value: '兼职' },
  { label: '日结', value: '日结' },
  { label: '钟点工', value: '钟点工' },
  { label: '实习', value: '实习' },
];

export const JOB_SALARY_OPTIONS: {
  label: string;
  value: JobFilterState['salaryRange'];
}[] = [
  { label: '不限薪资', value: 'all' },
  { label: '3000以下', value: 'under3000' },
  { label: '3000-5000', value: '3000to5000' },
  { label: '5000-8000', value: '5000to8000' },
  { label: '8000以上', value: 'over8000' },
];

function toNum(input: unknown): number | null {
  const n = Number(String(input ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeType(input: unknown): JobType {
  const s = String(input || '');
  for (const t of JOB_TYPES) if (s.includes(t)) return t;
  if (/日结|当天结/.test(s)) return '日结';
  if (/钟点|小时工|按小时/.test(s)) return '钟点工';
  if (/实习/.test(s)) return '实习';
  if (/兼职|临时|寒假|暑期|周末/.test(s)) return '兼职';
  return '全职';
}

function normalizeUnit(text: string, raw?: unknown): JobPriceUnit {
  const s = `${String(raw || '')} ${text}`;
  if (/小时|时薪|\/时|\/小时/.test(s)) return '时';
  if (/天|日结|\/日/.test(s)) return '天';
  return '月';
}

function shortHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 100000007;
  return h.toString(36);
}

/** 把 AI 返回的一条招聘信息规范化 */
function normalizeJob(raw: any, idx: number, fallbackDistrict?: string): JobListing | null {
  if (!raw || typeof raw !== 'object') return null;

  const title = String(raw.title || raw.职位 || raw.job || '').trim();
  const company = String(raw.company || raw.公司 || raw.shop || '').trim();
  if (!title && !company) return null;

  const salaryText = String(raw.salaryText || raw.salary || raw.薪资 || '').trim();
  const nums = (salaryText.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0);
  const salaryMin = toNum(raw.salaryMin) ?? (nums.length > 0 ? nums[0] : null);
  const salaryMax =
    toNum(raw.salaryMax) ?? (nums.length > 1 ? nums[1] : salaryMin ?? null);

  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 6)
    : [];

  return {
    id: `job_${shortHash(`${company}-${title}-${idx}`)}`,
    title: title || '招聘岗位',
    company: company || '未标明单位',
    salaryText: salaryText || (salaryMin ? `${salaryMin}元起` : '薪资面议'),
    salaryMin,
    salaryMax,
    salaryUnit: normalizeUnit(salaryText, raw.salaryUnit),
    district: String(raw.district || fallbackDistrict || '').trim() || undefined,
    address: String(raw.address || raw.addr || company || '').trim() || '地址待核实',
    distanceMeters: Math.max(20, Math.round(toNum(raw.distanceMeters) ?? 300 + idx * 130)),
    type: normalizeType(raw.type || raw.jobType),
    experience: String(raw.experience || '').trim() || undefined,
    education: String(raw.education || '').trim() || undefined,
    headcount: toNum(raw.headcount),
    tags,
    description: String(raw.description || raw.desc || '').trim() || undefined,
    publishText: String(raw.publishText || '').trim() || undefined,
    photos: [],
    source: 'ai_search',
  };
}

/** 招聘单位的近似坐标（地图与位置图兜底，距离按房源距离推算） */
function approxJobCoord(
  center: SearchCenter,
  distanceMeters: number,
  seed: string,
  idx: number
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

/** 给岗位补单位实景图与坐标（高德 POI，取不到就用近似坐标 + 首字色块） */
export async function enrichJobMedia(
  jobs: JobListing[],
  center: SearchCenter,
  radius: number,
  amapKey: string
): Promise<JobListing[]> {
  const maxDist = Math.max(radius * 3, 5000);

  const out: JobListing[] = jobs.map((item, idx) => {
    const hasCoord = typeof item.lng === 'number' && typeof item.lat === 'number';
    const approx = approxJobCoord(center, item.distanceMeters, item.id || item.company, idx);
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
      const media = await fetchAmapPoiMedia(item.company, center.city, amapKey);
      if (!media) continue;

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

/** 使用高德周边搜索拉取搜索点周边真实餐饮/商超/酒店/物流/企业实体单位（防 AI 幻觉编造虚假店铺） */
export async function fetchNearbyRealEmployers(
  center: SearchCenter,
  radius: number,
  amapKey: string
): Promise<GroundedEmployerPoi[]> {
  const key = amapKey.trim();
  if (!key) return [];
  try {
    const rMeters = Math.min(Math.max(radius, 1000), 10000);
    const url =
      `https://restapi.amap.com/v5/place/around?key=${encodeURIComponent(key)}` +
      `&location=${center.lng},${center.lat}&types=050000|060000|100000|170000&radius=${rMeters}` +
      '&page_size=24&page_num=1&sortrule=distance&show_fields=photos';
    const resp = await fetch(url);
    const data = await resp.json();
    if (data?.status !== '1' || !Array.isArray(data.pois)) return [];

    const seen = new Set<string>();
    const list: GroundedEmployerPoi[] = [];
    for (const poi of data.pois) {
      const name = String(poi.name || '').trim();
      if (!name || seen.has(name)) continue;
      if (/公厕|洗手间|停车场|ATM|丰巢|菜鸟驿站/.test(name)) continue;
      const [lngStr, latStr] = String(poi.location || '').split(',');
      const lng = Number(lngStr);
      const lat = Number(latStr);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

      seen.add(name);
      const dist = Number(poi.distance) > 0
        ? Math.round(Number(poi.distance))
        : calcDistanceMeters(center.lng, center.lat, lng, lat);
      const rawType = String(poi.type || '');
      const category = rawType.split(';')[0] || '本地商户';
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

      list.push({ name, category, district, address, distanceMeters: dist, lng, lat, photos });
    }
    return list;
  } catch {
    return [];
  }
}

/** 半径越大给的条数越多，避免「换成 5km 还是同一批岗位」 */
export function jobCountForRadius(radius: number): number {
  if (radius <= 1000) return 8;
  if (radius <= 2000) return 10;
  if (radius <= 3000) return 12;
  if (radius <= 5000) return 16;
  return 20;
}

export function buildJobPrompt(
  center: SearchCenter,
  radius: number,
  count = jobCountForRadius(3000),
  realEmployers: GroundedEmployerPoi[] = []
): string {
  const cleanCity = String(center.city || '').replace(/市$/, '');
  const rangeText = radius >= 1000 ? `${Math.round(radius / 1000)}km` : `${radius}m`;
  const nearM = Math.max(150, Math.round(radius * 0.08));
  const midM = Math.max(nearM + 200, Math.round(radius * 0.4));
  const empBlock =
    realEmployers.length > 0
      ? `【高德地图实测周边真实商户/酒店/商超/企业名单（必须严格基于下列真实存在单位生成与业态匹配的岗位，原样使用 company、district、address 和 distanceMeters，严禁编造虚构店名厂名！）】：\n${realEmployers
          .slice(0, 20)
          .map(
            (e, i) =>
              `${i + 1}. 单位名="${e.name}" | 业态="${e.category}" | 区县="${e.district}" | 真实地址="${e.address}" | 距中心=${e.distanceMeters}m`
          )
          .join('\n')}\n\n`
      : '';

  return `你是中国本地招聘信息检索引擎。请检索「${cleanCity} ${center.name}」周边 ${rangeText} 内真实常见在招岗位（参照 BOSS直聘/58同城/智联招聘上该地段门店与企业特征），输出约 ${count} 条。

${empBlock}要求：
1. 岗位必须与单位真实业态对应（餐饮店招服务员/后厨/收银、便利店商超招理货员/导购、酒店招前台/客房保洁、物流招分拣/骑手、企业工厂招普工/文员），不要编造大厂高薪岗位；
2. 薪资符合当地真实行情并注明单位（元/月、元/天、元/时）；类型覆盖全职、兼职、日结、钟点工、实习；
3. 单位名称互不相同，不要同一家店重复出；${
    realEmployers.length > 0
      ? 'company、district、address、distanceMeters 必须严格与上方实测单位一致；'
      : `距离铺满 ${rangeText}（约 1/3 在 ${nearM}-${midM}m，约 1/3 在 ${midM}m-${Math.round(radius * 0.8)}m）；`
  }
4. 不要编造 HR 手机号、微信号，不要输出联系方式字段。

严格只返回 JSON 数组，不要任何解释文字，每项字段如下：
[
  {
    "title": "餐厅服务员",
    "company": "老城火锅店",
    "salaryText": "3200-4000元/月",
    "salaryMin": 3200,
    "salaryMax": 4000,
    "salaryUnit": "月",
    "type": "全职",
    "experience": "经验不限",
    "education": "学历不限",
    "headcount": 2,
    "district": "城关区",
    "address": "城关区建设路 12 号",
    "distanceMeters": 380,
    "tags": ["包吃", "月休4天", "有提成"],
    "description": "负责点单、上菜、餐前准备；能吃苦耐劳、普通话流利，有经验优先。",
    "publishText": "今天发布"
  }
]`;
}

export async function callDirectClientJobs(
  llm: LlmConfig,
  center: SearchCenter,
  radius: number,
  realEmployers: GroundedEmployerPoi[] = []
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
          content: buildJobPrompt(center, radius, jobCountForRadius(radius), realEmployers),
        },
      ],
      temperature: realEmployers.length > 0 ? 0.5 : 0.8,
      max_tokens: 3400,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
  const parsed = extractJsonFromText(String(data?.choices?.[0]?.message?.content || ''));
  return Array.isArray(parsed) ? parsed : [];
}

/** 未配置大模型 Key 时的示例岗位，仅用于看清界面 */
const DEMO_JOBS: Omit<JobListing, 'source' | 'photos'>[] = [
  {
    id: 'job_demo_1',
    title: '餐厅服务员',
    company: '老城火锅店',
    salaryText: '3200-4000元/月',
    salaryMin: 3200,
    salaryMax: 4000,
    salaryUnit: '月',
    type: '全职',
    experience: '经验不限',
    education: '学历不限',
    headcount: 2,
    district: '城关区',
    address: '建设路 12 号',
    distanceMeters: 380,
    tags: ['包吃', '月休4天', '有提成'],
    description: '负责点单、上菜、餐前准备；能吃苦耐劳、普通话流利，有经验优先。',
    publishText: '今天发布',
  },
  {
    id: 'job_demo_2',
    title: '酒店前台',
    company: '汉庭酒店（汽车站店）',
    salaryText: '3000-3800元/月',
    salaryMin: 3000,
    salaryMax: 3800,
    salaryUnit: '月',
    type: '全职',
    experience: '1年以内',
    education: '高中',
    headcount: 1,
    district: '城关区',
    address: '车站路 6 号',
    distanceMeters: 620,
    tags: ['五险', '包住', '上一休一'],
    description: '办理入住退房、接听电话、夜班轮值，会基本电脑操作。',
    publishText: '2天前发布',
  },
  {
    id: 'job_demo_3',
    title: '快递分拣员（夜班）',
    company: '顺丰中转场',
    salaryText: '4500-6000元/月',
    salaryMin: 4500,
    salaryMax: 6000,
    salaryUnit: '月',
    type: '全职',
    experience: '经验不限',
    education: '学历不限',
    headcount: 10,
    district: '物流园',
    address: '物流大道 18 号',
    distanceMeters: 2100,
    tags: ['月结', '夜班补贴', '免费班车'],
    description: '快件分拣、扫描、装车；能适应夜班，身体健康。',
    publishText: '今天发布',
  },
  {
    id: 'job_demo_4',
    title: '超市理货员',
    company: '家家悦超市',
    salaryText: '2800-3200元/月',
    salaryMin: 2800,
    salaryMax: 3200,
    salaryUnit: '月',
    type: '全职',
    experience: '经验不限',
    education: '学历不限',
    headcount: 3,
    district: '城关区',
    address: '人民路 88 号',
    distanceMeters: 740,
    tags: ['五险', '双休', '员工折扣'],
    description: '货架补货、整理排面、检查保质期，早晚班轮换。',
    publishText: '昨天发布',
  },
  {
    id: 'job_demo_5',
    title: '家政保洁（钟点）',
    company: '洁净家政服务部',
    salaryText: '35-45元/时',
    salaryMin: 35,
    salaryMax: 45,
    salaryUnit: '时',
    type: '钟点工',
    experience: '经验不限',
    education: '学历不限',
    headcount: 5,
    district: '城关区',
    address: '幸福路 20 号',
    distanceMeters: 460,
    tags: ['日结', '时间灵活', '就近派单'],
    description: '居家日常保洁、开荒保洁，按单结算，可自选接单时间。',
    publishText: '今天发布',
  },
  {
    id: 'job_demo_6',
    title: '外卖骑手',
    company: '美团外卖（城关站）',
    salaryText: '6000-9000元/月',
    salaryMin: 6000,
    salaryMax: 9000,
    salaryUnit: '月',
    type: '全职',
    experience: '经验不限',
    education: '学历不限',
    headcount: 20,
    district: '城关区',
    address: '中心广场东侧',
    distanceMeters: 320,
    tags: ['多劳多得', '电动车可租', '当天上岗'],
    description: '负责片区内外卖配送，自备或租赁电动车，熟悉本地路况优先。',
    publishText: '今天发布',
  },
  {
    id: 'job_demo_7',
    title: '奶茶店店员（周末兼职）',
    company: '茶百道（步行街店）',
    salaryText: '18-22元/时',
    salaryMin: 18,
    salaryMax: 22,
    salaryUnit: '时',
    type: '兼职',
    experience: '经验不限',
    education: '学历不限',
    headcount: 2,
    district: '城关区',
    address: '步行街 3 号',
    distanceMeters: 290,
    tags: ['周结', '排班灵活', '学生可做'],
    description: '制作饮品、收银、店面清洁，周末与晚班时段，可长期做。',
    publishText: '3天前发布',
  },
];

async function demoResult(
  center: SearchCenter,
  notice: string,
  amapKey = ''
): Promise<JobSearchResult> {
  const cleanCity = String(center.city || '').replace(/市$/, '');
  const base = DEMO_JOBS.map((j) => ({
    ...j,
    address: `${cleanCity}${j.district || ''}${j.address}`,
    photos: [] as string[],
    source: 'demo' as const,
  }));
  const jobs = await enrichJobMedia(base, center, 3000, amapKey);
  return { jobs, mode: 'demo', notice };
}

interface CacheEntry {
  ts: number;
  key: string;
  jobs: JobListing[];
}

function readCache(key: string): JobListing[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || parsed.key !== key) return null;
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    return Array.isArray(parsed.jobs) ? parsed.jobs : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, jobs: JobListing[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), key, jobs }));
  } catch {
    // 忽略存储失败
  }
}

export interface JobQueryOptions {
  center: SearchCenter;
  radius: number;
  llm: LlmConfig;
  /** 高德 Web 服务 Key：补单位实景图与坐标 */
  amapKey?: string;
  serverBaseUrl?: string;
  serpApiKey?: string;
  force?: boolean;
}

/** 联网检索周边招聘：优先后端代理，独立 IPA 未配服务器时端侧直连大模型 */
export async function searchJobs(options: JobQueryOptions): Promise<JobSearchResult> {
  const { center, radius, llm, amapKey = '', serverBaseUrl = '', serpApiKey = '', force } = options;
  const cacheKey = `${center.city}|${center.name}|${radius}|${amapKey ? 'amap' : 'no'}`;

  if (!force) {
    const cached = readCache(cacheKey);
    if (cached && cached.length > 0) {
      const needsMedia = cached.some(
        (item) => !item.photos?.length || typeof item.lng !== 'number' || typeof item.lat !== 'number'
      );
      const jobs = needsMedia ? await enrichJobMedia(cached, center, radius, amapKey) : cached;
      return { jobs, mode: 'ai', notice: '' };
    }
  }

  if (!llm.apiKey.trim()) {
    return demoResult(
      center,
      '当前展示的是示例岗位：在「接口/扫码」里填好大模型 Key 后，会自动联网检索该地段的真实招聘行情。',
      amapKey
    );
  }

  // 拉取高德周边真实存在商户/企业/门店，锚定招聘单位真实性
  const realEmployers = await fetchNearbyRealEmployers(center, radius, amapKey);
  const empMap = new Map(realEmployers.map((e) => [e.name, e]));

  const finish = async (rawList: any[], notice = ''): Promise<JobSearchResult> => {
    const normalized = rawList
      .map((raw, idx) => normalizeJob(raw, idx))
      .filter((j): j is JobListing => Boolean(j))
      .map((j) => {
        const matched =
          empMap.get(j.company) ||
          realEmployers.find((e) => e.name.includes(j.company) || j.company.includes(e.name));
        if (!matched) return j;
        return {
          ...j,
          company: matched.name,
          district: matched.district || j.district,
          address: matched.address || j.address,
          distanceMeters: matched.distanceMeters,
          lng: matched.lng,
          lat: matched.lat,
          geoApprox: false,
          photos: matched.photos.length > 0 ? matched.photos : j.photos,
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    if (normalized.length === 0) {
      return demoResult(center, 'AI 本次没有返回可用岗位，先展示示例数据，可稍后点「重新检索」。', amapKey);
    }
    const jobs = await enrichJobMedia(normalized, center, radius, amapKey);
    writeCache(cacheKey, jobs);
    const mergedNotice =
      notice ||
      (realEmployers.length > 0
        ? `已锚定周边 ${realEmployers.length} 家高德真实商户/单位定位与实景图`
        : '');
    return { jobs, mode: 'ai', notice: mergedNotice };
  };

  let firstError = '';

  if (!(isNativePackagedApp() && !serverBaseUrl)) {
    try {
      const resp = await fetch(resolveApiUrl('/api/ai-jobs', serverBaseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm,
          serpApiKey,
          city: center.city,
          centerName: center.name,
          radius,
          count: jobCountForRadius(radius),
          realEmployers: realEmployers.map((e) => ({
            name: e.name,
            category: e.category,
            district: e.district,
            address: e.address,
            distanceMeters: e.distanceMeters,
          })),
        }),
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data?.jobs) && data.jobs.length > 0) {
        return finish(data.jobs, data.notice || '');
      }
      firstError = data?.error || `后端返回 ${resp.status}`;
    } catch (err: any) {
      firstError = err?.message || '后端不可达';
    }
  }

  try {
    const direct = await callDirectClientJobs(llm, center, radius, realEmployers);
    return finish(direct, '');
  } catch (err: any) {
    const msg = err?.message || firstError || '网络异常';
    return demoResult(center, `招聘检索失败（${msg}），当前为示例数据。`, amapKey);
  }
}

/**
 * 构建精准区域限定检索词：如在济南市章丘区搜「工厂普工」，自动带上「章丘 工厂普工」避免满城乱跳到莱芜/其他远郊区。
 */
export function buildJobSearchKeyword(
  center: SearchCenter,
  job?: JobListing | null
): string {
  const cleanCity = String(center.city || '').replace(/市$/, '');
  const districtShort = String(job?.district || '')
    .replace(/(区|县)$/, '')
    .trim();
  const titleClean = job
    ? job.title.replace(/[（(].*?[)）]/g, '').trim() || job.title
    : `${center.name} 招聘`;

  if (districtShort && districtShort !== cleanCity && !titleClean.includes(districtShort)) {
    return `${districtShort} ${titleClean}`.trim();
  }
  return titleClean;
}

/**
 * BOSS直聘网页搜索页（实测 `/web/geek/jobs?city=...&query=...` 返回 200 直通）。
 */
export function buildBossSearchUrl(city: string, keyword: string): string {
  const code = bossCityCode(city);
  return (
    `https://www.zhipin.com/web/geek/jobs?query=${encodeURIComponent(keyword)}` +
    (code ? `&city=${code}` : '')
  );
}

/** 招聘平台跳转（同时提供精准区域关键词与手机/电脑各自直通链接） */
export function buildJobPlatformLinks(center: SearchCenter, job?: JobListing | null) {
  const cleanCity = String(center.city || '').replace(/市$/, '');
  const slug = anjukeCitySlug(center.city);
  const bossKw = buildJobSearchKeyword(center, job);
  const fullKw = job ? `${cleanCity} ${bossKw}`.trim() : `${cleanCity} ${center.name} 招聘`;
  const encodedBoss = encodeURIComponent(bossKw);
  const encodedFull = encodeURIComponent(fullKw);

  return {
    boss: buildBossSearchUrl(center.city, bossKw),
    wuba: `https://m.58.com/${slug ? `${slug}/` : ''}job/?key=${encodedBoss}`,
    wubaPc: `https://${slug ? `${slug}.` : 'www.'}58.com/job/?key=${encodedBoss}`,
    zhaopin: `https://www.zhaopin.com/sou/?kw=${encodedFull}`,
  };
}

/** 前端筛选 + 排序 */
export function applyJobFilters(jobs: JobListing[], filters: JobFilterState): JobListing[] {
  const kw = filters.keyword.trim().toLowerCase();

  const list = jobs.filter((item) => {
    if (filters.type !== 'all' && item.type !== filters.type) return false;
    if (item.distanceMeters > filters.radius) return false;

    if (filters.salaryRange !== 'all') {
      // 统一折算成月薪做区间比较，日薪×26、时薪×8×22
      const monthly =
        item.salaryUnit === '月'
          ? item.salaryMax ?? item.salaryMin
          : item.salaryUnit === '天'
          ? (item.salaryMax ?? item.salaryMin ?? 0) * 26
          : (item.salaryMax ?? item.salaryMin ?? 0) * 8 * 22;
      if (!monthly) return false;
      if (filters.salaryRange === 'under3000' && monthly >= 3000) return false;
      if (filters.salaryRange === '3000to5000' && (monthly < 3000 || monthly > 5000)) return false;
      if (filters.salaryRange === '5000to8000' && (monthly < 5000 || monthly > 8000)) return false;
      if (filters.salaryRange === 'over8000' && monthly < 8000) return false;
    }

    if (kw) {
      const hay = `${item.title} ${item.company} ${item.address} ${item.district || ''} ${
        item.tags.join(' ')
      }`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  const sorted = [...list];
  if (filters.sortBy === 'salary_desc') {
    sorted.sort((a, b) => (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0));
  } else {
    sorted.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
  return sorted;
}
