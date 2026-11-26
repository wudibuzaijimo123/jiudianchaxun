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
