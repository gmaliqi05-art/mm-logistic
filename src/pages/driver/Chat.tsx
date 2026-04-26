import ChatRoomComponent from '../../components/chat/ChatRoom';
import { useTranslation } from '../../i18n';

export default function DriverChat() {
  const { t } = useTranslation();
  return <ChatRoomComponent channelPrefix="driver" subtitle={t('chat.subtitle')} />;
}
