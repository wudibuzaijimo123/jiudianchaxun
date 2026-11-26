import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Briefcase,
  ChevronDown,
  Crosshair,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { fetchPlaceSuggestions, resolvePlaceCenter } from '../services/amapService';
import {
  JOB_SALARY_OPTIONS,
  JOB_TYPE_OPTIONS,
  applyJobFilters,
  buildJobPlatformLinks,
  buildJobSearchKeyword,
  searchJobs,
} from '../services/jobService';
import { LlmConfig, PlaceSuggestion, SearchCenter } from '../types/hotel';
import { JobFilterState, JobListing, JobSortMode } from '../types/job';
import { amapTargetFrom, buildAmapWebUrl, openInAmap } from '../utils/mapLaunch';
import { copyTextSilently, isMobileDevice } from '../utils/deepLinks';
import { openAppFirst, openExternalUrl, reserveTab } from '../utils/nativeBridge';
import { JobCard } from './JobCard';
import { JobDetailSheet } from './JobDetailSheet';
import { SmartJumpModal, SmartJumpTarget } from './SmartJumpModal';
import './job.css';

const RADIUS_OPTIONS = [
  { label: '1km', value: 1000 },
  { label: '2km', value: 2000 },
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
];

/** 常驻距离条：找工作常看通勤圈，多给一档 10km */
const JOB_RADIUS_OPTIONS = [
  { label: '1km', value: 1000 },
  { label: '2km', value: 2000 },
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
];

const SORT_OPTIONS: { label: string; value: JobSortMode }[] = [
  { label: '距离最近', value: 'distance' },
  { label: '薪资最高', value: 'salary_desc' },
];

interface Props {
  center: SearchCenter;
  amapKey: string;
  llmConfig: LlmConfig;
  serpApiKey: string;
  serverBaseUrl: string;
  locating: boolean;
  onSelectCenter: (center: SearchCenter) => void;
  onLocateMe: () => void;
  onToast: (msg: string) => void;
}

