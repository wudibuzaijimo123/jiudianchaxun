import React, { useState } from 'react';
import { Activity, Copy, Wrench } from 'lucide-react';
import { AppLauncher } from '@capacitor/app-launcher';
import { isNativePackagedApp } from '../services/standaloneClient';

/** 需要自检的平台：scheme 用于拉起 App，web 用于兜底对照 */
const TARGETS = [
  { label: '58同城', scheme: 'wbmain://', web: 'https://m.58.com/' },
  { label: 'BOSS直聘', scheme: 'bosszp://', web: 'https://www.zhipin.com/' },
  { label: '安居客', scheme: 'openanjuke://', web: 'https://m.anjuke.com/' },
  { label: '贝壳找房', scheme: 'lianjiabeike://', web: 'https://m.ke.com/' },
  { label: '智联招聘', scheme: 'zhaopin://', web: 'https://www.zhaopin.com/' },
  { label: '高德地图', scheme: 'iosamap://', web: 'https://uri.amap.com/' },
  { label: '美团', scheme: 'imeituan://www.meituan.com', web: 'https://www.meituan.com/' },
];

/**
 * 跳转自检面板。
 *
 * 真机上「点了没反应」有好几种可能：跑的是网页版、Capacitor 插件没打进包、
 * scheme 被目标 App 关掉、手机上压根没装那个 App。光看页面分不出来，
 * 所以这里把系统真实返回值直接打到屏幕上，截图就能定位。
 */
export const JumpSelfTest: React.FC = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const append = (msg: string) => setLines((prev) => [...prev, msg]);

  const env = () => {
    const w = window as any;
    const rows = [
      `协议=${window.location.protocol}  原生壳=${isNativePackagedApp()}`,
      `Capacitor=${typeof w.Capacitor}  AppLauncher插件=${
        w.Capacitor?.Plugins?.AppLauncher ? '已注册' : '未注册'
      }`,
      `UA=${navigator.userAgent.slice(0, 90)}`,
    ];
    setLines(rows);
  };

  /** 只查询「系统是否认为这个 scheme 有 App 能接」，不会真的跳出 App */
  const probe = async () => {
    setBusy(true);
    try {
      env();
      for (const t of TARGETS) {
        let can = 'err';
        try {
          const res = await AppLauncher.canOpenUrl({ url: t.scheme });
          can = res?.value ? '可打开' : '不可打开';
        } catch (err: any) {
          can = `异常(${err?.message || err})`;
        }
        append(`canOpenUrl ${t.scheme} → ${can}`);
      }
      append('提示：canOpenUrl=不可打开 若你手机里确实装了该 App，说明 scheme 变了或被系统限制');
    } finally {
      setBusy(false);
    }
  };

  /** 真跳一次，看 openUrl 的 completed */
  const fire = async (label: string, scheme: string) => {
    setBusy(true);
    try {
      const t0 = Date.now();
      const res = await AppLauncher.openUrl({ url: scheme });
      append(
        `openUrl ${label} ${scheme} → completed=${res?.completed} 耗时=${Date.now() - t0}ms`
      );
    } catch (err: any) {
      append(`openUrl ${label} ${scheme} → 异常 ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  /** 用 WebView 导航再试一次，不依赖插件 */
  const fireNav = (label: string, scheme: string) => {
    append(`navigation ${label} → 即将跳 ${scheme}，看是否切到该 App`);
    window.location.href = scheme;
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 14,
        padding: '12px 12px 10px',
        borderRadius: 14,
        border: '1px solid rgba(37,99,235,0.28)',
        background: 'rgba(37,99,235,0.06)',
      }}
    >
      <h4 style={{ margin: '0 0 8px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Wrench size={14} /> 跳转自检（点了没反应时用）
      </h4>
      <p style={{ margin: '0 0 8px', fontSize: 11.5, lineHeight: 1.6, color: '#64748b' }}>
        先点「检测环境」看协议是不是 <code>capacitor:</code>（是则跑在 IPA 里，否则是网页版）；
        再点某个平台的「试跳」，看系统返回 completed。
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <button
          type="button"
          onClick={probe}
          disabled={busy}
          style={{
            padding: '6px 10px',
            fontSize: 12,
            borderRadius: 9,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          <Activity size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          检测环境 / scheme
        </button>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={copyAll}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              borderRadius: 9,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
            }}
          >
            <Copy size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
            {copied ? '已复制' : '复制结果'}
          </button>
        )}
      </div>

      {lines.length > 0 && (
        <pre
          style={{
            margin: '0 0 8px',
            padding: 8,
            maxHeight: 168,
            overflow: 'auto',
            fontSize: 10.5,
            lineHeight: 1.55,
            borderRadius: 9,
            background: '#0f172a',
            color: '#e2e8f0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {lines.join('\n')}
        </pre>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {TARGETS.map((t) => (
          <span key={t.scheme} style={{ display: 'inline-flex', gap: 0 }}>
            <button
              type="button"
              onClick={() => fire(t.label, t.scheme)}
              disabled={busy}
              style={{
                padding: '5px 8px',
                fontSize: 11,
                borderRadius: '8px 0 0 8px',
                border: '1px solid #cbd5e1',
                borderRight: 'none',
                background: '#fff',
                color: '#1e293b',
              }}
            >
              试跳{t.label}
            </button>
            <button
              type="button"
              onClick={() => fireNav(t.label, t.scheme)}
              style={{
                padding: '5px 6px',
                fontSize: 11,
                borderRadius: '0 8px 8px 0',
                border: '1px solid #cbd5e1',
                background: '#eef2ff',
                color: '#1e293b',
              }}
              title="不经过插件，直接 WebView 导航唤端"
            >
              导航
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};
