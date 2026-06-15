import { useEffect, useState } from 'react';
import { UploadCloud, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';
import {
  drainPodOutbox,
  peekPodOutbox,
  podPayloadToBlob,
  type PodOutboxPayload,
  type QueuedPod,
} from '../../utils/podOutbox';
import { useTranslation } from '../../i18n';

/**
 * Background drainer for the driver POD offline outbox.
 *
 * Mounted once inside the DriverLayout so it stays alive across every
 * driver route. Every time `navigator.onLine` flips back to true (or
 * the layout itself mounts), the drainer attempts to ship queued POD
 * payloads to Supabase. Each flush is idempotent: if the corresponding
 * delivery_note has already been moved past `in_transit` (because a
 * previous attempt actually succeeded but the network dropped before
 * the client saw the response), the entry is treated as drained and
 * removed.
 *
 * Surfaces a tiny pill in the corner so the driver knows the queue
 * isn't lost — counts down as items flush, hidden when empty.
 */
export default function PodOutboxDrainer() {
  const { t } = useTranslation();
  const [queued, setQueued] = useState<QueuedPod[]>(() => peekPodOutbox());
  const [busy, setBusy] = useState(false);

  const refreshQueueView = () => setQueued(peekPodOutbox());

  const flush = async (payload: PodOutboxPayload): Promise<boolean> => {
    // Idempotency: skip if the note already moved past in_transit (a
    // previous attempt likely succeeded before the network failed).
    const { data: note } = await supabase
      .from('delivery_notes')
      .select('id, status')
      .eq('id', payload.delivery_note_id)
      .maybeSingle();
    if (!note) return true; // note vanished — drop from queue
    const status = (note as { status?: string }).status ?? '';
    if (['delivered', 'confirmed', 'completed', 'cancelled'].includes(status)) return true;

    const photoBlob = podPayloadToBlob(payload.photo);
    if (!photoBlob) return false;

    const photoExt = payload.photo.name.split('.').pop() || 'jpg';
    const photoPath = `${payload.company_id}/proof/${payload.delivery_note_id}/photo_${Date.now()}.${photoExt}`;
    const { error: pErr } = await supabase.storage.from('attachments').upload(photoPath, photoBlob, {
      contentType: payload.photo.type || 'image/jpeg',
      upsert: false,
    });
    if (pErr) return false;
    const photoUrl = supabase.storage.from('attachments').getPublicUrl(photoPath).data.publicUrl;

    let signatureUrl = '';
    if (payload.signature) {
      const sigBlob = podPayloadToBlob(payload.signature);
      if (sigBlob) {
        const sigExt = payload.signature.name.split('.').pop() || 'png';
        const sigPath = `${payload.company_id}/proof/${payload.delivery_note_id}/signature_${Date.now()}.${sigExt}`;
        const { error: sErr } = await supabase.storage.from('attachments').upload(sigPath, sigBlob, {
          contentType: payload.signature.type || 'image/png',
          upsert: false,
        });
        if (!sErr) {
          signatureUrl = supabase.storage.from('attachments').getPublicUrl(sigPath).data.publicUrl;
        }
      }
    }

    const { error: iErr } = await supabase.from('delivery_proofs').insert({
      delivery_note_id: payload.delivery_note_id,
      company_id: payload.company_id,
      captured_by_profile_id: payload.captured_by_profile_id,
      photo_url: photoUrl,
      signature_url: signatureUrl,
      gps_lat: payload.gps_lat,
      gps_lng: payload.gps_lng,
    });
    if (iErr) return false;

    const { error: uErr } = await supabase
      .from('delivery_notes')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', payload.delivery_note_id);
    if (uErr) return false;

    return true;
  };

  const drainOnce = async () => {
    if (busy) return;
    if (peekPodOutbox().length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    setBusy(true);
    try {
      const drained = await drainPodOutbox(flush);
      if (drained > 0) {
        logger.info('pod_outbox drained', { drained });
      }
    } catch (err) {
      logger.error('pod_outbox drainage failed', { error: err });
    } finally {
      setBusy(false);
      refreshQueueView();
    }
  };

  useEffect(() => {
    void drainOnce();
    const onOnline = () => { void drainOnce(); };
    const onStorage = () => refreshQueueView();
    window.addEventListener('online', onOnline);
    window.addEventListener('storage', onStorage);
    // Periodic safety net in case `online` doesn't fire (some browsers
    // keep it true on flaky mobile networks). 60s is conservative
    // enough not to hammer the API while idle.
    const interval = setInterval(() => { void drainOnce(); }, 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('storage', onStorage);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (queued.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-[70] max-w-sm">
      <div className="bg-amber-50 border border-amber-300 rounded-xl shadow-lg p-3 flex items-start gap-3">
        {busy ? (
          <UploadCloud className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0 animate-pulse" />
        ) : (
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {t('driver.podOutbox.queueTitle').replace('{count}', String(queued.length))}
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            {busy ? t('driver.podOutbox.flushing') : t('driver.podOutbox.willRetry')}
          </p>
        </div>
      </div>
    </div>
  );
}
