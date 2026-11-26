import { HotelCategory, HotelItem, RoomHint, SearchCenter } from '../types/hotel';
import { calcDistanceMeters } from '../utils/coordTransform';

export const PRESET_LANDMARKS: SearchCenter[] = [
  {
    name: '杭州西湖湖滨银泰',
    address: '浙江省杭州市上城区延安路258号',
    city: '杭州市',
    lng: 120.16368,
    lat: 30.25465,
  },
  {
    name: '上海外滩南京东路',
    address: '上海市黄浦区南京东路步行街',
    city: '上海市',
    lng: 121.48473,
    lat: 31.23818,
  },
  {
    name: '北京三里屯太古里',
    address: '北京市朝阳区三里屯路19号',
    city: '北京市',
    lng: 116.45432,
    lat: 39.93479,
  },
  {
    name: '成都春熙路太古里',
    address: '四川省成都市锦江区春熙路街道',
    city: '成都市',
    lng: 104.08152,
    lat: 30.65568,
  },
  {
    name: '深圳南山科技园万象天地',
    address: '广东省深圳市南山区深南大道9668号',
    city: '深圳市',
    lng: 113.95542,
    lat: 22.54168,
  },
  {
    name: '广州珠江新城花城广场',
    address: '广东省广州市天河区花城大道89号',
    city: '广州市',
    lng: 113.32452,
    lat: 23.11992,
  },
];

// 高质感酒店实景占位图 (Unsplash 精选酒店客房与大堂)
export const FALLBACK_HOTEL_PHOTOS: Record<Exclude<HotelCategory, 'all'>, string[]> = {
  luxury: [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
  ],
  comfort: [
    'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
  ],
  economy: [
    'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?auto=format&fit=crop&w=800&q=80',
  ],
  homestay: [
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
  ],
};

export function buildRoomHints(
  category: Exclude<HotelCategory, 'all'>,
  basePrice: number | null
): RoomHint[] {
  const base = basePrice && basePrice > 50 ? basePrice : category === 'luxury' ? 680 : category === 'comfort' ? 320 : category === 'homestay' ? 240 : 169;
  switch (category) {
    case 'luxury':
      return [
        { name: '豪华大床房', bedInfo: '1张2.0m特大床', area: '40-48㎡', windowInfo: '落地全景窗', estPrice: base },
        { name: '行政双床房', bedInfo: '2张1.35m单人床', area: '45-52㎡', windowInfo: '含双早 · 行政礼遇', estPrice: Math.round(base * 1.22) },
        { name: '景观尊享套房', bedInfo: '1张2.0m大床 + 会客厅', area: '72㎡', windowInfo: '高层城景', estPrice: Math.round(base * 1.75) },
      ];
    case 'comfort':
      return [
        { name: '高级大床房', bedInfo: '1张1.8m大床', area: '26-30㎡', windowInfo: '有窗 · 零压床垫', estPrice: base },
        { name: '舒享双床房', bedInfo: '2张1.2m单人床', area: '28-34㎡', windowInfo: '有窗 · 干湿分离', estPrice: Math.round(base * 1.12) },
        { name: '影音投影大床房', bedInfo: '1张1.8m大床', area: '32㎡', windowInfo: '百寸巨幕投影', estPrice: Math.round(base * 1.25) },
      ];
    case 'homestay':
      return [
        { name: '设计师阳光一居室', bedInfo: '1张1.8m大床', area: '35-42㎡', windowInfo: '独立阳台 · 洗衣机', estPrice: base },
        { name: 'Loft复式双床套房', bedInfo: '2张1.5m双人床', area: '52㎡', windowInfo: '可住4人 · 巨幕投影', estPrice: Math.round(base * 1.38) },
      ];
    case 'economy':
    default:
      return [
        { name: '特惠大床房', bedInfo: '1张1.5m双人床', area: '16-20㎡', windowInfo: '部分内窗 · 独立卫浴', estPrice: base },
        { name: '标准双床房', bedInfo: '2张1.2m单人床', area: '20-24㎡', windowInfo: '明窗 · 高速Wi-Fi', estPrice: Math.round(base * 1.15) },
        { name: '商务优选大床房', bedInfo: '1张1.8m大床', area: '24㎡', windowInfo: '明窗 · 静音楼层', estPrice: Math.round(base * 1.28) },
      ];
  }
}

interface DemoSeed {
  brand: string;
  suffix: string;
  category: Exclude<HotelCategory, 'all'>;
  categoryLabel: string;
  rawType: string;
  dLng: number;
  dLat: number;
  rating: number;
  price: number;
  phone: string;
  tags: string[];
}

