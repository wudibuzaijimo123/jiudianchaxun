import { isNativePackagedApp } from '../services/standaloneClient';

/** 需要在系统里唤起的第三方 App scheme */
const CUSTOM_SCHEME = /^(imeituan|snssdk1128|iosamap|baidumap|ctrip|diditaxi|alipay|weixin):/i;

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * 统一的外部链接打开入口。
 *
 * 网页 / PWA 里用 window.open 就够了，但装进 Capacitor 的 iOS IPA 之后：
 * - WKWebView 默认不支持 window.open（点了没反应）；
 * - 自定义 scheme（imeituan://、snssdk1128://）必须交给原生层用 UIApplication.open 处理。
 * 所以原生壳内改走 AppLauncher / Browser 插件，失败再回退。
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (!url) return false;

  if (!isNativePackagedApp()) {
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
