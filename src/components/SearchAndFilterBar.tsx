import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Compass,
  Filter,
  Loader2,
  MapPin,
  Navigation,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { PRESET_LANDMARKS } from '../data/demoHotels';
import { fetchPlaceSuggestions } from '../services/amapService';
import {
  FilterState,
  HotelCategory,
  PlaceSuggestion,
  PriceRange,
  SearchCenter,
  SortMode,
} from '../types/hotel';

interface Props {
  center: SearchCenter;
  amapKey: string;
  filters: FilterState;
  checkIn: string;
  checkOut: string;
  locating: boolean;
  totalFound: number;
  onSelectCenter: (center: SearchCenter) => void;
  onSearchText: (text: string) => void;
  onLocateMe: () => void;
  onChangeFilters: (patch: Partial<FilterState>) => void;
  onResetFilters: () => void;
  onChangeDates: (checkIn: string, checkOut: string) => void;
}

const RADIUS_OPTIONS = [
  { label: '500m', value: 500 },
  { label: '1km', value: 1000 },
  { label: '2km', value: 2000 },
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
];

const CATEGORY_OPTIONS: { label: string; value: HotelCategory }[] = [
  { label: '全部类型', value: 'all' },
  { label: '经济连锁', value: 'economy' },
  { label: '舒适高档', value: 'comfort' },
  { label: '豪华星级', value: 'luxury' },
  { label: '民宿公寓', value: 'homestay' },
];

const PRICE_OPTIONS: { label: string; value: PriceRange }[] = [
  { label: '不限预算', value: 'all' },
  { label: '¥200以下', value: 'under200' },
  { label: '¥200-400', value: '200to400' },
  { label: '¥400-700', value: '400to700' },
  { label: '¥700以上', value: 'over700' },
];

const SORT_OPTIONS: { label: string; value: SortMode }[] = [
  { label: '距离最近', value: 'distance' },
  { label: '低价优先', value: 'price_asc' },
  { label: '高分优先', value: 'rating_desc' },
];

