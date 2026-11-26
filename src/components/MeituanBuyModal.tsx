import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink, Laptop, ShoppingBag, Smartphone, X } from 'lucide-react';
import { HotelItem } from '../types/hotel';
import { copyTextSilently } from '../utils/deepLinks';

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
    copyTextSilently(hotel.name);
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
    // 超短局域网桥接链接，手机浏览器扫开即自动唤起美团 App 搜索该店
    const bridgeUrl = `http://${lanIp}:${port}/?gomt=${encodeURIComponent(hotel.name)}`;
    QRCode.toDataURL(bridgeUrl, {
      width: 190,
      margin: 1,
      color: { dark: '#1c1917', light: '#ffffff' },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [hotel, lanIp, port]);

  if (!hotel) return null;

  const ctripBuyUrl = `https://hotels.ctrip.com/hotels/list?keyword=${encodeURIComponent(
    hotel.name
  )}`;
  const tongchengBuyUrl = `https://www.ly.com/hotel/hotelsearch?keyword=${encodeURIComponent(
    hotel.name
  )}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: '#fffbeb' }}>
          <div className="modal-title">
            <ShoppingBag size={18} color="#d97706" />
            <h3>购买预订「{hotel.name}」</h3>
          </div>
          <button type="button" className="circle-btn plain" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="status-banner mode-demo">
            <Smartphone size={18} />
            <div>
              <strong>为什么美团电脑网页显示 OpenResty？</strong>
              <div style={{ marginTop: 2 }}>
                美团官方现已关停电脑网页端订房（<code>hotel.meituan.com</code> 已下线），美团订房仅开放给<strong>手机美团 App / 微信小程序</strong>。店名<strong>「{hotel.name}」</strong>已自动为你复制！
              </div>
            </div>
          </div>

          {/* 方式一：电脑端直接在线付款订房（携程 / 同程正常营业） */}
          <div className="guide-card">
            <h4>
              <Laptop size={15} /> 方式一：直接在当前电脑网页在线订房付款
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <a
                href={ctripBuyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="book-direct-btn"
                style={{ justifyContent: 'center', padding: '10px 12px', fontSize: 13 }}
              >
                去携程电脑版购买 <ExternalLink size={13} />
              </a>
              <a
                href={tongchengBuyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="book-direct-btn"
                style={{
                  justifyContent: 'center',
                  padding: '10px 12px',
                  fontSize: 13,
                  background: '#059669',
                }}
              >
                去同程电脑版购买 <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* 方式二：手机美团下单 */}
          <div className="guide-card" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
            <h4>
              <Smartphone size={15} /> 方式二：在手机美团 App / 微信美团小程序购买
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <div style={{ flex: 1, fontSize: 12, color: '#78350f', lineHeight: 1.55 }}>
                <p>
                  1. 直接打开手机<strong>美团 App</strong>或微信<strong>「美团酒店」小程序</strong>搜：
                </p>
                <button
                  type="button"
                  className="copy-inline-btn"
                  style={{ margin: '6px 0', fontWeight: 700, color: '#1c1917' }}
                  onClick={async () => {
                    await copyTextSilently(hotel.name);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{hotel.name}</span>
                </button>
                <p>
                  2. 或用<strong>手机系统相机/Safari</strong>扫右侧码自动拉起美团 App（若电脑开了 Clash/Mihomo 的 <strong>TUN模式</strong>，请先关掉 TUN 只留系统代理，否则局域网会被拦截）。
                </p>
              </div>
              {qrUrl && (
                <div className="qr-img-box">
                  <img src={qrUrl} alt="扫码拉起美团App" style={{ width: 112, height: 112 }} />
                  <span>手机浏览器扫码</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
