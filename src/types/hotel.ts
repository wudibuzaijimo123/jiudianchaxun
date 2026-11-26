export type HotelCategory = 'all' | 'economy' | 'comfort' | 'luxury' | 'homestay';

export type PriceRange = 'all' | 'under200' | '200to400' | '400to700' | 'over700';

export type SortMode = 'distance' | 'price_asc' | 'rating_desc';

export type DataSourceMode = 'amap_live' | 'amap' | 'osm' | 'demo';

export type AvailabilityStatus = 'available' | 'sold_out' | 'unknown';

export interface SearchCenter {
  name: string;
  address?: string;
  city: string;
  /** GCJ-02 经度 */
  lng: number;
  /** GCJ-02 纬度 */
  lat: number;
}

export interface LiveOtaOffer {
  source: string;
  logo?: string;
  nightlyPrice: number;
  totalPrice?: number;
  link?: string;
  rooms: LiveRoomOffer[];
}

export interface LiveRoomOffer {
  name: string;
  nightlyPrice: number;
  totalPrice?: number;
  numGuests?: number;
  link?: string;
  images?: string[];
  tags?: string[];
}

export interface RoomHint {
  name: string;
  bedInfo: string;
  area: string;
  windowInfo: string;
  estPrice: number;
}

export interface CardRoomRow {
  name: string;
  spec?: string;
  status: string;
  leftText?: string;
  price: number;
  isLive?: boolean;
  bookUrl?: string;
}

export interface HotelItem {
  id: string;
  name: string;
  city: string;
  district?: string;
  address: string;
  /** GCJ-02 经度 */
  lng: number;
  /** GCJ-02 纬度 */
  lat: number;
  /** 距离搜索中心米数 */
  distance: number;
  rawType: string;
  category: Exclude<HotelCategory, 'all'>;
  categoryLabel: string;
  rating: number | null;
  reviewCount?: number;
  /** 最低每晚房价 (元/晚) */
  minPrice: number | null;
  /** 价格来源说明 */
  priceSource: 'live_ota' | 'amap_cost' | 'ai_search' | 'estimated' | 'none';
  /** AI 检索出的价格区间与房型一句话摘要（直接打印在卡片正面） */
  aiPriceRange?: string;
  aiRoomBrief?: string;
  aiBasis?: string;
  /** AI 或实时接口返回的整体房态摘要（如“今日房源充足”） */
  vacancySummary?: string;
  /** 直接展示在列表卡片正面的实时客房情况明细行 */
  cardRooms?: CardRoomRow[];
  /** 今日空房状态 */
  availability: AvailabilityStatus;
  /** SerpApi Google Hotels property_token（用于点开详情直接拉取实时细分空房房型） */
  propertyToken?: string;
  /** 卡片已携带的多平台实时报价列表 */
  otaOffers?: LiveOtaOffer[];
  phones: string[];
  photos: string[];
  tags: string[];
  roomHints: RoomHint[];
  source: DataSourceMode;
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  district: string;
  address: string;
  city: string;
  lng: number;
  lat: number;
}

export interface FilterState {
  radius: number;
  priceRange: PriceRange;
  category: HotelCategory;
  sortBy: SortMode;
  keyword: string;
  onlyWithPrice?: boolean;
}

export interface SearchHistoryItem {
  name: string;
  city: string;
  address?: string;
  lng: number;
  lat: number;
  timestamp: number;
}

export interface CnIntelItem {
  platform: 'douyin' | 'xiaohongshu' | 'ctrip' | 'tongcheng' | 'qunar' | 'meituan' | 'web';
  platformLabel: string;
  title: string;
  snippet: string;
  link: string;
  date?: string;
}

export interface CnHotelIntelData {
  items: CnIntelItem[];
  minExtractedPrice: number | null;
  metaFacts: string[];
}

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AiDetailRoomData {
  lowestPrice: number;
  priceRange: string;
  vacancyStatus: string;
  douyinGroupBuy: string;
  highlights: string;
  pitfalls: string;
  rooms: {
    roomName: string;
    spec: string;
    price: number;
    tag?: string;
  }[];
}
