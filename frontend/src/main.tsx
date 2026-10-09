import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { homeFontsReady } from './pages/Home';
import './styles/index.css';
import './pages/commerce.css';
async function mount() {
  // Inline brand subsets decode locally before the first homepage layout.
  if (window.location.pathname === '/') await homeFontsReady;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
void mount();
