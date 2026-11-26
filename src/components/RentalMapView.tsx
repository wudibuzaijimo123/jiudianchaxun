import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, ExternalLink, Home, MapPin, Navigation2, X } from 'lucide-react';
import { SearchCenter } from '../types/hotel';
import { RentalListing } from '../types/rental';
import { formatDistance } from '../utils/coordTransform';
import { FALLBACK_CENTER, isValidLngLat, toFiniteCoord } from '../utils/geo';
import { RENTAL_FALLBACK_PHOTOS, photoSrc, rentalPhotos } from '../utils/rentalImages';

interface Props {
  center: SearchCenter;
  radius: number;
  listings: RentalListing[];
  selectedId: string | null;
  visible: boolean;
  onSelect: (listing: RentalListing | null) => void;
  onOpenDetail: (listing: RentalListing) => void;
  onOpenAmap: (listing: RentalListing) => void;
}

function priceLabel(listing: RentalListing): string {
  if (listing.rentMonthly !== null) return `¥${listing.rentMonthly}`;
  if (listing.rentDaily !== null) return `¥${listing.rentDaily}/天`;
  return '面议';
}

export const RentalMapView: React.FC<Props> = ({
  center,
  radius,
  listings,
  selectedId,
  visible,
  onSelect,
  onOpenDetail,
  onOpenAmap,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const centerPinRef = useRef<L.Marker | null>(null);

  const [preview, setPreview] = useState<RentalListing | null>(null);

  const safeCenter = useMemo(
    () =>
      isValidLngLat(center?.lng, center?.lat)
        ? center
        : { ...center, lng: FALLBACK_CENTER.lng, lat: FALLBACK_CENTER.lat },
    [center]
  );

  const mappableListings = useMemo(
    () =>
      listings
        .map((l) => {
          const c = toFiniteCoord(l.lng, l.lat);
          return c ? { ...l, lng: c.lng, lat: c.lat } : null;
        })
        .filter((l): l is RentalListing & { lng: number; lat: number } => Boolean(l)),
    [listings]
  );

  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 2000;

  // 初始化地图（高德中文瓦片，GCJ-02 无偏移）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: L.Map;
    try {
      map = L.map(containerRef.current, {
        center: [safeCenter.lat, safeCenter.lng],
        zoom: 14,
        zoomControl: false,
        attributionControl: true,
      });
    } catch {
      return;
    }

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer(
      'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      {
        subdomains: ['1', '2', '3', '4'],
        maxZoom: 18,
        minZoom: 4,
        attribution: '&copy; 高德地图 GS(2024)',
      }
    ).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 视图切换后修复尺寸，避免灰块
  useEffect(() => {
    if (!visible || !mapRef.current) return;
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 90);
    return () => clearTimeout(timer);
  }, [visible]);

  // 半径圈 + 中心脉冲点
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    circleRef.current?.remove();
    circleRef.current = L.circle([safeCenter.lat, safeCenter.lng], {
      radius: safeRadius,
      color: '#2563eb',
      weight: 1.5,
      dashArray: '6 6',
      fillColor: '#3b82f6',
      fillOpacity: 0.06,
    }).addTo(map);

    centerPinRef.current?.remove();
    const icon = L.divIcon({
      className: 'custom-center-pin-wrap',
      html: `<div class="center-radar-pin"><span class="pulse-ring"></span><span class="center-dot"></span><div class="center-label">${safeCenter.name}</div></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    centerPinRef.current = L.marker([safeCenter.lat, safeCenter.lng], {
      icon,
      zIndexOffset: 100,
    }).addTo(map);

    const zoom = safeRadius <= 1000 ? 16 : safeRadius <= 2000 ? 15 : safeRadius <= 3000 ? 15 : 13;
    // 容器隐藏时尺寸为 0，flyTo 会算出 NaN 坐标直接抛错，改用无动画 setView
    const size = map.getSize();
    if (size.x > 0 && size.y > 0) {
      map.flyTo([safeCenter.lat, safeCenter.lng], zoom, { duration: 0.6 });
    } else {
      map.setView([safeCenter.lat, safeCenter.lng], zoom, { animate: false });
    }
  }, [safeCenter.lng, safeCenter.lat, safeCenter.name, safeRadius]);

  // 价格气泡
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    mappableListings.forEach((item) => {
      const active = selectedId === item.id;

      const icon = L.divIcon({
        className: 'rt-price-pin-wrap',
        html: `<div class="rt-price-pin ${active ? 'active' : ''}">${priceLabel(item)}</div>`,
        iconSize: [64, 26],
        iconAnchor: [32, 26],
      });

      const marker = L.marker([item.lat, item.lng], {
        icon,
        zIndexOffset: active ? 1200 : 200,
      });

      marker.on('click', () => {
        setPreview(item);
        onSelect(item);
      });

      marker.addTo(layer);
    });
  }, [mappableListings, selectedId, onSelect]);

  // 列表选中后地图跟随
  useEffect(() => {
    if (!selectedId) return;
    const target = mappableListings.find((l) => l.id === selectedId);
    if (target) {
      setPreview(target);
      mapRef.current?.panTo([target.lat, target.lng], { animate: true });
    }
  }, [selectedId, mappableListings]);

  return (
    <div className="rt-map-wrap">
      <div ref={containerRef} className="rt-map-canvas" />

      <button
        type="button"
        className="recenter-map-btn"
        onClick={() => {
          mapRef.current?.flyTo([safeCenter.lat, safeCenter.lng], 14, { duration: 0.5 });
          setPreview(null);
        }}
        title="回到搜索目标点"
      >
        <Crosshair size={18} />
      </button>

      {preview ? (
        <div className="rt-map-card" onClick={() => onOpenDetail(preview)}>
          <button
            type="button"
            className="rt-map-card-close"
            onClick={(e) => {
              e.stopPropagation();
              setPreview(null);
              onSelect(null);
            }}
            aria-label="关闭预览"
          >
            <X size={14} />
          </button>

          <img
            src={photoSrc(rentalPhotos(preview)[0] || RENTAL_FALLBACK_PHOTOS[preview.kind][0])}
            alt={preview.title}
            referrerPolicy="no-referrer"
            onError={(e) => {
              const fallback = RENTAL_FALLBACK_PHOTOS[preview.kind]?.[0];
              if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
            }}
          />

          <div className="rt-map-card-body">
            <h4>{preview.title}</h4>
            <div className="rt-map-card-meta">
              <span>{preview.layout}</span>
              {preview.area ? <span>{preview.area}㎡</span> : null}
              <span className="rt-map-card-dist">
                <Navigation2 size={11} /> {formatDistance(preview.distanceMeters)}
              </span>
            </div>
            <div className="rt-map-card-bottom">
              <div className="rt-map-card-price">
                {preview.rentMonthly !== null ? (
                  <>
                    <small>¥</small>
                    <strong>{preview.rentMonthly}</strong>
                    <small>/月</small>
                  </>
                ) : (
                  <>
                    <small>¥</small>
                    <strong>{preview.rentDaily}</strong>
                    <small>/天</small>
                  </>
                )}
              </div>
              <div className="rt-map-card-actions">
                <button
                  type="button"
                  className="rt-map-amap-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAmap(preview);
                  }}
                >
                  <MapPin size={12} /> 高德
                </button>
                <button
                  type="button"
                  className="rt-map-detail-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail(preview);
                  }}
                >
                  详情 <ExternalLink size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : listings.length === 0 ? (
        <div className="rt-map-empty">
          <Home size={22} />
          <span>当前筛选下没有房源，放宽条件后可看到更多落点</span>
        </div>
      ) : null}
    </div>
  );
};
