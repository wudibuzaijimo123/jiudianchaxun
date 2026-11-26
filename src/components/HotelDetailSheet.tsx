import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  BedDouble,
  Bot,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  ExternalLink,
  Flame,
  Heart,
  Loader2,
  MapPin,
  Navigation2,
  PhoneCall,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { FALLBACK_HOTEL_PHOTOS } from '../data/demoHotels';
import { fetchHotelLiveRoomsDetail } from '../services/amapService';
import {
  directClientDetailAiRooms,
  isNativePackagedApp,
  resolveApiUrl,
} from '../services/standaloneClient';
import { loadServerBaseUrl } from '../utils/storage';
import {
  AiDetailRoomData,
  CnHotelIntelData,
  HotelItem,
  LiveOtaOffer,
  LlmConfig,
} from '../types/hotel';
import { estimateTravelHint, formatDistance } from '../utils/coordTransform';
import {
  buildPlatformLinks,
  copyTextSilently,
  isAppleDevice,
  isMobileDevice,
  launchMeituanPurchase,
  smartLaunchPlatform,
} from '../utils/deepLinks';
import {
  buildAmapStaticMapUrl,
  getPhotoSourceLabel,
  isStaticMapUrl,
  photoSrc,
} from '../utils/rentalImages';

interface Props {
  hotel: HotelItem | null;
  isFavorite: boolean;
  checkIn: string;
  checkOut: string;
  amapKey?: string;
  serpApiKey: string;
  llmConfig: LlmConfig;
  onClose: () => void;
  onToggleFavorite: (hotel: HotelItem, e: React.MouseEvent) => void;
  onOpenSettings: () => void;
  onOpenMeituanBuy: (hotel: HotelItem) => void;
  onToast: (msg: string) => void;
}

