import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, ExternalLink, Heart, Navigation2, RefreshCw, Star, X } from 'lucide-react';
import { FALLBACK_HOTEL_PHOTOS } from '../data/demoHotels';
import { HotelItem, SearchCenter } from '../types/hotel';
import { calcDistanceMeters, formatDistance } from '../utils/coordTransform';

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

  // 初始化 Leaflet + 高德中文街道瓦片 (GCJ-02 零偏移对齐)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
    });

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
      const movedDist = calcDistanceMeters(center.lng, center.lat, c.lng, c.lat);
      if (movedDist > 450) {
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
    circleRef.current = L.circle([center.lat, center.lng], {
      radius,
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
      html: `<div class="center-radar-pin"><span class="pulse-ring"></span><span class="center-dot"></span><div class="center-label">${center.name}</div></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    centerMarkerRef.current = L.marker([center.lat, center.lng], {
      icon: centerIcon,
      zIndexOffset: 900,
    }).addTo(map);

    const targetZoom =
      radius <= 500 ? 16 : radius <= 1000 ? 15 : radius <= 2000 ? 14 : radius <= 3000 ? 13 : 12;
    map.flyTo([center.lat, center.lng], targetZoom, { duration: 0.65 });
  }, [center.lng, center.lat, center.name, radius]);

  // 渲染酒店价格气泡标记
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    hotels.forEach((hotel) => {
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
  }, [hotels, selectedHotel, previewHotel, favoriteIds, onSelectHotel]);

  // 当从列表点击选中酒店时，地图平滑居中
  useEffect(() => {
    if (selectedHotel && mapRef.current) {
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
          mapRef.current?.flyTo([center.lat, center.lng], 15, { duration: 0.5 });
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
