/** 招聘类型（小城市场景：全职/兼职/日结/钟点工都有） */
export type JobType = '全职' | '兼职' | '实习' | '日结' | '钟点工';

export type JobPriceUnit = '月' | '天' | '时';

export type JobSource = 'ai_search' | 'demo';

export interface JobListing {
  id: string;
  /** 职位名，如「餐厅服务员」 */
  title: string;
  /** 公司/门店名 */
  company: string;
  /** 原始薪资文本，如「4000-6000元/月」 */
  salaryText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryUnit: JobPriceUnit;
  district?: string;
  address: string;
  distanceMeters: number;
  type: JobType;
  /** 经验要求，如「经验不限」「1-3年」 */
  experience?: string;
  /** 学历要求，如「学历不限」「大专」 */
  education?: string;
  /** 招聘人数 */
  headcount: number | null;
  /** 福利标签：五险一金、包吃住、双休… */
  tags: string[];
  /** 岗位职责/要求简述 */
  description?: string;
  /** 发布时间描述，如「今天发布」 */
  publishText?: string;
  /** 单位实景图（高德 POI photos），没有时前端显示首字色块 */
  photos: string[];
  /** 高德 POI 坐标（GCJ-02），用于地图与位置图 */
  lng?: number;
  lat?: number;
  /** 坐标是否为按距离推算的近似位置 */
  geoApprox?: boolean;
  source: JobSource;
}

export type JobSortMode = 'distance' | 'salary_desc';

export interface JobFilterState {
  radius: number;
  type: 'all' | JobType;
  salaryRange: 'all' | 'under3000' | '3000to5000' | '5000to8000' | 'over8000';
  sortBy: JobSortMode;
  keyword: string;
}

export interface JobSearchResult {
  jobs: JobListing[];
  mode: 'ai' | 'demo';
  notice: string;
}
