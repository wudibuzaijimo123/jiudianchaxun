import React, { useState } from 'react';
import { Building2, ExternalLink, GraduationCap, Images, MapPin, Navigation2, Users } from 'lucide-react';
import { JobListing } from '../types/job';
import { formatDistance } from '../utils/coordTransform';
import { isAmapPhoto, jobPhotos, photoSrc } from '../utils/rentalImages';

interface Props {
  job: JobListing;
  onOpen: (job: JobListing) => void;
  onJump: (
    job: JobListing,
    platform: 'boss' | 'wuba' | 'zhaopin' | 'amap',
    e: React.MouseEvent
  ) => void;
}

const LOGO_TONES = ['blue', 'green', 'amber', 'violet', 'rose', 'cyan'];

function toneOf(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 997;
  return LOGO_TONES[h % LOGO_TONES.length];
}

export const JobCard: React.FC<Props> = ({ job, onOpen, onJump }) => {
  const isDemo = job.source === 'demo';
  const tone = toneOf(job.company);
  const initial = (job.company || '招').slice(0, 1);
  const photos = jobPhotos(job);
  const cover = photos[0];
  const [imgError, setImgError] = useState(false);
  const showImg = Boolean(cover) && !imgError;

  return (
    <article className="jb-card" onClick={() => onOpen(job)}>
      <div className="jb-card-head">
        <div className={`jb-logo ${showImg ? 'has-img' : `tone-${tone}`}`}>
          {showImg ? (
            <img
              src={photoSrc(cover)}
              alt={job.company}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
            />
          ) : (
            initial
          )}
          {showImg && (
            <span className={`jb-logo-src ${isAmapPhoto(cover) ? 'amap' : ''}`}>
              {isAmapPhoto(cover) ? '高德' : 'AI图'}
            </span>
          )}
          {showImg && photos.length > 1 && (
            <span className="jb-logo-cnt">
              <Images size={9} /> {photos.length}
            </span>
          )}
        </div>

        <div className="jb-main">
          <div className="jb-title-row">
            <h3 className="jb-title">{job.title}</h3>
            <span className="jb-salary">{job.salaryText}</span>
          </div>

          <div className="jb-company-row">
            <span className="jb-company">
              <Building2 size={11} /> {job.company}
            </span>
            <span className={`jb-type-pill type-${job.type}`}>{job.type}</span>
            {job.verifiedSource && (
              <span className="jb-type-pill" style={{ background: '#dcfce7', color: '#15803d' }}>
                公开真帖
              </span>
            )}
            {isDemo && <span className="jb-demo-pill">示例</span>}
          </div>

          <div className="jb-meta-row">
            {job.experience && <span className="jb-meta">{job.experience}</span>}
            {job.education && (
              <span className="jb-meta">
                <GraduationCap size={11} /> {job.education}
              </span>
            )}
            {job.headcount && (
              <span className="jb-meta">
                <Users size={11} /> 招{job.headcount}人
              </span>
            )}
          </div>

          {job.tags.length > 0 && (
            <div className="jb-tags">
              {job.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="jb-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="jb-addr-row">
            <MapPin size={11} />
            <span className="jb-addr-text">{job.address}</span>
            <span className="jb-distance">
              <Navigation2 size={10} /> {formatDistance(job.distanceMeters)}
            </span>
          </div>
        </div>
      </div>

      <div className="jb-card-foot" onClick={(e) => e.stopPropagation()}>
        <span className="jb-publish">{job.publishText || '近期发布'}</span>
        <div className="jb-actions">
          <button
            type="button"
            className="jb-btn boss"
            onClick={(e) => onJump(job, 'boss', e)}
            title="去 BOSS 直聘搜同岗位"
          >
            BOSS
          </button>
          <button
            type="button"
            className="jb-btn wuba"
            onClick={(e) => onJump(job, 'wuba', e)}
            title="去 58 同城看同类岗位"
          >
            58
          </button>
          <button
            type="button"
            className="jb-btn ghost"
            onClick={(e) => onJump(job, 'amap', e)}
            title="在高德地图上看看这家单位在哪"
          >
            <MapPin size={10} /> 地图
          </button>
          <button type="button" className="jb-btn detail" onClick={() => onOpen(job)}>
            详情 <ExternalLink size={10} />
          </button>
        </div>
      </div>
    </article>
  );
};
