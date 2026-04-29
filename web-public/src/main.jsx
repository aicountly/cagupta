import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

if (window.location.hostname.startsWith('www.')) {
  window.location.replace(
    window.location.href.replace(window.location.hostname, window.location.hostname.substring(4))
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
