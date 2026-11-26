import React, { useState } from 'react';
import {
  Building2,
  ExternalLink,
  Images,
  Layers,
  MapPin,
  Navigation2,
  Ruler,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { RentalKind, RentalListing } from '../types/rental';
import { formatDistance } from '../utils/coordTransform';
import { getPhotoSourceLabel, isAmapPhoto, photoSrc, rentalPhotos } from '../utils/rentalImages';

const KIND_TONE: Record<RentalKind, string> = {
  整租: 'whole',
  合租: 'shared',
  单间: 'single',
  床位: 'bed',
  日租: 'daily',
  公寓: 'apt',
};

interface Props {
  listing: RentalListing;
  onOpen: (listing: RentalListing) => void;
  onJump: (
    listing: RentalListing,
    platform: 'anjuke' | 'wuba' | 'beike' | 'amap' | 'baidu',
    e: React.MouseEvent
  ) => void;
}

export const RentalCard: React.FC<Props> = ({ listing, onOpen, onJump }) => {
  const tone = KIND_TONE[listing.kind] || 'whole';
  const initial = (listing.community || '租').slice(0, 1);
  const isDemo = listing.priceSource === 'demo';

  const photos = rentalPhotos(listing);
  const [imgError, setImgError] = useState(false);
  const cover = photos[0];
  const showImg = Boolean(cover) && !imgError;

  return (
    <article className="rt-card" onClick={() => onOpen(listing)}>
      <div className={`rt-thumb tone-${tone} ${showImg ? 'has-img' : ''}`}>
        {showImg ? (
          <img
            src={photoSrc(cover)}
            alt={listing.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="rt-thumb-initial">{initial}</span>
        )}
        <span className={`rt-kind-badge tone-${tone}`}>{listing.kind}</span>
        {isDemo && <span className="rt-demo-badge">示例</span>}
        {showImg && (
          <span className={`rt-photo-src ${isAmapPhoto(cover) ? 'amap' : 'demo-pic'}`}>
            {isAmapPhoto(cover) ? '高德' : getPhotoSourceLabel(cover, 'AI图').replace('参考图', '图')}
          </span>
        )}
        {showImg && photos.length > 1 && (
          <span className="rt-photo-count">
            <Images size={10} /> {photos.length}
          </span>
        )}
      </div>

      <div className="rt-body">
        <div className="rt-title-row">
          <h3 className="rt-title">{listing.title}</h3>
        </div>

        <div className="rt-meta-row">
          <span className="rt-meta-item">
            <Building2 size={12} /> {listing.layout}
          </span>
          {listing.area && (
            <span className="rt-meta-item">
              <Ruler size={12} /> {listing.area}㎡
            </span>
          )}
          {listing.floor && (
            <span className="rt-meta-item">
              <Layers size={12} /> {listing.floor}
            </span>
          )}
          {listing.orientation && <span className="rt-meta-item">{listing.orientation}</span>}
          {listing.decoration && <span className="rt-meta-item">{listing.decoration}</span>}
        </div>

        <div className="rt-addr-row" title={listing.address}>
          <MapPin size={12} />
          <span className="rt-addr-text">
            {listing.district ? `${listing.district} · ` : ''}
            {listing.address}
          </span>
          <span className="rt-distance">
            <Navigation2 size={11} /> {formatDistance(listing.distanceMeters)}
          </span>
        </div>

        {listing.tags.length > 0 && (
          <div className="rt-tags">
            {listing.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rt-tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="rt-bottom-row">
          <div className="rt-price-block">
            {listing.rentMonthly !== null ? (
              <>
                <span className="rt-currency">¥</span>
                <span className="rt-price-num">{listing.rentMonthly}</span>
                <span className="rt-price-unit">/月</span>
              </>
            ) : (
              <>
                <span className="rt-currency">¥</span>
                <span className="rt-price-num">{listing.rentDaily}</span>
                <span className="rt-price-unit">/天</span>
              </>
            )}
            {listing.rentMonthly !== null && listing.rentDaily !== null && (
              <span className="rt-price-sub">日租 ¥{listing.rentDaily}</span>
            )}
            {listing.payMethod && <span className="rt-pay-pill">{listing.payMethod}</span>}
          </div>

          <div className="rt-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="rt-btn anjuke"
              onClick={(e) => onJump(listing, 'anjuke', e)}
              title="去安居客搜该小区真实在租房源"
            >
              安居客
            </button>
            <button
              type="button"
              className="rt-btn wuba"
              onClick={(e) => onJump(listing, 'wuba', e)}
              title="去 58 同城搜该小区真实在租房源"
            >
              58同城
            </button>
            <button
              type="button"
              className="rt-btn ghost"
              onClick={(e) => onJump(listing, 'amap', e)}
              title="在高德地图上定位该地址"
            >
              <MapPin size={11} /> 地图
            </button>
          </div>
        </div>

        <div className="rt-hint-row">
          {listing.minLease && <span className="rt-hint-lease">{listing.minLease}</span>}
          {listing.riskNote ? (
            <span className="rt-hint-risk">
              <ShieldAlert size={11} /> {listing.riskNote}
            </span>
          ) : listing.basis ? (
            <span className="rt-hint-basis">
              <Sparkles size={11} /> {listing.basis}
            </span>
          ) : null}
          <span className="rt-open-detail">
            详情 <ExternalLink size={11} />
          </span>
        </div>
      </div>
    </article>
  );
};
