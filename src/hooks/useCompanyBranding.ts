import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useCompanyBranding() {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');

  useEffect(() => {
    if (!profile?.company_id) {
      setName('');
      setLogo('');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('name, logo_url')
        .eq('id', profile.company_id!)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setName(data.name || '');
      setLogo(data.logo_url || '');
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.company_id]);

  return { name, logo };
}
