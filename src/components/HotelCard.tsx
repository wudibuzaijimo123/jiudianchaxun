import React from 'react';
import {
  BedDouble,
  Bot,
  CheckCircle2,
  ExternalLink,
  Heart,
  Loader2,
  MapPin,
  Navigation2,
  Phone,
  ShoppingBag,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import { FALLBACK_HOTEL_PHOTOS } from '../data/demoHotels';
import { HotelItem } from '../types/hotel';
import { estimateTravelHint, formatDistance } from '../utils/coordTransform';

interface Props {
  hotel: HotelItem;
  isFavorite: boolean;
  isSelected: boolean;
  aiLoading?: boolean;
  onSelect: (hotel: HotelItem) => void;
  onToggleFavorite: (hotel: HotelItem, e: React.MouseEvent) => void;
  onQuickPlatformJump: (
    hotel: HotelItem,
    platform: 'amap_detail' | 'meituan' | 'douyin' | 'ctrip' | 'amap',
    e: React.MouseEvent
  ) => void;
}

export const HotelCard: React.FC<Props> = ({
  hotel,
  isFavorite,
  isSelected,
  aiLoading,
  onSelect,
  onToggleFavorite,
  onQuickPlatformJump,
}) => {
  const coverUrl =
    hotel.photos[0] ||
    FALLBACK_HOTEL_PHOTOS[hotel.category]?.[0] ||
    FALLBACK_HOTEL_PHOTOS.comfort[0];

  const roomsToDisplay =
    hotel.cardRooms && hotel.cardRooms.length > 0
      ? hotel.cardRooms
      : hotel.minPrice
      ? hotel.roomHints.slice(0, 2).map((r) => ({
          name: r.name,
          status: '有房可订',
          price: r.estPrice,
          isLive: hotel.priceSource === 'live_ota',
        }))
      : [];

  return (
    <article
      className={`hotel-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(hotel)}
    >
      <div className="hotel-card-thumb">
        <img
          src={coverUrl}
          alt={hotel.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const target = e.currentTarget;
            const fallback = FALLBACK_HOTEL_PHOTOS[hotel.category][0];
            if (target.src !== fallback) target.src = fallback;
          }}
        />
        <span className={`cat-badge cat-${hotel.category}`}>{hotel.categoryLabel}</span>

        {hotel.availability === 'sold_out' ? (
          <span className="avail-badge full">今日满房</span>
        ) : hotel.availability === 'available' || roomsToDisplay.length > 0 ? (
          <span className="avail-badge ok">● 今日有房</span>
        ) : null}

        <button
          type="button"
          className={`fav-icon-btn ${isFavorite ? 'active' : ''}`}
          onClick={(e) => onToggleFavorite(hotel, e)}
          aria-label={isFavorite ? '取消收藏' : '加入收藏'}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="hotel-card-body">
        <div className="hotel-title-row">
          <h3 className="hotel-name">{hotel.name}</h3>
          {hotel.rating ? (
            <span className="rating-pill">
              <Star size={12} fill="currentColor" />
              {hotel.rating.toFixed(1)}
            </span>
          ) : (
            <span className="rating-pill muted">周边实景</span>
          )}
        </div>

        <div className="hotel-distance-line">
          <span className="dist-highlight">
            <Navigation2 size={12} /> 距目标 {formatDistance(hotel.distance)}
          </span>
          <span className="dot">·</span>
          <span className="travel-est">{estimateTravelHint(hotel.distance)}</span>
          {hotel.phones.length > 0 && (
            <>
              <span className="dot">·</span>
              <span className="phone-inline">
                <Phone size={10} /> {hotel.phones[0]}
              </span>
            </>
          )}
        </div>

        <div className="hotel-address-line" title={hotel.address}>
          <MapPin size={12} />
          <span>{hotel.address}</span>
        </div>

        {/* ========== 直接在卡片正面展示【实时客房情况明细表】 ========== */}
        {roomsToDisplay.length > 0 ? (
          <div className="card-rooms-panel">
            {roomsToDisplay.slice(0, 2).map((rm, idx) => (
              <div key={`${rm.name}-${idx}`} className="card-room-row">
                <span className="cr-name">
                  <BedDouble size={11} /> {rm.name}
                </span>
                <span className="cr-right">
                  <span className={`cr-status ${rm.isLive ? 'live' : ''}`}>
                    {rm.status}
                  </span>
                  <strong className="cr-price">¥{rm.price}</strong>
                </span>
              </div>
            ))}
          </div>
        ) : aiLoading ? (
          <div className="card-rooms-loading">
            <Loader2 size={12} className="spin" />
            <span>正在实时检索该店今日客房与房价情况...</span>
          </div>
        ) : (
          <div className="hotel-tags-row">
            {hotel.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="hotel-tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="hotel-bottom-bar">
          <div className="price-block">
            {hotel.minPrice ? (
              <>
                <span className="currency">¥</span>
                <span className="price-num">{hotel.minPrice}</span>
                <span className="price-unit">/晚起</span>
                {hotel.priceSource === 'live_ota' && (
                  <span className="live-price-tag">
                    <Zap size={10} /> 实时库存
                  </span>
                )}
                {hotel.priceSource === 'amap_cost' && (
                  <span className="real-price-tag">
                    <CheckCircle2 size={10} /> 高德均价
                  </span>
                )}
                {hotel.priceSource === 'ai_search' && (
                  <span className="ai-price-tag">
                    <Bot size={10} /> AI搜价
                  </span>
                )}
              </>
            ) : hotel.availability === 'sold_out' ? (
              <span className="price-soldout">所选日期满房</span>
            ) : (
              <span className="price-tbd">点详情核查房态</span>
            )}
          </div>

          <div className="quick-jump-btns">
            <button
              type="button"
              className="q-btn meituan"
              onClick={(e) => onQuickPlatformJump(hotel, 'meituan', e)}
              title="直接跳转到美团该酒店购买预订页面"
            >
              <ShoppingBag size={11} /> 美团购买
            </button>
            <button
              type="button"
              className="q-btn douyin"
              onClick={(e) => onQuickPlatformJump(hotel, 'douyin', e)}
              title="去抖音搜团购券"
            >
              <Sparkles size={11} /> 抖音
            </button>
            <button
              type="button"
              className="q-btn detail"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(hotel);
              }}
            >
              全部房型 <ExternalLink size={11} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