export const SearchAndFilterBar: React.FC<Props> = ({
  center,
  amapKey,
  filters,
  checkIn,
  checkOut,
  locating,
  totalFound,
  onSelectCenter,
  onSearchText,
  onLocateMe,
  onChangeFilters,
  onResetFilters,
  onChangeDates,
}) => {
  const [query, setQuery] = useState(center.name);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingTips, setLoadingTips] = useState(false);
  const [expandFilters, setExpandFilters] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(center.name);
  }, [center.name]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!showDropdown || !trimmed || trimmed === center.name) {
      if (!trimmed) setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoadingTips(true);
      const list = await fetchPlaceSuggestions(trimmed, amapKey);
      setSuggestions(list);
      setLoadingTips(false);
    }, 280);
    return () => clearTimeout(timer);
  }, [query, amapKey, showDropdown, center.name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setShowDropdown(false);
    onSearchText(query.trim());
  };

  const calcNights = () => {
    const d1 = new Date(checkIn).getTime();
    const d2 = new Date(checkOut).getTime();
    const diff = Math.round((d2 - d1) / (1000 * 3600 * 24));
    return diff > 0 ? diff : 1;
  };

  const hasActiveFilter =
    filters.priceRange !== 'all' ||
    filters.category !== 'all' ||
    filters.keyword.trim() !== '';

  return (
    <div className="search-filter-panel" ref={wrapperRef}>
      {/* 主搜索输入栏 + 一键定位 */}
      <form className="search-bar-form" onSubmit={handleSubmit}>
        <div className="search-input-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            value={query}
            onFocus={() => setShowDropdown(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            placeholder="输入想去的地标、地铁站、商圈或地址..."
            aria-label="搜索目标地点"
          />
          {query && (
            <button
              type="button"
              className="clear-input-btn"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setShowDropdown(true);
              }}
              title="清空"
            >
              <X size={15} />
            </button>
          )}
          <button type="submit" className="search-submit-btn">
            搜周边
          </button>
        </div>

        <button
          type="button"
          className="locate-me-btn"
          onClick={onLocateMe}
          disabled={locating}
          title="使用当前手机/电脑定位查找附近酒店"
        >
          {locating ? <Loader2 size={17} className="spin" /> : <Navigation size={17} />}
          <span>{locating ? '定位中' : '当前附近'}</span>
        </button>
      </form>

      {/* 联想词与热门地标下拉层 */}
      {showDropdown && (
        <div className="suggestions-dropdown">
          {loadingTips && (
            <div className="dropdown-hint">
              <Loader2 size={14} className="spin" /> 正在联想地点...
            </div>
          )}

          {!loadingTips && suggestions.length > 0 && (
            <div className="suggestion-list">
              <div className="dropdown-section-title">匹配地点</div>
              {suggestions.map((tip) => (
                <button
                  key={tip.id}
                  type="button"
                  className="suggestion-item"
                  onClick={() => {
                    setShowDropdown(false);
                    setQuery(tip.name);
                    onSelectCenter({
                      name: tip.name,
                      address: tip.address,
                      city: tip.city,
                      lng: tip.lng,
                      lat: tip.lat,
                    });
                  }}
                >
                  <MapPin size={16} className="tip-pin" />
                  <div className="tip-text">
                    <div className="tip-name">{tip.name}</div>
                    <div className="tip-addr">{tip.address || tip.district}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="preset-section">
            <div className="dropdown-section-title">
              <Compass size={13} /> 热门商圈一键体验
            </div>
            <div className="preset-chips">
              {PRESET_LANDMARKS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={`preset-chip ${center.name === item.name ? 'active' : ''}`}
                  onClick={() => {
                    setShowDropdown(false);
                    setQuery(item.name);
                    onSelectCenter(item);
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 入住日期选择 + 半径快选行 */}
      <div className="date-radius-row">
        <div className="stay-date-group">
          <Calendar size={14} className="date-icon" />
          <input
            type="date"
            value={checkIn}
            onChange={(e) => {
              const nextIn = e.target.value;
              if (!nextIn) return;
              if (nextIn >= checkOut) {
                const nextDay = new Date(new Date(nextIn).getTime() + 86400000)
                  .toISOString()
                  .slice(0, 10);
                onChangeDates(nextIn, nextDay);
              } else {
                onChangeDates(nextIn, checkOut);
              }
            }}
            aria-label="入住日期"
          />
          <span className="date-sep">至</span>
          <input
            type="date"
            value={checkOut}
            min={checkIn}
            onChange={(e) => {
              if (e.target.value && e.target.value > checkIn) {
                onChangeDates(checkIn, e.target.value);
              }
            }}
            aria-label="离店日期"
          />
          <span className="nights-badge">{calcNights()}晚</span>
        </div>

        <div className="radius-pills">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`mini-pill ${filters.radius === r.value ? 'active' : ''}`}
              onClick={() => onChangeFilters({ radius: r.value })}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* 排序 + 酒店类型快筛 + 展开更多筛选按钮 */}
      <div className="quick-filter-row">
        <div className="scrollable-chips">
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`filter-chip sort-chip ${filters.sortBy === s.value ? 'active' : ''}`}
              onClick={() => onChangeFilters({ sortBy: s.value })}
            >
              {s.label}
            </button>
          ))}
          <span className="chip-divider" />
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`filter-chip ${filters.category === c.value ? 'active' : ''}`}
              onClick={() => onChangeFilters({ category: c.value })}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`more-filter-toggle ${expandFilters || hasActiveFilter ? 'active' : ''}`}
          onClick={() => setExpandFilters((v) => !v)}
        >
          <SlidersHorizontal size={14} />
          <span>筛选</span>
        </button>
      </div>

      {/* 展开式高级筛选面板（价格区间 + 品牌/关键词二次过滤） */}
      {expandFilters && (
        <div className="advanced-filter-drawer">
          <div className="adv-row">
            <span className="adv-label">价格区间</span>
            <div className="adv-options">
              {PRICE_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`adv-btn ${filters.priceRange === p.value ? 'active' : ''}`}
                  onClick={() => onChangeFilters({ priceRange: p.value })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="adv-row">
            <span className="adv-label">品牌/设施</span>
            <div className="adv-kw-box">
              <Filter size={14} />
              <input
                type="text"
                value={filters.keyword}
                onChange={(e) => onChangeFilters({ keyword: e.target.value })}
                placeholder="在结果中筛品牌或特色，如：全季、亚朵、停车、投影..."
              />
              {filters.keyword && (
                <button
                  type="button"
                  className="clear-kw"
                  onClick={() => onChangeFilters({ keyword: '' })}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="adv-footer">
            <span className="found-summary">当前符合条件共 {totalFound} 家住宿</span>
            <button type="button" className="reset-filter-btn" onClick={onResetFilters}>
              <RotateCcw size={13} /> 重置筛选
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
