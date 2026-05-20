import { supabase } from '../lib/supabase';
import { logger } from './logger';

interface SendPushNotificationParams {
  recipientIds: string[];
  title: string;
  body: string;
  type: 'chat' | 'document' | 'delivery';
  url?: string;
  icon?: string;
  tag?: string;
}

export async function sendPushNotification(params: SendPushNotificationParams): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      logger.warn('No active session');
      return false;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const text = await response.text();
      let error: unknown;
      try { error = JSON.parse(text); } catch { error = text; }
      logger.warn('Push notification error', { error });
      return false;
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    logger.warn('Error sending push notification', { error });
    return false;
  }
}

export async function createNotificationAndPush(
  userId: string,
  type: 'chat' | 'document' | 'delivery' | 'system',
  title: string,
  message: string,
  _url?: string
): Promise<boolean> {
  try {
    const { error: notifError } = await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      is_read: false,
      push_sent: false,
    });

    if (notifError) {
      logger.warn('Error creating notification', { error: notifError.message });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('Error creating notification', { error });
    return false;
  }
}

export async function notifyMultipleUsers(
  userIds: string[],
  type: 'chat' | 'document' | 'delivery' | 'system',
  title: string,
  message: string,
  _url?: string
): Promise<void> {
  try {
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      type,
      title,
      message,
      is_read: false,
      push_sent: false,
    }));

    const { error } = await supabase.from('notifications').insert(notifications);

    if (error) {
      logger.warn('Error creating notifications', { error: error.message });
      return;
    }
  } catch (error) {
    logger.warn('Error notifying users', { error });
  }
}
