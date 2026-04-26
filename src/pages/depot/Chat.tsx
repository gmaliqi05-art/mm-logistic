import ChatRoomComponent from '../../components/chat/ChatRoom';
import { useTranslation } from '../../i18n';

export default function DepotChat() {
  const { t } = useTranslation();
  return <ChatRoomComponent channelPrefix="depot" subtitle={t('chat.subtitle')} />;
}
