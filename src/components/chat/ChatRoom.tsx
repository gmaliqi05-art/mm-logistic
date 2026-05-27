import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Plus,
  Search,
  X,
  Loader2,
  Users,
  User,
  Paperclip,
  AlertTriangle,
  Camera,
  Trash2,
  Image,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { ChatRoom as ChatRoomType, ChatMessage, ChatParticipant, Profile } from '../../types';
import EmojiPicker from './EmojiPicker';
import MessageBubble from './MessageBubble';
import ProfilePhotoUpload from './ProfilePhotoUpload';

interface RoomWithMeta extends ChatRoomType {
  participants: (ChatParticipant & { profile?: Profile })[];
  last_message_text?: string;
  last_message_at?: string;
  unread_count?: number;
  my_last_read_at?: string | null;
}

interface ChatRoomProps {
  channelPrefix?: string;
  subtitle?: string;
  isSuperAdmin?: boolean;
}

export default function ChatRoomComponent({ channelPrefix = 'chat', subtitle, isSuperAdmin = false }: ChatRoomProps) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<RoomWithMeta[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithMeta | null>(null);
  const [messages, setMessages] = useState<(ChatMessage & { is_deleted?: boolean })[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [companyProfiles, setCompanyProfiles] = useState<Profile[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showProfileUpload, setShowProfileUpload] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const deleteChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAllRooms();
      fetchAllProfiles();
    } else if (profile?.company_id) {
      fetchRooms();
      fetchCompanyProfiles();
    }
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (deleteChannelRef.current) supabase.removeChannel(deleteChannelRef.current);
    };
  }, [profile?.company_id, isSuperAdmin]);

  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase
      .channel(`${channelPrefix}-global-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => {
          if (isSuperAdmin) fetchAllRooms();
          else if (profile?.company_id) fetchRooms();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.id, isSuperAdmin, channelPrefix]);

  useEffect(() => {
    if (selectedRoom) {
      fetchMessages(selectedRoom.id);
      subscribeToMessages(selectedRoom.id);
    }
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (deleteChannelRef.current) {
        supabase.removeChannel(deleteChannelRef.current);
        deleteChannelRef.current = null;
      }
    };
  }, [selectedRoom?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchRooms() {
    try {
      setLoading(true);
      setError(null);

      const { data: participantRooms, error: pErr } = await supabase
        .from('chat_participants')
        .select('room_id')
        .eq('user_id', profile!.id);

      if (pErr) throw pErr;

      const roomIds = (participantRooms ?? []).map((p) => p.room_id);

      if (roomIds.length === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      let roomsQuery = supabase
        .from('chat_rooms')
        .select('*')
        .in('id', roomIds)
        .order('created_at', { ascending: false });

      if (profile?.company_id) {
        roomsQuery = roomsQuery.eq('company_id', profile.company_id);
      }

      const { data: roomsData, error: rErr } = await roomsQuery;

      if (rErr) throw rErr;

      const enriched = await enrichRooms(roomsData ?? []);
      setRooms(enriched);
    } catch (err) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllRooms() {
    try {
      setLoading(true);
      setError(null);

      const { data: participantRooms, error: pErr } = await supabase
        .from('chat_participants')
        .select('room_id')
        .eq('user_id', profile!.id);

      if (pErr) throw pErr;

      const roomIds = (participantRooms ?? []).map((p) => p.room_id);

      if (roomIds.length === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      const { data: roomsData, error: rErr } = await supabase
        .from('chat_rooms')
        .select('*')
        .in('id', roomIds)
        .order('created_at', { ascending: false });

      if (rErr) throw rErr;

      const enriched = await enrichRooms(roomsData ?? []);
      setRooms(enriched);
    } catch (err) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function enrichRooms(roomsData: ChatRoomType[]): Promise<RoomWithMeta[]> {
    const enriched: RoomWithMeta[] = [];

    for (const room of roomsData) {
      const { data: parts } = await supabase
        .from('chat_participants')
        .select('*, profile:profiles(id, full_name, avatar_url, email)')
        .eq('room_id', room.id);

      const { data: lastMsg } = await supabase
        .from('chat_messages')
        .select('message, created_at, is_deleted')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const myPart = (parts ?? []).find((p) => p.user_id === profile!.id);
      const myLastRead = (myPart as any)?.last_read_at ?? null;

      let unread = 0;
      if (myLastRead) {
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', room.id)
          .neq('sender_id', profile!.id)
          .gt('created_at', myLastRead);
        unread = count ?? 0;
      } else {
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', room.id)
          .neq('sender_id', profile!.id);
        unread = count ?? 0;
      }

      enriched.push({
        ...room,
        participants: parts ?? [],
        last_message_text: lastMsg?.is_deleted ? 'Mesazh i fshire' : (lastMsg?.message ?? ''),
        last_message_at: lastMsg?.created_at ?? room.created_at,
        unread_count: unread,
        my_last_read_at: myLastRead,
      });
    }

    enriched.sort((a, b) => new Date(b.last_message_at!).getTime() - new Date(a.last_message_at!).getTime());
    return enriched;
  }

  async function fetchMessages(roomId: string) {
    try {
      setMessagesLoading(true);
      const { data, error: err } = await supabase
        .from('chat_messages')
        .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (err) throw err;
      setMessages(data ?? []);
    } catch (err) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setMessagesLoading(false);
    }
  }

  function subscribeToMessages(roomId: string) {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (deleteChannelRef.current) supabase.removeChannel(deleteChannelRef.current);

    const channel = supabase
      .channel(`${channelPrefix}-room-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const newMsg = payload.new as any;
          const { data: msgWithSender } = await supabase
            .from('chat_messages')
            .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)')
            .eq('id', newMsg.id)
            .maybeSingle();

          if (msgWithSender) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msgWithSender.id)) return prev;
              const tempIdx = prev.findIndex(
                (m) => m.id.startsWith('temp-') && m.sender_id === msgWithSender.sender_id && m.message === msgWithSender.message
              );
              if (tempIdx >= 0) {
                const updated = [...prev];
                updated[tempIdx] = msgWithSender;
                return updated;
              }
              return [...prev, msgWithSender];
            });
          }
        }
      )
      .subscribe();

    const delChannel = supabase
      .channel(`${channelPrefix}-del-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.is_deleted) {
            setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, is_deleted: true } : m)));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    deleteChannelRef.current = delChannel;
  }

  async function fetchCompanyProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('company_id', profile!.company_id!)
      .eq('is_active', true)
      .neq('id', profile!.id);
    setCompanyProfiles(data ?? []);
  }

  async function fetchAllProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .neq('id', profile!.id);
    setCompanyProfiles(data ?? []);
  }

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || !selectedRoom || sending) return;
    const text = newMessage.trim();
    setNewMessage('');
    try {
      setSending(true);
      const optimistic = {
        id: `temp-${Date.now()}`,
        room_id: selectedRoom.id,
        sender_id: profile!.id,
        message: text,
        message_type: 'text' as const,
        attachment_url: '',
        created_at: new Date().toISOString(),
        is_deleted: false,
        sender: { id: profile!.id, full_name: profile!.full_name, avatar_url: profile!.avatar_url },
      };
      setMessages((prev) => [...prev, optimistic as any]);

      const { error: err } = await supabase.from('chat_messages').insert({
        room_id: selectedRoom.id,
        sender_id: profile!.id,
        message: text,
        message_type: 'text',
      });

      if (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        throw err;
      }

    } catch (err) {
      setError(err.message || t('common.errorSending'));
    } finally {
      setSending(false);
    }
  }, [newMessage, selectedRoom, sending, profile]);

  async function handleFileSend(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedRoom) return;

    try {
      setUploading(true);
      const ext = file.name.split('.').pop() || 'bin';
      const filePath = `chat/${selectedRoom.id}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
      const isImage = file.type.startsWith('image/');
      const messageType = isImage ? 'photo' : 'document';

      const optimistic = {
        id: `temp-${Date.now()}`,
        room_id: selectedRoom.id,
        sender_id: profile!.id,
        message: isImage ? '' : file.name,
        message_type: messageType,
        attachment_url: urlData.publicUrl,
        created_at: new Date().toISOString(),
        is_deleted: false,
        sender: { id: profile!.id, full_name: profile!.full_name, avatar_url: profile!.avatar_url },
      };
      setMessages((prev) => [...prev, optimistic as any]);

      const { error: msgErr } = await supabase.from('chat_messages').insert({
        room_id: selectedRoom.id,
        sender_id: profile!.id,
        message: isImage ? '' : file.name,
        message_type: messageType,
        attachment_url: urlData.publicUrl,
      });

      if (msgErr) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        throw msgErr;
      }

    } catch (err) {
      setError(err.message || t('common.errorSending'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function deleteMessage(msgId: string) {
    try {
      const { error: err } = await supabase
        .from('chat_messages')
        .update({ is_deleted: true })
        .eq('id', msgId)
        .eq('sender_id', profile!.id);

      if (err) throw err;
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, is_deleted: true } : m)));
    } catch (err) {
      setError(err.message || t('common.error'));
    }
    setShowDeleteConfirm(null);
  }

  async function createRoom() {
    if (selectedParticipants.length === 0) return;
    try {
      setCreating(true);
      const isGroup = selectedParticipants.length > 1;
      const name = isGroup
        ? groupName.trim() || 'Grup i Ri'
        : companyProfiles.find((p) => p.id === selectedParticipants[0])?.full_name ?? 'Bisede';

      const roomId = crypto.randomUUID();
      const { error: roomErr } = await supabase
        .from('chat_rooms')
        .insert({
          id: roomId,
          company_id: isSuperAdmin ? null : profile!.company_id!,
          name,
          is_group: isGroup,
          created_by: profile!.id,
        });

      if (roomErr) throw roomErr;

      const participants = [profile!.id, ...selectedParticipants].map((uid) => ({
        room_id: roomId,
        user_id: uid,
      }));

      const { error: partErr } = await supabase.from('chat_participants').insert(participants);
      if (partErr) throw partErr;

      setShowNewChat(false);
      setSelectedParticipants([]);
      setGroupName('');

      if (isSuperAdmin) {
        await fetchAllRooms();
      } else {
        await fetchRooms();
      }

      const { data: parts } = await supabase
        .from('chat_participants')
        .select('*, profile:profiles(id, full_name, avatar_url, email)')
        .eq('room_id', roomId);

      const now = new Date().toISOString();
      const newRoom: RoomWithMeta = {
        id: roomId,
        company_id: isSuperAdmin ? '' : profile!.company_id!,
        name,
        is_group: isGroup,
        created_by: profile!.id,
        created_at: now,
        participants: parts ?? [],
        last_message_text: '',
        last_message_at: now,
      };
      setSelectedRoom(newRoom);
      setShowMobileChat(true);
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setCreating(false);
    }
  }

  function toggleParticipant(id: string) {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function getRoomDisplayName(room: RoomWithMeta): string {
    if (room.is_group) return room.name;
    const other = room.participants.find((p) => p.user_id !== profile?.id);
    return (other?.profile as any)?.full_name ?? room.name;
  }

  function getRoomAvatar(room: RoomWithMeta): string | null {
    if (room.is_group) return null;
    const other = room.participants.find((p) => p.user_id !== profile?.id);
    return (other?.profile as any)?.avatar_url ?? null;
  }

  const filteredRooms = rooms.filter((r) => {
    if (!roomSearch) return true;
    const q = roomSearch.toLowerCase();
    return (
      getRoomDisplayName(r).toLowerCase().includes(q) ||
      r.participants.some((p) => (p.profile as any)?.full_name?.toLowerCase().includes(q))
    );
  });

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  }

  function handleEmojiSelect(emoji: string) {
    setNewMessage((prev) => prev + emoji);
    inputRef.current?.focus();
  }

  async function handleSelectRoom(room: RoomWithMeta) {
    setSelectedRoom(room);
    setShowMobileChat(true);
    try {
      await supabase
        .from('chat_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('room_id', room.id)
        .eq('user_id', profile!.id);
      setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, unread_count: 0 } : r)));
    } catch {
      // non-blocking
    }
  }

  return (
    <div className="flex flex-col chat-root">
      <div className="mb-2 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('nav.chat')}</h1>
          <p className="text-gray-500 text-sm">{subtitle || t('chat.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowProfileUpload(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <User className="w-3.5 h-3.5 text-teal-600" />
            )}
          </div>
          <Camera className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3 mb-2 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 flex bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-0">
        <div className={`w-full md:w-80 border-r border-gray-100 flex flex-col flex-shrink-0 ${showMobileChat ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('common.search') + '...'}
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              onClick={() => setShowNewChat(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Bisede e Re
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">{t('chat.noMessages')}</p>
              </div>
            ) : (
              filteredRooms.map((room) => {
                const avatar = getRoomAvatar(room);
                const displayName = getRoomDisplayName(room);
                const isSelected = selectedRoom?.id === room.id;

                return (
                  <button
                    key={room.id}
                    onClick={() => handleSelectRoom(room)}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-colors border-b border-gray-50 ${
                      isSelected ? 'bg-teal-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                      {avatar ? (
                        <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : room.is_group ? (
                        <Users className="w-5 h-5 text-teal-600" />
                      ) : (
                        <User className="w-5 h-5 text-teal-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-teal-900' : 'text-gray-900'}`}>
                          {displayName}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {room.last_message_at && (
                            <span className="text-xs text-gray-400">
                              {formatTime(room.last_message_at)}
                            </span>
                          )}
                          {!!room.unread_count && room.unread_count > 0 && !isSelected && (
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold px-1.5">
                              {room.unread_count > 99 ? '99+' : room.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${room.unread_count && !isSelected ? 'text-gray-800 font-semibold' : 'text-gray-500'}`}>
                        {room.last_message_text || t('chat.noMessages')}
                      </p>
                      {room.is_group && (
                        <div className="flex items-center gap-1 mt-1">
                          <Users className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-400">{room.participants.length}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={`flex-1 flex flex-col min-w-0 ${showMobileChat ? 'flex' : 'hidden md:flex'}`}>
          {!selectedRoom ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">{t('chat.noRoom')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-white">
                <button
                  onClick={() => setShowMobileChat(false)}
                  className="md:hidden p-1 text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden">
                  {getRoomAvatar(selectedRoom) ? (
                    <img src={getRoomAvatar(selectedRoom)!} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : selectedRoom.is_group ? (
                    <Users className="w-4 h-4 text-teal-600" />
                  ) : (
                    <User className="w-4 h-4 text-teal-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{getRoomDisplayName(selectedRoom)}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {selectedRoom.participants.map((p) => (p.profile as any)?.full_name).filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">{t('chat.noMessages')}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        isOwn={msg.sender_id === profile?.id}
                        onDelete={(id) => setShowDeleteConfirm(id)}
                        formatTime={formatTime}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <div className="chat-composer border-t border-gray-100 bg-white px-3 pt-2 pb-2 sm:pb-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                  className="hidden"
                  onChange={handleFileSend}
                />

                {/* Desktop / tablet layout: single row */}
                <div className="hidden sm:flex items-end gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="p-2.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    title={t('common.file')}
                  >
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = 'image/*';
                        fileInputRef.current.click();
                        fileInputRef.current.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip';
                      }
                    }}
                    disabled={uploading}
                    className="p-2.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    title={t('common.upload')}
                  >
                    <Image className="w-5 h-5" />
                  </button>
                  <div className="flex-shrink-0">
                    <EmojiPicker onSelect={handleEmojiSelect} />
                  </div>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={t('chat.typeMessage')}
                    className="flex-1 min-w-0 resize-none px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm leading-5 max-h-[120px]"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    className="p-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 shadow-sm"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>

                {/* Mobile layout: textarea on top, toolbar + send below */}
                <div className="sm:hidden flex flex-col gap-2">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 140) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={t('chat.typeMessage')}
                    className="w-full resize-none px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-[15px] leading-5 max-h-[140px] bg-gray-50"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-10 h-10 flex items-center justify-center text-gray-500 active:bg-teal-50 active:text-teal-600 rounded-full transition-colors disabled:opacity-50"
                        title={t('common.file')}
                      >
                        {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = 'image/*';
                            fileInputRef.current.click();
                            fileInputRef.current.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip';
                          }
                        }}
                        disabled={uploading}
                        className="w-10 h-10 flex items-center justify-center text-gray-500 active:bg-teal-50 active:text-teal-600 rounded-full transition-colors disabled:opacity-50"
                        title={t('common.upload')}
                      >
                        <Image className="w-5 h-5" />
                      </button>
                      <EmojiPicker onSelect={handleEmojiSelect} />
                    </div>
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || sending}
                      className="inline-flex items-center gap-2 px-5 h-11 bg-teal-600 text-white rounded-full hover:bg-teal-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm font-medium text-sm"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <span>{t('chat.send') || 'Send'}</span>
                          <Send className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-xl">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{t('common.delete')}?</h2>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                {t('common.areYouSure')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => deleteMessage(showDeleteConfirm)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowNewChat(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Bisede e Re</h2>
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setSelectedParticipants([]);
                  setGroupName('');
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-gray-100">
              {selectedParticipants.length > 1 && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.name')}</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder={t('common.name') + '...'}
                  />
                </div>
              )}
              <p className="text-sm text-gray-500">
                {t('chat.members')} ({selectedParticipants.length} {t('common.selected')})
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {companyProfiles.length === 0 ? (
                <div className="p-6 text-center">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">{t('common.noData')}</p>
                </div>
              ) : (
                companyProfiles.map((p) => {
                  const isSelected = selectedParticipants.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleParticipant(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        isSelected ? 'bg-teal-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <User className="w-4 h-4 text-teal-600" />
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-gray-900">{p.full_name}</p>
                        <p className="text-xs text-gray-500">{p.email}</p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-teal-600 bg-teal-600' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setSelectedParticipants([]);
                  setGroupName('');
                }}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={createRoom}
                disabled={creating || selectedParticipants.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('common.continue')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileUpload && (
        <ProfilePhotoUpload onClose={() => setShowProfileUpload(false)} />
      )}

      {showImagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setShowImagePreview(null)}>
          <img src={showImagePreview} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
