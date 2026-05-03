import { supabase } from '../lib/supabase';

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
      console.error('No active session');
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
      const error = await response.json();
      console.error('Push notification error:', error);
      return false;
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
}

export async function createNotificationAndPush(
  userId: string,
  type: 'chat' | 'document' | 'delivery' | 'system',
  title: string,
  message: string,
  url?: string
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
      console.error('Error creating notification:', notifError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error creating notification:', error);
    return false;
  }
}

export async function notifyMultipleUsers(
  userIds: string[],
  type: 'chat' | 'document' | 'delivery' | 'system',
  title: string,
  message: string,
  url?: string
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
      console.error('Error creating notifications:', error);
      return;
    }
  } catch (error) {
    console.error('Error notifying users:', error);
  }
}
