import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  Crosshair,
  Home,
  Info,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { resolvePlaceCenter, fetchPlaceSuggestions } from '../services/amapService';
import {
  RENT_RANGE_OPTIONS,
  RENTAL_KIND_OPTIONS,
  applyRentalFilters,
  buildRentalPlatformLinks,
  buildRentalSearchKeyword,
  searchRentals,
} from '../services/rentalService';
import { LlmConfig, PlaceSuggestion, SearchCenter } from '../types/hotel';
import { RentalFilterState, RentalListing, RentalSortMode } from '../types/rental';
import { amapTargetFrom, openInAmap } from '../utils/mapLaunch';
import { copyTextSilently } from '../utils/deepLinks';
import { openExternalUrl } from '../utils/nativeBridge';
import { RentalCard } from './RentalCard';
import { RentalDetailSheet } from './RentalDetailSheet';
import { RentalMapView } from './RentalMapView';
import './rental.css';

const RADIUS_OPTIONS = [
  { label: '1km', value: 1000 },
  { label: '2km', value: 2000 },
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
];

/** 常驻距离条：租房找的是「通勤圈」，多给一档 10km 覆盖近郊 */
const RENT_RADIUS_OPTIONS = [
  { label: '1km', value: 1000 },
  { label: '2km', value: 2000 },
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
];

