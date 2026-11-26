import React, { useState } from 'react';
import {
  BedDouble,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
import { CardRoomRow, HotelItem } from '../types/hotel';
import { estimateTravelHint, formatDistance } from '../utils/coordTransform';

interface Props {
  hotel: HotelItem;
  isFavorite: boolean;
  isSelected: boolean;
  checkIn?: string;
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
  checkIn,
  aiLoading,
  onSelect,
  onToggleFavorite,
  onQuickPlatformJump,
}) => {
  const [expandAllRooms, setExpandAllRooms] = useState(false);

  const coverUrl =
    hotel.photos[0] ||
    FALLBACK_HOTEL_PHOTOS[hotel.category]?.[0] ||
    FALLBACK_HOTEL_PHOTOS.comfort[0];

  // 构建卡片内嵌【实时客房情况】列表：优先在线实时库存 -> AI全网实查房型 -> 门店基础房型库
  const allRooms: CardRoomRow[] =
    hotel.cardRooms && hotel.cardRooms.length > 0
      ? hotel.cardRooms
      : hotel.roomHints.map((r) => ({
          name: r.name,
          spec: `${r.bedInfo} · ${r.windowInfo}`,
          status:
            hotel.availability === 'sold_out'
              ? '已满房'
              : hotel.minPrice
              ? '有空房'
              : '常规房型',
          leftText: hotel.minPrice ? '可订' : '电询/美团查',
          price: r.estPrice,
          isLive: hotel.priceSource === 'live_ota',
        }));

  const visibleRooms = expandAllRooms ? allRooms : allRooms.slice(0, 2);

  const sourceBadgeText =
    hotel.priceSource === 'live_ota'
      ? '⚡ 在线实时库存'
      : hotel.priceSource === 'ai_search'
      ? `🤖 AI全网实查${hotel.vacancySummary ? ` · ${hotel.vacancySummary}` : ''}`
      : hotel.priceSource === 'amap_cost'
      ? '✓ 高德收录房型'
      : aiLoading
      ? '正在同步实时房态...'
      : '门店主力房型参考';

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
        ) : (
          <span className="avail-badge ok">
            ● {hotel.priceSource === 'live_ota' ? '实时有空房' : '今日有房'}
          </span>
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
            <span className="rating-pill muted">实景收录</span>
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

        {/* ========== 核心：直接内嵌在列表每张卡片上的【实时客房情况看板】 ========== */}
        <div
          className={`hotel-rooms-board src-${hotel.priceSource}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rooms-board-head">
            <span className="rb-title">
              <BedDouble size={12} /> 实时客房情况
              {checkIn ? ` (${checkIn.slice(5)}入住)` : ''}
            </span>
            <span className="rb-source">
              {aiLoading && hotel.priceSource === 'none' && (
                <Loader2 size={10} className="spin" style={{ marginRight: 3 }} />
              )}
              {sourceBadgeText}
            </span>
          </div>

          <div className="rooms-board-rows">
            {visibleRooms.map((rm, idx) => {
              const isTight = /紧俏|仅剩|少量/.test(rm.status + (rm.leftText || ''));
              const isFull = /满房|售罄|无房/.test(rm.status);

              return (
                <div key={`${rm.name}-${idx}`} className="rb-row">
                  <div className="rb-room-info">
                    <span className="rb-room-name">{rm.name}</span>
                    {rm.spec && <span className="rb-room-spec">{rm.spec}</span>}
                  </div>

                  <div className="rb-room-right">
                    <span
                      className={`rb-vacancy-pill ${
                        isFull ? 'full' : isTight ? 'tight' : rm.isLive ? 'live' : 'ok'
                      }`}
                    >
                      {rm.status}
                      {rm.leftText && rm.leftText !== rm.status ? `·${rm.leftText}` : ''}
                    </span>

                    <strong className="rb-room-price">
                      {hotel.minPrice || hotel.priceSource !== 'none'
                        ? `¥${rm.price}`
                        : `约¥${rm.price}`}
                    </strong>

                    <button
                      type="button"
                      className="rb-book-mini"
                      onClick={(e) => {
                        if (rm.bookUrl) {
                          e.stopPropagation();
                          window.open(rm.bookUrl, '_blank', 'noopener,noreferrer');
                        } else {
                          onQuickPlatformJump(hotel, 'meituan', e);
                        }
                      }}
                    >
                      订
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {allRooms.length > 2 && (
            <button
              type="button"
              className="rb-expand-btn"
              onClick={() => setExpandAllRooms((v) => !v)}
            >
              {expandAllRooms ? (
                <>
                  收起房型 <ChevronUp size={12} />
                </>
              ) : (
                <>
                  展开全部 {allRooms.length} 种房型 <ChevronDown size={12} />
                </>
              )}
            </button>
          )}
        </div>

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
                    <CheckCircle2 size={10} /> 高德实价
                  </span>
                )}
                {hotel.priceSource === 'ai_search' && (
                  <span className="ai-price-tag">
                    <Bot size={10} /> AI实查
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="currency">约¥</span>
                <span className="price-num">{allRooms[0]?.price || 119}</span>
                <span className="price-unit">/晚起</span>
              </>
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
              详情 <ExternalLink size={11} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
