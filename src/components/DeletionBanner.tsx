import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';

export default function DeletionBanner() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!profile) return;
    checkDeletion();
  }, [profile]);

  async function checkDeletion() {
    if (profile?.role === 'company_admin' && profile.company_id) {
      const { data } = await supabase
        .from('companies')
        .select('deletion_scheduled_for')
        .eq('id', profile.company_id)
        .maybeSingle();
      if (data?.deletion_scheduled_for) setScheduledFor(data.deletion_scheduled_for);
    } else if (profile?.id) {
      const { data } = await supabase
        .from('profiles')
        .select('deletion_scheduled_for')
        .eq('id', profile.id)
        .maybeSingle();
      if (data?.deletion_scheduled_for) setScheduledFor(data.deletion_scheduled_for);
    }
  }

  if (!scheduledFor || dismissed) return null;

  const days = Math.max(0, Math.ceil((new Date(scheduledFor).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const formattedDate = new Date(scheduledFor).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-900">
            <span className="font-semibold">Llogaria do te fshihet me {formattedDate}</span>
            <span className="text-amber-700"> ({days} dite te mbetura).</span>
            {' '}
            <a href="/settings/account" className="font-semibold underline hover:text-amber-800">{t('common.anuloFshirjen')}</a>
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-amber-500 hover:text-amber-700 rounded flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
