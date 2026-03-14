import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { chatApi } from '../api/chat';
import {
  MessageCircle,
  Send,
  Search,
  ArrowLeft,
  Users,
  Check,
  CheckCheck,
} from 'lucide-react';
import io from 'socket.io-client';

const ROLE_LABELS = {
  ADMIN: 'Админ',
  OFFICE: 'Офис',
  COUNTRY: 'Страна',
  CITY: 'Город',
};

const ROLE_COLORS = {
  ADMIN: 'bg-red-500/15 text-red-400',
  OFFICE: 'bg-amber-500/15 text-amber-400',
  COUNTRY: 'bg-sky-500/15 text-sky-400',
  CITY: 'bg-emerald-500/15 text-emerald-400',
};

function ChatAvatar({ name, url, size = 'md' }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover flex-shrink-0 ring-1 ring-edge`}
      />
    );
  }
  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div
      className={`${sizes[size]} rounded-full bg-brand-600/15 text-brand-400 flex items-center justify-center font-semibold flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

export default function Chat() {
  const { user, token } = useAuthStore();
  const [conversations, setConversations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileView, setMobileView] = useState('list');
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const selectedUserRef = useRef(null);

  // Keep ref in sync with state so socket callbacks always see current value
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    loadConversations();
    connectSocket();
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const connectSocket = () => {
    const baseUrl =
      import.meta.env.VITE_API_URL?.replace('/api', '') || '';
    const socket = io(`${baseUrl}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('new_message', (msg) => {
      const currentUserId = useAuthStore.getState().user?.id;
      const currentPartner = selectedUserRef.current;

      // Determine who the "other" person is in this message
      const otherId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;

      // Only add to visible messages if this message belongs to the currently open conversation
      if (currentPartner && otherId === currentPartner.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // If the message is FROM the other person, mark as read
        if (msg.senderId !== currentUserId) {
          socket.emit('mark_read', { senderId: msg.senderId });
          chatApi.markAsRead(msg.senderId).catch(() => {});
        }
      }
      // Always refresh conversation list for sidebar
      loadConversations();
      useChatStore.getState().fetchUnreadCount();
    });

    socket.on('messages_read', ({ readBy }) => {
      // The other person read our messages — update checkmarks
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === useAuthStore.getState().user?.id && !m.read
            ? { ...m, read: true }
            : m,
        ),
      );
      loadConversations();
    });

    socketRef.current = socket;
  };

  const loadConversations = async () => {
    try {
      const { data } = await chatApi.getConversations();
      const list = data.data || data;
      setConversations(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data } = await chatApi.getUsers();
      const list = data.data || data;
      setAllUsers(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
    }
  };

  const openChat = async (otherUser) => {
    setSelectedUser(otherUser);
    setShowNewChat(false);
    setMobileView('chat');
    try {
      const { data } = await chatApi.getMessages(otherUser.id);
      const list = data.data || data;
      setMessages(Array.isArray(list) ? list : []);
      // Mark messages as read (backend already does this in getMessages, but notify sender via socket)
      if (socketRef.current?.connected) {
        socketRef.current.emit('mark_read', { senderId: otherUser.id });
      }
      useChatStore.getState().fetchUnreadCount();
      loadConversations();
    } catch (err) {
      console.error(err);
    }
  };

  // Always send via REST API for reliability; socket is only for receiving
  const handleSend = useCallback(async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedUser || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      const { data } = await chatApi.sendMessage(selectedUser.id, text);
      const msg = data.data || data;
      // Add to local messages (deduplicate in case socket event arrives first)
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      loadConversations();
    } catch (err) {
      console.error(err);
      // Restore text if send failed so user doesn't lose their message
      setInputText(text);
    } finally {
      setSending(false);
    }
  }, [inputText, selectedUser, sending]);

  const handleNewChat = async () => {
    setShowNewChat(true);
    await loadUsers();
  };

  const goBack = () => {
    setMobileView('list');
    setSelectedUser(null);
    setMessages([]);
    loadConversations();
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    return c.user.displayName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredUsers = allUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600/20 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-8rem)] flex flex-col">
      <div className="flex-1 flex bg-surface-card rounded-[var(--radius-md)] border border-edge overflow-hidden min-h-0">
        {/* Left panel: Conversations */}
        <div
          className={`w-full sm:w-80 border-r border-edge flex flex-col flex-shrink-0 ${
            mobileView === 'chat' ? 'hidden sm:flex' : 'flex'
          }`}
        >
          <div className="p-3 border-b border-edge">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-content-primary flex-1 text-sm">
                Сообщения
              </h3>
              <button
                onClick={handleNewChat}
                className="p-2 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-brand-500 transition-colors"
                title="Новый чат"
              >
                <Users size={18} />
              </button>
            </div>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted"
              />
              <input
                type="text"
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-surface-primary border border-edge rounded-[var(--radius-sm)] text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none text-content-primary placeholder:text-content-muted"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {showNewChat ? (
              <div>
                <div className="px-3 py-2 text-2xs text-content-muted font-semibold uppercase tracking-widest">
                  Все пользователи
                </div>
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => openChat(u)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-card-hover transition-colors text-left"
                  >
                    <ChatAvatar name={u.displayName} url={u.avatarUrl} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-content-primary truncate">
                        {u.displayName}
                      </div>
                      <div className="text-xs text-content-muted flex items-center gap-1.5">
                        @{u.username}
                        <span className={`text-2xs px-1.5 py-0.5 rounded-full ${ROLE_COLORS[u.role] || ''}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-sm text-content-muted text-center py-8">
                    Нет пользователей
                  </p>
                )}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                <MessageCircle size={32} className="mb-2 opacity-40" />
                <p className="text-sm">Нет сообщений</p>
                <button
                  onClick={handleNewChat}
                  className="mt-2 text-xs text-brand-500 hover:text-brand-400"
                >
                  Начать чат
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.user.id}
                  onClick={() => openChat(conv.user)}
                  className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-surface-card-hover transition-colors text-left ${
                    selectedUser?.id === conv.user.id
                      ? 'bg-brand-600/5'
                      : ''
                  }`}
                >
                  <ChatAvatar
                    name={conv.user.displayName}
                    url={conv.user.avatarUrl}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-content-primary truncate">
                        {conv.user.displayName}
                      </span>
                      <span className="text-[10px] text-content-muted flex-shrink-0">
                        {new Date(conv.lastMessage.createdAt).toLocaleTimeString(
                          'ru-RU',
                          { hour: '2-digit', minute: '2-digit' },
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-content-secondary truncate flex-1">
                        {conv.lastMessage.senderId === user.id && (
                          <span className="text-content-muted">Вы: </span>
                        )}
                        {conv.lastMessage.text}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 w-5 h-5 bg-brand-600 text-white text-[10px] rounded-full flex items-center justify-center flex-shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right panel: Messages */}
        <div
          className={`flex-1 flex flex-col min-w-0 ${
            mobileView === 'list' ? 'hidden sm:flex' : 'flex'
          }`}
        >
          {selectedUser ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-edge">
                <button
                  onClick={goBack}
                  className="sm:hidden p-1 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted"
                >
                  <ArrowLeft size={20} />
                </button>
                <ChatAvatar
                  name={selectedUser.displayName}
                  url={selectedUser.avatarUrl}
                />
                <div>
                  <div className="font-medium text-content-primary text-sm">
                    {selectedUser.displayName}
                  </div>
                  <span className={`text-2xs px-1.5 py-0.5 rounded-full ${ROLE_COLORS[selectedUser.role] || 'text-content-muted'}`}>
                    {ROLE_LABELS[selectedUser.role] || selectedUser.role}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-content-muted">
                    <MessageCircle size={32} className="mb-2 opacity-30" />
                    <p className="text-sm">Начните диалог</p>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const isMe =
                    msg.senderId === user.id || msg.sender?.id === user.id;
                  const prevMsg = messages[i - 1];
                  const prevIsMe = prevMsg && (prevMsg.senderId === user.id || prevMsg.sender?.id === user.id);
                  const sameAuthor = prevIsMe === isMe;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${sameAuthor ? '' : 'mt-3'}`}
                    >
                      <div
                        className={`max-w-[75%] px-3.5 py-2 ${
                          isMe
                            ? 'bg-brand-600 text-white rounded-2xl rounded-br-md'
                            : 'bg-surface-secondary text-content-primary rounded-2xl rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {msg.text}
                        </p>
                        <div
                          className={`text-[10px] mt-0.5 flex items-center gap-1 ${
                            isMe ? 'text-white/50 justify-end' : 'text-content-muted'
                          }`}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {isMe &&
                            (msg.read ? (
                              <CheckCheck size={12} />
                            ) : (
                              <Check size={12} />
                            ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form
                onSubmit={handleSend}
                className="p-3 border-t border-edge"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Сообщение..."
                    className="flex-1 px-4 py-2.5 bg-surface-primary border border-edge rounded-[var(--radius-md)] text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none text-content-primary placeholder:text-content-muted"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || sending}
                    className="p-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-[var(--radius-md)] transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-content-muted">
              <MessageCircle size={48} className="mb-3 opacity-20" />
              <p className="text-sm">Выберите чат или начните новый</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
