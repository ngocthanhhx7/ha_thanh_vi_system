import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { gameApi } from '../services/gameApi';
import './game-launcher.css';

export function GameLauncher() {
  const { pathname } = useLocation();
  const [session, setSession] = useState(0);
  useEffect(() => {
    const changed = () => setSession((value) => value + 1);
    window.addEventListener('customer-session-changed', changed);
    return () => window.removeEventListener('customer-session-changed', changed);
  }, []);
  useEffect(() => {
    const products = pathname === '/san-pham' || pathname.startsWith('/san-pham/');
    if (!products) return;
    let active = true;
    let token: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let visibilityVersion = 0;
    const visibility = () => {
      if (document.visibilityState !== 'visible') {
        token = undefined;
        ++visibilityVersion;
      }
    };
    document.addEventListener('visibilitychange', visibility);
    async function heartbeat() {
      if (!active) return;
      if (document.visibilityState !== 'visible') {
        token = undefined;
        timer = setTimeout(heartbeat, 5000);
        return;
      }
      try {
        const version = visibilityVersion;
        const result = await gameApi.presence(token);
        failures = 0;
        token = version === visibilityVersion ? result.token : undefined;
        if (active && !result.state.collection.productBonusClaimed)
          timer = setTimeout(heartbeat, 5000);
      } catch {
        token = undefined;
        if (active && ++failures <= 3) timer = setTimeout(heartbeat, 5000 * failures);
      }
    }
    // Allow an effect cleanup (including Strict Mode) to cancel the first request.
    queueMicrotask(() => {
      if (active) void heartbeat();
    });
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [pathname, session]);
  if (/^\/tro-choi\/?$/.test(pathname) || pathname.startsWith('/thanh-toan')) return null;
  return (
    <Link
      className="game-launcher"
      to="/tro-choi"
      aria-label="Chơi cùng Hà Thành Vị, lật thẻ và sưu tập nhận ưu đãi"
    >
      <span className="game-launcher-cards" aria-hidden="true">
        <img src="/brand/game/cards/card-back-launcher.webp" alt="" width="48" height="72" />
      </span>
      <span>Chơi & nhận quà</span>
    </Link>
  );
}
