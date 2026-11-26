/**
 * 安居客城市站的前缀（PC 域名的二级标签，如 jn.anjuke.com / m.anjuke.com/jn/）。
 * 只收录常见城市；查不到时退化为不带城市的全国站，避免拼错直接 404。
 */
const CITY_SLUG: Record<string, string> = {
  北京: 'bj',
  上海: 'sh',
  广州: 'gz',
  深圳: 'sz',
  天津: 'tj',
  重庆: 'cq',
  成都: 'cd',
  杭州: 'hz',
  南京: 'nj',
  武汉: 'wh',
  西安: 'xa',
  苏州: 'su',
  长沙: 'cs',
  郑州: 'zz',
  济南: 'jn',
  青岛: 'qd',
  沈阳: 'sy',
  大连: 'dl',
  长春: 'cc',
  哈尔滨: 'heb',
  合肥: 'hf',
  福州: 'fz',
  厦门: 'xm',
  南昌: 'nc',
  昆明: 'km',
  贵阳: 'gy',
  南宁: 'nn',
  海口: 'hk',
  石家庄: 'sjz',
  太原: 'ty',
  兰州: 'lz',
  西宁: 'xn',
  银川: 'yc',
  乌鲁木齐: 'wlmq',
  拉萨: 'ls',
  宁波: 'nb',
  无锡: 'wx',
  温州: 'wz',
  佛山: 'fs',
  东莞: 'dg',
  珠海: 'zh',
  中山: 'zs',
  惠州: 'huizhou',
  常州: 'cz',
  徐州: 'xz',
  烟台: 'yt',
  潍坊: 'wf',
  临沂: 'linyi',
  淄博: 'zb',
  唐山: 'ts',
  保定: 'bd',
  洛阳: 'ly',
  南阳: 'ny',
  芜湖: 'wuhu',
  泉州: 'qz',
  嘉兴: 'jx',
  绍兴: 'sx',
  台州: 'tz',
  金华: 'jh',
  汕头: 'st',
  湛江: 'zj',
  桂林: 'gl',
  柳州: 'liuzhou',
  三亚: 'sanya',
};

export function anjukeCitySlug(city?: string): string {
  const clean = String(city || '')
    .replace(/市$/, '')
    .trim();
  if (!clean) return '';
  if (CITY_SLUG[clean]) return CITY_SLUG[clean];
  // 「济南市章丘区」这类带区县的名字，取前两三个字再匹配一次
  const head2 = clean.slice(0, 2);
  if (CITY_SLUG[head2]) return CITY_SLUG[head2];
  if (CITY_SLUG[clean.slice(0, 3)]) return CITY_SLUG[clean.slice(0, 3)];
  return '';
}

/**
 * BOSS直聘的城市编码（web 搜索页的 city 参数）。
 * 不带 city 时平台按 IP 或上次城市出结果，常常跳去外地，所以能查到就带上。
 */
const BOSS_CITY_CODE: Record<string, string> = {
  北京: '101010100',
  上海: '101020100',
  天津: '101030100',
  重庆: '101040100',
  哈尔滨: '101050100',
  长春: '101060100',
  沈阳: '101070100',
  大连: '101070200',
  呼和浩特: '101080100',
  石家庄: '101090100',
  太原: '101100100',
  西安: '101110100',
  济南: '101120100',
  青岛: '101120200',
  烟台: '101120500',
  潍坊: '101120600',
  郑州: '101180100',
  洛阳: '101180900',
  南京: '101190100',
  无锡: '101190200',
  苏州: '101190400',
  徐州: '101190800',
  常州: '101191100',
  合肥: '101220100',
  杭州: '101210100',
  宁波: '101210400',
  温州: '101210700',
  福州: '101230100',
  厦门: '101230200',
  泉州: '101230500',
  南昌: '101240100',
  长沙: '101250100',
  武汉: '101200100',
  广州: '101280100',
  深圳: '101280600',
  东莞: '101281600',
  佛山: '101280800',
  珠海: '101280700',
  中山: '101281700',
  惠州: '101280300',
  南宁: '101300100',
  海口: '101310100',
  三亚: '101310200',
  成都: '101270100',
  昆明: '101290100',
  贵阳: '101260100',
  兰州: '101160100',
  西宁: '101150100',
  银川: '101170100',
  乌鲁木齐: '101130100',
  拉萨: '101140100',
};

export function bossCityCode(city?: string): string {
  const clean = String(city || '')
    .replace(/市$/, '')
    .trim();
  if (!clean) return '';
  if (BOSS_CITY_CODE[clean]) return BOSS_CITY_CODE[clean];
  const head2 = clean.slice(0, 2);
  if (BOSS_CITY_CODE[head2]) return BOSS_CITY_CODE[head2];
  const head3 = clean.slice(0, 3);
  if (BOSS_CITY_CODE[head3]) return BOSS_CITY_CODE[head3];
  return '';
}
