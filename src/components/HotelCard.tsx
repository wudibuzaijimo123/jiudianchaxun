import React from 'react';
import {
  BedDouble,
  Bot,
  CheckCircle2,
  ExternalLink,
  Heart,
  MapPin,
  Navigation2,
  Phone,
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
  onSelect,
  onToggleFavorite,
  onQuickPlatformJump,
}) => {
  const coverUrl =
    hotel.photos[0] ||
    FALLBACK_HOTEL_PHOTOS[hotel.category]?.[0] ||
    FALLBACK_HOTEL_PHOTOS.comfort[0];

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

        {hotel.availability === 'available' && (
          <span className="avail-badge ok">● 有空房</span>
        )}
        {hotel.availability === 'sold_out' && (
          <span className="avail-badge full">满房</span>
        )}

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
            <span className="rating-pill muted">周边收录</span>
          )}
        </div>

        <div className="hotel-distance-line">
          <span className="dist-highlight">
            <Navigation2 size={12} /> 距目标 {formatDistance(hotel.distance)}
          </span>
          <span className="dot">·</span>
          <span className="travel-est">{estimateTravelHint(hotel.distance)}</span>
        </div>

        <div className="hotel-address-line" title={hotel.address}>
          <MapPin size={12} />
          <span>{hotel.address}</span>
        </div>

        {/* 直接在卡片正面打印实时比价条或 AI 检索出的房型价格条 */}
        {hotel.otaOffers && hotel.otaOffers.length > 0 ? (
          <div className="inline-ota-strip">
            {hotel.otaOffers.slice(0, 3).map((offer, i) => (
              <span key={`${offer.source}-${i}`} className="ota-mini-chip">
                {offer.source}: <strong>¥{offer.nightlyPrice}</strong>
              </span>
            ))}
          </div>
        ) : hotel.aiRoomBrief ? (
          <div className="ai-card-room-line">
            <BedDouble size={12} />
            <span>{hotel.aiRoomBrief}</span>
          </div>
        ) : (
          <div className="hotel-tags-row">
            {hotel.phones.length > 0 && (
              <span className="hotel-tag phone-tag">
                <Phone size={10} /> {hotel.phones[0]}
              </span>
            )}
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
                    <Zap size={10} /> 实时房态价
                  </span>
                )}
                {hotel.priceSource === 'amap_cost' && (
                  <span className="real-price-tag">
                    <CheckCircle2 size={10} /> 高德均价
                  </span>
                )}
                {hotel.priceSource === 'ai_search' && (
                  <span className="ai-price-tag" title={hotel.aiBasis || 'AI 全网检索价格'}>
                    <Bot size={10} /> AI搜价{hotel.aiPriceRange ? ` ${hotel.aiPriceRange}` : ''}
                  </span>
                )}
              </>
            ) : hotel.availability === 'sold_out' ? (
              <span className="price-soldout">所选日期已满房</span>
            ) : (
              <span className="price-tbd">点击查看/AI搜价</span>
            )}
          </div>

          <div className="quick-jump-btns">
            <button
              type="button"
              className="q-btn detail"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(hotel);
              }}
            >
              房型价目表 <ExternalLink size={11} />
            </button>
            <button
              type="button"
              className="q-btn douyin"
              onClick={(e) => onQuickPlatformJump(hotel, 'douyin', e)}
            >
              <Sparkles size={11} /> 抖音
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
