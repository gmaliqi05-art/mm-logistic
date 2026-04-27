import { supabase } from './supabase';

export type SaAuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'toggle'
  | 'login'
  | 'export'
  | 'settings_change';

export interface SaAuditEntry {
  action: SaAuditAction;
  entity_type: string;
  entity_id?: string;
  entity_label?: string;
  details?: Record<string, unknown>;
}

export async function logSaAudit(entry: SaAuditEntry): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('sa_audit_logs').insert({
      actor_id: user.id,
      actor_email: user.email ?? '',
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? '',
      entity_label: entry.entity_label ?? '',
      details: entry.details ?? {},
    });
  } catch (error) {
    console.error('Failed to write SA audit log', error);
  }
}
