import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import {
  Building2,
  Compass,
  Copy,
  ExternalLink,
  Info,
  Layers,
  MapPin,
  QrCode,
  Ruler,
  ShieldAlert,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { RentalListing } from '../types/rental';
import { formatDistance } from '../utils/coordTransform';
import { copyTextSilently } from '../utils/deepLinks';
import { buildAnjukeMobileUrl, buildRentalPlatformLinks } from '../services/rentalService';
import { buildAmapWebUrl } from '../utils/mapLaunch';
import { getPhotoSourceLabel, RENTAL_FALLBACK_PHOTOS, buildAmapStaticMapUrl, isStaticMapUrl, photoSrc, rentalPhotos } from '../utils/rentalImages';

interface Props {
  listing: RentalListing | null;
  city: string;
  amapKey: string;
  onClose: () => void;
  onJump: (
    listing: RentalListing,
    platform: 'anjuke' | 'wuba' | 'beike' | 'amap' | 'baidu'
  ) => void;
}

const FACILITY_ICON_FALLBACK = '·';

export const RentalDetailSheet: React.FC<Props> = ({ listing, city, amapKey, onClose, onJump }) => {
  const [activePhoto, setActivePhoto] = useState(0);
  const [qrMode, setQrMode] = useState<'anjuke' | 'wuba' | 'amap'>('anjuke');
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActivePhoto(0);
  }, [listing?.id]);

  const cleanCity = String(city || '').replace(/市$/, '');

  // 手机扫码直达：安居客 / 58同城手机站 / 高德地图定位
  useEffect(() => {
    if (!listing) {
      setQrUrl('');
      return;
    }
    const fakeCenter = { name: listing.community, address: listing.address, city, lng: listing.lng || 0, lat: listing.lat || 0 };
    const links = buildRentalPlatformLinks(fakeCenter, listing);
    const target =
      qrMode === 'anjuke'
        ? buildAnjukeMobileUrl(city, listing)
        : qrMode === 'wuba'
        ? links.wuba
        : buildAmapWebUrl({
            name: listing.community,
            address: listing.address,
            city,
            lng: listing.lng,
            lat: listing.lat,
            approx: listing.geoApprox,
          });

    let cancelled = false;
    QRCode.toDataURL(target, {
      width: 148,
      margin: 1,
      color: { dark: '#1c1917', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [listing?.id, qrMode, city, listing?.lng, listing?.lat, listing?.community]);

  const amapDirectUrl = listing
    ? buildAmapWebUrl({
        name: listing.community,
        address: listing.address,
        city,
        lng: listing.lng,
        lat: listing.lat,
        approx: listing.geoApprox,
      })
    : '';
  const scanOpenUrl =
    qrMode === 'anjuke'
      ? listing
        ? buildAnjukeMobileUrl(city, listing)
        : ''
      : qrMode === 'wuba' && listing
      ? buildRentalPlatformLinks(
          { name: listing.community, address: listing.address, city, lng: listing.lng || 0, lat: listing.lat || 0 },
          listing
        ).wuba
      : amapDirectUrl;

  const handleCopyKeyword = async () => {
    const text = listing ? `${cleanCity} ${listing.community} 租房`.trim() : '';
    const ok = await copyTextSilently(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    }
    return ok;
  };

  if (!listing) return null;
  const isDemo = listing.priceSource === 'demo';

  const photoList = rentalPhotos(listing);
  const mapPhoto = buildAmapStaticMapUrl({
    lng: listing.lng,
    lat: listing.lat,
    amapKey,
    zoom: 15,
  });
  // 高德实景图 + AI 多户型街景参考图 + 高德位置图
  const photos = mapPhoto ? [...photoList, mapPhoto] : photoList;
  const currentPhoto = photos[Math.min(activePhoto, photos.length - 1)];
  const photoSource = getPhotoSourceLabel(currentPhoto, 'AI参考图');

  const facts: { label: string; value: string; icon: React.ReactNode }[] = [
    { label: '出租方式', value: listing.kind, icon: <Building2 size={13} /> },
    { label: '户型', value: listing.layout, icon: <Building2 size={13} /> },
    {
      label: '面积',
      value: listing.area ? `${listing.area} ㎡` : '待核实',
      icon: <Ruler size={13} />,
    },
    { label: '楼层', value: listing.floor || '待核实', icon: <Layers size={13} /> },
    { label: '朝向', value: listing.orientation || '待核实', icon: <Compass size={13} /> },
    { label: '装修', value: listing.decoration || '待核实', icon: <Sparkles size={13} /> },
    { label: '付租方式', value: listing.payMethod || '面议', icon: <Wallet size={13} /> },
    { label: '最短租期', value: listing.minLease || '面议', icon: <Info size={13} /> },
  ];

  return createPortal(
    <div className="rt-sheet-mask" onClick={onClose}>
      <div className="rt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rt-sheet-head">
          <div className="rt-sheet-head-main">
            <h2>{listing.title}</h2>
            <p>
              {listing.district ? `${listing.district} · ` : ''}
              {listing.community}
            </p>
          </div>
          <button type="button" className="rt-sheet-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="rt-sheet-scroll">
          {currentPhoto && (
            <div className="rt-gallery">
              <div
                className={`rt-gallery-main ${isStaticMapUrl(currentPhoto) ? 'is-map' : ''}`}
                onClick={() => {
                  if (isStaticMapUrl(currentPhoto)) onJump(listing, 'amap');
                }}
              >
                <img
                  src={photoSrc(currentPhoto)}
                  alt={listing.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const fallback = RENTAL_FALLBACK_PHOTOS[listing.kind]?.[0];
                    if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                  }}
                />
                <span className="rt-gallery-src">{photoSource}</span>
              </div>

              {photos.length > 1 && (
                <div className="rt-gallery-thumbs">
                  {photos.map((p, i) => (
                    <button
                      key={`${p}-${i}`}
                      type="button"
                      className={`rt-gallery-thumb ${i === activePhoto ? 'active' : ''}`}
                      onClick={() => setActivePhoto(i)}
                      aria-label={`查看第 ${i + 1} 张图`}
                    >
                      <img src={photoSrc(p)} alt="" referrerPolicy="no-referrer" />
                      {isStaticMapUrl(p) && (
                        <span className="rt-thumb-map-tag">
                          <MapPin size={10} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rt-sheet-price">
            <div className="rt-sheet-price-main">
              {listing.rentMonthly !== null ? (
                <>
                  <span className="cur">¥</span>
                  <strong>{listing.rentMonthly}</strong>
                  <span className="unit">/月</span>
                </>
              ) : (
                <>
                  <span className="cur">¥</span>
                  <strong>{listing.rentDaily}</strong>
                  <span className="unit">/天</span>
                </>
              )}
              {listing.rentMonthly !== null && listing.rentDaily !== null && (
                <span className="rt-sheet-daily">日租 ¥{listing.rentDaily}/天</span>
              )}
            </div>
            <span className={`rt-sheet-kind ${isDemo ? 'demo' : ''}`}>
              {isDemo ? '示例房源' : 'AI 联网检索'}
            </span>
          </div>

          <div className="rt-facts-grid">
            {facts.map((f) => (
              <div key={f.label} className="rt-fact">
                <span className="rt-fact-label">
                  {f.icon} {f.label}
                </span>
                <span className="rt-fact-value">{f.value}</span>
              </div>
            ))}
          </div>

          {listing.facilities.length > 0 && (
            <div className="rt-sheet-block">
              <h3>房屋配套</h3>
              <div className="rt-facility-list">
                {listing.facilities.map((f) => (
                  <span key={f} className="rt-facility">
                    {FACILITY_ICON_FALLBACK} {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rt-sheet-block">
            <h3>位置与距离</h3>
            <div className="rt-sheet-loc">
              <MapPin size={14} />
              <span>{listing.address}</span>
            </div>
            <div className="rt-sheet-loc-sub">
              距搜索中心约 {formatDistance(listing.distanceMeters)}
              {listing.basis ? ` · 依据：${listing.basis}` : ''}
            </div>
          </div>

          {listing.riskNote && (
            <div className="rt-sheet-warn">
              <ShieldAlert size={14} />
              <span>{listing.riskNote}</span>
            </div>
          )}

          <div className="rt-sheet-disclaimer">
            <Info size={13} />
            <div>
              <strong>请务必核验后再签约</strong>
              <p>
                以上户型与租金由 AI 结合公开检索摘要与该地段行情整理，属于参考信息，不是平台挂牌原文；不提供房东电话，
                请点下方按钮到安居客 / 58 同城 / 贝壳查看真实房源与联系方式。图片为高德地图上该小区/周边的实景图，
                不是本套房源的室内实拍。签约前请实地看房、核对房产证与房东身份，切勿提前转账定金。
              </p>
            </div>
          </div>

          <div className="rt-scan-block">
            <div className="rt-scan-head">
              <strong>
                <QrCode size={13} /> 手机扫码直达
              </strong>
              <div className="rt-scan-tabs">
                <button
                  type="button"
                  className={qrMode === 'anjuke' ? 'active' : ''}
                  onClick={() => setQrMode('anjuke')}
                >
                  安居客
                </button>
                <button
                  type="button"
                  className={qrMode === 'wuba' ? 'active' : ''}
                  onClick={() => setQrMode('wuba')}
                >
                  58同城
                </button>
                <button
                  type="button"
                  className={qrMode === 'amap' ? 'active' : ''}
                  onClick={() => setQrMode('amap')}
                >
                  高德地图
                </button>
              </div>
            </div>

            <div className="rt-scan-body">
              {qrUrl ? (
                <img src={qrUrl} alt="手机扫码直达" />
              ) : (
                <div className="rt-scan-placeholder">二维码生成中…</div>
              )}
              <div className="rt-scan-side">
                <p>
                  {qrMode === 'anjuke'
                    ? `手机扫一下，直接进安居客看「${listing.community}」租房信息（${cleanCity || '当前城市'}）`
                    : qrMode === 'wuba'
                    ? `手机扫一下，200 直通 58 同城手机端搜「${listing.community}」（避开电脑滑动验证）`
                    : `扫一下在手机高德地图上定位「${listing.community}」，可直接导航过去看房`}
                </p>
                <div className="rt-scan-actions">
                  <button type="button" onClick={() => void handleCopyKeyword()}>
                    <Copy size={12} />{' '}
                    {copied ? '已复制' : qrMode === 'anjuke' ? '复制小区名' : '复制小区名'}
                  </button>
                  {scanOpenUrl && (
                    <a href={scanOpenUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={12} /> 本机打开
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rt-sheet-actions">
          <button
            type="button"
            className="rt-sheet-btn anjuke"
            onClick={() => onJump(listing, 'anjuke')}
          >
            安居客找房
          </button>
          <button
            type="button"
            className="rt-sheet-btn wuba"
            onClick={() => onJump(listing, 'wuba')}
          >
            58同城
          </button>
          <button
            type="button"
            className="rt-sheet-btn ghost"
            onClick={() => onJump(listing, 'beike')}
          >
            贝壳
          </button>
          <button
            type="button"
            className="rt-sheet-btn ghost"
            onClick={() => onJump(listing, 'amap')}
            title="在高德地图中定位该小区（手机上会尝试唤起高德 App）"
          >
            高德地图
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
