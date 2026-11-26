import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, ExternalLink, Heart, Navigation2, RefreshCw, Star, X } from 'lucide-react';
import { FALLBACK_HOTEL_PHOTOS } from '../data/demoHotels';
import { HotelItem, SearchCenter } from '../types/hotel';
import { calcDistanceMeters, formatDistance } from '../utils/coordTransform';
import { FALLBACK_CENTER, isValidLngLat } from '../utils/geo';

interface Props {
  center: SearchCenter;
  radius: number;
  hotels: HotelItem[];
  selectedHotel: HotelItem | null;
  favoriteIds: Set<string>;
  visible: boolean;
  onSelectHotel: (hotel: HotelItem) => void;
  onOpenDetail: (hotel: HotelItem) => void;
  onToggleFavorite: (hotel: HotelItem, e: React.MouseEvent) => void;
  onSearchMapCenter: (lng: number, lat: number) => void;
}

export const HotelMapView: React.FC<Props> = ({
  center,
  radius,
  hotels,
  selectedHotel,
  favoriteIds,
  visible,
  onSelectHotel,
  onOpenDetail,
  onToggleFavorite,
  onSearchMapCenter,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);

  const [movedCenter, setMovedCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [previewHotel, setPreviewHotel] = useState<HotelItem | null>(null);

  // 中心点坐标不合法时退回默认点，避免整张地图崩溃
  const safeCenter = useMemo(
    () =>
      isValidLngLat(center?.lng, center?.lat)
        ? center
        : { ...center, lng: FALLBACK_CENTER.lng, lat: FALLBACK_CENTER.lat },
    [center]
  );

  // 只给坐标有效的酒店打点
  const mappableHotels = useMemo(
    () => hotels.filter((h) => isValidLngLat(h.lng, h.lat)),
    [hotels]
  );

  // 半径异常（NaN/0/负数）时 Leaflet 的 Circle 会算出 NaN 边界并抛错，这里兜一个默认值
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1000;

  // 初始化 Leaflet + 高德中文街道瓦片 (GCJ-02 零偏移对齐)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: L.Map;
    try {
      map = L.map(containerRef.current, {
        center: [safeCenter.lat, safeCenter.lng],
        zoom: 15,
        zoomControl: false,
        attributionControl: true,
      });
    } catch {
      // 容器或坐标异常时不要抛出，宁可这块地图空着
      return;
    }

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // 高德标准中文电子地图瓦片 (支持缩放至街道门牌级)
    L.tileLayer(
      'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      {
        subdomains: ['1', '2', '3', '4'],
        maxZoom: 18,
        minZoom: 4,
        attribution: '&copy; 高德地图 GS(2024)',
      }
    ).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);


    map.on('dragend', () => {
      const c = map.getCenter();
      const movedDist = calcDistanceMeters(safeCenter.lng, safeCenter.lat, c.lng, c.lat);
      if (Number.isFinite(movedDist) && movedDist > 450) {
        setMovedCenter({ lng: Number(c.lng.toFixed(6)), lat: Number(c.lat.toFixed(6)) });
      } else {
        setMovedCenter(null);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 切换显示视图时刷新地图尺寸，防止灰块
  useEffect(() => {
    if (visible && mapRef.current) {
      const timer = setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // 搜索中心或搜索半径变化时更新雷达圈与中心锚点
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    setMovedCenter(null);
    setPreviewHotel(null);

    if (circleRef.current) {
      circleRef.current.remove();
    }
    circleRef.current = L.circle([safeCenter.lat, safeCenter.lng], {
      radius: safeRadius,
      color: '#2563eb',
      weight: 1.5,
      dashArray: '6 6',
      fillColor: '#3b82f6',
      fillOpacity: 0.07,
    }).addTo(map);

    if (centerMarkerRef.current) {
      centerMarkerRef.current.remove();
    }
    const centerIcon = L.divIcon({
      className: 'custom-center-pin-wrap',
      html: `<div class="center-radar-pin"><span class="pulse-ring"></span><span class="center-dot"></span><div class="center-label">${safeCenter.name}</div></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    centerMarkerRef.current = L.marker([safeCenter.lat, safeCenter.lng], {
      icon: centerIcon,
      zIndexOffset: 900,
    }).addTo(map);

    const targetZoom =
      safeRadius <= 500 ? 16 : safeRadius <= 1000 ? 15 : safeRadius <= 2000 ? 14 : safeRadius <= 3000 ? 13 : 12;
    // 容器被隐藏（手机端列表视图）时尺寸为 0，flyTo 的动画计算会拿到 NaN 经纬度并抛错，
    // 这种情况直接用无动画的 setView 定位，等切到地图视图再 invalidateSize 即可。
    const size = map.getSize();
    if (size.x > 0 && size.y > 0) {
      map.flyTo([safeCenter.lat, safeCenter.lng], targetZoom, { duration: 0.65 });
    } else {
      map.setView([safeCenter.lat, safeCenter.lng], targetZoom, { animate: false });
    }
  }, [safeCenter.lng, safeCenter.lat, safeCenter.name, safeRadius]);

  // 渲染酒店价格气泡标记
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    mappableHotels.forEach((hotel) => {
      const isActive =
        selectedHotel?.id === hotel.id || previewHotel?.id === hotel.id;
      const isFav = favoriteIds.has(hotel.id);
      const label = hotel.minPrice ? `¥${hotel.minPrice}` : hotel.rating ? `★${hotel.rating}` : '酒店';

      const icon = L.divIcon({
        className: 'hotel-price-marker-wrap',
        html: `<div class="price-bubble-pin ${isActive ? 'active' : ''} cat-${hotel.category}">
          ${isFav ? '<span class="fav-mini-heart">♥</span>' : ''}
          <span>${label}</span>
        </div>`,
        iconSize: [64, 30],
        iconAnchor: [32, 30],
      });

      const marker = L.marker([hotel.lat, hotel.lng], {
        icon,
        zIndexOffset: isActive ? 1200 : 200,
      });

      marker.on('click', () => {
        setPreviewHotel(hotel);
        onSelectHotel(hotel);
      });

      marker.addTo(layer);
    });
  }, [mappableHotels, selectedHotel, previewHotel, favoriteIds, onSelectHotel]);

  // 当从列表点击选中酒店时，地图平滑居中
  useEffect(() => {
    if (selectedHotel && mapRef.current && isValidLngLat(selectedHotel.lng, selectedHotel.lat)) {
      setPreviewHotel(selectedHotel);
      mapRef.current.panTo([selectedHotel.lat, selectedHotel.lng], { animate: true });
    }
  }, [selectedHotel]);

  return (
    <div className="map-view-container">
      <div ref={containerRef} className="leaflet-canvas" />

      {/* 拖动地图后：在当前视野中心重新搜周边 */}
      {movedCenter && (
        <button
          type="button"
          className="search-this-area-btn"
          onClick={() => {
            onSearchMapCenter(movedCenter.lng, movedCenter.lat);
            setMovedCenter(null);
          }}
        >
          <RefreshCw size={14} /> 搜索地图当前中心周边酒店
        </button>
      )}

      {/* 回到当前搜索中心按钮 */}
      <button
        type="button"
        className="recenter-map-btn"
        onClick={() => {
          mapRef.current?.flyTo([safeCenter.lat, safeCenter.lng], 15, { duration: 0.5 });
          setMovedCenter(null);
        }}
        title="回到搜索目标点"
      >
        <Crosshair size={18} />
      </button>

      {/* 地图底部悬浮预览小卡 */}
      {previewHotel && (
        <div className="map-floating-card" onClick={() => onOpenDetail(previewHotel)}>
          <button
            type="button"
            className="close-preview-btn"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewHotel(null);
            }}
            aria-label="关闭预览"
          >
            <X size={15} />
          </button>

          <img
            src={previewHotel.photos[0] || FALLBACK_HOTEL_PHOTOS[previewHotel.category][0]}
            alt={previewHotel.name}
            className="preview-thumb"
            referrerPolicy="no-referrer"
          />

          <div className="preview-info">
            <div className="preview-top">
              <h4>{previewHotel.name}</h4>
            </div>
            <div className="preview-meta">
              {previewHotel.rating && (
                <span className="p-rating">
                  <Star size={11} fill="currentColor" /> {previewHotel.rating}
                </span>
              )}
              <span>
                <Navigation2 size={11} /> 距目标 {formatDistance(previewHotel.distance)}
              </span>
              <span className="p-cat">{previewHotel.categoryLabel}</span>
            </div>
            <div className="preview-bottom">
              <div className="p-price">
                {previewHotel.minPrice ? (
                  <>
                    <small>¥</small>
                    <strong>{previewHotel.minPrice}</strong>
                    <small>起</small>
                  </>
                ) : (
                  <span>实时询价</span>
                )}
              </div>
              <div className="preview-actions">
                <button
                  type="button"
                  className={`mini-fav ${favoriteIds.has(previewHotel.id) ? 'active' : ''}`}
                  onClick={(e) => onToggleFavorite(previewHotel, e)}
                >
                  <Heart
                    size={15}
                    fill={favoriteIds.has(previewHotel.id) ? 'currentColor' : 'none'}
                  />
                </button>
                <button
                  type="button"
                  className="open-detail-pill"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail(previewHotel);
                  }}
                >
                  查房态/导航 <ExternalLink size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
