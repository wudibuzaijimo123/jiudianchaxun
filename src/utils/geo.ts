/**
 * 坐标合法性校验。
 *
 * Leaflet 遇到 NaN / undefined 的经纬度会直接抛 `Invalid LatLng object`，
 * 由于地图组件没有错误边界，这个异常会连带把整个 React 树卸载掉（表现为整页白屏）。
 * 所有要传给地图的坐标都必须先过这一层。
 */
export function isValidLngLat(lng: unknown, lat: unknown): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lat as number) <= 90 &&
    Math.abs(lng as number) <= 180
  );
}

/** 中国大陆范围附近的兜底中心点（杭州西湖），仅在原坐标非法时使用 */
export const FALLBACK_CENTER = { lng: 120.16368, lat: 30.25465 };

/** 把可能是字符串 / NaN 的坐标转成有限数值，失败返回 null */
export function toFiniteCoord(lng: unknown, lat: unknown): { lng: number; lat: number } | null {
  const x = typeof lng === 'string' ? Number(lng) : lng;
  const y = typeof lat === 'string' ? Number(lat) : lat;
  if (!isValidLngLat(x, y)) return null;
  return { lng: x as number, lat: y as number };
}
