import { isNativePackagedApp } from '../services/standaloneClient';

/** 需要在系统里唤起的第三方 App scheme 及拨号/邮件协议 */
const CUSTOM_SCHEME =
  /^(imeituan|snssdk1128|iosamap|androidamap|baidumap|ctrip|diditaxi|openanjuke|wbmain|lianjiabeike|bosszp|alipay|weixin|tel|mailto):/i;

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * 在用户点击的同一个事件回调里先占一个空白标签页。
 *
 * 浏览器只允许「同步」发起的 window.open；如果先 await 复制关键词再打开，
 * 就被当成弹窗拦截（点按钮完全没反应）。所以先占位，异步拿到地址后再填进去。
 */
export function reserveTab(): Window | null {
  if (isNativePackagedApp()) return null;
  try {
    const win = window.open('about:blank', '_blank');
    if (win) {
      try {
        win.opener = null;
      } catch {
        // 个别浏览器禁止改写 opener，忽略即可
      }
    }
    return win;
  } catch {
    return null;
  }
}

/**
 * 统一的外部链接打开入口。
 *
 * 网页 / PWA 里用 window.open 就够了，但装进 Capacitor 的 iOS IPA 之后：
 * - WKWebView 默认不支持 window.open（点了没反应）；
 * - 自定义 scheme（imeituan://、ssnsdk1128://）必须交给原生层用 UIApplication.open 处理。
 * 所以原生壳内改走 AppLauncher / Browser 插件，失败再回退。
 *
 * `reserved` 是 reserveTab() 预留的标签页，优先复用它，避免弹窗拦截。
 */
export async function openExternalUrl(url: string, reserved?: Window | null): Promise<boolean> {
  if (!url) return false;

  if (!isNativePackagedApp()) {
    if (reserved && !reserved.closed) {
      reserved.location.href = url;
      return true;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  if (CUSTOM_SCHEME.test(url)) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      await AppLauncher.openUrl({ url });
      return true;
    } catch {
      return false;
    }
  }

  if (isHttpUrl(url)) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return true;
    } catch {
      window.location.href = url;
      return true;
    }
  }

  window.location.href = url;
  return true;
}

/** 唤起美团/抖音这类「有则打开 App，没有就退化为网页」的场景 */
export async function openAppOrWeb(appUrl: string, webUrl: string): Promise<'app' | 'web'> {
  const opened = await openExternalUrl(appUrl);
  if (opened) return 'app';
  await openExternalUrl(webUrl);
  return 'web';
}
