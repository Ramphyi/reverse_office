import React from 'react';
import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import PublicSite from './PublicSite';
const App = lazy(() => import('./App'));
const publicPath = location.pathname.replace(/\/+$/, '');
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import './studio.css';
import './workforce.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {['/welcome', '/guide'].includes(publicPath) ? (
      <PublicSite guide={publicPath === '/guide'} />
    ) : (
      <Suspense
        fallback={
          <div className="loading-screen" role="status">
            Opening Reverse Office…
          </div>
        }
      >
        <App />
      </Suspense>
    )}
  </React.StrictMode>,
);
import './workspace-controls.css';
import './chat.css';

import './productivity.css';

import './workspace-experience.css';
import './product-site.css';
