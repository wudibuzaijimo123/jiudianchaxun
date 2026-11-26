import { AppLauncher } from '@capacitor/app-launcher';
import { Browser } from '@capacitor/browser';
import { isNativePackagedApp } from '../services/standaloneClient';

/** 需要在系统里唤起的第三方 App scheme 及拨号/邮件协议 */
const CUSTOM_SCHEME =
  /^(imeituan|snssdk1128|iosamap|androidamap|baidumap|ctrip|diditaxi|openanjuke|wbmain|lianjiabeike|bosszp|zhipin|zhaopin|job51|ke|alipay|weixin|tel|mailto):/i;

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** 对包含中文或特殊符号的外部链接做合法 ASCII URI 规范化，避免 Swift URL(string:) 返回 nil */
function normalizeExternalUrl(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (isHttpUrl(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return encodeURI(trimmed);
    }
  }
  return trimmed;
}

/**
 * 在用户点击的同一个事件回调里先占一个空白标签页。
 * 浏览器只允许同步发起的 window.open；原生壳内无需占位。
 */
export function reserveTab(): Window | null {
  if (isNativePackagedApp()) return null;
  try {
    const win = window.open('about:blank', '_blank');
    if (win) {
      try {
        win.opener = null;
      } catch {
        // ignore
      }
    }
    return win;
  } catch {
    return null;
  }
}

/**
 * 统一的外部链接打开入口（全面兼容网页 / PWA / Capacitor iOS IPA）。
 */
export async function openExternalUrl(url: string, reserved?: Window | null): Promise<boolean> {
  const safeUrl = normalizeExternalUrl(url);
  if (!safeUrl) return false;

  if (!isNativePackagedApp()) {
    if (reserved && !reserved.closed) {
      reserved.location.href = safeUrl;
      return true;
    }
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    return true;
  }

  // 1. 自定义 App Scheme（imeituan://、iosamap:// 等）走原生 UIApplication.open，必须校验 completed 才算成功
  if (CUSTOM_SCHEME.test(safeUrl)) {
    try {
      const res = await AppLauncher.openUrl({ url: safeUrl });
      return Boolean(res?.completed ?? true);
    } catch {
      return false;
    }
  }

  // 2. HTTP / HTTPS 在独立 iOS IPA 内优先用 AppLauncher.openUrl（系统 UIApplication.open）：
  // 直接唤起系统 Safari 或目标 Universal Link App，避开 SFSafariViewController 复用状态卡死与 302 拦截问题
  if (isHttpUrl(safeUrl)) {
    try {
      const res = await AppLauncher.openUrl({ url: safeUrl });
      if (res?.completed !== false) {
        return true;
      }
    } catch {
      // fall through to Browser plugin
    }

    try {
      await Browser.open({ url: safeUrl });
      return true;
    } catch {
      // fall through to WebView navigation
    }

    try {
      window.location.assign(safeUrl);
      return true;
    } catch {
      return false;
    }
  }

  window.location.href = safeUrl;
  return true;
}

/** 唤起结果：进了 App / 退了网页 / 都失败 */
export type OpenResult = 'app' | 'web' | 'fail';

/**
 * 用 WebView 导航的方式尝试唤起 App（不依赖任何 Capacitor 插件）。
 *
 * 原理：WKWebView 收到非 http(s) 协议会交给系统处理，系统能打开就切到 App。
 * 页面切走后 visibilitychange / blur / pagehide 会立刻触发，据此判断成功；
 * 超时仍未切走就认为没装这个 App。
 */
function trySchemeByNavigation(scheme: string, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('pagehide', onLeave);
    };
    const onLeave = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(true);
    };
    const onVisible = () => {
      if (document.visibilityState === 'hidden') onLeave();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('blur', onLeave);
    window.addEventListener('pagehide', onLeave);

    try {
      window.location.href = scheme;
    } catch {
      // 等超时即可
    }

    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    }, timeoutMs);
  });
}

/** 是否手机浏览器（PWA 场景下也值得试一次 scheme，桌面浏览器不试，避免 1.2s 白等） */
function isMobileUA(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * 优先用平台自己的 URL Scheme 拉起原生 App，没装再退回网页。
 *
 * 三条路依次尝试。酒店模块只覆盖了第 1、3 条，而 58/BOSS 这类没有「callnative」
 * 唤起页的平台必须补第 2 条，否则在某些 IPA 里点了只会开浏览器：
 *   1. Capacitor AppLauncher 插件（原生 UIApplication.open，美团就是这么跳的）
 *   2. WebView 导航到 scheme（完全不依赖插件，插件没打进包也能唤起 App）
 *   3. 网页兜底
 */
export async function openAppFirst(
  schemes: string[],
  webFallback: string,
  reserved?: Window | null
): Promise<{ result: OpenResult; scheme: string; tried: string[] }> {
  const list = schemes.map((s) => normalizeExternalUrl(s)).filter(Boolean);
  const tried: string[] = [];

  if (isNativePackagedApp()) {
    // 1) 插件直开
    for (const scheme of list) {
      tried.push(scheme.split('?')[0]);
      try {
        const res = await AppLauncher.openUrl({ url: scheme });
        if (res?.completed !== false) return { result: 'app', scheme, tried };
      } catch {
        // 插件不可用 / scheme 打不开，走第 2 条
      }
    }
  }

  // 2) WebView 导航唤端（插件失效时的兜底；手机浏览器里同样有效）
  if (isNativePackagedApp() || isMobileUA()) {
    for (const scheme of list) {
      tried.push(scheme.split('?')[0]);
      const ok = await trySchemeByNavigation(scheme);
      if (ok) return { result: 'app', scheme, tried };
    }
  }

  const opened = await openExternalUrl(webFallback, reserved);
  return { result: opened ? 'web' : 'fail', scheme: '', tried };
}

/** 唤起美团/抖音这类「有则打开 App，没有就退化为网页」的场景 */
export async function openAppOrWeb(appUrl: string, webUrl: string): Promise<'app' | 'web'> {
  const opened = await openExternalUrl(appUrl);
  if (opened) return 'app';
  await openExternalUrl(webUrl);
  return 'web';
}
