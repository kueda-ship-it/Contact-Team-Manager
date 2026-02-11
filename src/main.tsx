import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { initializeMsal } from './lib/microsoftGraph';

// Initialize MSAL before rendering
initializeMsal().then(() => {
  const isPopup = !!window.opener;
  const hasHash = window.location.hash.length > 0;
  console.log(`[main.tsx] MSAL Initialized. isPopup=${isPopup}, hasHash=${hasHash}`);

  if (isPopup && hasHash) {
    console.log("[main.tsx] I am a popup with a hash. MSAL should handle this and close me.");
  }

  // Register Service Worker for Notifications
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(error => {
        console.error('ServiceWorker registration failed: ', error);
      });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}).catch(e => {
  console.error("Failed to initialize MSAL in main.tsx", e);
});
