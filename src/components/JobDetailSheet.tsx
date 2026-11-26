import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import {
  Banknote,
  Briefcase,
  Copy,
  ExternalLink,
  GraduationCap,
  Info,
  MapPin,
  QrCode,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { JobListing } from '../types/job';
import { copyTextSilently } from '../utils/deepLinks';
import { formatDistance } from '../utils/coordTransform';
import { buildAmapWebUrl } from '../utils/mapLaunch';
import { buildAmapStaticMapUrl, isAmapPhoto, isStaticMapUrl, photoSrc } from '../utils/rentalImages';
import { buildBossSearchUrl } from '../services/jobService';

interface Props {
  job: JobListing | null;
  city: string;
  amapKey: string;
  onClose: () => void;
  onJump: (job: JobListing, platform: 'boss' | 'wuba' | 'zhaopin' | 'amap') => void;
}

export const JobDetailSheet: React.FC<Props> = ({ job, city, amapKey, onClose, onJump }) => {
  const [activePhoto, setActivePhoto] = useState(0);
  const [qrMode, setQrMode] = useState<'boss' | 'amap'>('boss');
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActivePhoto(0);
  }, [job?.id]);

  const cleanCity = String(city || '').replace(/市$/, '');
  // 岗位标题本身就是最好的检索词，城市交给 city 参数限定，避免搜出外地岗位
  const searchKeyword = job ? job.title : '';

  // 手机扫码直达：BOSS直聘该城市同岗位搜索 / 高德定位单位
  useEffect(() => {
    if (!job) {
      setQrUrl('');
      return;
    }
    const target =
      qrMode === 'boss'
        ? buildBossSearchUrl(city, job.title)
        : buildAmapWebUrl({
            name: job.company,
            address: job.address,
            city,
            lng: job.lng,
            lat: job.lat,
            approx: job.geoApprox,
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
  }, [job?.id, qrMode, city, job?.lng, job?.lat, job?.company, job?.title]);

  const bossDirectUrl = job ? buildBossSearchUrl(city, job.title) : '';
  const amapDirectUrl = job
    ? buildAmapWebUrl({
        name: job.company,
        address: job.address,
        city,
        lng: job.lng,
        lat: job.lat,
        approx: job.geoApprox,
      })
    : '';
  const scanOpenUrl = qrMode === 'boss' ? bossDirectUrl : amapDirectUrl;

  const handleCopyKeyword = async () => {
    const text = qrMode === 'boss' ? searchKeyword : `${cleanCity} ${job?.company || ''}`.trim();
    const ok = await copyTextSilently(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    }
    return ok;
  };

  if (!job) return null;
  const isDemo = job.source === 'demo';

  const mapPhoto = buildAmapStaticMapUrl({
    lng: job.lng,
    lat: job.lat,
    amapKey,
    zoom: 16,
  });
  const photos = [...(job.photos || []), ...(mapPhoto ? [mapPhoto] : [])];
  const currentPhoto = photos[Math.min(activePhoto, photos.length - 1)];
  const photoSource = isStaticMapUrl(currentPhoto)
    ? '高德位置图'
    : isAmapPhoto(currentPhoto)
    ? '高德实景图'
    : '示意图';

  const facts: { label: string; value: string; icon: React.ReactNode }[] = [
    { label: '薪资', value: job.salaryText, icon: <Banknote size={13} /> },
    { label: '用工类型', value: job.type, icon: <Briefcase size={13} /> },
    { label: '经验要求', value: job.experience || '不限', icon: <Briefcase size={13} /> },
    { label: '学历要求', value: job.education || '不限', icon: <GraduationCap size={13} /> },
    {
      label: '招聘人数',
      value: job.headcount ? `${job.headcount} 人` : '若干',
      icon: <Users size={13} />,
    },
    { label: '距搜索中心', value: formatDistance(job.distanceMeters), icon: <MapPin size={13} /> },
  ];

  return createPortal(
    <div className="jb-sheet-mask" onClick={onClose}>
      <div className="jb-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="jb-sheet-head">
          <div>
            <h2>{job.title}</h2>
            <p>
              {job.company}
              {job.district ? ` · ${job.district}` : ''}
            </p>
          </div>
          <button type="button" className="jb-sheet-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="jb-sheet-scroll">
          {currentPhoto && (
            <div className="jb-gallery">
              <div
                className={`jb-gallery-main ${isStaticMapUrl(currentPhoto) ? 'is-map' : ''}`}
                onClick={() => {
                  if (isStaticMapUrl(currentPhoto)) onJump(job, 'amap');
                }}
              >
                <img src={photoSrc(currentPhoto)} alt={job.company} referrerPolicy="no-referrer" />
                <span className="jb-gallery-src">{photoSource}</span>
              </div>

              {photos.length > 1 && (
                <div className="jb-gallery-thumbs">
                  {photos.map((p, i) => (
                    <button
                      key={`${p}-${i}`}
                      type="button"
                      className={`jb-gallery-thumb ${i === activePhoto ? 'active' : ''}`}
                      onClick={() => setActivePhoto(i)}
                      aria-label={`查看第 ${i + 1} 张图`}
                    >
                      <img src={photoSrc(p)} alt="" referrerPolicy="no-referrer" />
                      {isStaticMapUrl(p) && (
                        <span className="jb-thumb-map-tag">
                          <MapPin size={10} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="jb-sheet-salary">
            <div className="jb-sheet-salary-main">
              <strong>{job.salaryText}</strong>
              <span className={`jb-type-pill type-${job.type}`}>{job.type}</span>
            </div>
            <span className={`jb-sheet-source ${isDemo ? 'demo' : ''}`}>
              {isDemo ? '示例岗位' : 'AI 联网检索'}
            </span>
          </div>

          <div className="jb-facts-grid">
            {facts.map((f) => (
              <div key={f.label} className="jb-fact">
                <span className="jb-fact-label">
                  {f.icon} {f.label}
                </span>
                <span className="jb-fact-value">{f.value}</span>
              </div>
            ))}
          </div>

          {job.tags.length > 0 && (
            <div className="jb-sheet-block">
              <h3>福利待遇</h3>
              <div className="jb-tag-list">
                {job.tags.map((t) => (
                  <span key={t} className="jb-tag big">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {job.description && (
            <div className="jb-sheet-block">
              <h3>岗位职责与要求</h3>
              <p className="jb-desc">{job.description}</p>
            </div>
          )}

          <div className="jb-sheet-block">
            <h3>工作地点</h3>
            <div className="jb-sheet-loc">
              <MapPin size={14} />
              <span>{job.address}</span>
            </div>
            <div className="jb-sheet-loc-sub">
              距搜索中心约 {formatDistance(job.distanceMeters)}
              {job.publishText ? ` · ${job.publishText}` : ''}
            </div>
          </div>

          <div className="jb-sheet-warn">
            <ShieldAlert size={14} />
            <span>
              任何以押金、服装费、培训费、体检费、入职保证金名义先收费的都要警惕；不要交身份证原件，不要做刷单、
              代收款类“岗位”。请到 BOSS直聘 / 58同城 核验企业与招聘者身份后再面试。
            </span>
          </div>

          <div className="jb-sheet-disclaimer">
            <Info size={13} />
            <div>
              <strong>信息性质说明</strong>
              <p>
                以上岗位、薪资与单位名称由 AI 结合公开检索摘要与该地段招聘行情整理，属于参考信息，不是平台在招岗位原文；
                不提供招聘方电话，请点下方按钮到招聘平台查看真实岗位与联系方式。
              </p>
            </div>
          </div>

          <div className="jb-scan-block">
            <div className="jb-scan-head">
              <strong>
                <QrCode size={13} /> 手机扫码直达
              </strong>
              <div className="jb-scan-tabs">
                <button
                  type="button"
                  className={qrMode === 'boss' ? 'active' : ''}
                  onClick={() => setQrMode('boss')}
                >
                  BOSS直聘
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

            <div className="jb-scan-body">
              {qrUrl ? (
                <img src={qrUrl} alt="手机扫码直达" />
              ) : (
                <div className="jb-scan-placeholder">二维码生成中…</div>
              )}
              <div className="jb-scan-side">
                <p>
                  {qrMode === 'boss'
                    ? `手机扫一下，直接进 BOSS直聘 搜「${job.title}」（限定${cleanCity || '当前城市'}），看真实在招岗位`
                    : `扫一下在手机高德地图上定位「${job.company}」，先看看单位在哪儿再决定去不去面试`}
                </p>
                <div className="jb-scan-actions">
                  <button type="button" onClick={() => void handleCopyKeyword()}>
                    <Copy size={12} /> {copied ? '已复制' : qrMode === 'boss' ? '复制搜索词' : '复制单位名'}
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

        <div className="jb-sheet-actions">
          <button type="button" className="jb-sheet-btn boss" onClick={() => onJump(job, 'boss')}>
            BOSS直聘
          </button>
          <button type="button" className="jb-sheet-btn wuba" onClick={() => onJump(job, 'wuba')}>
            58同城
          </button>
          <button
            type="button"
            className="jb-sheet-btn ghost"
            onClick={() => onJump(job, 'zhaopin')}
          >
            智联
          </button>
          <button type="button" className="jb-sheet-btn ghost" onClick={() => onJump(job, 'amap')}>
            高德地图
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
