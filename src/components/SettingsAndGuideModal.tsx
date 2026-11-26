import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  HelpCircle,
  QrCode,
  ShieldCheck,
  Zap,
  X,
} from 'lucide-react';
import { DataSourceMode, LlmConfig, SearchCenter } from '../types/hotel';
import { isNativePackagedApp } from '../services/standaloneClient';

interface Props {
  open: boolean;
  amapKey: string;
  serpApiKey: string;
  llmConfig: LlmConfig;
  serverBaseUrl?: string;
  currentMode: DataSourceMode;
  center: SearchCenter;
  onSaveAll: (
    amapKey: string,
    serpApiKey: string,
    llmConfig: LlmConfig,
    serverBaseUrl: string
  ) => void;
  onClose: () => void;
}

const LLM_PRESETS = [
  {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    applyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    label: '硅基流动 (含免费模型)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    applyUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  {
    label: '阿里通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    applyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
  },
  {
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    applyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
];

export const SettingsAndGuideModal: React.FC<Props> = ({
  open,
  amapKey,
  serpApiKey,
  llmConfig,
  serverBaseUrl = '',
  center,
  onSaveAll,
  onClose,
}) => {
  const [inputAmap, setInputAmap] = useState(amapKey);
  const [inputSerp, setInputSerp] = useState(serpApiKey);
  const [llmKey, setLlmKey] = useState(llmConfig.apiKey);
  const [llmBase, setLlmBase] = useState(llmConfig.baseUrl);
  const [llmModel, setLlmModel] = useState(llmConfig.model);
  const [inputServerUrl, setInputServerUrl] = useState(serverBaseUrl);

  // 默认遮罩保护密钥防截图泄露，可点眼睛图标查看
  const [showAmap, setShowAmap] = useState(false);
  const [showSerp, setShowSerp] = useState(false);
  const [showLlm, setShowLlm] = useState(false);

  // 展开/收起各模块保姆级申请教程
  const [openGuide, setOpenGuide] = useState<'amap' | 'serp' | 'llm' | null>(
    !amapKey.trim() ? 'amap' : null
  );

  const [lanIps, setLanIps] = useState<string[]>([]);
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [port, setPort] = useState<number>(
    Number(window.location.port) || 5173
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    setInputAmap(amapKey);
    setInputSerp(serpApiKey);
    setLlmKey(llmConfig.apiKey);
    setLlmBase(llmConfig.baseUrl || 'https://api.deepseek.com/v1');
    setLlmModel(llmConfig.model || 'deepseek-chat');
    setInputServerUrl(serverBaseUrl);
  }, [amapKey, serpApiKey, llmConfig, serverBaseUrl, open]);

  useEffect(() => {
    if (!open || isNativePackagedApp()) return;
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
    if (!open || !selectedIp || isNativePackagedApp()) {
      setQrDataUrl('');
      return;
    }
    // 将当前电脑端配置同步到本机局域网服务内存中，二维码仅编码 26 字符极简短网址，秒扫秒开！
    fetch('/api/sync-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amapKey: inputAmap.trim(),
        serpApiKey: inputSerp.trim(),
        llmConfig: {
          apiKey: llmKey.trim(),
          baseUrl: llmBase.trim() || 'https://api.deepseek.com/v1',
          model: llmModel.trim() || 'deepseek-chat',
        },
        center,
      }),
    }).catch(() => {});

    const mobileUrl = `http://${selectedIp}:${port}/`;
    QRCode.toDataURL(mobileUrl, {
      width: 180,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [open, selectedIp, port, inputAmap, inputSerp, llmKey, llmBase, llmModel, center]);

  if (!open) return null;

  const configuredList = [
    inputAmap.trim() ? '高德定位' : '',
    inputSerp.trim() ? 'SerpApi实时检索' : '',
    llmKey.trim() ? 'AI全网搜价' : '',
  ].filter(Boolean);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveAll(
      inputAmap.trim(),
      inputSerp.trim(),
      {
        apiKey: llmKey.trim(),
        baseUrl: llmBase.trim() || 'https://api.deepseek.com/v1',
        model: llmModel.trim() || 'deepseek-chat',
      },
      inputServerUrl.trim()
    );
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Zap size={18} />
            <h3>多源数据接口 & AI 搜价配置指南</h3>
          </div>
          <button type="button" className="circle-btn plain" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* 顶部实时配置就绪状态 */}
          <div
            className={`status-banner ${
              configuredList.length > 0 ? 'mode-amap' : 'mode-demo'
            }`}
          >
            <CheckCircle2 size={18} />
            <div>
              <strong>
                {configuredList.length > 0
                  ? `已配置模块：${configuredList.join(' + ')}`
                  : '尚未填写接口 Key，点击每项右侧「怎么获取？」可查看 1 分钟免费申请教程'}
              </strong>
            </div>
          </div>

          <form onSubmit={handleSave} className="key-form">
            {/* ========== 1. 高德开放平台 Key ========== */}
            <div className="key-field-block">
              <div className="field-label-row">
                <label htmlFor="amap-key-input">
                  📍 1. 高德开放平台「Web服务」Key（必填推荐 · 免费 5000 次/日）
                </label>
                <button
                  type="button"
                  className="guide-toggle-link"
                  onClick={() => setOpenGuide(openGuide === 'amap' ? null : 'amap')}
                >
                  <HelpCircle size={13} />
                  <span>怎么获取？</span>
                  {openGuide === 'amap' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>

              <div className="masked-input-wrap">
                <input
                  id="amap-key-input"
                  type={showAmap ? 'text' : 'password'}
                  value={inputAmap}
                  onChange={(e) => setInputAmap(e.target.value)}
                  placeholder="粘贴 32 位高德 Web服务 Key（查周边酒店定位、电话、高德均价）"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowAmap((v) => !v)}
                  title={showAmap ? '隐藏密钥' : '显示密钥'}
                >
                  {showAmap ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {openGuide === 'amap' && (
                <div className="inline-step-guide">
                  <ol>
                    <li>
                      打开{' '}
                      <a
                        href="https://console.amap.com/dev/user/info"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        高德开放平台控制台-账号信息
                      </a>{' '}
                      注册并完成个人实名认证。
                    </li>
                    <li>
                      <strong>关键防坑①：</strong>在「账号信息」页右下角检查「授权类型」，若显示未获得许可，点击旁边的<strong>「去开通」</strong>免费勾选个人开发许可。
                    </li>
                    <li>
                      进入左侧菜单<strong>「应用管理 → 我的应用」</strong>，点击右上角「创建新应用」→ 点击应用右侧「+ 添加Key」。
                    </li>
                    <li>
                      <strong>关键防坑②：</strong>服务平台务必点选 <strong>「Web服务」</strong>（切勿选成 Web端JS API），提交后复制生成的 32 位 Key 粘贴到上方即可。
                    </li>
                  </ol>
                </div>
              )}
            </div>

            {/* ========== 2. SerpApi Key ========== */}
            <div className="key-field-block" style={{ marginTop: 12 }}>
              <div className="field-label-row">
                <label htmlFor="serp-key-input">
                  ⚡ 2. SerpApi Key（选填 · 免费 250 次/月 · 查空房与抖音/小红书网页）
                </label>
                <button
                  type="button"
                  className="guide-toggle-link"
                  onClick={() => setOpenGuide(openGuide === 'serp' ? null : 'serp')}
                >
                  <HelpCircle size={13} />
                  <span>怎么获取？</span>
                  {openGuide === 'serp' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>

              <div className="masked-input-wrap">
                <input
                  id="serp-key-input"
                  type={showSerp ? 'text' : 'password'}
                  value={inputSerp}
                  onChange={(e) => setInputSerp(e.target.value)}
                  placeholder="粘贴 64 位 SerpApi Private Key（免绑卡，内置25分钟防重复扣费缓存）"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowSerp((v) => !v)}
                  title={showSerp ? '隐藏密钥' : '显示密钥'}
                >
                  {showSerp ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {openGuide === 'serp' && (
                <div className="inline-step-guide">
                  <ol>
                    <li>
                      打开{' '}
                      <a
                        href="https://serpapi.com/users/sign_up"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        serpapi.com/users/sign_up
                      </a>{' '}
                      使用 GitHub / Google 或邮箱注册，套餐选择 <strong>Free Plan ($0/月，无需绑信用卡)</strong>。
                    </li>
                    <li>
                      <strong>关键一步：</strong>按照页面提示完成<strong>邮箱验证链接点击 + 手机号验证码验证</strong>（未完成验证前 Key 处于未激活状态）。
                    </li>
                    <li>
                      打开{' '}
                      <a
                        href="https://serpapi.com/manage-api-key"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        serpapi.com/manage-api-key
                      </a>{' '}
                      复制 <code>Your Private API Key</code> 粘贴到上方。
                    </li>
                  </ol>
                </div>
              )}
            </div>

            {/* ========== 3. AI 大模型搜价与提纯配置 ========== */}
            <div className="key-field-block llm-box" style={{ marginTop: 12 }}>
              <div className="field-label-row">
                <label>
                  <Bot size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                  3. AI 联网搜价与房型提纯大模型（推荐 · 自动把房价打印到卡片上）
                </label>
                <button
                  type="button"
                  className="guide-toggle-link"
                  onClick={() => setOpenGuide(openGuide === 'llm' ? null : 'llm')}
                >
                  <HelpCircle size={13} />
                  <span>怎么配置？</span>
                  {openGuide === 'llm' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>

              {/* 一键填入主流国内平台地址与模型名 */}
              <div className="llm-preset-bar">
                <span>一键填平台参数：</span>
                {LLM_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`preset-mini-btn ${llmBase === p.baseUrl ? 'active' : ''}`}
                    onClick={() => {
                      setLlmBase(p.baseUrl);
                      setLlmModel(p.model);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="masked-input-wrap">
                <input
                  type={showLlm ? 'text' : 'password'}
                  value={llmKey}
                  onChange={(e) => setLlmKey(e.target.value)}
                  placeholder="粘贴大模型 API Key（如 sk-xxxx）"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowLlm((v) => !v)}
                  title={showLlm ? '隐藏密钥' : '显示密钥'}
                >
                  {showLlm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

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

              {openGuide === 'llm' && (
                <div className="inline-step-guide">
                  <p style={{ marginBottom: 5 }}>
                    支持任意兼容 OpenAI 接口格式的服务商（先点上方按钮自动填好地址和模型名，再去对应官网复制 <code>sk-...</code> Key）：
                  </p>
                  <ul>
                    <li>
                      <strong>硅基流动（新手零成本推荐，有免费模型）：</strong>前往{' '}
                      <a
                        href="https://cloud.siliconflow.cn/account/ak"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        cloud.siliconflow.cn
                      </a>{' '}
                      新建 API 密钥，点上方「硅基流动」自动填入免费模型 <code>Qwen/Qwen2.5-7B-Instruct</code>。
                    </li>
                    <li>
                      <strong>DeepSeek 官方：</strong>前往{' '}
                      <a
                        href="https://platform.deepseek.com/api_keys"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        platform.deepseek.com
                      </a>{' '}
                      创建 Key，点上方「DeepSeek」即可。
                    </li>
                    <li>
                      <strong>阿里云百炼（通义千问）：</strong>前往{' '}
                      <a
                        href="https://bailian.console.aliyun.com/?apiKey=1"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        bailian.console.aliyun.com
                      </a>{' '}
                      获取 API-KEY，点上方「阿里通义千问」即可。
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* ========== 4. 独立 IPA 包选填：挂载自己的云服务器后端地址 ========== */}
            <div className="key-field-block" style={{ marginTop: 12 }}>
              <label htmlFor="server-url-input">
                🌐 4. 选填：远程云服务器地址（仅独立安装 iOS IPA 且需连接自家服务器时填写）
              </label>
              <input
                id="server-url-input"
                type="text"
                value={inputServerUrl}
                onChange={(e) => setInputServerUrl(e.target.value)}
                placeholder="网页直连留空即可；IPA 包可填如 https://你的服务器域名 或留空纯端侧运行"
                spellCheck={false}
              />
            </div>

            <button type="submit" className="save-both-btn">
              保存全部配置
            </button>

            <p className="privacy-hint">
              <ShieldCheck size={13} /> 所有密钥默认密码遮罩防截图泄露，且仅保存在你当前设备的浏览器本地存储（localStorage）中。
            </p>
          </form>

          {selectedIp && (
            <div className="qr-sync-card">
              <div className="qr-left">
                <h4>
                  <QrCode size={15} /> 手机扫码同步（免重复填 Key）
                </h4>
                <p>
                  1. 请用<strong>手机系统相机或浏览器</strong>扫码（勿用微信扫一扫）；<br />
                  2. <strong>重要防坑：</strong>你电脑开着 <code>Mihomo/Clash</code> 的 <strong>TUN 虚拟网卡模式</strong>时，TUN 会拦截手机连入电脑局域网导致打不开！在代理软件里<strong>关掉 TUN 模式（仅保留系统代理）</strong>手机即可秒开！
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
