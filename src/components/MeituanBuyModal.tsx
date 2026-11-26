import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  ExternalLink,
  Laptop,
  MapPin,
  ShieldAlert,
  ShoppingBag,
  Smartphone,
  X,
} from 'lucide-react';
import { HotelItem } from '../types/hotel';
import {
  buildExactStoreQuery,
  buildPlatformLinks,
  copyTextSilently,
} from '../utils/deepLinks';

interface Props {
  hotel: HotelItem | null;
  onClose: () => void;
}

export const MeituanBuyModal: React.FC<Props> = ({ hotel, onClose }) => {
  const [qrMode, setQrMode] = useState<'amap_ota' | 'meituan_app' | 'lan'>('amap_ota');
  const [lanIp, setLanIp] = useState<string>('');
  const [port, setPort] = useState<number>(5173);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hotel) return;
    setQrMode('amap_ota');
    const exactQuery = buildExactStoreQuery(hotel);
    void copyTextSilently(exactQuery);

    fetch('/api/hotel-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hotel),
    }).catch(() => {});

    fetch('/api/lan-info')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.ips) && d.ips.length > 0) setLanIp(d.ips[0]);
        if (d.port) setPort(d.port);
      })
      .catch(() => {});
  }, [hotel]);

  useEffect(() => {
    if (!hotel) {
      setQrUrl('');
      return;
    }
    const links = buildPlatformLinks(hotel);
    let targetUrl = links.amapPoiApp;
    if (qrMode === 'meituan_app') {
      targetUrl = links.meituanApp;
    } else if (qrMode === 'lan' && lanIp) {
      targetUrl = `http://${lanIp}:${port}/?buyId=${encodeURIComponent(hotel.id)}`;
    }

    let cancelled = false;
    QRCode.toDataURL(targetUrl, {
      width: 186,
      margin: 1,
      color: { dark: '#1c1917', light: '#ffffff' },
    })
      .then((u) => {
        if (!cancelled) setQrUrl(u);
      })
      .catch(() => {
        if (!cancelled) setQrUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [hotel, qrMode, lanIp, port]);

  if (!hotel) return null;

  const exactQuery = buildExactStoreQuery(hotel);
  const links = buildPlatformLinks(hotel);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="settings-modal"
        style={{ maxWidth: 510 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ background: '#fffbeb' }}>
          <div className="modal-title">
            <ShoppingBag size={18} color="#d97706" />
            <h3>精准锁定购买「{hotel.name}」</h3>
          </div>
          <button type="button" className="circle-btn plain" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="info-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <div className="info-line">
              <MapPin size={16} color="#15803d" />
              <div className="info-text" style={{ fontSize: 12.5 }}>
                <strong style={{ color: '#166534' }}>已绑定唯一物理门店（防重名串店）：</strong>
                <div>
                  {hotel.city}
                  {hotel.address}
                </div>
              </div>
            </div>
          </div>

          {/* 方式一：电脑端同店直接打开 */}
          <div className="guide-card">
            <h4>
              <Laptop size={15} /> 方式一：直接在当前电脑浏览器打开同店预订
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <a
                href={links.amapDetail}
                target="_blank"
                rel="noopener noreferrer"
                className="buy-modal-btn"
                style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)' }}
              >
                高德唯一门店ID直达（内含美团/携程/飞猪同店比价） <ExternalLink size={13} />
              </a>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <a
                  href={links.ctripWeb}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="buy-modal-btn ctrip-btn"
                >
                  去携程同店购买 <ExternalLink size={13} />
                </a>
                <a
                  href={links.tongchengWeb}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="buy-modal-btn tongcheng-btn"
                >
                  去同程同店购买 <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>

          {/* 方式二：手机扫码直达（默认 5G 通用公网码，免同一 Wi-Fi！） */}
          <div className="guide-card" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <h4 style={{ margin: 0 }}>
                <Smartphone size={15} /> 方式二：手机扫码直跳该门店（5G/Wi-Fi通用）
              </h4>
              <div
                style={{
                  display: 'inline-flex',
                  background: '#fef3c7',
                  padding: 2,
                  borderRadius: 8,
                  gap: 3,
                }}
              >
                <button
                  type="button"
                  className={`mini-pill ${qrMode === 'amap_ota' ? 'active' : ''}`}
                  onClick={() => setQrMode('amap_ota')}
                >
                  手机相机通用码
                </button>
                <button
                  type="button"
                  className={`mini-pill ${qrMode === 'meituan_app' ? 'active' : ''}`}
                  onClick={() => setQrMode('meituan_app')}
                >
                  美团App扫一扫
                </button>
                {lanIp && (
                  <button
                    type="button"
                    className={`mini-pill ${qrMode === 'lan' ? 'active' : ''}`}
                    onClick={() => setQrMode('lan')}
                  >
                    同Wi-Fi唤美团
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <div style={{ flex: 1, fontSize: 12, color: '#78350f', lineHeight: 1.55 }}>
                <p>
                  {qrMode === 'amap_ota'
                    ? '用手机系统相机直接扫码（无需同一 Wi-Fi），直达该物理门店手机端比价与美团/携程预订入口：'
                    : qrMode === 'meituan_app'
                    ? '打开手机【美团 App → 右上角扫一扫】扫码，直接锁定该分店团购与日历房：'
                    : '手机连同一 Wi-Fi 用系统相机扫码，自动唤起手机美团 App 锁定该分店：'}
                </p>
                <button
                  type="button"
                  className="copy-inline-btn"
                  style={{ margin: '6px 0', fontWeight: 700, color: '#1c1917' }}
                  onClick={async () => {
                    await copyTextSilently(exactQuery);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>复制：{exactQuery}</span>
                </button>
              </div>
              {qrUrl && (
                <div className="qr-img-box">
                  <img src={qrUrl} alt="手机扫码直达该酒店" style={{ width: 118, height: 118 }} />
                  <span>
                    {qrMode === 'meituan_app' ? '美团App扫码' : '手机相机扫码'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <p className="privacy-hint" style={{ alignItems: 'flex-start' }}>
            <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              说明：美团 PC 酒店网页已下线，手机端领神券/会员折后价通常低于公开挂牌价，用上方二维码即可在手机上精准直达同一家店。
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
