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
  const [lanIp, setLanIp] = useState<string>('');
  const [port, setPort] = useState<number>(5173);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hotel) return;
    const exactQuery = buildExactStoreQuery(hotel);
    copyTextSilently(exactQuery);

    // 将当前点击的唯一门店完整数据（含城市、区县、门牌地址、高德唯一POI ID）存入本机服务，确保手机扫码 100% 锁定同一门店
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
    if (!hotel || !lanIp) {
      setQrUrl('');
      return;
    }
    const bridgeUrl = `http://${lanIp}:${port}/?buyId=${encodeURIComponent(hotel.id)}`;
    QRCode.toDataURL(bridgeUrl, {
      width: 190,
      margin: 1,
      color: { dark: '#1c1917', light: '#ffffff' },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [hotel, lanIp, port]);

  if (!hotel) return null;

  const exactQuery = buildExactStoreQuery(hotel);
  const links = buildPlatformLinks(hotel);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="settings-modal"
        style={{ maxWidth: 500 }}
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
          {/* 门店防跳错唯一定位核对条 */}
          <div className="info-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <div className="info-line">
              <MapPin size={16} color="#15803d" />
              <div className="info-text" style={{ fontSize: 12.5 }}>
                <strong style={{ color: '#166534' }}>已绑定唯一物理门店（防重名串店）：</strong>
                <div>{hotel.city}{hotel.address}</div>
              </div>
            </div>
          </div>

          {/* 方式一：电脑端同店精准购买（高德物理同ID直订 / 携程同城同路名锁定 / 同程） */}
          <div className="guide-card">
            <h4>
              <Laptop size={15} /> 方式一：直接在当前电脑端精准打开这家店预订
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <a
                href={links.amapDetail}
                target="_blank"
                rel="noopener noreferrer"
                className="buy-modal-btn"
                style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)' }}
              >
                高德唯一门店ID直达（内含美团/携程/飞猪同店实价） <ExternalLink size={13} />
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

          {/* 方式二：手机扫码 100% 跳转同一家美团门店 */}
          <div className="guide-card" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
            <h4>
              <Smartphone size={15} /> 方式二：手机扫码直跳美团 App 同一家店
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <div style={{ flex: 1, fontSize: 12, color: '#78350f', lineHeight: 1.55 }}>
                <p>
                  扫码后将携带<strong>「城市+区县+街道+店名」</strong>精准锁定该分店，绝不会跳去外地或其他同名分店：
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
                <p style={{ fontSize: 11, opacity: 0.9 }}>
                  注：电脑若开启了 Mihomo/Clash 的 TUN 模式，请关闭 TUN 仅保留系统代理后再用手机相机扫码。
                </p>
              </div>
              {qrUrl && (
                <div className="qr-img-box">
                  <img src={qrUrl} alt="扫码跳同一家美团店" style={{ width: 112, height: 112 }} />
                  <span>扫码锁定同店</span>
                </div>
              )}
            </div>
          </div>

          <p className="privacy-hint" style={{ alignItems: 'flex-start' }}>
            <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              关于价格差异说明：美团 App 内最终到手价叠加了你个人账号的「神券膨胀、美团会员等级折扣、门店私域闲时特惠」，此类私域折后价不对外网公开，因此界面上的 AI 价格为公开挂牌参考价，最终下单请以扫码进店后的个人券后价为准。
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
