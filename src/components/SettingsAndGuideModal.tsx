import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Bot,
  CheckCircle2,
  QrCode,
  ShieldCheck,
  Zap,
  X,
} from 'lucide-react';
import { DataSourceMode, LlmConfig, SearchCenter } from '../types/hotel';

interface Props {
  open: boolean;
  amapKey: string;
  serpApiKey: string;
  llmConfig: LlmConfig;
  currentMode: DataSourceMode;
  center: SearchCenter;
  onSaveAll: (amapKey: string, serpApiKey: string, llmConfig: LlmConfig) => void;
  onClose: () => void;
}

export const SettingsAndGuideModal: React.FC<Props> = ({
  open,
  amapKey,
  serpApiKey,
  llmConfig,
  currentMode,
  center,
  onSaveAll,
  onClose,
}) => {
  const [inputAmap, setInputAmap] = useState(amapKey);
  const [inputSerp, setInputSerp] = useState(serpApiKey);
  const [llmKey, setLlmKey] = useState(llmConfig.apiKey);
  const [llmBase, setLlmBase] = useState(llmConfig.baseUrl);
  const [llmModel, setLlmModel] = useState(llmConfig.model);

  const [lanIps, setLanIps] = useState<string[]>([]);
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [port, setPort] = useState<number>(5173);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    setInputAmap(amapKey);
    setInputSerp(serpApiKey);
    setLlmKey(llmConfig.apiKey);
    setLlmBase(llmConfig.baseUrl || 'https://api.deepseek.com/v1');
    setLlmModel(llmConfig.model || 'deepseek-chat');
  }, [amapKey, serpApiKey, llmConfig, open]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/lan-info')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.ips) && data.ips.length > 0) {
          setLanIps(data.ips);
          setSelectedIp(data.ips[0]);
        }
        if (data.port) setPort(data.port);
      })
      .catch(() => {
        if (window.location.hostname !== 'localhost') {
          setLanIps([window.location.hostname]);
          setSelectedIp(window.location.hostname);
        }
      });
  }, [open]);

  useEffect(() => {
    if (!open || !selectedIp) {
      setQrDataUrl('');
      return;
    }
    const params = new URLSearchParams();
    if (inputAmap.trim()) params.set('syncKey', inputAmap.trim());
    if (inputSerp.trim()) params.set('syncSerp', inputSerp.trim());
    params.set('name', center.name);
    params.set('city', center.city || '');
    params.set('lng', String(center.lng));
    params.set('lat', String(center.lat));

    const mobileUrl = `http://${selectedIp}:${port}/#${params.toString()}`;
    QRCode.toDataURL(mobileUrl, {
      width: 170,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [open, selectedIp, port, inputAmap, inputSerp, center]);

  if (!open) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveAll(inputAmap.trim(), inputSerp.trim(), {
      apiKey: llmKey.trim(),
      baseUrl: llmBase.trim() || 'https://api.deepseek.com/v1',
      model: llmModel.trim() || 'deepseek-chat',
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Zap size={18} />
            <h3>多源数据接口 & AI 情报提纯配置</h3>
          </div>
          <button type="button" className="circle-btn plain" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className={`status-banner mode-${currentMode === 'amap_live' ? 'amap' : currentMode}`}>
            <CheckCircle2 size={18} />
            <div>
              <strong>
                {currentMode === 'amap_live'
                  ? '已启用：高德周边全量定位 + 实时空房房价 + 国内抖音/小红书/携程情报聚合！'
                  : '请检查或补充下方接口配置'}
              </strong>
            </div>
          </div>

          <form onSubmit={handleSave} className="key-form">
            <div className="key-field-block">
              <label htmlFor="amap-key-input">
                📍 1. 高德开放平台「Web服务」Key（周边宾馆定位、前台电话、间夜均价）
              </label>
              <input
                id="amap-key-input"
                type="text"
                value={inputAmap}
                onChange={(e) => setInputAmap(e.target.value)}
                placeholder="32 位高德 Web服务 Key"
                spellCheck={false}
              />
            </div>

            <div className="key-field-block" style={{ marginTop: 12 }}>
              <label htmlFor="serp-key-input">
                ⚡ 2. SerpApi Key（实时空房房型 + 国内抖音/小红书/携程公开情报检索）
              </label>
              <input
                id="serp-key-input"
                type="text"
                value={inputSerp}
                onChange={(e) => setInputSerp(e.target.value)}
                placeholder="SerpApi Private API Key（免费 250 次/月，已加 20 分钟防重复扣费缓存）"
                spellCheck={false}
              />
            </div>

            {/* 借鉴 TripStar 的 OpenAI 兼容大模型提纯配置 */}
            <div className="key-field-block llm-box" style={{ marginTop: 12 }}>
              <label>
                <Bot size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                3. 选填：AI 住店避坑提纯大模型（与 TripStar 配置完全兼容，如 DeepSeek / 通义千问）
              </label>
              <input
                type="password"
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                placeholder="LLM_API_KEY（可留空；填入后自动把抖音/小红书帖子提纯成避坑总结）"
                spellCheck={false}
              />
              <div className="llm-sub-inputs">
                <input
                  type="text"
                  value={llmBase}
                  onChange={(e) => setLlmBase(e.target.value)}
                  placeholder="Base URL, 如 https://api.deepseek.com/v1"
                />
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="模型名, 如 deepseek-chat"
                />
              </div>
            </div>

            <button type="submit" className="save-both-btn">
              保存全部配置
            </button>

            <p className="privacy-hint">
              <ShieldCheck size={13} /> 免填任何抖音/小红书个人 Cookie，零封号风险；所有密钥仅保存在你本机。
            </p>
          </form>

          {selectedIp && (
            <div className="qr-sync-card">
              <div className="qr-left">
                <h4>
                  <QrCode size={15} /> 手机扫码同步（免重复填 Key）
                </h4>
                <p>
                  手机连同一 Wi-Fi 扫码即可同步打开，添加到主屏幕当 App 使用：
                </p>
                {lanIps.length > 1 && (
                  <div className="ip-selector">
                    {lanIps.slice(0, 3).map((ip) => (
                      <button
                        key={ip}
                        type="button"
                        className={`mini-pill ${selectedIp === ip ? 'active' : ''}`}
                        onClick={() => setSelectedIp(ip)}
                      >
                        {ip}
                      </button>
                    ))}
                  </div>
                )}
                <div className="lan-url-text">
                  局域网地址：<code>http://{selectedIp}:{port}</code>
                </div>
              </div>
              {qrDataUrl && (
                <div className="qr-img-box">
                  <img src={qrDataUrl} alt="手机扫码打开" />
                  <span>扫一扫同步到手机</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
