import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BedDouble,
  Bot,
  Briefcase,
  Clock,
  Compass,
  Heart,
  Home,
  Info,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  Settings,
  Smartphone,
  Trash2,
  Zap,
} from 'lucide-react';
import { HotelCard } from './components/HotelCard';
import { HotelDetailSheet } from './components/HotelDetailSheet';
import { HotelMapView } from './components/HotelMapView';
import { JobPanel } from './components/JobPanel';
import { MeituanBuyModal } from './components/MeituanBuyModal';
import { RentalPanel } from './components/RentalPanel';
import { SearchAndFilterBar } from './components/SearchAndFilterBar';
import { SettingsAndGuideModal } from './components/SettingsAndGuideModal';
import {
  resolvePlaceCenter,
  reverseGeocodeGcj02,
  searchNearbyHotels,
} from './services/amapService';
import {
  directClientBatchAiPrices,
  isNativePackagedApp,
  resolveApiUrl,
} from './services/standaloneClient';
import {
  DataSourceMode,
  FilterState,
  HotelItem,
  LlmConfig,
  SearchCenter,
  SearchHistoryItem,
} from './types/hotel';
import { wgs84ToGcj02 } from './utils/coordTransform';
import { openExternalUrl } from './utils/nativeBridge';
import {
  buildExactStoreQuery,
  buildPlatformLinks,
  isMobileDevice,
  smartLaunchPlatform,
} from './utils/deepLinks';
import {
  addSearchHistory,
  clearSearchHistory,
  loadAmapKey,
  loadFavorites,
  loadLastCenter,
  loadLlmConfig,
  loadSearchHistory,
  loadSerpApiKey,
  loadServerBaseUrl,
  saveAmapKey,
  saveFavorites,
  saveLastCenter,
  saveLlmConfig,
  saveSerpApiKey,
  saveServerBaseUrl,
} from './utils/storage';
import './App.css';

type ActiveTab = 'explore' | 'favorites' | 'history';
type MobileViewMode = 'list' | 'map';
/** 住宿（酒店宾馆）与 租房（房源）两种结果形态 */
type AppMode = 'stay' | 'rent' | 'job';

function getTodayAndTomorrow(): [string, string] {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return [fmt(now), fmt(tomorrow)];
}

