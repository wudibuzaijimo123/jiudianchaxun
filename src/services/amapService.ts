import {
  buildRoomHints,
  FALLBACK_HOTEL_PHOTOS,
  PRESET_LANDMARKS,
} from '../data/demoHotels';
import {
  AvailabilityStatus,
  CardRoomRow,
  DataSourceMode,
  HotelCategory,
  HotelItem,
  LiveOtaOffer,
  LiveRoomOffer,
  PlaceSuggestion,
  SearchCenter,
} from '../types/hotel';
import {
  calcDistanceMeters,
  gcj02ToWgs84,
  wgs84ToGcj02,
} from '../utils/coordTransform';
import { loadServerBaseUrl } from '../utils/storage';
import { isNativePackagedApp, resolveApiUrl } from './standaloneClient';

function asStr(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  return '';
}

function normalizeHotelName(name: string): string {
  return name
    .replace(/[（(].*?[)）]/g, '')
    .replace(/(酒店|宾馆|大酒店|国际酒店|旅馆|民宿|公寓|店|济南|山东)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * 过滤高德住宿类目中混入的快递驿站（兔喜驿站/菜鸟驿站等）、学校/单位内部宿舍、养老院、宠物店等非对外营业住宿
 */
function isRealBookableHotel(name: string, rawType: string): boolean {
  const text = `${name} ${rawType}`;

  // 1. 排除各类快递驿站（因含“驿站”二字常被地图误归入旅馆驿站）
  if (
    /兔喜|菜鸟驿站|妈妈驿站|熊猫快收|近邻宝|驿收发|丰巢|快递|速递|物流|代收点|邮政支局|顺丰|中通|圆通|申通|韵达|极兔/.test(
      text
    )
  ) {
    return false;
  }

  // 2. 排除单位内部宿舍、家属院、驻地办非营业楼
  if (/宿舍|家属院|家属楼|职工楼|教工楼|人才公寓|公租房|保租房|廉租房|安置房/.test(text)) {
    return false;
  }

  // 3. 排除大中小学内部的学生公寓楼（如“XX学校6号公寓”、“XX学院学生公寓”），保留正常商业“酒店公寓”
  if (
    /(大学|学院|学校|中学|小学|一中|二中|实验校).*?(学生公寓|男女生公寓|\d+号公寓|[一二三四五六七八九十]+号公寓|公寓楼)/.test(
      name
    ) &&
    !/酒店|宾馆|美宿|民宿|日租/.test(name)
  ) {
    return false;
  }

  // 4. 排除养老、月子、宠物寄养等非普通住店场所
  if (/养老院|敬老院|护理院|康养中心|月子中心|月子会所|宠物酒店|宠物寄养|猫咪寄养/.test(text)) {
    return false;
  }

  return true;
}

function classifyHotel(
  name: string,
  rawType: string,
  stars?: string
): { category: Exclude<HotelCategory, 'all'>; label: string; estPrice: number } {
  const text = `${name} ${rawType} ${stars || ''}`;

  if (
    /五星|豪华|万豪|丽思卡尔顿|瑞吉|柏悦|君悦|凯悦|香格里拉|洲际|希尔顿|华尔道夫|康莱德|威斯汀|W酒店|喜来登|索菲特|费尔蒙|文华东方|四季酒店|半岛酒店|安缦|英迪格|皇冠假日/.test(
      text
    ) ||
    stars === '5'
  ) {
    return { category: 'luxury', label: '豪华星级', estPrice: 720 };
  }

  if (/民宿|公寓|客栈|青旅|青年旅舍|招待所|美宿|驻宿|日租|短租|Loft|复式/i.test(text)) {
    return { category: 'homestay', label: '民宿公寓', estPrice: 138 };
  }

  if (
    /四星|三星|高档|舒适|全季|亚朵|桔子|橘子|维也纳|丽枫|智选假日|希尔顿欢朋|万枫|美居|诺富特|漫心|星程|和颐|开元名庭|戴斯|锦江都城|君亭|亚朵S|希岸|麗枫/.test(
      text
    ) ||
    stars === '4' ||
    stars === '3'
  ) {
    return { category: 'comfort', label: '舒适高档', estPrice: 299 };
  }

  if (
    /经济|快捷|汉庭|如家|7天|七天|锦江之星|格林豪泰|速8|海友|尚客优|城市便捷|布丁|怡莱|莫泰|IU酒店|派柏|银座佳驿|贝壳酒店|都市118|驿家365/.test(
      text
    )
  ) {
    return { category: 'economy', label: '经济连锁', estPrice: 139 };
  }

  if (/大酒店|国际酒店|花园酒店|度假酒店/.test(text)) {
    return { category: 'comfort', label: '舒适高档', estPrice: 259 };
  }
  return { category: 'economy', label: '经济宾馆', estPrice: 109 };
}

function extractTags(
  name: string,
  rawType: string,
  businessArea: string,
  tagStr: string,
  distance: number
): string[] {
  const tags: string[] = [];
  if (distance <= 350) tags.push('核心近距');
  else if (distance <= 800) tags.push('步行可达');

  if (businessArea) tags.push(`${businessArea}商圈`);

  if (/全季|汉庭|橘子|桔子|漫心|海友|星程/.test(name)) tags.push('华住会体系');
  else if (/亚朵/.test(name)) tags.push('亚朵星球');
  else if (/如家|和颐|莫泰/.test(name)) tags.push('首旅如家');
  else if (/维也纳|锦江|丽枫|麗枫|7天|希岸/.test(name)) tags.push('锦江荟体系');
  else if (/格林豪泰|贝壳/.test(name)) tags.push('格林酒店系');
  else if (/尚客优|骏怡/.test(name)) tags.push('尚美数智');

  if (tagStr) {
    tagStr
      .split(/[;,，、\s]+/)
      .filter((t) => t.length >= 2 && t.length <= 7)
      .slice(0, 2)
      .forEach((t) => {
        if (!tags.includes(t)) tags.push(t);
      });
  }

  if (tags.length < 3) {
    if (/公寓|民宿|日租/.test(rawType + name)) tags.push('自助入住');
    else tags.push('24h前台');
  }
  return tags.slice(0, 4);
}

export interface NearbySearchResult {
  hotels: HotelItem[];
  mode: DataSourceMode;
  notice?: string;
}

/**
 * 1. 地点输入联想提示
 */
export async function fetchPlaceSuggestions(
  keyword: string,
  amapKey: string
): Promise<PlaceSuggestion[]> {
  const cleanKw = keyword.trim();
  if (!cleanKw) return [];

  const localMatches: PlaceSuggestion[] = PRESET_LANDMARKS.filter(
    (p) =>
      p.name.includes(cleanKw) ||
      p.city.includes(cleanKw) ||
      (p.address && p.address.includes(cleanKw))
  ).map((p, idx) => ({
    id: `preset-${idx}`,
    name: p.name,
    district: p.city,
    address: p.address || p.city,
    city: p.city,
    lng: p.lng,
    lat: p.lat,
  }));

  if (amapKey.trim()) {
    try {
      const url = `https://restapi.amap.com/v3/assistant/inputtips?key=${encodeURIComponent(
        amapKey.trim()
      )}&keywords=${encodeURIComponent(cleanKw)}&datatype=all`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === '1' && Array.isArray(data.tips)) {
        const amapTips: PlaceSuggestion[] = data.tips
          .filter((tip: any) => typeof tip.location === 'string' && tip.location.includes(','))
          .slice(0, 8)
          .map((tip: any, idx: number) => {
            const [lngStr, latStr] = tip.location.split(',');
            const district = asStr(tip.district);
            const cityMatch = district.match(/([^省自治区]+?[市州盟])/);
            return {
              id: asStr(tip.id) || `tip-${idx}`,
              name: asStr(tip.name),
              district,
              address: asStr(tip.address) ? `${district}${asStr(tip.address)}` : district,
              city: cityMatch ? cityMatch[1] : district,
              lng: Number(lngStr),
              lat: Number(latStr),
            };
          });
        if (amapTips.length > 0) return amapTips;
      }

      const poiUrl = `https://restapi.amap.com/v5/place/text?key=${encodeURIComponent(
        amapKey.trim()
      )}&keywords=${encodeURIComponent(cleanKw)}&page_size=8`;
      const poiRes = await fetch(poiUrl);
      const poiData = await poiRes.json();
      if (poiData.status === '1' && Array.isArray(poiData.pois) && poiData.pois.length > 0) {
        return poiData.pois
          .filter((p: any) => typeof p.location === 'string' && p.location.includes(','))
          .map((p: any, idx: number) => {
            const [lngStr, latStr] = p.location.split(',');
            const city = asStr(p.cityname);
            const adname = asStr(p.adname);
            return {
              id: asStr(p.id) || `amap-poi-${idx}`,
              name: asStr(p.name),
              district: `${city}${adname}`,
              address: `${city}${adname}${asStr(p.address)}`,
              city,
              lng: Number(lngStr),
              lat: Number(latStr),
            };
          });
      }
    } catch {
      // ignore
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanKw)}&limit=8`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.features) && data.features.length > 0) {
        const photonTips: PlaceSuggestion[] = data.features
          .filter((f: any) => Array.isArray(f.geometry?.coordinates))
          .map((f: any, idx: number) => {
            const [wgsLng, wgsLat] = f.geometry.coordinates;
            const [gcjLng, gcjLat] = wgs84ToGcj02(Number(wgsLng), Number(wgsLat));
            const props = f.properties || {};
            const state = asStr(props.state);
            const city = asStr(props.city) || asStr(props.county) || state || '中国';
            const district = asStr(props.district) || asStr(props.locality);
            const street = asStr(props.street);
            const name = asStr(props.name) || cleanKw;
            const fullAddr = [state, city !== state ? city : '', district, street]
              .filter(Boolean)
              .join('');

            return {
              id: `photon-${props.osm_id || idx}`,
              name,
              district: `${city}${district}`,
              address: fullAddr || city,
              city,
              lng: gcjLng,
              lat: gcjLat,
            };
          });
        return [...localMatches, ...photonTips].slice(0, 8);
      }
    }
  } catch {
    // ignore
  }

  return localMatches;
}

export async function resolvePlaceCenter(
  keyword: string,
  amapKey: string
): Promise<SearchCenter | null> {
  const tips = await fetchPlaceSuggestions(keyword, amapKey);
  if (tips.length > 0) {
    const first = tips[0];
    return {
      name: first.name,
      address: first.address,
      city: first.city || first.district || '',
      lng: first.lng,
      lat: first.lat,
    };
  }
  return null;
}

export async function reverseGeocodeGcj02(
  gcjLng: number,
  gcjLat: number,
  amapKey: string
): Promise<SearchCenter> {
  if (amapKey.trim()) {
    try {
      const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(
        amapKey.trim()
      )}&location=${gcjLng},${gcjLat}&extensions=base`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === '1' && data.regeocode) {
        const comp = data.regeocode.addressComponent || {};
        const city = asStr(comp.city) || asStr(comp.province) || '当前城市';
        const district = asStr(comp.district);
        const street = asStr(comp.township);
        const formatted = asStr(data.regeocode.formatted_address);
        return {
          name: street ? `${district}${street}` : formatted || '所选地图位置',
          address: formatted || `${gcjLng}, ${gcjLat}`,
          city,
          lng: gcjLng,
          lat: gcjLat,
        };
      }
    } catch {
      // ignore
    }
  }

  try {
    const [wgsLng, wgsLat] = gcj02ToWgs84(gcjLng, gcjLat);
    const url = `https://photon.komoot.io/reverse?lon=${wgsLng}&lat=${wgsLat}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const props = data.features?.[0]?.properties;
      if (props) {
        const city = asStr(props.city) || asStr(props.state) || '当前城市';
        const district = asStr(props.district);
        const name = asStr(props.name) || asStr(props.street) || district || '所选位置';
        return {
          name,
          address: [asStr(props.state), city, district, asStr(props.street)]
            .filter(Boolean)
            .join(''),
          city,
          lng: gcjLng,
          lat: gcjLat,
        };
      }
    }
  } catch {
    // ignore
  }

  return {
    name: '地图所选位置',
    address: `坐标 ${gcjLng.toFixed(4)}, ${gcjLat.toFixed(4)}`,
    city: '当前城市',
    lng: gcjLng,
    lat: gcjLat,
  };
}

/**
 * 解析 SerpApi Google Hotels 单个酒店的平台报价列表
 */
function parseSerpOffers(prop: any): LiveOtaOffer[] {
  const rawList = Array.isArray(prop.featured_prices)
    ? prop.featured_prices
    : Array.isArray(prop.prices)
    ? prop.prices
    : [];

  return rawList
    .map((fp: any) => {
      const nightly =
        fp.rate_per_night?.extracted_lowest ??
        fp.extracted_price ??
        parseFloat(String(fp.rate_per_night?.lowest || fp.price || '').replace(/[^\d.]/g, ''));

      if (!Number.isFinite(nightly) || nightly <= 0) return null;

      const total = fp.total_rate?.extracted_lowest;
      const rooms: LiveRoomOffer[] = Array.isArray(fp.rooms)
        ? fp.rooms
            .map((rm: any) => {
              const rPrice =
                rm.rate_per_night?.extracted_lowest ??
                rm.extracted_price ??
                nightly;
              return {
                name: asStr(rm.name) || '标准客房',
                nightlyPrice: Math.round(rPrice),
                totalPrice: rm.total_rate?.extracted_lowest
                  ? Math.round(rm.total_rate.extracted_lowest)
                  : undefined,
                numGuests: rm.num_guests,
                link: asStr(rm.link) || asStr(fp.link),
                images: Array.isArray(rm.images) ? rm.images : [],
              };
            })
            .filter((r: LiveRoomOffer) => r.nightlyPrice > 0)
        : [];

      return {
        source: asStr(fp.source) || '在线预订渠道',
        logo: asStr(fp.logo),
        nightlyPrice: Math.round(nightly),
        totalPrice: total ? Math.round(total) : undefined,
        link: asStr(fp.link) || asStr(prop.link),
        rooms,
      } as LiveOtaOffer;
    })
    .filter(Boolean) as LiveOtaOffer[];
}

/**
 * 调用官方 SerpApi Google Hotels 查询目标点指定日期的实时空房与各平台报价
 */
async function fetchLiveHotelInventory(
  center: SearchCenter,
  radiusMeters: number,
  checkIn: string,
  checkOut: string,
  serpApiKey: string
): Promise<{ items: HotelItem[]; error?: string }> {
  if (!serpApiKey.trim()) return { items: [] };
  const serverBase = loadServerBaseUrl();
  // 若运行在独立 IPA 内且未填远程后端服务器地址，跳过本地代理接口，直接由高德+端侧AI工作
  if (isNativePackagedApp() && !serverBase) return { items: [] };

  try {
    const [wgsLng, wgsLat] = gcj02ToWgs84(center.lng, center.lat);
    const cleanCity = (center.city || '').replace(/市$/, '');
    const strippedName = center.name.replace(/[（(].*?[)）]/g, '').trim();

    const querySerp = async (qStr: string) => {
      const url = resolveApiUrl(
        `/api/serp-hotels?api_key=${encodeURIComponent(
          serpApiKey.trim()
        )}&q=${encodeURIComponent(qStr)}&check_in_date=${encodeURIComponent(
          checkIn
        )}&check_out_date=${encodeURIComponent(checkOut)}`,
        serverBase
      );
      const resp = await fetch(url);
      return resp.json();
    };

    const translateSerpErr = (rawErr: string) => {
      if (/not.*verified|verify/i.test(rawErr)) {
        return '你的 SerpApi 账号尚未完成邮箱或手机号验证，请在 serpapi.com 网页完成验证激活后即可生效！';
      }
      if (/invalid.*api_key|invalid api key/i.test(rawErr)) {
        return 'SerpApi Key 无效，请确认复制的是 serpapi.com/manage-api-key 页面上的 64 位 Private API Key。';
      }
      return rawErr;
    };

    // 先按清洗掉括号后的中文地标搜周边酒店，若无近距匹配再按 GPS 坐标搜
    const primaryQ = cleanCity ? `${cleanCity} ${strippedName} 酒店` : `${strippedName} 酒店`;
    let data = await querySerp(primaryQ);
    if (data.error) {
      return { items: [], error: translateSerpErr(String(data.error)) };
    }

    const hasNearbyInList = (arr: any[]) =>
      arr.some((p: any) => {
        const g = p.gps_coordinates;
        if (!g || typeof g.longitude !== 'number') return false;
        const [glng, glat] = wgs84ToGcj02(g.longitude, g.latitude);
        return calcDistanceMeters(center.lng, center.lat, glng, glat) <= Math.max(radiusMeters * 3, 8000);
      });

    if (!Array.isArray(data.properties) || !hasNearbyInList(data.properties)) {
      const coordData = await querySerp(`Hotels near ${wgsLat.toFixed(4)},${wgsLng.toFixed(4)}`);
      if (coordData.error) {
        return { items: [], error: translateSerpErr(String(coordData.error)) };
      }
      if (Array.isArray(coordData.properties) && coordData.properties.length > 0) {
        data = coordData;
      }
    }

    const rawProps = Array.isArray(data.properties)
      ? data.properties
      : data.type === 'hotel'
      ? [data]
      : [];

    if (rawProps.length === 0) {
      return { items: [] };
    }

    const items: HotelItem[] = [];
    const maxDist = Math.max(radiusMeters * 3, 8000);

    for (let idx = 0; idx < rawProps.length; idx++) {
      const prop = rawProps[idx];
      const gps = prop.gps_coordinates;
      let gcjLng = center.lng;
      let gcjLat = center.lat;
      let distance = 500;

      if (gps && typeof gps.longitude === 'number' && typeof gps.latitude === 'number') {
        [gcjLng, gcjLat] = wgs84ToGcj02(gps.longitude, gps.latitude);
        distance = calcDistanceMeters(center.lng, center.lat, gcjLng, gcjLat);
        if (distance > maxDist) continue;
      }

      const name = asStr(prop.name) || `可订酒店 ${idx + 1}`;
      if (!isRealBookableHotel(name, asStr(prop.type))) continue;
      const cls = classifyHotel(name, asStr(prop.type), asStr(prop.hotel_class));
      const lowestNightly =
        prop.rate_per_night?.extracted_lowest ??
        parseFloat(String(prop.rate_per_night?.lowest || '').replace(/[^\d.]/g, ''));

      const hasLiveRate = Number.isFinite(lowestNightly) && lowestNightly > 0;
      const availability: AvailabilityStatus = hasLiveRate ? 'available' : 'sold_out';
      const offers = parseSerpOffers(prop);

      // 构建直接在卡片正面展示的实时客房情况行
      const liveCardRooms: CardRoomRow[] = [];
      for (const off of offers) {
        for (const rm of off.rooms) {
        if (rm && liveCardRooms.length < 4) {
          liveCardRooms.push({
            name: `${rm.name}`,
            spec: `${off.source}${rm.numGuests ? ` · 可住${rm.numGuests}人` : ''}`,
            status: '实时有空房',
            leftText: '在线可订',
            price: rm.nightlyPrice,
            isLive: true,
            bookUrl: rm.link || off.link,
          });
        }
        }
      }
      if (liveCardRooms.length === 0 && offers.length > 0) {
        offers.slice(0, 2).forEach((off) => {
          liveCardRooms.push({
            name: `${off.source} 标准客房`,
            status: '实时有空房',
            price: off.nightlyPrice,
            isLive: true,
          });
        });
      } else if (liveCardRooms.length === 0 && hasLiveRate) {
        liveCardRooms.push(
          { name: '标准大床房', status: '实时有空房', price: Math.round(lowestNightly), isLive: true },
          { name: '标准双床房', status: '实时有空房', price: Math.round(lowestNightly * 1.15), isLive: true }
        );
      }

      const photos: string[] = Array.isArray(prop.images)
        ? prop.images
            .map((img: any) => asStr(img.original_image || img.thumbnail))
            .filter((u: string) => u.startsWith('http'))
        : [];

      const amenities: string[] = Array.isArray(prop.amenities)
        ? prop.amenities.slice(0, 4).map((a: any) => String(a))
        : extractTags(name, '酒店', '', '', distance);

      items.push({
        id: asStr(prop.property_token) || `live-${idx}`,
        name,
        city: center.city || '',
        address: asStr(prop.description) || `${center.name}周边 ${distance}m`,
        lng: gcjLng,
        lat: gcjLat,
        distance,
        rawType: '实时房态直连',
        category: cls.category,
        categoryLabel: cls.label,
        rating:
          typeof prop.overall_rating === 'number'
            ? Number(prop.overall_rating.toFixed(1))
            : null,
        reviewCount: typeof prop.reviews === 'number' ? prop.reviews : undefined,
        minPrice: hasLiveRate ? Math.round(lowestNightly) : null,
        priceSource: hasLiveRate ? 'live_ota' : 'none',
        availability,
        propertyToken: asStr(prop.property_token) || undefined,
        otaOffers: offers,
        cardRooms: liveCardRooms,
        phones: [],
        photos: photos.length > 0 ? photos : FALLBACK_HOTEL_PHOTOS[cls.category],
        tags: amenities,
        roomHints: buildRoomHints(cls.category, hasLiveRate ? Math.round(lowestNightly) : null),
        source: 'amap_live',
      });
    }

    return { items };
  } catch (e: any) {
    return { items: [], error: e?.message || '实时房态接口请求失败' };
  }
}

/**
 * 点开单个酒店抽屉时：实时拉取该酒店在所选入住日期下的【各平台比价 + 具体空房房型列表】
 * 支持通过 propertyToken 精准拉取，或通过「城市 + 酒店名」按需实时匹配查询
 */
export async function fetchHotelLiveRoomsDetail(
  propertyToken: string | undefined,
  hotelName: string,
  city: string,
  checkIn: string,
  checkOut: string,
  serpApiKey: string
): Promise<LiveOtaOffer[]> {
  if (!serpApiKey.trim()) return [];
  const serverBase = loadServerBaseUrl();
  if (isNativePackagedApp() && !serverBase) return [];
  try {
    if (propertyToken) {
      const url = resolveApiUrl(
        `/api/serp-hotels?api_key=${encodeURIComponent(
          serpApiKey.trim()
        )}&property_token=${encodeURIComponent(
          propertyToken
        )}&check_in_date=${encodeURIComponent(checkIn)}&check_out_date=${encodeURIComponent(
          checkOut
        )}`,
        serverBase
      );
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data.error) {
        const offers = parseSerpOffers(data);
        if (offers.length > 0) return offers;
      }
    }

    // 若列表阶段没有挂载到 propertyToken，按「城市 + 酒店名」实时定向检索该门店
    const cleanCity = (city || '').replace(/市$/, '');
    const q = cleanCity ? `${cleanCity} ${hotelName}` : hotelName;
    const searchUrl = resolveApiUrl(
      `/api/serp-hotels?api_key=${encodeURIComponent(
        serpApiKey.trim()
      )}&q=${encodeURIComponent(q)}&check_in_date=${encodeURIComponent(
        checkIn
      )}&check_out_date=${encodeURIComponent(checkOut)}`,
      serverBase
    );
    const sResp = await fetch(searchUrl);
    const sData = await sResp.json();
    if (sData.error) return [];

    if (sData.type === 'hotel') {
      return parseSerpOffers(sData);
    }
    if (Array.isArray(sData.properties) && sData.properties.length > 0) {
      const targetNorm = normalizeHotelName(hotelName);
      const matched = sData.properties.find((p: any) => {
        const pNorm = normalizeHotelName(asStr(p.name));
        return pNorm && targetNorm && (pNorm.includes(targetNorm) || targetNorm.includes(pNorm));
      });
      if (matched) {
        if (matched.property_token) {
          const detailUrl = `/api/serp-hotels?api_key=${encodeURIComponent(
            serpApiKey.trim()
          )}&property_token=${encodeURIComponent(
            matched.property_token
          )}&check_in_date=${encodeURIComponent(
            checkIn
          )}&check_out_date=${encodeURIComponent(checkOut)}`;
          const dResp = await fetch(detailUrl);
          const dData = await dResp.json();
          const dOffers = parseSerpOffers(dData);
          if (dOffers.length > 0) return dOffers;
        }
        return parseSerpOffers(matched);
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * 高德 POI 2.0 (v5/place/around?show_fields=business,cost,photos) + v3 兼容拉取周边全量酒店与均价
 */
async function fetchAmapNearbyPois(
  center: SearchCenter,
  radiusMeters: number,
  amapKey: string
): Promise<{ hotels: HotelItem[]; errorMsg?: string }> {
  const cleanKey = amapKey.trim();
  if (!cleanKey) return { hotels: [] };

  try {
    // 同时并行请求高德 POI 2.0 (v5) 与 POI 1.0 (v3 extensions=all)，融合两边官方收录的 lowest_price 与 cost 实价！
    const fetchV5Page = async (pageNum: number) => {
      const url = `https://restapi.amap.com/v5/place/around?key=${encodeURIComponent(
        cleanKey
      )}&location=${center.lng},${center.lat}&types=100000&radius=${radiusMeters}&page_size=25&page_num=${pageNum}&sortrule=distance&show_fields=business,cost,photos`;
      const r = await fetch(url);
      return r.json();
    };

    const fetchV3Page = async (pageNum: number) => {
      const url = `https://restapi.amap.com/v3/place/around?key=${encodeURIComponent(
        cleanKey
      )}&location=${center.lng},${center.lat}&types=100000&radius=${radiusMeters}&offset=25&page=${pageNum}&sortrule=distance&extensions=all`;
      const r = await fetch(url);
      return r.json();
    };

    const [p1, v3p1] = await Promise.all([
      fetchV5Page(1),
      fetchV3Page(1).catch(() => null),
    ]);

    // 提取 v3 中可能独有的官方最低房价 (lowest_price / cost) 映射表
    const v3PriceMap = new Map<string, number>();
    if (v3p1?.status === '1' && Array.isArray(v3p1.pois)) {
      for (const vp of v3p1.pois) {
        const vid = asStr(vp.id);
        const vPriceStr = asStr(vp.biz_ext?.lowest_price) || asStr(vp.biz_ext?.cost);
        const vNum = parseFloat(vPriceStr);
        if (vid && Number.isFinite(vNum) && vNum >= 15) {
          v3PriceMap.set(vid, Math.round(vNum));
        }
      }
    }
    if (p1.status === '1' && Array.isArray(p1.pois)) {
      let allPois = [...p1.pois];
      if (p1.pois.length === 25) {
        try {
          const p2 = await fetchV5Page(2);
          if (p2.status === '1' && Array.isArray(p2.pois)) {
            allPois = [...allPois, ...p2.pois];
          }
        } catch {
          // ignore
        }
      }

      const hotels: HotelItem[] = allPois
        .filter(
          (poi: any) =>
            typeof poi.location === 'string' &&
            poi.location.includes(',') &&
            isRealBookableHotel(asStr(poi.name), asStr(poi.type))
        )
        .map((poi: any, idx: number) => {
          const [lngStr, latStr] = poi.location.split(',');
          const lng = Number(lngStr);
          const lat = Number(latStr);
          const distRaw = Number(asStr(poi.distance));
          const distance =
            Number.isFinite(distRaw) && distRaw > 0
              ? distRaw
              : calcDistanceMeters(center.lng, center.lat, lng, lat);

          const name = asStr(poi.name) || `周边酒店 ${idx + 1}`;
          const rawType = asStr(poi.type) || '住宿服务;宾馆酒店';
          const biz = poi.business || {};
          const cls = classifyHotel(name, rawType);

          const ratingNum = parseFloat(asStr(biz.rating));
          const rating =
            Number.isFinite(ratingNum) && ratingNum > 0 && ratingNum <= 5
              ? Number(ratingNum.toFixed(1))
              : null;

          // 融合高德 v5 (business.cost) 与 v3 (biz_ext.lowest_price) 的真实挂牌底价
          const poiId = asStr(poi.id) || `amap5-${idx}`;
          const costRaw = asStr(biz.cost) || asStr(poi.cost?.cost) || asStr(poi.cost);
          const costNum = parseFloat(costRaw);
          const v3Price = v3PriceMap.get(poiId);
          const officialPrice =
            Number.isFinite(costNum) && costNum >= 15
              ? Math.round(costNum)
              : v3Price ?? null;
          const hasAmapCost = officialPrice !== null;

          const telStr = asStr(biz.tel) || asStr(poi.tel);
          const phones = telStr
            ? telStr
                .split(/[;；/]+/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

          const photos: string[] = Array.isArray(poi.photos)
            ? poi.photos
                .map((ph: any) => asStr(ph?.url))
                .filter((u: string) => u.startsWith('http'))
            : [];

          const city = asStr(poi.cityname) || center.city || '';
          const district = asStr(poi.adname);
          const addr = asStr(poi.address) || `${district}${name}`;
          const businessArea = asStr(biz.business_area);
          const rectag = asStr(biz.rectag) || asStr(biz.keytag);

          return {
            id: poiId,
            name,
            city,
            district,
            address: district && !addr.startsWith(district) ? `${district}${addr}` : addr,
            lng,
            lat,
            distance,
            rawType,
            category: cls.category,
            categoryLabel: cls.label,
            rating,
            minPrice: officialPrice,
            priceSource: hasAmapCost ? ('amap_cost' as const) : ('none' as const),
            availability: 'unknown' as const,
            phones,
            photos: photos.length > 0 ? photos : FALLBACK_HOTEL_PHOTOS[cls.category],
            tags: extractTags(name, rawType, businessArea, rectag, distance),
            roomHints: buildRoomHints(cls.category, officialPrice),
            source: 'amap' as const,
          };
        });

      return { hotels };
    }

    const infoCode = asStr(p1.infocode);
    if (infoCode === '10009') {
      return {
        hotels: [],
        errorMsg:
          '高德 Key 类型选成了「Web端(JS API)」，请在高德控制台新建一个勾选「Web服务」的 Key。',
      };
    }
    return { hotels: [], errorMsg: `高德接口提示：${asStr(p1.info) || infoCode}` };
  } catch {
    return { hotels: [], errorMsg: '高德接口网络请求超时' };
  }
}

/**
 * 综合双擎搜索：高德 POI 2.0（位置/电话/间夜均价） + SerpApi Google Hotels（实时空房状态/多平台实时房价）
 */
export async function searchNearbyHotels(
  center: SearchCenter,
  radiusMeters: number,
  amapKey: string,
  serpApiKey = '',
  checkIn = '',
  checkOut = ''
): Promise<NearbySearchResult> {
  const [amapRes, liveRes] = await Promise.all([
    fetchAmapNearbyPois(center, radiusMeters, amapKey),
    fetchLiveHotelInventory(center, radiusMeters, checkIn, checkOut, serpApiKey),
  ]);

  const amapHotels = amapRes.hotels;
  const liveHotels = liveRes.items;

  // 若两边都有数据，智能融合：把实时空房与各平台实时报价挂载到高德酒店卡片上，并补充其余实时可订酒店
  if (amapHotels.length > 0 && liveHotels.length > 0) {
    const usedLiveIdx = new Set<number>();

    const merged = amapHotels.map((ah) => {
      const normA = normalizeHotelName(ah.name);
      let bestIdx = -1;

      for (let i = 0; i < liveHotels.length; i++) {
        if (usedLiveIdx.has(i)) continue;
        const lh = liveHotels[i];
        const normL = normalizeHotelName(lh.name);
        const distBetween = calcDistanceMeters(ah.lng, ah.lat, lh.lng, lh.lat);

        const nameMatch =
          normA.length >= 2 &&
          normL.length >= 2 &&
          (normA.includes(normL) || normL.includes(normA));

        if ((nameMatch && distBetween < 1500) || distBetween < 120) {
          bestIdx = i;
          break;
        }
      }

      if (bestIdx >= 0) {
        usedLiveIdx.add(bestIdx);
        const lh = liveHotels[bestIdx];
        return {
          ...ah,
          minPrice: lh.minPrice ?? ah.minPrice,
          priceSource: lh.minPrice ? ('live_ota' as const) : ah.priceSource,
          availability: lh.availability,
          propertyToken: lh.propertyToken,
          otaOffers: lh.otaOffers,
          cardRooms: lh.cardRooms,
          rating: ah.rating ?? lh.rating,
          reviewCount: lh.reviewCount,
          source: 'amap_live' as const,
        };
      }
      return ah;
    });

    // 把高德前 50 条没覆盖到但周边有实时空房的酒店也加进来展示
    liveHotels.forEach((lh, idx) => {
      if (!usedLiveIdx.has(idx) && lh.distance <= Math.max(radiusMeters * 2, 5000)) {
        merged.push(lh);
      }
    });

    merged.sort((a, b) => {
      // 有实时报价的排在前面或按距离排
      return a.distance - b.distance;
    });
    const liveMatchedCount = merged.filter((m) => m.priceSource === 'live_ota').length;
    return {
      hotels: merged,
      mode: 'amap_live',
      notice: liveRes.error
        ? `实时房态接口报错：${liveRes.error}`
        : `已同步 ${liveMatchedCount} 家实时可订酒店空房与报价（部分村镇个体小旅馆未接入线上分销网，仅支持电话或美团App内团购）。`,
    };
  }

  if (liveHotels.length > 0) {
    return {
      hotels: liveHotels,
      mode: 'amap_live',
    };
  }

  if (amapHotels.length > 0) {
    const pricedCount = amapHotels.filter((h) => h.minPrice !== null).length;
    const hint = !serpApiKey.trim()
      ? `高德已加载 ${amapHotels.length} 家住宿（其中 ${pricedCount} 家含高德官方间夜均价）。想在页面内直接看「今日是否有空房 + 携程/Agoda实时细分房型价」，可点右上角免费填入 SerpApi Key！`
      : liveRes.error
      ? `实时房态接口提示：${liveRes.error}`
      : '当前小范围多为个体小旅馆（未接入携程/Agoda公开房态网）；可将半径切至 5km 或切换商圈（如西湖/春熙路/机场）查看连锁酒店实时空房与报价。';

    return {
      hotels: amapHotels,
      mode: 'amap',
      notice: hint,
    };
  }

  return {
    hotels: [],
    mode: 'demo',
    notice:
      amapRes.errorMsg ||
      '请点击右上角填入免费高德 Key（查全量位置电话与均价）和 SerpApi Key（查实时空房与各房型报价）。',
  };
}
