import { useAuth } from '../../contexts/AuthContext';
import LiveFleetMap from '../../components/fleet/LiveFleetMap';

export default function LogisticsLiveMap() {
  const { profile } = useAuth();
  if (!profile?.company_id) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Live Fleet Map</h1>
        <p className="text-sm text-slate-600 mt-1">Real-time positions of drivers currently on the road.</p>
      </div>
      <LiveFleetMap companyId={profile.company_id} height="calc(100vh - 200px)" />
    </div>
  );
}
