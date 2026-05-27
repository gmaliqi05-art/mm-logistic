import { lazy, Suspense, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsPwa } from '../hooks/useIsPwa';
import HomeAppView from '../components/homepage/HomeAppView';

const HomeWebView = lazy(() => import('../components/homepage/HomeWebView'));

export default function HomePage() {
  const isPwa = useIsPwa();
  const clickTimestamps = useRef<number[]>([]);
  const navigate = useNavigate();

  const handleSecretClick = useCallback(() => {
    const now = Date.now();
    clickTimestamps.current.push(now);
    clickTimestamps.current = clickTimestamps.current.filter((x) => now - x < 2000);
    if (clickTimestamps.current.length >= 3) {
      clickTimestamps.current = [];
      navigate('/sa-access');
    }
  }, [navigate]);

  if (isPwa) {
    return <HomeAppView onSecretClick={handleSecretClick} />;
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <HomeWebView onSecretClick={handleSecretClick} />
    </Suspense>
  );
}
