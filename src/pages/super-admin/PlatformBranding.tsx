import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Upload, Save, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function PlatformBranding() {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [platformName, setPlatformName] = useState('MM Logistic');
  const [platformShortName, setPlatformShortName] = useState('MML');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);

      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['platform_logo', 'platform_name', 'platform_short_name']);

      if (data) {
        data.forEach((setting) => {
          if (setting.key === 'platform_logo') setLogoUrl(setting.value || '');
          if (setting.key === 'platform_name') setPlatformName(setting.value || 'MM Logistic');
          if (setting.key === 'platform_short_name') setPlatformShortName(setting.value || 'MML');
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gabim në ngarkim');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setError('Ju lutem ngarkoni një imazh (JPEG, PNG, GIF, WEBP, SVG)');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Imazhi duhet të jetë më i vogël se 2MB');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const fileExt = file.name.split('.').pop();
      const fileName = `platform-logo-${Date.now()}.${fileExt}`;
      const filePath = `platform/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      setLogoUrl(urlData.publicUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dështoi ngarkimi i logos');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updates = [
        { key: 'platform_logo', value: logoUrl },
        { key: 'platform_name', value: platformName },
        { key: 'platform_short_name', value: platformShortName },
      ];

      for (const update of updates) {
        const { data: existing } = await supabase
          .from('platform_settings')
          .select('id')
          .eq('key', update.key)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('platform_settings')
            .update({ value: update.value, updated_at: new Date().toISOString() })
            .eq('key', update.key);
        } else {
          await supabase
            .from('platform_settings')
            .insert({
              key: update.key,
              value: update.value,
              description: `Platform ${update.key}`,
            });
        }
      }

      setSuccess('Cilësimet u ruajtën me sukses! Rifreskoni faqen për të parë ndryshimet.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gabim në ruajtje');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Logo dhe Branding i Platformës</h1>
        <p className="text-gray-500 mt-1">Menaxhoni logon dhe emrin e platformës MM Logistic</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-green-700 text-sm">{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">
            ×
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Logo e Platformës</h2>
          <p className="text-sm text-gray-500 mt-1">
            Logo do të shfaqet në të gjithë platformën (navbar, sidebar, homepage)
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Logo Aktuale
            </label>
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Platform Logo"
                    className="w-32 h-32 rounded-lg object-contain border-2 border-gray-200 bg-gray-50 p-2"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {uploading ? 'Duke ngarkuar...' : 'Ngarko Logo të Re'}
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  Format: PNG, JPG, GIF, WEBP, SVG (deri në 2MB)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Rekomandohet: 512x512px ose më e madhe, sfondi transparent (PNG)
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Emri i Platformës (i plotë)
              </label>
              <input
                type="text"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                placeholder="MM Logistic"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Shfaqet në navbar, sidebar dhe homepage
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Emri i shkurtër (akronim)
              </label>
              <input
                type="text"
                value={platformShortName}
                onChange={(e) => setPlatformShortName(e.target.value)}
                placeholder="MML"
                maxLength={10}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Përdoret kur sidebar është mbyllur ose në hapësira të vogla
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Ndryshimet do të aplikohen në të gjithë platformën
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Duke ruajtur...' : 'Ruaj Ndryshimet'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Shënim i rëndësishëm</h3>
            <p className="text-sm text-blue-700">
              Pas ruajtjes së ndryshimeve, përdoruesit duhet të rifreskojnë faqen (F5) për të parë logon e re.
              Logo e platformës do të shfaqet në të gjitha pozicionet: navbar, sidebar, homepage dhe footer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
