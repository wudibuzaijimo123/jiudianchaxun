import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { isNativePackagedApp } from './services/standaloneClient';
import { openExternalUrl } from './utils/nativeBridge';

// 仅在 HTTP/HTTPS 网页模式下注册 PWA Service Worker（独立 iOS IPA 容器内跳过）
if (
  'serviceWorker' in navigator &&
  !isNativePackagedApp() &&
  (window.location.protocol === 'https:' || window.location.protocol === 'http:')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// 独立 iOS IPA (WKWebView) 内统一接管所有外部链接、target="_blank"、tel: 拨号与第三方 App Scheme
if (typeof document !== 'undefined' && isNativePackagedApp()) {
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href')?.trim() || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      const isExternalProto = /^(https?:|tel:|mailto:|imeituan:|snssdk1128:|iosamap:|androidamap:|baidumap:|ctrip:|diditaxi:|openanjuke:|wbmain:|lianjiabeike:|bosszp:|weixin:|alipay:)/i.test(
        href
      );
      if (isExternalProto || anchor.target === '_blank') {
        e.preventDefault();
        void openExternalUrl(href);
      }
    },
    true
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
