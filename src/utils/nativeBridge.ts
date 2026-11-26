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
 * 优先用平台自己的 URL Scheme 拉起原生 App，没装再退回网页。
 *
 * 写法与酒店模块的「美团 / 高德」保持一致：不做 canOpenUrl 预检，直接
 * AppLauncher.openUrl（等价于原生 UIApplication.open），返回 completed=false
 * 才认为该 App 没装、换下一个。canOpenUrl 在 scheme 未登记时会恒为 false，
 * 拿它当开关反而会把本来能跳的 App 挡掉。
 */
export async function openAppFirst(
  schemes: string[],
  webFallback: string,
  reserved?: Window | null
): Promise<OpenResult> {
  if (isNativePackagedApp()) {
    for (const raw of schemes) {
      const scheme = normalizeExternalUrl(raw);
      if (!scheme) continue;
      try {
        const res = await AppLauncher.openUrl({ url: scheme });
        if (res?.completed !== false) return 'app';
      } catch {
        // 这个 scheme 打不开，试下一个
      }
    }
  }
  const opened = await openExternalUrl(webFallback, reserved);
  return opened ? 'web' : 'fail';
}

/** 唤起美团/抖音这类「有则打开 App，没有就退化为网页」的场景 */
export async function openAppOrWeb(appUrl: string, webUrl: string): Promise<'app' | 'web'> {
  const opened = await openExternalUrl(appUrl);
  if (opened) return 'app';
  await openExternalUrl(webUrl);
  return 'web';
}
