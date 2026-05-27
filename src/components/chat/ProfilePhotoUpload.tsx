import { useState, useRef } from 'react';
import { Camera, Loader2, User, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface ProfilePhotoUploadProps {
  onClose: () => void;
}

export default function ProfilePhotoUpload({ onClose }: ProfilePhotoUploadProps) {
  const { profile, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (!file.type.startsWith('image/')) {
      setError(t('chat.profilePhotoImagesOnly') || 'Vetem imazhe lejohen');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t('chat.profilePhotoTooLarge'));
      return;
    }

    setPreview(URL.createObjectURL(file));
    setError(null);

    try {
      setUploading(true);
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${profile.id}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', profile.id);

      if (updateErr) throw updateErr;

      if (refreshProfile) await refreshProfile();
      onClose();
    } catch (err) {
      setError(err.message || t('common.errorSaving'));
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('chat.profilePhoto')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-5">
          <div className="relative">
            <div className="w-28 h-28 rounded-full overflow-hidden bg-teal-100 flex items-center justify-center ring-4 ring-teal-50">
              {preview || profile?.avatar_url ? (
                <img
                  src={preview || profile?.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-teal-600" />
              )}
            </div>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                {profile?.avatar_url ? t('chat.changePhoto') : t('common.upload')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
