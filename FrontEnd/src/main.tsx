import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <App />
        <Toaster position="top-right" />
      </ErrorBoundary>
    </HelmetProvider>
  </StrictMode>
);
