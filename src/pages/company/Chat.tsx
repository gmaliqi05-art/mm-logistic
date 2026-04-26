import ChatRoomComponent from '../../components/chat/ChatRoom';
import { useTranslation } from '../../i18n';

export default function CompanyChat() {
  const { t } = useTranslation();
  return <ChatRoomComponent channelPrefix="company" subtitle={t('nav.chat')} />;
}