const DEMO_SEEDS: DemoSeed[] = [
  {
    brand: '全季酒店',
    suffix: '旗舰店',
    category: 'comfort',
    categoryLabel: '舒适高档',
    rawType: '住宿服务;宾馆酒店;四星级宾馆',
    dLng: 0.0021,
    dLat: 0.0016,
    rating: 4.8,
    price: 339,
    phone: '021-63398801',
    tags: ['华住会旗下', '24h自助洗衣', '机器人送物', '近地铁口'],
  },
  {
    brand: '亚朵酒店 (Atour)',
    suffix: '中心店',
    category: 'comfort',
    categoryLabel: '舒适高档',
    rawType: '住宿服务;宾馆酒店;四星级宾馆',
    dLng: -0.0032,
    dLat: 0.0024,
    rating: 4.9,
    price: 458,
    phone: '021-63398802',
    tags: ['深夜粥道', '普兰特床垫', '免费停车场', '竹居阅读空间'],
  },
  {
    brand: '汉庭优佳酒店',
    suffix: '地铁站店',
    category: 'economy',
    categoryLabel: '经济连锁',
    rawType: '住宿服务;宾馆酒店;经济型连锁酒店',
    dLng: 0.0014,
    dLat: -0.0019,
    rating: 4.6,
    price: 179,
    phone: '021-63398803',
    tags: ['步行至地铁', '自助入住机', '行李寄存', '高性价比'],
  },
  {
    brand: '橘子水晶酒店',
    suffix: '商圈店',
    category: 'comfort',
    categoryLabel: '舒适高档',
    rawType: '住宿服务;宾馆酒店;四星级宾馆',
    dLng: -0.0046,
    dLat: -0.0028,
    rating: 4.8,
    price: 389,
    phone: '021-63398804',
    tags: ['智能客控', '蓝牙音响', '威士忌大堂吧', '健身房'],
  },
  {
    brand: '如家精选酒店',
    suffix: '步行街店',
    category: 'economy',
    categoryLabel: '经济连锁',
    rawType: '住宿服务;宾馆酒店;经济型连锁酒店',
    dLng: 0.0039,
    dLat: -0.0035,
    rating: 4.5,
    price: 198,
    phone: '021-63398805',
    tags: ['连锁保障', '含双早可选', '24h前台', '近美食街'],
  },
  {
    brand: '洲际智选假日酒店',
    suffix: '中心广场店',
    category: 'comfort',
    categoryLabel: '舒适高档',
    rawType: '住宿服务;宾馆酒店;四星级宾馆',
    dLng: 0.0068,
    dLat: 0.0042,
    rating: 4.7,
    price: 419,
    phone: '021-63398806',
    tags: ['IHG洲际旗下', '免费中西热早', '地面停车场', '会议室'],
  },
  {
    brand: 'JW万豪尊享酒店',
    suffix: '',
    category: 'luxury',
    categoryLabel: '豪华星级',
    rawType: '住宿服务;宾馆酒店;五星级宾馆',
    dLng: -0.0072,
    dLat: 0.0055,
    rating: 4.9,
    price: 899,
    phone: '021-63398807',
    tags: ['五星豪华', '恒温泳池', '行政酒廊', '高层城景'],
  },
  {
    brand: '云栖设计师高空美宿',
    suffix: 'Loft公寓店',
    category: 'homestay',
    categoryLabel: '民宿公寓',
    rawType: '住宿服务;旅馆招待所;公寓式酒店',
    dLng: 0.0027,
    dLat: 0.0049,
    rating: 4.7,
    price: 238,
    phone: '13800138000',
    tags: ['巨幕投影', '独立洗衣机', '密码自助入住', '可做饭'],
  },
  {
    brand: '维也纳国际酒店',
    suffix: '大道店',
    category: 'comfort',
    categoryLabel: '舒适高档',
    rawType: '住宿服务;宾馆酒店;三星级宾馆',
    dLng: -0.0115,
    dLat: -0.0068,
    rating: 4.6,
    price: 268,
    phone: '021-63398809',
    tags: ['免费大停车场', '宽敞客房', '商务出行', '锦江旗下'],
  },
  {
    brand: '7天优品Premium',
    suffix: '快捷店',
    category: 'economy',
    categoryLabel: '经济连锁',
    rawType: '住宿服务;宾馆酒店;经济型连锁酒店',
    dLng: 0.0095,
    dLat: -0.0082,
    rating: 4.3,
    price: 135,
    phone: '021-63398810',
    tags: ['百元特惠', '独立空调', '24h热水', '临时过渡优选'],
  },
  {
    brand: '香格里拉大酒店',
    suffix: '',
    category: 'luxury',
    categoryLabel: '豪华星级',
    rawType: '住宿服务;宾馆酒店;五星级宾馆',
    dLng: 0.0142,
    dLat: 0.0098,
    rating: 4.9,
    price: 1080,
    phone: '021-63398811',
    tags: ['老牌五星', '花园景观', '亲子友好', '米其林餐厅'],
  },
  {
    brand: '隅见·暮光江景服务公寓',
    suffix: '',
    category: 'homestay',
    categoryLabel: '民宿公寓',
    rawType: '住宿服务;宾馆酒店;公寓式酒店',
    dLng: -0.0088,
    dLat: 0.0112,
    rating: 4.8,
    price: 289,
    phone: '13900139000',
    tags: ['落地大窗', '浴缸房可选', '长短租皆宜', '宠物友好'],
  },
];

export function generateDemoHotels(center: SearchCenter, radiusMeters: number): HotelItem[] {
  const areaLabel = center.name.replace(/(市|区|县|街道)$/, '');
  return DEMO_SEEDS.map((seed, idx) => {
    const lng = Number((center.lng + seed.dLng).toFixed(6));
    const lat = Number((center.lat + seed.dLat).toFixed(6));
    const distance = calcDistanceMeters(center.lng, center.lat, lng, lat);
    const fullName = seed.suffix
      ? `${seed.brand}（${areaLabel}${seed.suffix}）`
      : `${center.city.replace('市', '')}${seed.brand}`;

    return {
      id: `demo-${idx}-${center.lng.toFixed(3)}`,
      name: fullName,
      city: center.city || '当前城市',
      address: `${center.city || ''}${areaLabel}核心商圈 ${(idx + 1) * 18} 号`,
      lng,
      lat,
      distance,
      rawType: seed.rawType,
      category: seed.category,
      categoryLabel: seed.categoryLabel,
      rating: seed.rating,
      minPrice: seed.price,
      priceSource: 'estimated' as const,
      availability: 'unknown' as const,
      phones: [seed.phone],
      photos: FALLBACK_HOTEL_PHOTOS[seed.category],
      tags: seed.tags,
      roomHints: buildRoomHints(seed.category, seed.price),
      source: 'demo' as const,
    };
  }).filter((item) => item.distance <= Math.max(radiusMeters, 800));
}