export const App: React.FC = () => {
  const [defaultIn, defaultOut] = useMemo(() => getTodayAndTomorrow(), []);

  const [amapKey, setAmapKey] = useState<string>(() => loadAmapKey());
  const [serpApiKey, setSerpApiKey] = useState<string>(() => loadSerpApiKey());
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(() => loadLlmConfig());
  const [serverBaseUrl, setServerBaseUrl] = useState<string>(() => loadServerBaseUrl());
  const [center, setCenter] = useState<SearchCenter>(() => loadLastCenter());
  const [checkIn, setCheckIn] = useState<string>(defaultIn);
  const [checkOut, setCheckOut] = useState<string>(defaultOut);

  const [filters, setFilters] = useState<FilterState>({
    radius: 2000,
    priceRange: 'all',
    category: 'all',
    sortBy: 'distance',
    keyword: '',
    onlyWithPrice: false,
  });

  const [rawHotels, setRawHotels] = useState<HotelItem[]>([]);
  const [dataMode, setDataMode] = useState<DataSourceMode>('demo');
  const [noticeText, setNoticeText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [aiPricingLoading, setAiPricingLoading] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('explore');
  // 支持 ?mode=rent / ?mode=job 直达对应模式（扫码或分享链接时有用）
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const m = new URLSearchParams(window.location.search).get('mode');
    return m === 'rent' || m === 'job' ? m : 'stay';
  });
  const [mobileView, setMobileView] = useState<MobileViewMode>('list');
  const [selectedHotel, setSelectedHotel] = useState<HotelItem | null>(null);
  const [detailHotel, setDetailHotel] = useState<HotelItem | null>(null);
  const [buyModalHotel, setBuyModalHotel] = useState<HotelItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const [favorites, setFavorites] = useState<HotelItem[]>(() => loadFavorites());
  const [historyList, setHistoryList] = useState<SearchHistoryItem[]>(() =>
    loadSearchHistory()
  );

  const [toastMsg, setToastMsg] = useState<string>('');

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 2800);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // 1. 手机扫码 ?buyId=xxx 精准锁定同一物理门店唤醒美团App；2. 手机局域网首次打开自动从电脑同步全部 Key
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const buyId = searchParams.get('buyId');
    const gomt = searchParams.get('gomt');

    if (buyId) {
      window.history.replaceState(null, '', window.location.pathname);
      fetch(`/api/hotel-target?id=${encodeURIComponent(buyId)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.hotel) {
            const h: HotelItem = d.hotel;
            setDetailHotel(h);
            const links = buildPlatformLinks(h);
            showToast(`已锁定同店：${buildExactStoreQuery(h)}`);
            void openExternalUrl(links.meituanApp);
          }
        })
        .catch(() => {});
    } else if (gomt) {
      window.history.replaceState(null, '', window.location.pathname);
      void openExternalUrl(`imeituan://www.meituan.com/search?q=${encodeURIComponent(gomt)}`);
    }

    if (window.location.hostname !== 'localhost' && !loadAmapKey()) {
      fetch('/api/sync-config')
        .then((r) => r.json())
        .then((cfg) => {
          if (cfg?.amapKey) {
            saveAmapKey(cfg.amapKey);
            setAmapKey(cfg.amapKey);
          }
          if (cfg?.serpApiKey) {
            saveSerpApiKey(cfg.serpApiKey);
            setSerpApiKey(cfg.serpApiKey);
          }
          if (cfg?.llmConfig?.apiKey) {
            saveLlmConfig(cfg.llmConfig);
            setLlmConfig(cfg.llmConfig);
          }
          if (cfg?.center?.lng && cfg?.center?.lat) {
            setCenter(cfg.center);
            saveLastCenter(cfg.center);
          }
        })
        .catch(() => {});
    } else if (window.location.hostname === 'localhost') {
      // 电脑端启动时将本机已存配置同步进内存供手机随时扫码拉取
      fetch('/api/sync-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amapKey: loadAmapKey(),
          serpApiKey: loadSerpApiKey(),
          llmConfig: loadLlmConfig(),
          center: loadLastCenter(),
        }),
      }).catch(() => {});
    }
  }, []);

  // AI 并发分批全网检索周边酒店客房与房价情况（每批 5 家并发请求，3~5 秒极速刷上屏幕且绝不截断！）
  const triggerAiBatchPriceFill = useCallback(
    async (
      hotelsToCheck: HotelItem[],
      targetCenter: SearchCenter,
      currentLlm: LlmConfig,
      sKey: string,
      inDate: string,
      outDate: string,
      forceAll = false
    ) => {
      if (!currentLlm.apiKey.trim()) return;
      const missing = forceAll
        ? hotelsToCheck.slice(0, 18)
        : hotelsToCheck.filter((h) => h.minPrice === null).slice(0, 18);

      if (missing.length === 0) return;

      const knownPrices = hotelsToCheck
        .filter((h) => h.minPrice !== null)
        .map((h) => ({ name: h.name, price: h.minPrice }));

      // 拆分为每组 6 家的并发小批次，大幅缩短等待时间并避免 JSON 超长截断
      const chunks: HotelItem[][] = [];
      for (let i = 0; i < missing.length; i += 6) {
        chunks.push(missing.slice(i, i + 6));
      }

      setAiPricingLoading(true);
      let firstError = '';

      try {
        await Promise.all(
          chunks.map(async (chunk) => {
            try {
              const serverBase = loadServerBaseUrl();
              let resultsArr: any[] = [];

              // 若在独立 iOS IPA 内且未连接外部后端，直接在手机端侧调用大模型接口；否则走后端代理搜全网实证
              if (isNativePackagedApp() && !serverBase) {
                resultsArr = await directClientBatchAiPrices(
                  currentLlm,
                  targetCenter.city,
                  targetCenter.name,
                  inDate,
                  outDate,
                  chunk.map((m) => ({
                    id: m.id,
                    name: m.name,
                    address: m.address,
                    categoryLabel: m.categoryLabel,
                  })),
                  knownPrices
                );
              } else {
                const resp = await fetch(resolveApiUrl('/api/ai-batch-prices', serverBase), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    llm: currentLlm,
                    serpApiKey: sKey,
                    city: targetCenter.city,
                    centerName: targetCenter.name,
                    checkIn: inDate,
                    checkOut: outDate,
                    hotels: chunk.map((m) => ({
                      id: m.id,
                      name: m.name,
                      address: m.address,
                      categoryLabel: m.categoryLabel,
                      distance: m.distance,
                    })),
                    knownPrices,
                  }),
                });
                const data = await resp.json();
                if (!resp.ok || data?.error) {
                  // 后端不可达时自动降级到纯端侧直连大模型
                  resultsArr = await directClientBatchAiPrices(
                    currentLlm,
                    targetCenter.city,
                    targetCenter.name,
                    inDate,
                    outDate,
                    chunk.map((m) => ({
                      id: m.id,
                      name: m.name,
                      address: m.address,
                      categoryLabel: m.categoryLabel,
                    })),
                    knownPrices
                  );
                } else if (Array.isArray(data?.results)) {
                  resultsArr = data.results;
                }
              }

              if (resultsArr.length > 0) {
                const priceMap = new Map<string, any>();
                resultsArr.forEach((r: any) => {
                  if (r && r.id && Number.isFinite(Number(r.minPrice)) && Number(r.minPrice) > 0) {
                    priceMap.set(String(r.id), r);
                  }
                });

                if (priceMap.size > 0) {
                  // 每完成一个小批次立即流式刷新对应卡片与地图气泡！
                  setRawHotels((prev) =>
                    prev.map((item) => {
                      const hit = priceMap.get(item.id);
                      if (!hit) return item;
                      if (!forceAll && item.minPrice !== null) return item;

                      const aiRooms = Array.isArray(hit.rooms)
                        ? hit.rooms
                            .filter((rm: any) => rm?.name && Number(rm?.price) > 0)
                            .map((rm: any) => ({
                              name: String(rm.name),
                              spec: rm.spec ? String(rm.spec) : undefined,
                              status: String(rm.status || '有空房'),
                              leftText: rm.leftText ? String(rm.leftText) : undefined,
                              price: Math.round(Number(rm.price)),
                              isLive: false,
                            }))
                        : undefined;

                      return {
                        ...item,
                        minPrice: Math.round(Number(hit.minPrice)),
                        priceSource: 'ai_search',
                        availability:
                          item.availability === 'unknown' ? 'available' : item.availability,
                        vacancySummary: hit.vacancyHint ? String(hit.vacancyHint) : undefined,
                        aiPriceRange: hit.priceRange ? String(hit.priceRange) : undefined,
                        aiRoomBrief: hit.roomBrief ? String(hit.roomBrief) : undefined,
                        aiBasis: hit.basis ? String(hit.basis) : 'AI全网搜价',
                        cardRooms: aiRooms && aiRooms.length > 0 ? aiRooms : item.cardRooms,
                      };
                    })
                  );
                }
              }
            } catch (err: any) {
              if (!firstError) firstError = err?.message || 'AI 请求网络异常';
            }
          })
        );

        if (firstError) {
          showToast(`AI 搜价提示：${firstError}`);
        }
      } finally {
        setAiPricingLoading(false);
      }
    },
    [showToast]
  );

  // 执行周边酒店 + 实时空房房价 + AI 自动补齐房价查询
  const runNearbySearch = useCallback(
    async (
      targetCenter: SearchCenter,
      radius: number,
      aKey: string,
      sKey: string,
      currentLlm: LlmConfig,
      inDate: string,
      outDate: string
    ) => {
      setLoading(true);
      const res = await searchNearbyHotels(
        targetCenter,
        radius,
        aKey,
        sKey,
        inDate,
        outDate
      );
      setRawHotels(res.hotels);
      setDataMode(res.mode);
      setNoticeText(res.notice || '');
      setLoading(false);

      // 若已配置 AI，自动为尚未返回价格的周边门店联网搜价并直接打印到卡片和地图气泡上
      if (currentLlm.apiKey.trim() && res.hotels.some((h) => h.minPrice === null)) {
        triggerAiBatchPriceFill(
          res.hotels,
          targetCenter,
          currentLlm,
          sKey,
          inDate,
          outDate,
          false
        );
      }
    },
    [triggerAiBatchPriceFill]
  );

  useEffect(() => {
    runNearbySearch(
      center,
      filters.radius,
      amapKey,
      serpApiKey,
      llmConfig,
      checkIn,
      checkOut
    );
  }, [
    center,
    filters.radius,
    amapKey,
    serpApiKey,
    llmConfig,
    checkIn,
    checkOut,
    runNearbySearch,
  ]);

  const handleSelectCenter = useCallback((nextCenter: SearchCenter) => {
    setCenter(nextCenter);
    saveLastCenter(nextCenter);
    setHistoryList(addSearchHistory(nextCenter));
    setSelectedHotel(null);
    setActiveTab('explore');
  }, []);

  const handleSearchText = async (text: string) => {
    setLoading(true);
    const resolved = await resolvePlaceCenter(text, amapKey);
    if (resolved) {
      handleSelectCenter(resolved);
      showToast(`已定位至「${resolved.name}」周边`);
    } else {
      setLoading(false);
      showToast('未能解析该地点，请输入更具体的城市+地标名称');
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      showToast('当前浏览器不支持地理定位，请直接输入地点名称');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const [gcjLng, gcjLat] = wgs84ToGcj02(
          pos.coords.longitude,
          pos.coords.latitude
        );
        const currentPlace = await reverseGeocodeGcj02(gcjLng, gcjLat, amapKey);
        setLocating(false);
        handleSelectCenter(currentPlace);
        showToast(`已定位到：${currentPlace.name}`);
      },
      () => {
        setLocating(false);
        showToast('自动定位受限，请直接在搜索框输入所在路名或地标');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  const handleSearchMapCenter = async (gcjLng: number, gcjLat: number) => {
    const place = await reverseGeocodeGcj02(gcjLng, gcjLat, amapKey);
    handleSelectCenter(place);
    showToast(`正在搜索「${place.name}」周边住宿`);
  };

  const favoriteIds = useMemo(
    () => new Set(favorites.map((h) => h.id)),
    [favorites]
  );

  const handleToggleFavorite = useCallback(
    (hotel: HotelItem, e: React.MouseEvent) => {
      e.stopPropagation();
      setFavorites((prev) => {
        const exists = prev.some((item) => item.id === hotel.id);
        const next = exists
          ? prev.filter((item) => item.id !== hotel.id)
          : [hotel, ...prev];
        saveFavorites(next);
        showToast(exists ? '已移出收藏夹' : `已收藏「${hotel.name}」`);
        return next;
      });
    },
    [showToast]
  );

  const filteredHotels = useMemo(() => {
    const kw = filters.keyword.trim().toLowerCase();
    const list = rawHotels.filter((h) => {
      if (filters.onlyWithPrice && h.minPrice === null) {
        return false;
      }
      if (filters.category !== 'all' && h.category !== filters.category) {
        return false;
      }
      if (filters.priceRange !== 'all') {
        const p = h.minPrice ?? 0;
        if (p <= 0) return false;
        if (filters.priceRange === 'under200' && p >= 200) return false;
        if (filters.priceRange === '200to400' && (p < 200 || p > 400)) return false;
        if (filters.priceRange === '400to700' && (p < 400 || p > 700)) return false;
        if (filters.priceRange === 'over700' && p < 700) return false;
      }
      if (kw) {
        const hay = `${h.name} ${h.address} ${h.categoryLabel} ${h.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    const sorted = [...list];
    if (filters.sortBy === 'distance') {
      sorted.sort((a, b) => a.distance - b.distance);
    } else if (filters.sortBy === 'price_asc') {
      sorted.sort((a, b) => (a.minPrice ?? 99999) - (b.minPrice ?? 99999));
    } else if (filters.sortBy === 'rating_desc') {
      sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    return sorted;
  }, [rawHotels, filters]);

  return (
    <div className="app-shell">
      <header className="top-navbar">
        <div className="brand-area">
          <img
            src="./apple-touch-icon.png"
            alt="查询工具"
            width={34}
            height={34}
            className="brand-logo-img"
          />
          <div>
            <h1>查询工具</h1>
            <p className="brand-sub">酒店 · 租房 · 招聘，周边一图查</p>
          </div>
        </div>

        <div className="header-right-btns">
          <button
            type="button"
            className={`source-status-pill mode-${
              dataMode === 'amap_live' ? 'amap' : amapKey || serpApiKey ? 'amap' : 'demo'
            }`}
            onClick={() => setSettingsOpen(true)}
          >
            <Zap size={13} />
            <span>
              {amapKey && llmConfig.apiKey
                ? '双核已就绪'
                : amapKey
                ? '高德已连接'
                : '配置接口Key'}
            </span>
          </button>

          {!isNativePackagedApp() && (
            <button
              type="button"
              className="install-app-btn"
              onClick={() => setSettingsOpen(true)}
              title="手机扫码同步使用"
            >
              <Smartphone size={14} />
              <span className="hide-xs">手机扫码用</span>
            </button>
          )}
        </div>
      </header>

      {activeTab === 'explore' && (
        <main
          className={`explore-workspace ${appMode === 'rent' ? 'rent-mode' : ''} ${
            appMode === 'job' ? 'job-mode' : ''
          }`}
        >
          <section
            className={`left-column ${
              appMode === 'rent' || appMode === 'job'
                ? ''
                : mobileView === 'map'
                ? 'hide-on-mobile'
                : ''
            }`}
          >
            <div className="app-mode-switch">
              <button
                type="button"
                className={`ams-btn ${appMode === 'stay' ? 'active' : ''}`}
                onClick={() => setAppMode('stay')}
              >
                <BedDouble size={14} /> 住酒店
              </button>
              <button
                type="button"
                className={`ams-btn ${appMode === 'rent' ? 'active' : ''}`}
                onClick={() => setAppMode('rent')}
              >
                <Home size={14} /> 租房源
              </button>
              <button
                type="button"
                className={`ams-btn ${appMode === 'job' ? 'active' : ''}`}
                onClick={() => setAppMode('job')}
              >
                <Briefcase size={14} /> 找工作
              </button>
            </div>

            {appMode === 'job' ? (
              <JobPanel
                center={center}
                amapKey={amapKey}
                llmConfig={llmConfig}
                serpApiKey={serpApiKey}
                serverBaseUrl={serverBaseUrl}
                locating={locating}
                onSelectCenter={handleSelectCenter}
                onLocateMe={handleLocateMe}
                onToast={showToast}
              />
            ) : appMode === 'rent' ? (
              <RentalPanel
                center={center}
                amapKey={amapKey}
                llmConfig={llmConfig}
                serpApiKey={serpApiKey}
                serverBaseUrl={serverBaseUrl}
                locating={locating}
                onSelectCenter={handleSelectCenter}
                onLocateMe={handleLocateMe}
                onToast={showToast}
              />
            ) : (
              <>
                <SearchAndFilterBar
              center={center}
              amapKey={amapKey}
              filters={filters}
              checkIn={checkIn}
              checkOut={checkOut}
              locating={locating}
              totalFound={filteredHotels.length}
              onSelectCenter={handleSelectCenter}
              onSearchText={handleSearchText}
              onLocateMe={handleLocateMe}
              onChangeFilters={(patch) =>
                setFilters((prev) => ({ ...prev, ...patch }))
              }
              onResetFilters={() =>
                setFilters((prev) => ({
                  ...prev,
                  priceRange: 'all',
                  category: 'all',
                  sortBy: 'distance',
                  keyword: '',
                  onlyWithPrice: false,
                }))
              }
              onChangeDates={(inD, outD) => {
                setCheckIn(inD);
                setCheckOut(outD);
              }}
            />

            {noticeText && (
              <div className="data-notice-bar" onClick={() => setSettingsOpen(true)}>
                <Info size={14} className="notice-icon" />
                <span>{noticeText}</span>
              </div>
            )}

            <div className="result-summary-bar row-between-summary">
              <div className="target-summary">
                <MapPin size={14} className="pin-accent" />
                <span>
                  <strong>{center.name}</strong>{' '}
                  {filters.radius >= 1000
                    ? `${filters.radius / 1000}km`
                    : `${filters.radius}m`}{' '}
                  内共 <strong>{filteredHotels.length}</strong> 家
                </span>
              </div>

              <div className="summary-right-tools">
                {aiPricingLoading ? (
                  <span className="ai-running-pill">
                    <Loader2 size={12} className="spin" /> AI 正在全网搜价写入界面...
                  </span>
                ) : llmConfig.apiKey.trim() ? (
                  <button
                    type="button"
                    className="ai-trigger-btn"
                    onClick={() =>
                      triggerAiBatchPriceFill(
                        rawHotels,
                        center,
                        llmConfig,
                        serpApiKey,
                        checkIn,
                        checkOut,
                        true
                      )
                    }
                    title="让 AI 重新联网检索并刷新列表房价"
                  >
                    <Bot size={13} /> AI 刷新全表房价
                  </button>
                ) : null}

                <label className="only-priced-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(filters.onlyWithPrice)}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        onlyWithPrice: e.target.checked,
                      }))
                    }
                  />
                  <span>只看有报价</span>
                </label>
              </div>
            </div>

            <div className="hotel-list-scroll">
              {loading ? (
                <div className="loading-state">
                  <Loader2 size={28} className="spin accent" />
                  <p>正在拉取「{center.name}」周边酒店、空房状态与房价...</p>
                </div>
              ) : filteredHotels.length === 0 ? (
                <div className="empty-state">
                  <p>当前筛选条件下未找到匹配酒店</p>
                  <button
                    type="button"
                    className="primary-pill-btn"
                    onClick={() =>
                      setFilters({
                        radius: Math.max(filters.radius, 3000),
                        priceRange: 'all',
                        category: 'all',
                        sortBy: 'distance',
                        keyword: '',
                        onlyWithPrice: false,
                      })
                    }
                  >
                    扩大半径至 3km 并显示全部酒店
                  </button>
                </div>
              ) : (
                filteredHotels.map((hotel) => (
                  <HotelCard
                    key={hotel.id}
                    hotel={hotel}
                    isFavorite={favoriteIds.has(hotel.id)}
                    isSelected={selectedHotel?.id === hotel.id}
                    checkIn={checkIn}
                    aiLoading={aiPricingLoading}
                    onSelect={(h) => {
                      setSelectedHotel(h);
                      setDetailHotel(h);
                    }}
                    onToggleFavorite={handleToggleFavorite}
                    onQuickPlatformJump={(h, plat, e) => {
                      e.stopPropagation();
                      if (plat === 'meituan' && !isMobileDevice()) {
                        setBuyModalHotel(h);
                      } else {
                        smartLaunchPlatform(h, plat, showToast, serpApiKey);
                      }
                    }}
                  />
                ))
              )}
            </div>
              </>
            )}
          </section>

          {appMode === 'stay' && (
            <>
          <section className={`right-map-column ${mobileView === 'list' ? 'hide-on-mobile' : ''}`}>
            {mobileView === 'map' && (
              <div className="mobile-map-top-overlay">
                <SearchAndFilterBar
                  center={center}
                  amapKey={amapKey}
                  filters={filters}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  locating={locating}
                  totalFound={filteredHotels.length}
                  onSelectCenter={handleSelectCenter}
                  onSearchText={handleSearchText}
                  onLocateMe={handleLocateMe}
                  onChangeFilters={(patch) =>
                    setFilters((prev) => ({ ...prev, ...patch }))
                  }
                  onResetFilters={() =>
                    setFilters((prev) => ({
                      ...prev,
                      priceRange: 'all',
                      category: 'all',
                      sortBy: 'distance',
                      keyword: '',
                      onlyWithPrice: false,
                    }))
                  }
                  onChangeDates={(inD, outD) => {
                    setCheckIn(inD);
                    setCheckOut(outD);
                  }}
                />
              </div>
            )}

            <HotelMapView
              center={center}
              radius={filters.radius}
              hotels={filteredHotels}
              selectedHotel={selectedHotel}
              favoriteIds={favoriteIds}
              visible={mobileView === 'map' || window.innerWidth >= 1024}
              onSelectHotel={(h) => setSelectedHotel(h)}
              onOpenDetail={(h) => setDetailHotel(h)}
              onToggleFavorite={handleToggleFavorite}
              onSearchMapCenter={handleSearchMapCenter}
            />
          </section>

          <button
            type="button"
            className="mobile-view-fab"
            onClick={() =>
              setMobileView((v) => (v === 'list' ? 'map' : 'list'))
            }
          >
            {mobileView === 'list' ? (
              <>
                <MapIcon size={16} />
                <span>地图打点 ({filteredHotels.length})</span>
              </>
            ) : (
              <>
                <List size={16} />
                <span>返回列表</span>
              </>
            )}
          </button>
            </>
          )}
        </main>
      )}

      {activeTab === 'favorites' && (
        <main className="secondary-page">
          <div className="sec-page-header">
            <h2>我的收藏酒店 ({favorites.length})</h2>
            <p>保存在本机，随时查看实时房态与导航</p>
          </div>

          {favorites.length === 0 ? (
            <div className="empty-state">
              <Heart size={36} className="muted-icon" />
              <p>还没有收藏过酒店，在列表点击爱心即可收藏备选</p>
              <button
                type="button"
                className="primary-pill-btn"
                onClick={() => setActiveTab('explore')}
              >
                去搜索周边酒店
              </button>
            </div>
          ) : (
            <div className="fav-grid">
              {favorites.map((hotel) => (
                <HotelCard
                  key={hotel.id}
                  hotel={hotel}
                  isFavorite={true}
                  isSelected={false}
                  onSelect={(h) => setDetailHotel(h)}
                  onToggleFavorite={handleToggleFavorite}
                  onQuickPlatformJump={(h, plat, e) => {
                    e.stopPropagation();
                    smartLaunchPlatform(h, plat, showToast, serpApiKey);
                  }}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {activeTab === 'history' && (
        <main className="secondary-page">
          <div className="sec-page-header row-between">
            <div>
              <h2>历史搜索地点</h2>
              <p>点击任意历史记录可立即重新扫描该地点周边住宿</p>
            </div>
            {historyList.length > 0 && (
              <button
                type="button"
                className="danger-outline-btn"
                onClick={() => {
                  clearSearchHistory();
                  setHistoryList([]);
                  showToast('已清空搜索历史');
                }}
              >
                <Trash2 size={14} /> 清空
              </button>
            )}
          </div>

          {historyList.length === 0 ? (
            <div className="empty-state">
              <Clock size={36} className="muted-icon" />
              <p>暂无历史搜索记录</p>
            </div>
          ) : (
            <div className="history-list-box">
              {historyList.map((item) => (
                <button
                  key={`${item.name}-${item.timestamp}`}
                  type="button"
                  className="history-card"
                  onClick={() => {
                    handleSelectCenter({
                      name: item.name,
                      city: item.city,
                      address: item.address,
                      lng: item.lng,
                      lat: item.lat,
                    });
                  }}
                >
                  <div className="h-left">
                    <MapPin size={18} className="pin-accent" />
                    <div>
                      <div className="h-name">{item.name}</div>
                      <div className="h-addr">
                        {item.city} · {item.address || `${item.lng.toFixed(4)}, ${item.lat.toFixed(4)}`}
                      </div>
                    </div>
                  </div>
                  <span className="h-go">搜周边 →</span>
                </button>
              ))}
            </div>
          )}
        </main>
      )}

      <nav className="bottom-tabbar">
        <button
          type="button"
          className={`tab-item ${activeTab === 'explore' ? 'active' : ''}`}
          onClick={() => setActiveTab('explore')}
        >
          <Compass size={20} />
          <span>周边找房</span>
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          <div className="tab-icon-wrap">
            <Heart size={20} />
            {favorites.length > 0 && (
              <span className="tab-badge">{favorites.length}</span>
            )}
          </div>
          <span>收藏备选</span>
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Clock size={20} />
          <span>历史足迹</span>
        </button>

        <button
          type="button"
          className="tab-item"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={20} />
          <span>接口/扫码</span>
        </button>
      </nav>

      <HotelDetailSheet
        hotel={detailHotel}
        isFavorite={detailHotel ? favoriteIds.has(detailHotel.id) : false}
        checkIn={checkIn}
        checkOut={checkOut}
        amapKey={amapKey}
        serpApiKey={serpApiKey}
        llmConfig={llmConfig}
        onClose={() => setDetailHotel(null)}
        onToggleFavorite={handleToggleFavorite}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenMeituanBuy={(h) => setBuyModalHotel(h)}
        onToast={showToast}
      />

      <MeituanBuyModal
        hotel={buyModalHotel}
        onClose={() => setBuyModalHotel(null)}
      />

      <SettingsAndGuideModal
        open={settingsOpen}
        amapKey={amapKey}
        serpApiKey={serpApiKey}
        llmConfig={llmConfig}
        serverBaseUrl={serverBaseUrl}
        currentMode={dataMode}
        center={center}
        onSaveAll={(nextAmap, nextSerp, nextLlm, nextServerUrl) => {
          saveAmapKey(nextAmap);
          saveSerpApiKey(nextSerp);
          saveLlmConfig(nextLlm);
          saveServerBaseUrl(nextServerUrl);
          setAmapKey(nextAmap);
          setSerpApiKey(nextSerp);
          setLlmConfig(nextLlm);
          setServerBaseUrl(nextServerUrl);
          showToast('配置已保存，正在同步周边房态与情报...');
        }}
        onClose={() => setSettingsOpen(false)}
      />

      {toastMsg && <div className="global-toast">{toastMsg}</div>}
    </div>
  );
};

export default App;
