import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { APP_HTTP_ERROR_EVENT, type AppHttpErrorDetail } from '../services/httpErrors';

export function ApiErrorRedirector() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigating = useRef(false);

  useEffect(() => {
    navigating.current = false;
  }, [location.pathname]);

  useEffect(() => {
    const handleError = (event: Event) => {
      if (location.pathname.startsWith('/loi/') || navigating.current) return;
      const detail = (event as CustomEvent<AppHttpErrorDetail>).detail;
      if (!detail || !Number.isInteger(detail.status) || detail.status < 400 || detail.status > 599)
        return;
      navigating.current = true;
      navigate('/loi/' + detail.status, {
        replace: true,
        state: { from: location.pathname + location.search, message: detail.message },
      });
    };
    window.addEventListener(APP_HTTP_ERROR_EVENT, handleError);
    return () => window.removeEventListener(APP_HTTP_ERROR_EVENT, handleError);
  }, [location.pathname, location.search, navigate]);

  return null;
}