export const HotelDetailSheet: React.FC<Props> = ({
  hotel,
  isFavorite,
  checkIn,
  checkOut,
  amapKey = '',
  serpApiKey,
  llmConfig,
  onClose,
  onToggleFavorite,
  onOpenSettings,
  onOpenMeituanBuy,
  onToast,
}) => {
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [copiedField, setCopiedField] = useState<'name' | 'addr' | null>(null);
  const [liveOffers, setLiveOffers] = useState<LiveOtaOffer[]>([]);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(false);

  const [cnIntel, setCnIntel] = useState<CnHotelIntelData | null>(null);
  const [loadingCnIntel, setLoadingCnIntel] = useState<boolean>(false);

  const [aiRoomData, setAiRoomData] = useState<AiDetailRoomData | null>(null);
  const [loadingAiRooms, setLoadingAiRooms] = useState<boolean>(false);
  const [meituanQr, setMeituanQr] = useState<string>('');

  useEffect(() => {
    if (!hotel) return;
    setActivePhotoIdx(0);
    setCnIntel(null);
    setAiRoomData(null);

    if (hotel.otaOffers && hotel.otaOffers.length > 0) {
      setLiveOffers(hotel.otaOffers);
    } else {
      setLiveOffers([]);
    }

    // 生成手机美团 App 扫码直达该酒店购买二维码
    const links = buildPlatformLinks(hotel);
    QRCode.toDataURL(links.meituanApp, {
      width: 110,
      margin: 1,
      color: { dark: '#1c1917', light: '#ffffff' },
    })
      .then(setMeituanQr)
      .catch(() => setMeituanQr(''));

    let cancelled = false;

    const loadAllIntel = async () => {
      let fetchedSnippets: any[] = [];
      const serverBase = loadServerBaseUrl();
      const canCallBackend = !isNativePackagedApp() || Boolean(serverBase);

      if (serpApiKey.trim() && canCallBackend) {
        setLoadingRooms(true);
        setLoadingCnIntel(true);

        fetchHotelLiveRoomsDetail(
          hotel.propertyToken,
          hotel.name,
          hotel.city,
          checkIn,
          checkOut,
          serpApiKey
        ).then((res) => {
          if (!cancelled) {
            if (res.length > 0) setLiveOffers(res);
            setLoadingRooms(false);
          }
        });

        try {
          const r = await fetch(
            resolveApiUrl(
              `/api/cn-hotel-intel?api_key=${encodeURIComponent(
                serpApiKey.trim()
              )}&hotel=${encodeURIComponent(hotel.name)}&city=${encodeURIComponent(
                hotel.city || ''
              )}`,
              serverBase
            )
          );
          const data = await r.json();
          if (!cancelled) {
            setLoadingCnIntel(false);
            if (data && Array.isArray(data.items)) {
              setCnIntel(data);
              fetchedSnippets = data.items;
            }
          }
        } catch {
          if (!cancelled) setLoadingCnIntel(false);
        }
      }

      if (llmConfig.apiKey.trim() && !cancelled) {
        setLoadingAiRooms(true);
        try {
          let aiJson: any = null;
          if (canCallBackend) {
            const aiResp = await fetch(resolveApiUrl('/api/ai-hotel-rooms', serverBase), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                llm: llmConfig,
                serpApiKey: serpApiKey.trim(),
                hotelName: hotel.name,
                city: hotel.city || '',
                address: hotel.address,
                categoryLabel: hotel.categoryLabel,
                checkIn,
                checkOut,
                existingSnippets: fetchedSnippets,
                fallbackPrice: hotel.minPrice,
              }),
            });
            if (aiResp.ok) {
              aiJson = await aiResp.json();
            }
          }
          if (!aiJson || !Array.isArray(aiJson.rooms)) {
            aiJson = await directClientDetailAiRooms(
              llmConfig,
              hotel.name,
              hotel.city || '',
              hotel.address,
              hotel.categoryLabel,
              checkIn,
              checkOut,
              hotel.minPrice
            );
          }
          if (!cancelled && aiJson && Array.isArray(aiJson.rooms)) {
            setAiRoomData(aiJson);
          }
        } catch {
          // ignore
        } finally {
          if (!cancelled) setLoadingAiRooms(false);
        }
      }
    };

    loadAllIntel();

    return () => {
      cancelled = true;
    };
  }, [hotel, checkIn, checkOut, serpApiKey, llmConfig]);

  if (!hotel) return null;

  const basePhotos =
    hotel.photos.length > 0 ? hotel.photos : FALLBACK_HOTEL_PHOTOS[hotel.category];
  const mapPhoto = buildAmapStaticMapUrl({
    lng: hotel.lng,
    lat: hotel.lat,
    amapKey,
    zoom: 16,
  });
  const photos = Array.from(
    new Set<string>([...basePhotos, ...FALLBACK_HOTEL_PHOTOS[hotel.category], ...(mapPhoto ? [mapPhoto] : [])])
  ).slice(0, 7);
  const currentPhoto = photos[activePhotoIdx % photos.length];
  const photoLabel = getPhotoSourceLabel(currentPhoto, 'AI参考图');
  const mobile = isMobileDevice();
  const appleEnv = isAppleDevice();

  const nights = Math.max(
    1,
    Math.round(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 3600 * 24)
    )
  );

  const displayPrice =
    hotel.minPrice ?? aiRoomData?.lowestPrice ?? cnIntel?.minExtractedPrice ?? null;

  const handleCopy = async (text: string, type: 'name' | 'addr') => {
    const ok = await copyTextSilently(text);
    if (ok) {
      setCopiedField(type);
      onToast(`已复制${type === 'name' ? '酒店名称' : '详细地址'}`);
      setTimeout(() => setCopiedField(null), 1800);
    }
  };

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-drag-handle" />

        <div
          className={`detail-hero ${isStaticMapUrl(currentPhoto) ? 'is-map' : ''}`}
          onClick={() => {
            if (isStaticMapUrl(currentPhoto)) {
              void smartLaunchPlatform(hotel, 'amap', onToast, serpApiKey);
            }
          }}
        >
          <img
            src={photoSrc(currentPhoto)}
            alt={hotel.name}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = FALLBACK_HOTEL_PHOTOS[hotel.category][0];
            }}
          />
          <div className="hero-top-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`circle-btn ${isFavorite ? 'fav-active' : ''}`}
              onClick={(e) => onToggleFavorite(hotel, e)}
              title="收藏"
            >
              <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="circle-btn" onClick={onClose} title="关闭">
              <X size={18} />
            </button>
          </div>

          <div className="hero-bottom-badges">
            <span className="hero-cat">{hotel.categoryLabel}</span>
            <span className="hero-cat">{photoLabel}</span>
            {hotel.availability === 'sold_out' ? (
              <span className="hero-src warn">所选日期已满房</span>
            ) : (
              <span className="hero-src ok">● 今日有空房</span>
            )}
          </div>
        </div>

        {photos.length > 1 && (
          <div className="hotel-thumbs-strip">
            {photos.map((p, idx) => (
              <button
                key={`${p}-${idx}`}
                type="button"
                className={`hotel-thumb-btn ${idx === activePhotoIdx % photos.length ? 'active' : ''}`}
                onClick={() => setActivePhotoIdx(idx)}
                aria-label={`查看第 ${idx + 1} 张图`}
              >
                <img src={photoSrc(p)} alt="" referrerPolicy="no-referrer" />
                {isStaticMapUrl(p) && <span className="ht-map-dot">地图</span>}
              </button>
            ))}
          </div>
        )}

        <div className="detail-content">
          <div className="detail-title-group">
            <div className="d-title-row">
              <h2>{hotel.name}</h2>
              <button
                type="button"
                className="copy-inline-btn"
                onClick={() => handleCopy(hotel.name, 'name')}
              >
                {copiedField === 'name' ? <Check size={13} /> : <Copy size={13} />}
                <span>复制店名</span>
              </button>
            </div>

            <div className="d-score-price-row">
              <div className="d-left-badges">
                {hotel.rating ? (
                  <span className="d-rating">
                    <Star size={13} fill="currentColor" /> {hotel.rating.toFixed(1)} 分
                  </span>
                ) : (
                  <span className="d-rating neutral">周边收录</span>
                )}
                <span className="d-dist">
                  <Navigation2 size={12} /> 距搜索点 {formatDistance(hotel.distance)}（
                  {estimateTravelHint(hotel.distance)}）
                </span>
              </div>

              <div className="d-price">
                {displayPrice ? (
                  <>
                    {hotel.priceSource === 'live_ota' ? (
                      <span className="live-price-tag" style={{ marginRight: 6 }}>
                        <Zap size={11} /> 实时库存价
                      </span>
                    ) : hotel.priceSource === 'amap_cost' ? (
                      <span className="real-price-tag" style={{ marginRight: 6 }}>
                        <CheckCircle2 size={11} /> 高德均价
                      </span>
                    ) : (
                      <span className="ai-price-tag" style={{ marginRight: 6 }}>
                        <Bot size={11} /> AI全网搜价
                      </span>
                    )}
                    <small>¥</small>
                    <strong>{displayPrice}</strong>
                    <small>/晚起</small>
                  </>
                ) : (
                  <span className="price-tbd">正在检索价格...</span>
                )}
              </div>
            </div>
          </div>

          {/* ========== 一键购买预订主横幅 ========== */}
          <div className="meituan-buy-banner">
            <div className="mt-buy-left">
              <button
                type="button"
                className="mt-buy-primary-btn"
                onClick={() => {
                  if (mobile) {
                    launchMeituanPurchase(hotel, serpApiKey, onToast);
                  } else {
                    onOpenMeituanBuy(hotel);
                  }
                }}
              >
                <ShoppingBag size={16} />
                <span>{mobile ? '唤醒美团 App 购买' : '立即购买 / 预订该酒店'}</span>
                <ExternalLink size={14} />
              </button>
              <span className="mt-buy-sub">
                {mobile
                  ? '点击直接唤醒手机美团 App 进入该酒店预订下单页'
                  : '电脑支持直达携程/同程在线付款，或手机美团 App 领券下单'}
              </span>
            </div>
          </div>

          <div className="info-box">
            <div className="info-line">
              <MapPin size={16} className="info-icon" />
              <span className="info-text">{hotel.address}</span>
              <button
                type="button"
                className="mini-action"
                onClick={() => handleCopy(hotel.address, 'addr')}
              >
                {copiedField === 'addr' ? '已复制' : '复制'}
              </button>
            </div>

            {hotel.phones.length > 0 ? (
              <div className="info-line">
                <PhoneCall size={16} className="info-icon phone" />
                <span className="info-text">前台电话：{hotel.phones.join(' / ')}</span>
                <a href={`tel:${hotel.phones[0]}`} className="mini-action call">
                  直拨问空房
                </a>
              </div>
            ) : (
              <div className="info-line muted">
                <Building2 size={16} className="info-icon" />
                <span className="info-text">类型：{hotel.rawType.replace(/;/g, ' · ')}</span>
              </div>
            )}
          </div>

          {/* ========== 在线分销平台实时客房库存（若有） ========== */}
          {(loadingRooms || liveOffers.length > 0) && (
            <section className="detail-section">
              <div className="section-head">
                <h3>
                  <BedDouble size={16} /> 在线实时客房库存（实时有房）
                </h3>
                <span className="stay-pill">
                  <Calendar size={12} /> {checkIn.slice(5)} 至 {checkOut.slice(5)}
                </span>
              </div>

              {loadingRooms ? (
                <div className="inline-loading-rooms">
                  <Loader2 size={17} className="spin accent" />
                  <span>正在核查实时客房剩余库存...</span>
                </div>
              ) : (
                <div className="live-offers-container">
                  {liveOffers.map((offer, idx) => (
                    <div key={`${offer.source}-${idx}`} className="live-ota-block">
                      <div className="ota-header-row">
                        <div className="ota-brand">
                          {offer.logo && (
                            <img src={offer.logo} alt={offer.source} className="ota-logo" />
                          )}
                          <strong>{offer.source}</strong>
                          <span className="avail-tag-inline">实时有空房</span>
                        </div>
                        <div className="ota-price-act">
                          <span className="ota-main-price">¥{offer.nightlyPrice}/晚</span>
                          {offer.link && (
                            <a
                              href={offer.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="book-direct-btn"
                            >
                              去预订 <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      </div>

                      {offer.rooms.length > 0 && (
                        <div className="ota-sub-rooms">
                          {offer.rooms.slice(0, 6).map((rm, rIdx) => (
                            <div key={`${rm.name}-${rIdx}`} className="sub-room-row">
                              <div className="sr-left">
                                <span className="sr-name">{rm.name}</span>
                                <span className="avail-tag-inline">有房</span>
                                {rm.numGuests && (
                                  <span className="sr-guests">
                                    <Users size={11} /> 可住{rm.numGuests}人
                                  </span>
                                )}
                              </div>
                              <div className="sr-right">
                                <strong>¥{rm.nightlyPrice}</strong>
                                {rm.link && (
                                  <a
                                    href={rm.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="sr-link"
                                  >
                                    订
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ========== AI 全网检索客房情况与价目表 ========== */}
          <section className="detail-section">
            <div className="section-head">
              <h3>
                <Bot size={16} className="ai-accent-icon" /> AI 全网检索客房情况与价目表
              </h3>
              <span className="stay-pill">共 {nights} 晚</span>
            </div>

            {loadingAiRooms ? (
              <div className="ai-distill-box loading">
                <Loader2 size={16} className="spin" />
                <span>AI 正在联网核查该店大床房/双床房房态、美团抖音团购价...</span>
              </div>
            ) : aiRoomData ? (
              <div className="ai-structured-panel">
                <div className="ai-top-metrics">
                  <span className="ai-metric-chip">
                    💰 价格区间：<strong>{aiRoomData.priceRange}</strong>
                  </span>
                  <span className="ai-metric-chip ok">
                    🟢 客房情况：{aiRoomData.vacancyStatus}
                  </span>
                </div>

                {aiRoomData.douyinGroupBuy && (
                  <div className="ai-douyin-bar">
                    <Sparkles size={13} />
                    <span>{aiRoomData.douyinGroupBuy}</span>
                  </div>
                )}

                <div className="room-hint-list">
                  {aiRoomData.rooms.map((rm, rIdx) => (
                    <div key={`${rm.roomName}-${rIdx}`} className="room-hint-item ai-room-row">
                      <div className="rm-left">
                        <div className="rm-name">
                          {rm.roomName}
                          <span className="avail-tag-inline" style={{ marginLeft: 6 }}>
                            有房
                          </span>
                          {rm.tag && <span className="ai-rm-tag">{rm.tag}</span>}
                        </div>
                        <div className="rm-spec">{rm.spec}</div>
                      </div>
                      <div className="rm-right">
                        <div className="rm-nightly">¥{rm.price}/晚</div>
                        <button
                          type="button"
                          className="mini-mt-buy"
                          onClick={() => {
                            if (mobile) {
                              launchMeituanPurchase(hotel, serpApiKey, onToast);
                            } else {
                              onOpenMeituanBuy(hotel);
                            }
                          }}
                        >
                          立即购
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="ai-pros-cons">
                  <div>👍 <strong>亮点：</strong>{aiRoomData.highlights}</div>
                  <div>⚠️ <strong>注意：</strong>{aiRoomData.pitfalls}</div>
                </div>
              </div>
            ) : !llmConfig.apiKey.trim() ? (
              <div className="enable-live-cta">
                <p>填入 AI API Key 后可自动检索并展示该店全部细分房型与团购底价。</p>
                <button
                  type="button"
                  className="primary-pill-btn"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                >
                  去配置 AI 接口
                </button>
              </div>
            ) : null}
          </section>

          {/* 国内抖音 / 小红书 / 携程公开来源卡片 */}
          {cnIntel && cnIntel.items.length > 0 && (
            <section className="detail-section">
              <div className="section-head">
                <h3>
                  <Flame size={16} className="cn-flame" /> 国内抖音 · 小红书 · 携程收录详情
                </h3>
              </div>
              <div className="cn-snippet-list">
                {cnIntel.items.slice(0, 5).map((item, idx) => (
                  <a
                    key={`${item.link}-${idx}`}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`cn-snippet-card plat-${item.platform}`}
                  >
                    <div className="cn-s-top">
                      <span className={`cn-plat-tag tag-${item.platform}`}>
                        {item.platformLabel}
                      </span>
                      <span className="cn-s-title">{item.title}</span>
                      <ExternalLink size={12} className="cn-ext" />
                    </div>
                    {item.snippet && <p className="cn-s-desc">{item.snippet}</p>}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* 快捷比价与地图导航（Windows 自动采用高德+百度双精准国内导航，iOS/Mac 显示原生 Apple 地图） */}
          <section className="detail-section">
            <div className="section-head">
              <h3>更多购买渠道与精准导航</h3>
            </div>

            <div className="platform-grid">
              <button
                type="button"
                className="plat-card douyin"
                onClick={() => smartLaunchPlatform(hotel, 'douyin', onToast, serpApiKey)}
              >
                <div className="plat-top">
                  <span className="plat-badge">
                    <Sparkles size={13} /> 抖音团购购买
                  </span>
                  <ExternalLink size={14} />
                </div>
                <div className="plat-desc">查看抖音直播间囤房券与探店实拍</div>
              </button>

              <button
                type="button"
                className="plat-card ctrip"
                onClick={() => smartLaunchPlatform(hotel, 'ctrip', onToast, serpApiKey)}
              >
                <div className="plat-top">
                  <span className="plat-badge">携程预订购买</span>
                  <ExternalLink size={14} />
                </div>
                <div className="plat-desc">直达携程查看日历房并在线下单</div>
              </button>

              <div className="nav-dual-cards" style={{ gridColumn: '1 / -1' }}>
                <button
                  type="button"
                  className="nav-btn amap"
                  onClick={() => smartLaunchPlatform(hotel, 'amap', onToast, serpApiKey)}
                >
                  <Navigation2 size={16} />
                  <div>
                    <strong>高德地图导航</strong>
                    <small>国内精准路线规划</small>
                  </div>
                </button>

                {appleEnv ? (
                  <button
                    type="button"
                    className="nav-btn apple"
                    onClick={() => smartLaunchPlatform(hotel, 'apple', onToast, serpApiKey)}
                  >
                    <Compass size={16} />
                    <div>
                      <strong>Apple 地图</strong>
                      <small>iOS/Mac原生打点</small>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="nav-btn baidu"
                    onClick={() => smartLaunchPlatform(hotel, 'baidu', onToast, serpApiKey)}
                  >
                    <Compass size={16} />
                    <div>
                      <strong>百度地图全景/导航</strong>
                      <small>电脑网页端精准可用</small>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
