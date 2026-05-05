import { supabase } from '../lib/supabase';

export type NotificationType =
  | 'chat'
  | 'document'
  | 'delivery'
  | 'delivery_note'
  | 'stock'
  | 'assignment'
  | 'system';

interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  titleKey: string;
  messageKey: string;
  params?: Record<string, string | number>;
  referenceId?: string | null;
  fallbackTitle: string;
  fallbackMessage: string;
}

function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    template,
  );
}

export async function notifyUsers({
  userIds,
  type,
  titleKey,
  messageKey,
  params,
  referenceId,
  fallbackTitle,
  fallbackMessage,
}: NotifyInput): Promise<void> {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  const rows = ids.map((uid) => ({
    user_id: uid,
    type,
    title: fill(fallbackTitle, params),
    message: fill(fallbackMessage, params),
    reference_id: referenceId ?? null,
    data: { titleKey, messageKey, params: params ?? {} },
  }));
  await supabase.from('notifications').insert(rows);
}

export async function notifyRole(options: {
  companyId: string;
  role: string;
  type: NotificationType;
  titleKey: string;
  messageKey: string;
  params?: Record<string, string | number>;
  referenceId?: string | null;
  fallbackTitle: string;
  fallbackMessage: string;
}): Promise<void> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_id', options.companyId)
    .eq('role', options.role)
    .eq('is_active', true);
  const userIds = (data ?? []).map((p: { id: string }) => p.id);
  if (userIds.length === 0) return;
  await notifyUsers({ ...options, userIds });
}
