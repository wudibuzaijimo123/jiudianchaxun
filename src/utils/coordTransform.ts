const PI = Math.PI;
const AXIS = 6378245.0;
const OFFSET = 0.00669342162296594323;

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/**
 * WGS-84 (GPS / OpenStreetMap) -> GCJ-02 (高德 / 腾讯 / 国内 Apple 地图)
 */
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - OFFSET * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((AXIS * (1 - OFFSET)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return [Number((lng + dLng).toFixed(6)), Number((lat + dLat).toFixed(6))];
}

/**
 * GCJ-02 -> WGS-84 (用于将国内地图坐标传给 OpenStreetMap Overpass 检索)
 */
export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  const [gLng, gLat] = wgs84ToGcj02(lng, lat);
  return [
    Number((lng * 2 - gLng).toFixed(6)),
    Number((lat * 2 - gLat).toFixed(6)),
  ];
}

/**
 * 计算两点间球面距离（单位：米）
 */
export function calcDistanceMeters(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): number {
  const toRad = (deg: number) => (deg * PI) / 180.0;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.max(10, Math.round(meters))}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

export function estimateTravelHint(meters: number): string {
  if (meters <= 1200) {
    const walkMin = Math.max(2, Math.round(meters / 75));
    return `步行约 ${walkMin} 分钟`;
  }
  const driveMin = Math.max(4, Math.round(meters / 420));
  return `驾车约 ${driveMin} 分钟`;
}
