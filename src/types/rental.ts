/** 房源出租类型（小城市场景：整租/合租/单间/床位/日租都有） */
export type RentalKind = '整租' | '合租' | '单间' | '床位' | '日租' | '公寓';

export type RentalPriceSource = 'ai_search' | 'demo';

/** 一条租房房源（安居客式字段） */
export interface RentalListing {
  id: string;
  /** 卡片主标题，如「整租·万科城 2室1厅」 */
  title: string;
  /** 小区/楼栋/自建房名称 */
  community: string;
  district?: string;
  address: string;
  kind: RentalKind;
  /** 户型，如「2室1厅1卫」 */
  layout: string;
  /** 面积 m² */
  area: number | null;
  /** 楼层，如「中楼层/18层」 */
  floor?: string;
  orientation?: string;
  decoration?: string;
  /** 月租金（元/月） */
  rentMonthly: number | null;
  /** 日租价（元/天），小旅馆月租场景可能只有日租 */
  rentDaily: number | null;
  /** 付租方式，如「押一付三」 */
  payMethod?: string;
  /** 最短租期，如「一年起租」「可月付」 */
  minLease?: string;
  tags: string[];
  facilities: string[];
  /** 距搜索中心的估算距离（米） */
  distanceMeters: number;
  /** 房源图集：优先取高德 POI 实景图，取不到时前端用内置房型图兜底 */
  photos: string[];
  /** 高德 POI 坐标（GCJ-02），用于地图打点 */
  lng?: number;
  lat?: number;
  /** 坐标是否为按距离推算的近似位置（地图上需提示） */
  geoApprox?: boolean;
  /** 价格/信息依据说明 */
  basis?: string;
  riskNote?: string;
  priceSource: RentalPriceSource;
}

export type RentalSortMode = 'distance' | 'rent_asc' | 'area_desc';

export interface RentalFilterState {
  radius: number;
  kind: 'all' | RentalKind;
  /** 月租区间 */
  rentRange: 'all' | 'under1000' | '1000to2000' | '2000to3500' | 'over3500';
  sortBy: RentalSortMode;
  keyword: string;
}

export interface RentalSearchResult {
  listings: RentalListing[];
  mode: 'ai' | 'demo';
  notice: string;
}