const SORT_OPTIONS: { label: string; value: RentalSortMode }[] = [
  { label: '距离最近', value: 'distance' },
  { label: '租金最低', value: 'rent_asc' },
  { label: '面积最大', value: 'area_desc' },
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

export const RentalPanel: React.FC<Props> = ({
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
  const [filters, setFilters] = useState<RentalFilterState>({
    radius: 3000,
    kind: 'all',
    rentRange: 'all',
    sortBy: 'distance',
    keyword: '',
  });

  const [listings, setListings] = useState<RentalListing[]>([]);
  const [mode, setMode] = useState<'ai' | 'demo'>('demo');
  const [notice, setNotice] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [detail, setDetail] = useState<RentalListing | null>(null);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>(() =>
    new URLSearchParams(window.location.search).get('view') === 'map' ? 'map' : 'list'
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [query, setQuery] = useState(center.name);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(center.name);
    setShowDropdown(false);
  }, [center.name]);

  // 支持 ?open=first 直接展开第一条房源（分享单条房源时用）
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || listings.length === 0) return;
    if (new URLSearchParams(window.location.search).get('open') !== 'first') return;
    autoOpened.current = true;
    setDetail(listings[0]);
  }, [listings]);

  const runSearch = useCallback(
    async (force = false, radiusOverride?: number) => {
      setLoading(true);
      try {
        const res = await searchRentals({
          center,
          radius: Math.max(radiusOverride ?? filters.radius, 2000),
          llm: llmConfig,
          amapKey,
          serpApiKey,
          serverBaseUrl,
          force,
        });
        setListings(res.listings);
        setMode(res.mode);
        setNotice(res.notice);
        if (force && res.mode === 'ai') {
          onToast(`已重新检索到 ${res.listings.length} 套房源`);
        }
      } catch (err: any) {
        setNotice(err?.message || '租房检索失败');
      } finally {
        setLoading(false);
      }
    },
    [center, filters.radius, llmConfig, serpApiKey, serverBaseUrl, onToast]
  );

  useEffect(() => {
    void runSearch(false);
    // 仅在地点或接口配置变化时重新联网检索，切换筛选不重复消耗额度
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lng, center.lat, llmConfig.apiKey, llmConfig.baseUrl, llmConfig.model, serverBaseUrl]);

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
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
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
      onToast(`已切换到「${resolved.name}」周边房源`);
    } else {
      onToast('未能解析该地点，请补充城市或换一个更具体的地名');
    }
  };

  const filtered = useMemo(() => applyRentalFilters(listings, filters), [listings, filters]);

  const handleJump = useCallback(
    async (listing: RentalListing, platform: 'anjuke' | 'wuba' | 'beike' | 'amap' | 'baidu') => {
      if (platform === 'amap') {
        onToast(`正在高德地图定位「${listing.community}」`);
        void openInAmap(
          amapTargetFrom({
            name: listing.community,
            address: listing.address,
            city: center.city,
            lng: listing.lng,
            lat: listing.lat,
            geoApprox: listing.geoApprox,
          })
        );
        return;
      }

      // 和酒店查询一致：先复制精准搜索词，再打开平台，用户进去直接粘贴
      const keyword = buildRentalSearchKeyword(center, listing);
      const copied = await copyTextSilently(keyword);
      if (platform === 'anjuke' || platform === 'wuba') {
        onToast(
          copied
            ? `已复制「${keyword}」，进入平台粘贴搜索；若出现验证页，完成一次验证即可`
            : `正在打开平台，进入后搜索「${keyword}」`
        );
      } else if (platform === 'beike') {
        onToast(`正在打开贝壳找房「${keyword}」`);
      }

      const links = buildRentalPlatformLinks(center, listing);
      void openExternalUrl(links[platform]);
    },
    [center, onToast]
  );

  const priceHint =
    mode === 'demo'
      ? '示例房源'
      : filters.kind === 'all'
      ? '全部类型'
      : filters.kind;

  return (
    <div className="rt-panel">
      <div className="rt-search-wrap" ref={boxRef}>
        <div className="rt-search-box">
          <Search size={15} className="rt-search-icon" />
          <input
            value={query}
            placeholder="输入小区、街道、学校或商圈"
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
            className="rt-locate-btn"
            onClick={onLocateMe}
            disabled={locating}
            title="用当前位置找附近房源"
          >
            {locating ? <Loader2 size={14} className="spin" /> : <Crosshair size={14} />}
          </button>
        </div>

        {showDropdown && suggestions.length > 0 && (
          <div className="rt-suggest">
            {suggestions.slice(0, 6).map((s) => (
              <button
                key={`${s.id}-${s.name}`}
                type="button"
                className="rt-suggest-item"
                onClick={() => {
                  setShowDropdown(false);
                  onSelectCenter({
                    name: s.name,
                    city: s.city,
                    address: s.address,
                    lng: s.lng,
                    lat: s.lat,
                  });
                  onToast(`已切换到「${s.name}」周边房源`);
                }}
              >
                <MapPin size={13} />
                <span className="rt-suggest-name">{s.name}</span>
                <span className="rt-suggest-addr">{s.address}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rt-chip-row">
        {RENTAL_KIND_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`rt-chip ${filters.kind === opt.value ? 'active' : ''}`}
            onClick={() => setFilters((prev) => ({ ...prev, kind: opt.value }))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 距离：常驻可见，切换即按新半径重新检索 */}
      <div className="rt-radius-row">
        <span className="rt-radius-label">
          <MapPin size={12} /> 距离
        </span>
        {RENT_RADIUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`rt-chip small ${filters.radius === opt.value ? 'active' : ''}`}
            onClick={() => {
              setFilters((prev) => ({ ...prev, radius: opt.value }));
              void runSearch(false, opt.value);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="rt-subbar">
        <button
          type="button"
          className={`rt-filter-toggle ${showFilters ? 'open' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
        >
          筛选 · {priceHint} <ChevronDown size={13} />
        </button>

        <span className="rt-count">
          {center.name} · {filtered.length} 套
        </span>

        <div className="rt-view-switch" role="group" aria-label="列表/地图切换">
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
            title="列表看房"
          >
            <List size={13} /> 列表
          </button>
          <button
            type="button"
            className={viewMode === 'map' ? 'active' : ''}
            onClick={() => setViewMode('map')}
            title="在高德地图上按价格看房"
          >
            <MapIcon size={13} /> 地图
          </button>
        </div>

        <button
          type="button"
          className="rt-refresh-btn"
          onClick={() => void runSearch(true)}
          disabled={loading}
          title="重新联网检索该地段房源"
        >
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
          <span className="hide-xs">重新检索</span>
        </button>
      </div>

      {showFilters && (
        <div className="rt-filter-panel">
          <div className="rt-filter-group">
            <span className="rt-filter-label">月租</span>
            <div className="rt-chip-row tight">
              {RENT_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rt-chip small ${filters.rentRange === opt.value ? 'active' : ''}`}
                  onClick={() => setFilters((prev) => ({ ...prev, rentRange: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rt-filter-group">
            <span className="rt-filter-label">范围</span>
            <div className="rt-chip-row tight">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rt-chip small ${filters.radius === opt.value ? 'active' : ''}`}
                  onClick={() => setFilters((prev) => ({ ...prev, radius: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rt-filter-group">
            <span className="rt-filter-label">排序</span>
            <div className="rt-chip-row tight">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rt-chip small ${filters.sortBy === opt.value ? 'active' : ''}`}
                  onClick={() => setFilters((prev) => ({ ...prev, sortBy: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rt-filter-group">
            <span className="rt-filter-label">关键词</span>
            <div className="rt-keyword-box">
              <input
                value={filters.keyword}
                placeholder="如 独卫 / 可月付 / 近地铁"
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

      {notice && viewMode === 'list' && (
        <div className={`rt-notice ${mode === 'demo' ? 'warn' : ''}`}>
          <Info size={13} />
          <span>{notice}</span>
        </div>
      )}

      {viewMode === 'map' ? (
        <RentalMapView
          center={center}
          radius={filters.radius}
          listings={filtered}
          selectedId={selectedId}
          visible
          onSelect={(l) => setSelectedId(l ? l.id : null)}
          onOpenDetail={(l) => setDetail(l)}
          onOpenAmap={(l) => handleJump(l, 'amap')}
        />
      ) : (
      <div className="rt-list">
        {loading && listings.length === 0 ? (
          <div className="rt-loading">
            <Loader2 size={26} className="spin" />
            <p>
              {llmConfig.apiKey
                ? `正在联网检索「${center.name}」周边租房房源与租金行情...`
                : '正在加载示例房源...'}
            </p>
            {llmConfig.apiKey && (
              <span className="rt-loading-sub">
                <Bot size={12} /> AI 会参考该地段挂牌特征整理户型与租金
              </span>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rt-empty">
            <Home size={34} />
            <p>当前条件下没有匹配房源</p>
            <span>可以放宽租金、缩小筛选范围，或换一个搜索地点</span>
            <button
              type="button"
              className="rt-primary-btn"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  radius: Math.max(prev.radius, 5000),
                  rentRange: 'all',
                  kind: 'all',
                  keyword: '',
                }))
              }
            >
              放宽条件看全部房源
            </button>
          </div>
        ) : (
          filtered.map((item) => (
            <RentalCard
              key={item.id}
              listing={item}
              onOpen={(l) => setDetail(l)}
              onJump={(l, platform, e) => {
                e.stopPropagation();
                handleJump(l, platform);
              }}
            />
          ))
        )}
      </div>
      )}

      <div className="rt-footnote">
        <Sparkles size={12} />
        房源与租金为 AI 联网整理的参考信息，未接入平台挂牌原文，请到安居客 / 58 同城核验后签约
      </div>

      <RentalDetailSheet
        listing={detail}
        city={center.city}
        amapKey={amapKey}
        onClose={() => setDetail(null)}
        onJump={(l, platform) => handleJump(l, platform)}
      />
    </div>
  );
};
