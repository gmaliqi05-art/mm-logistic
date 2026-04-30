import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';

export default function AccountingRoute({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const { accountingEnabled, loading: subLoading } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (!profile) return <Navigate to="/login" replace />;

  const allowedRoles = ['accountant', 'company_admin', 'super_admin'];
  if (!allowedRoles.includes(profile.role)) return <Navigate to="/login" replace />;

  if (profile.role === 'accountant' || profile.role === 'super_admin') {
    return <>{children}</>;
  }

  if (!accountingEnabled) {
    return <Navigate to="/company/accounting-upgrade" replace />;
  }

  return <>{children}</>;
}
