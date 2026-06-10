import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { initializeMsal } from './lib/microsoftGraph';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Initialize MSAL before rendering, but don't let MSAL failure crash the whole app
initializeMsal()
  .catch(e => {
    console.error("Failed to initialize MSAL in main.tsx, continuing without MSAL...", e);
  })
  .finally(() => {
    const isPopup = !!window.opener;
    const hasHash = window.location.hash.length > 0;
    console.log(`[main.tsx] App booting. isPopup=${isPopup}, hasHash=${hasHash}`);

    if (isPopup && hasHash) {
      console.log("[main.tsx] I am a popup with a hash. MSAL should handle this and close me.");
    }

    // Register Service Worker for Notifications
    if ('serviceWorker' in navigator) {
      // 新しい SW が制御を取得したら自動リロード。
      // precache 方式のため、これが無いと開きっぱなしの PWA は
      // 何度デプロイしても旧バンドルを配り続ける（sw.js は skipWaiting + clients.claim 済み）。
      let reloading = false;
      let hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // 初回インストール（未制御 → 制御）ではリロードしない
        if (!hadController) { hadController = true; return; }
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
          // 長時間開きっぱなしでも更新を拾えるよう、定期 + フォーカス時に更新チェック
          const check = () => registration.update().catch(() => { });
          setInterval(check, 10 * 60 * 1000);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') check();
          });
        })
        .catch(error => {
          console.error('ServiceWorker registration failed: ', error);
        });
    }

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <NotificationProvider>
            <ThemeProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ThemeProvider>
          </NotificationProvider>
        </ErrorBoundary>
      </StrictMode>,
    )
  });
