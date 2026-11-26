import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  ExternalLink,
  Laptop,
  MapPin,
  QrCode,
  Smartphone,
  X,
} from 'lucide-react';
import { copyTextSilently } from '../utils/deepLinks';
import { openExternalUrl } from '../utils/nativeBridge';

export interface SmartJumpTarget {
  platformName: string;
  accentColor?: string;
  itemTitle: string;
  itemSub?: string;
  keyword: string;
  /** 手机扫码直达链接（已验证手机端 200 直通，5G/Wi-Fi 通用） */
  mobileQrUrl: string;
  /** 可选第二个二维码（如高德定位导航码） */
  altQrLabel?: string;
  altQrUrl?: string;
  /** 电脑端仍要打开时的兜底链接 */
  pcFallbackUrl?: string;
  reasonHint?: string;
}

interface Props {
  target: SmartJumpTarget | null;
  onClose: () => void;
}

export const SmartJumpModal: React.FC<Props> = ({ target, onClose }) => {
  const [qrMode, setQrMode] = useState<'main' | 'alt'>('main');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setQrMode('main');
    setCopied(false);
    if (target?.keyword) {
      void copyTextSilently(target.keyword);
    }
  }, [target]);

  useEffect(() => {
    if (!target) {
      setQrDataUrl('');
      return;
    }
    const urlToEncode =
      qrMode === 'alt' && target.altQrUrl ? target.altQrUrl : target.mobileQrUrl;

    let cancelled = false;
    QRCode.toDataURL(urlToEncode, {
      width: 196,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [target, qrMode]);

  if (!target) return null;

  const accent = target.accentColor || '#2563eb';

  return createPortal(
    <div className="modal-backdrop" style={{ zIndex: 120 }} onClick={onClose}>
      <div
        className="settings-modal"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ background: '#f8fafc' }}>
          <div className="modal-title">
            <Smartphone size={18} color={accent} />
            <h3>手机扫码直跳 · {target.platformName}</h3>
          </div>
          <button type="button" className="circle-btn plain" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ gap: 12 }}>
          <div className="info-box" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
            <div className="info-line">
              <MapPin size={16} color="#1d4ed8" />
              <div className="info-text" style={{ fontSize: 12.5 }}>
                <strong style={{ color: '#1e3a8a' }}>{target.itemTitle}</strong>
                {target.itemSub && <div style={{ color: '#475569' }}>{target.itemSub}</div>}
              </div>
            </div>
          </div>

          <div
            className="guide-card"
            style={{
              background: '#ffffff',
              borderColor: '#e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '16px 14px',
            }}
          >
            {target.altQrUrl && (
              <div
                style={{
                  display: 'inline-flex',
                  background: '#f1f5f9',
                  padding: 3,
                  borderRadius: 9,
                  gap: 4,
                  marginBottom: 12,
                }}
              >
                <button
                  type="button"
                  className={`mini-pill ${qrMode === 'main' ? 'active' : ''}`}
                  onClick={() => setQrMode('main')}
                >
                  {target.platformName}直达码
                </button>
                <button
                  type="button"
                  className={`mini-pill ${qrMode === 'alt' ? 'active' : ''}`}
                  onClick={() => setQrMode('alt')}
                >
                  {target.altQrLabel || '高德定位码'}
                </button>
              </div>
            )}

            <div className="qr-img-box" style={{ padding: 10 }}>
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`扫码打开${target.platformName}`}
                  style={{ width: 168, height: 168 }}
                />
              ) : (
                <div style={{ width: 168, height: 168, display: 'grid', placeItems: 'center' }}>
                  生成中…
                </div>
              )}
              <span style={{ color: accent }}>
                <QrCode size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />
                手机相机 / 浏览器扫码即开（5G/Wi-Fi通用）
              </span>
            </div>

            <p style={{ fontSize: 12, color: '#475569', marginTop: 10, lineHeight: 1.55 }}>
              {target.reasonHint ||
                `${target.platformName}电脑网页端易触发登录或滑动验证，用手机扫码可直接进入对应城市与关键词结果页。`}
            </p>

            <button
              type="button"
              className="copy-inline-btn"
              style={{ marginTop: 8, fontWeight: 700 }}
              onClick={async () => {
                await copyTextSilently(target.keyword);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? '已复制关键词' : `已自动复制：${target.keyword}`}</span>
            </button>
          </div>

          {target.pcFallbackUrl && (
            <button
              type="button"
              className="save-both-btn"
              style={{
                background: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
              onClick={() => {
                void openExternalUrl(target.pcFallbackUrl!);
              }}
            >
              <Laptop size={15} />
              <span>仍在电脑浏览器打开 {target.platformName}（进站粘贴搜索词）</span>
              <ExternalLink size={13} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
