import React, { useEffect, useState } from 'react';
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
  Sparkles,
  Star,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { FALLBACK_HOTEL_PHOTOS } from '../data/demoHotels';
import { fetchHotelLiveRoomsDetail } from '../services/amapService';
import {
  AiDetailRoomData,
  CnHotelIntelData,
  HotelItem,
  LiveOtaOffer,
  LlmConfig,
} from '../types/hotel';
import { estimateTravelHint, formatDistance } from '../utils/coordTransform';
import {
  copyTextSilently,
  isMobileDevice,
  smartLaunchPlatform,
} from '../utils/deepLinks';

interface Props {
  hotel: HotelItem | null;
  isFavorite: boolean;
  checkIn: string;
  checkOut: string;
  serpApiKey: string;
  llmConfig: LlmConfig;
  onClose: () => void;
  onToggleFavorite: (hotel: HotelItem, e: React.MouseEvent) => void;
  onOpenSettings: () => void;
  onToast: (msg: string) => void;
}

export const HotelDetailSheet: React.FC<Props> = ({
  hotel,
  isFavorite,
  checkIn,
  checkOut,
  serpApiKey,
  llmConfig,
  onClose,
  onToggleFavorite,
  onOpenSettings,
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

    let cancelled = false;

    // 1. 若有 SerpApi Key，拉取实时空房与国内抖音/小红书/携程收录摘要
    const loadAllIntel = async () => {
      let fetchedSnippets: any[] = [];

      if (serpApiKey.trim()) {
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
            `/api/cn-hotel-intel?api_key=${encodeURIComponent(
              serpApiKey.trim()
            )}&hotel=${encodeURIComponent(hotel.name)}&city=${encodeURIComponent(
              hotel.city || ''
            )}`
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

      // 2. 若已配置 AI Key，让 AI 结合全网检索结果生成结构化房型价目表与团购情报打印在界面上
      if (llmConfig.apiKey.trim() && !cancelled) {
        setLoadingAiRooms(true);
        try {
          const aiResp = await fetch('/api/ai-hotel-rooms', {
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
          const aiJson = await aiResp.json();
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

  const photos =
    hotel.photos.length > 0 ? hotel.photos : FALLBACK_HOTEL_PHOTOS[hotel.category];
  const currentPhoto = photos[activePhotoIdx % photos.length];
  const mobile = isMobileDevice();

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

        <div className="detail-hero">
          <img
            src={currentPhoto}
            alt={hotel.name}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = FALLBACK_HOTEL_PHOTOS[hotel.category][0];
            }}
          />
          <div className="hero-top-actions">
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

          {photos.length > 1 && (
            <div className="photo-dots">
              {photos.slice(0, 6).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`p-dot ${idx === activePhotoIdx % photos.length ? 'active' : ''}`}
                  onClick={() => setActivePhotoIdx(idx)}
                />
              ))}
            </div>
          )}

          <div className="hero-bottom-badges">
            <span className="hero-cat">{hotel.categoryLabel}</span>
            {hotel.availability === 'available' && (
              <span className="hero-src ok">● 今日有空房</span>
            )}
            {hotel.availability === 'sold_out' && (
              <span className="hero-src warn">所选日期已满房</span>
            )}
          </div>
        </div>

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
                        <Zap size={11} /> 实时空房底价
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

          {/* ========== 核心板块一：AI 全网检索房型价目表与团购底价（直接打印在界面上） ========== */}
          <section className="detail-section">
            <div className="section-head">
              <h3>
                <Bot size={16} className="ai-accent-icon" /> AI 全网检索房型价目表
              </h3>
              <span className="stay-pill">
                <Calendar size={12} /> {checkIn.slice(5)} 至 {checkOut.slice(5)} · {nights}晚
              </span>
            </div>

            {loadingAiRooms ? (
              <div className="ai-distill-box loading">
                <Loader2 size={16} className="spin" />
                <span>AI 正在联网检索该店大床房/双床房价格、抖音团购价与房态...</span>
              </div>
            ) : aiRoomData ? (
              <div className="ai-structured-panel">
                <div className="ai-top-metrics">
                  <span className="ai-metric-chip">
                    💰 价格区间：<strong>{aiRoomData.priceRange}</strong>
                  </span>
                  <span className="ai-metric-chip ok">
                    🛏️ 房态预判：{aiRoomData.vacancyStatus}
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
                          {rm.tag && <span className="ai-rm-tag">{rm.tag}</span>}
                        </div>
                        <div className="rm-spec">{rm.spec}</div>
                      </div>
                      <div className="rm-right">
                        <div className="rm-nightly">¥{rm.price}/晚</div>
                        {nights > 1 && (
                          <div className="rm-total">
                            {nights}晚合计 ¥{rm.price * nights}
                          </div>
                        )}
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
                <p>点击右上角填入 AI API Key 后，AI 将自动全网检索并在此打印该店各房型详细价目表。</p>
                <button
                  type="button"
                  className="primary-pill-btn"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                >
                  去检查 AI 配置
                </button>
              </div>
            ) : null}
          </section>

          {/* ========== 板块二：国际/携程直连实时可订渠道报价（若有） ========== */}
          {(loadingRooms || liveOffers.length > 0) && (
            <section className="detail-section">
              <div className="section-head">
                <h3>
                  <BedDouble size={16} /> 在线分销平台实时库存直连
                </h3>
              </div>

              {loadingRooms ? (
                <div className="inline-loading-rooms">
                  <Loader2 size={17} className="spin accent" />
                  <span>正在核查携程/Agoda/Booking 在线实时房量...</span>
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
                          <span className="avail-tag-inline">实时有房</span>
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
                          {offer.rooms.slice(0, 5).map((rm, rIdx) => (
                            <div key={`${rm.name}-${rIdx}`} className="sub-room-row">
                              <div className="sr-left">
                                <span className="sr-name">{rm.name}</span>
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

          {/* ========== 板块三：国内抖音 / 小红书 / 携程公开网页来源印证 ========== */}
          {(loadingCnIntel || (cnIntel && cnIntel.items.length > 0)) && (
            <section className="detail-section">
              <div className="section-head">
                <h3>
                  <Flame size={16} className="cn-flame" /> 国内抖音 · 小红书 · 携程公开检索来源
                </h3>
                {cnIntel?.metaFacts && cnIntel.metaFacts.length > 0 && (
                  <div className="cn-meta-pills">
                    {cnIntel.metaFacts.map((f) => (
                      <span key={f} className="cn-meta-pill">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {loadingCnIntel ? (
                <div className="inline-loading-rooms">
                  <Loader2 size={16} className="spin accent" />
                  <span>正在同步国内抖音/小红书来源卡片...</span>
                </div>
              ) : (
                <div className="cn-snippet-list">
                  {cnIntel?.items.slice(0, 5).map((item, idx) => (
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
              )}
            </section>
          )}

          <section className="detail-section">
            <div className="section-head">
              <h3>快捷导航与App直达</h3>
            </div>

            <div className="platform-grid">
              <button
                type="button"
                className="plat-card douyin"
                onClick={() => smartLaunchPlatform(hotel, 'douyin', onToast)}
              >
                <div className="plat-top">
                  <span className="plat-badge">
                    <Sparkles size={13} /> 打开抖音搜团购视频
                  </span>
                  <ExternalLink size={14} />
                </div>
                <div className="plat-desc">直达抖音查看直播团购券与探店实拍</div>
              </button>

              <button
                type="button"
                className="plat-card ctrip"
                onClick={() => smartLaunchPlatform(hotel, 'amap_detail', onToast)}
              >
                <div className="plat-top">
                  <span className="plat-badge">高德门店主页</span>
                  <ExternalLink size={14} />
                </div>
                <div className="plat-desc">查看高德国内渠道聚合评论</div>
              </button>

              {mobile && (
                <button
                  type="button"
                  className="plat-card meituan"
                  onClick={() => smartLaunchPlatform(hotel, 'meituan', onToast)}
                >
                  <div className="plat-top">
                    <span className="plat-badge">唤起美团 App</span>
                    <ExternalLink size={14} />
                  </div>
                  <div className="plat-desc">直接唤起手机美团 App 看闪住特惠</div>
                </button>
              )}

              <div className="nav-dual-cards">
                <button
                  type="button"
                  className="nav-btn apple"
                  onClick={() => smartLaunchPlatform(hotel, 'apple', onToast)}
                >
                  <Compass size={15} />
                  <div>
                    <strong>Apple 地图</strong>
                    <small>iOS原生打点</small>
                  </div>
                </button>
                <button
                  type="button"
                  className="nav-btn amap"
                  onClick={() => smartLaunchPlatform(hotel, 'amap', onToast)}
                >
                  <Navigation2 size={15} />
                  <div>
                    <strong>高德导航</strong>
                    <small>步行/打车路线</small>
                  </div>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