export const JobPanel: React.FC<Props> = ({
  center,
  amapKey,
  llmConfig,
  serpApiKey,
  serverBaseUrl,
  locating,
  onSelectCenter,
  onLocateMe,
  onToast,
}) => {
  const [filters, setFilters] = useState<JobFilterState>({
    radius: 3000,
    type: 'all',
    salaryRange: 'all',
    sortBy: 'distance',
    keyword: '',
  });

  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [mode, setMode] = useState<'ai' | 'demo'>('demo');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<JobListing | null>(null);
  const [jumpModalTarget, setJumpModalTarget] = useState<SmartJumpTarget | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [query, setQuery] = useState(center.name);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(center.name);
    setShowDropdown(false);
  }, [center.name]);

  // 支持 ?open=first 直接展开第一个岗位（分享单个岗位时用）
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || jobs.length === 0) return;
    if (new URLSearchParams(window.location.search).get('open') !== 'first') return;
    autoOpened.current = true;
    setDetail(jobs[0]);
  }, [jobs]);

  const runSearch = useCallback(
    async (force = false, radiusOverride?: number) => {
      setLoading(true);
      try {
        const res = await searchJobs({
          center,
          radius: Math.max(radiusOverride ?? filters.radius, 2000),
          llm: llmConfig,
          amapKey,
          serpApiKey,
          serverBaseUrl,
          force,
        });
        setJobs(res.jobs);
        setMode(res.mode);
        setNotice(res.notice);
        if (force && res.mode === 'ai') {
          onToast(`已重新检索到 ${res.jobs.length} 个岗位`);
        }
      } catch (err: any) {
        setNotice(err?.message || '招聘检索失败');
      } finally {
        setLoading(false);
      }
    },
    [center, filters.radius, llmConfig, amapKey, serpApiKey, serverBaseUrl, onToast]
  );

  useEffect(() => {
    void runSearch(false);
    // 地点、高德 Key、SerpApi 或大模型配置变化时重新检索
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lng, center.lat, amapKey, serpApiKey, llmConfig.apiKey, llmConfig.baseUrl, llmConfig.model, serverBaseUrl]);

  // 地名联想
  useEffect(() => {
    const trimmed = query.trim();
    if (!showDropdown || !trimmed || trimmed === center.name) return;
    const timer = setTimeout(async () => {
      const list = await fetchPlaceSuggestions(trimmed, amapKey);
      setSuggestions(list);
    }, 280);
    return () => clearTimeout(timer);
  }, [query, amapKey, showDropdown, center.name]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const submitPlace = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setShowDropdown(false);
    setSearchingPlace(true);
    const resolved = await resolvePlaceCenter(trimmed, amapKey);
    setSearchingPlace(false);
    if (resolved) {
      onSelectCenter(resolved);
      onToast(`已切换到「${resolved.name}」周边岗位`);
    } else {
      onToast('未能解析该地点，请补充城市或换一个更具体的地名');
    }
  };

  const filtered = useMemo(() => applyJobFilters(jobs, filters), [jobs, filters]);

  const handleJump = useCallback(
    async (job: JobListing, platform: 'boss' | 'wuba' | 'zhaopin' | 'amap') => {
      if (platform === 'amap') {
        onToast(`正在打开高德地图路线规划「${job.company}」`);
        void openInAmap({
          name: job.company,
          address: job.address,
          city: center.city,
          lng: job.lng,
          lat: job.lat,
          approx: job.geoApprox,
        });
        return;
      }

      const keyword = buildJobSearchKeyword(center, job);
      const links = buildJobPlatformLinks(center, job);

      // 58同城招聘 PC 网页会自动弹安全验证，而 m.58.com/<slug>/job/ 手机端 200 直通，因此在电脑端弹出扫码直达
      if (!isMobileDevice() && platform === 'wuba') {
        await copyTextSilently(keyword);
        setJumpModalTarget({
          platformName: '58同城招聘',
          accentColor: '#ff552e',
          itemTitle: `${job.title} · ${job.salaryText}`,
          itemSub: `${job.company} · ${job.address}`,
          keyword,
          mobileQrUrl: links.wuba,
          altQrLabel: '高德定位单位',
          altQrUrl: buildAmapWebUrl(
            amapTargetFrom({
              name: job.company,
              address: job.address,
              city: center.city,
              lng: job.lng,
              lat: job.lat,
              geoApprox: job.geoApprox,
            })
          ),
          pcFallbackUrl: links.wubaPc,
          reasonHint: '58同城招聘电脑端易弹出防刷验证；手机扫码可 200 直通当地 58 同城岗位搜索！',
        });
        return;
      }

      // BOSS直聘、智联或手机端：原生 IPA 内立即触发跳转，不让剪贴板异步阻塞手势
      const appSchemes: Record<string, string[]> = {
        boss: [links.bossApp, links.bossAppAlt],
        wuba: [links.wubaApp],
        zhaopin: [links.zhaopinApp],
        amap: [],
      };
      const platformName =
        platform === 'boss' ? 'BOSS直聘' : platform === 'wuba' ? '58同城' : '智联招聘';
      const tab = reserveTab();
      const copyPromise = copyTextSilently(keyword);
      // 先试 App 自己的 scheme（真机上能直接进 App），没装才退浏览器
      const result = await openAppFirst(appSchemes[platform] || [], links[platform], tab);
      const copied = await Promise.race([copyPromise, new Promise<boolean>((r) => setTimeout(() => r(false), 120))]);
      if (result === 'fail') {
        onToast(`跳转受阻，已复制「${keyword}」，可前往招聘平台粘贴搜`);
        return;
      }
      if (result === 'app') {
        onToast(`已跳转到${platformName} App${copied ? `，搜索词「${keyword}」已复制` : ''}`);
        return;
      }
      // 走到这里说明手机上没装对应 App，只能看网页版
      onToast(
        `未检测到${platformName} App，已用浏览器打开网页版${
          copied ? `，搜索词「${keyword}」已复制` : ''
        }`
      );
    },
    [center, onToast]
  );

  const filterHint = mode === 'demo' ? '示例岗位' : filters.type === 'all' ? '全部类型' : filters.type;

  return (
    <div className="jb-panel">
      <div className="jb-search-wrap" ref={boxRef}>
        <div className="jb-search-box">
          <Search size={15} className="jb-search-icon" />
          <input
            value={query}
            placeholder="输入商圈、街道、学校或小区"
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitPlace(query);
            }}
          />
          {searchingPlace && <Loader2 size={14} className="spin" />}
          <button
            type="button"
            className="jb-locate-btn"
            onClick={onLocateMe}
            disabled={locating}
            title="用当前位置找附近工作"
          >
            {locating ? <Loader2 size={14} className="spin" /> : <Crosshair size={14} />}
          </button>
        </div>

        {showDropdown && suggestions.length > 0 && (
          <div className="jb-suggest">
            {suggestions.slice(0, 6).map((s) => (
              <button
                key={`${s.id}-${s.name}`}
                type="button"
                className="jb-suggest-item"
                onClick={() => {
                  setShowDropdown(false);
                  onSelectCenter({
                    name: s.name,
                    city: s.city,
                    address: s.address,
                    lng: s.lng,
                    lat: s.lat,
                  });
                  onToast(`已切换到「${s.name}」周边岗位`);
                }}
              >
                <MapPin size={13} />
                <span className="jb-suggest-name">{s.name}</span>
                <span className="jb-suggest-addr">{s.address}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="jb-chip-row">
        {JOB_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`jb-chip ${filters.type === opt.value ? 'active' : ''}`}
            onClick={() => setFilters((prev) => ({ ...prev, type: opt.value }))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 距离：常驻可见，切换即按新半径重新检索 */}
      <div className="jb-radius-row">
        <span className="jb-radius-label">
          <MapPin size={12} /> 距离
        </span>
        {JOB_RADIUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`jb-chip small ${filters.radius === opt.value ? 'active' : ''}`}
            onClick={() => {
              setFilters((prev) => ({ ...prev, radius: opt.value }));
              void runSearch(false, opt.value);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="jb-subbar">
        <button
          type="button"
          className={`jb-filter-toggle ${showFilters ? 'open' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
        >
          筛选 · {filterHint} <ChevronDown size={13} />
        </button>

        <span className="jb-count">
          {center.name} · {filtered.length} 个岗位
        </span>

        <button
          type="button"
          className="jb-refresh-btn"
          onClick={() => void runSearch(true)}
          disabled={loading}
          title="重新联网检索该地段岗位"
        >
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
          <span className="hide-xs">重新检索</span>
        </button>
      </div>

      {showFilters && (
        <div className="jb-filter-panel">
          <div className="jb-filter-group">
            <span className="jb-filter-label">月薪区间（日/时薪按 26 天、8 小时折算）</span>
            <div className="jb-chip-row tight">
              {JOB_SALARY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`jb-chip small ${filters.salaryRange === opt.value ? 'active' : ''}`}
                  onClick={() => setFilters((prev) => ({ ...prev, salaryRange: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="jb-filter-group">
            <span className="jb-filter-label">范围</span>
            <div className="jb-chip-row tight">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`jb-chip small ${filters.radius === opt.value ? 'active' : ''}`}
                  onClick={() => setFilters((prev) => ({ ...prev, radius: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="jb-filter-group">
            <span className="jb-filter-label">排序</span>
            <div className="jb-chip-row tight">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`jb-chip small ${filters.sortBy === opt.value ? 'active' : ''}`}
                  onClick={() => setFilters((prev) => ({ ...prev, sortBy: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="jb-filter-group">
            <span className="jb-filter-label">关键词</span>
            <div className="jb-keyword-box">
              <input
                value={filters.keyword}
                placeholder="如 包吃住 / 日结 / 前台 / 双休"
                onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              />
              {filters.keyword && (
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, keyword: '' }))}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className={`jb-notice ${mode === 'demo' ? 'warn' : ''}`}>
          <Info size={13} />
          <span>{notice}</span>
        </div>
      )}

      <div className="jb-list">
        {loading && jobs.length === 0 ? (
          <div className="jb-loading">
            <Loader2 size={26} className="spin" />
            <p>
              {llmConfig.apiKey
                ? `正在联网检索「${center.name}」周边岗位与薪资行情...`
                : '正在加载示例岗位...'}
            </p>
            {llmConfig.apiKey && (
              <span className="jb-loading-sub">
                <Bot size={12} /> AI 会参考该地段门店招聘特征整理岗位与工资
              </span>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="jb-empty">
            <Briefcase size={34} />
            <p>当前条件下没有匹配岗位</p>
            <span>可以放宽薪资区间、缩小范围，或换一个搜索地点</span>
            <button
              type="button"
              className="jb-primary-btn"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  radius: Math.max(prev.radius, 5000),
                  salaryRange: 'all',
                  type: 'all',
                  keyword: '',
                }))
              }
            >
              放宽条件看全部岗位
            </button>
          </div>
        ) : (
          filtered.map((item) => (
            <JobCard
              key={item.id}
              job={item}
              onOpen={(j) => setDetail(j)}
              onJump={(j, platform, e) => {
                e.stopPropagation();
                handleJump(j, platform);
              }}
            />
          ))
        )}
      </div>

      <div className="jb-footnote">
        <Sparkles size={12} />
        岗位与薪资为 AI 联网整理的参考信息，未接入平台在招原文，请到 BOSS直聘 / 58同城核验后联系
      </div>

      <JobDetailSheet
        job={detail}
        city={center.city}
        amapKey={amapKey}
        onClose={() => setDetail(null)}
        onJump={(j, platform) => handleJump(j, platform)}
      />

      <SmartJumpModal target={jumpModalTarget} onClose={() => setJumpModalTarget(null)} />
    </div>
  );
};
