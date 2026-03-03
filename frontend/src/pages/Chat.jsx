import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { chatApi } from '../api/chat';
import Button from '../components/ui/Button';
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
        className={`${sizes[size]} rounded-full object-cover flex-shrink-0`}
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
      className={`${sizes[size]} rounded-full bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-300 flex items-center justify-center font-semibold flex-shrink-0`}
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
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      loadConversations();
    });

    socket.on('messages_read', () => {
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
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
        100,
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedUser) return;
    const text = inputText.trim();
    setInputText('');

    if (socketRef.current?.connected) {
      socketRef.current.emit('send_message', {
        receiverId: selectedUser.id,
        text,
      });
    } else {
      setSending(true);
      try {
        const { data } = await chatApi.sendMessage(selectedUser.id, text);
        const msg = data.data || data;
        setMessages((prev) => [...prev, msg]);
        loadConversations();
      } catch (err) {
        console.error(err);
      } finally {
        setSending(false);
      }
    }
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
      100,
    );
  };

  const handleNewChat = async () => {
    setShowNewChat(true);
    await loadUsers();
  };

  const goBack = () => {
    setMobileView('list');
    setSelectedUser(null);
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
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-8rem)] flex flex-col">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">
        Чат
      </h2>

      <div className="flex-1 flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden min-h-0">
        {/* Left sidebar: Conversations */}
        <div
          className={`w-full sm:w-80 border-r border-gray-100 dark:border-gray-700 flex flex-col flex-shrink-0 ${
            mobileView === 'chat' ? 'hidden sm:flex' : 'flex'
          }`}
        >
          <div className="p-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex-1">
                Сообщения
              </h3>
              <button
                onClick={handleNewChat}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-brand-600"
                title="Новый чат"
              >
                <Users size={18} />
              </button>
            </div>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-brand-200 focus:border-brand-500 focus:outline-none dark:text-gray-100"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {showNewChat ? (
              <div>
                <div className="px-3 py-2 text-xs text-gray-400 font-medium uppercase tracking-wider">
                  Все пользователи
                </div>
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => openChat(u)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <ChatAvatar name={u.displayName} url={u.avatarUrl} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {u.displayName}
                      </div>
                      <div className="text-xs text-gray-400">
                        @{u.username} · {ROLE_LABELS[u.role]}
                      </div>
                    </div>
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">
                    Нет пользователей
                  </p>
                )}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <MessageCircle size={32} className="mb-2 opacity-50" />
                <p className="text-sm">Нет сообщений</p>
                <button
                  onClick={handleNewChat}
                  className="mt-2 text-xs text-brand-600 hover:text-brand-700"
                >
                  Начать чат
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.user.id}
                  onClick={() => openChat(conv.user)}
                  className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left border-b border-gray-50 dark:border-gray-700 ${
                    selectedUser?.id === conv.user.id
                      ? 'bg-brand-50 dark:bg-brand-900/20'
                      : ''
                  }`}
                >
                  <ChatAvatar
                    name={conv.user.displayName}
                    url={conv.user.avatarUrl}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {conv.user.displayName}
                      </span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {new Date(conv.lastMessage.createdAt).toLocaleTimeString(
                          'ru-RU',
                          { hour: '2-digit', minute: '2-digit' },
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
                        {conv.lastMessage.senderId === user.id && (
                          <span className="text-gray-400">Вы: </span>
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

        {/* Right: Messages */}
        <div
          className={`flex-1 flex flex-col min-w-0 ${
            mobileView === 'list' ? 'hidden sm:flex' : 'flex'
          }`}
        >
          {selectedUser ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <button
                  onClick={goBack}
                  className="sm:hidden p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                >
                  <ArrowLeft size={20} />
                </button>
                <ChatAvatar
                  name={selectedUser.displayName}
                  url={selectedUser.avatarUrl}
                />
                <div>
                  <div className="font-medium text-gray-800 dark:text-gray-200 text-sm">
                    {selectedUser.displayName}
                  </div>
                  <div className="text-xs text-gray-400">
                    {ROLE_LABELS[selectedUser.role] || selectedUser.role}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <MessageCircle size={32} className="mb-2 opacity-30" />
                    <p className="text-sm">Начните диалог</p>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMe =
                    msg.senderId === user.id || msg.sender?.id === user.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                          isMe
                            ? 'bg-brand-600 text-white rounded-br-md'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {msg.text}
                        </p>
                        <div
                          className={`text-[10px] mt-1 flex items-center gap-1 ${
                            isMe ? 'text-brand-200 justify-end' : 'text-gray-400'
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
                className="p-3 border-t border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Сообщение..."
                    className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-brand-200 focus:border-brand-500 focus:outline-none dark:text-gray-100"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || sending}
                    className="p-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <MessageCircle size={48} className="mb-3 opacity-30" />
              <p className="text-sm">Выберите чат или начните новый</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
