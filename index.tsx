
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Register Service Worker only in compatible environments with matching origin
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    // Check if we are in a sandbox that might cause origin mismatch
    const swPath = './sw.js';
    navigator.serviceWorker.register(swPath)
      .then(reg => {
        // Success
      })
      .catch(err => {
        // Silently handle origin mismatch in preview environments
        if (err.name === 'SecurityError') {
          console.log('PWA features disabled in this environment (Origin Mismatch)');
        } else {
          console.error('SW registration failed:', err);
        }
      });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
