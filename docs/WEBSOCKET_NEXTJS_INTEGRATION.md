# WebSocket интеграция для Next.js с Odyssea Backend

## Обзор

Это руководство содержит только WebSocket интеграцию для Next.js фронтенда с Odyssea Backend. Включает в себя подключение к WebSocket, обработку событий и компоненты для real-time чата.

## Базовые настройки

### 1. Создание Next.js проекта

```bash
npx create-next-app@latest odyssea-frontend --typescript --tailwind --eslint --app
cd odyssea-frontend
```

### 2. Установка зависимостей

```bash
npm install socket.io-client
npm install @types/node
# или
yarn add socket.io-client @types/node
```

### 3. Переменные окружения

Создайте файл `.env.local` в корне проекта:

```env
NEXT_PUBLIC_WS_BASE_URL=ws://localhost:3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/v1
```

### 4. Базовые константы

```typescript
// lib/constants.ts
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_BASE_URL || 'ws://localhost:3000';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/v1';
```

### 5. Типы TypeScript

```typescript
// types/api.ts
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'DRIVER' | 'FLEET_MANAGER' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface ChatRoom {
  id: string;
  name?: string;
  type: 'DIRECT' | 'GROUP' | 'LOAD';
  loadId?: string;
  participants: User[];
  lastMessage?: Message;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  sender: User;
  chatRoomId: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## API Routes для Next.js

### 1. API Route для чат-комнат

```typescript
// app/api/chat-rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-rooms`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### 2. API Route для сообщений

```typescript
// app/api/messages/chat-room/[chatRoomId]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { chatRoomId: string } }
) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '50';

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/messages/chat-room/${params.chatRoomId}?page=${page}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### 3. API Route для отправки сообщений

```typescript
// app/api/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### 4. API Route для загрузки файлов

```typescript
// app/api/messages/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/messages/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

## WebSocket интеграция

### 1. WebSocket сервис

```typescript
// lib/services/websocketService.ts
import { io, Socket } from 'socket.io-client';
import { Message, ChatRoom, User } from '@/types/api';
import { WS_BASE_URL } from '@/lib/constants';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  // Подключение к WebSocket
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Проверяем, что мы в браузере
      if (typeof window === 'undefined') {
        reject(new Error('WebSocket can only be used in browser'));
        return;
      }

      this.socket = io(`${WS_BASE_URL}/chat`, {
        auth: {
          token,
        },
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        this.handleReconnect();
      });
    });
  }

  // Обработка переподключения
  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
      
      setTimeout(() => {
        console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.socket?.connect();
      }, delay);
    }
  }

  // Отключение от WebSocket
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Присоединиться к чат-комнате
  joinChatRoom(chatRoomId: string) {
    this.socket?.emit('joinChatRoom', { chatRoomId });
  }

  // Покинуть чат-комнату
  leaveChatRoom(chatRoomId: string) {
    this.socket?.emit('leaveChatRoom', { chatRoomId });
  }

  // Создать чат-комнату
  createChatRoom(data: {
    name?: string;
    type: 'DIRECT' | 'GROUP' | 'LOAD';
    loadId?: string;
    participantIds: string[];
  }) {
    this.socket?.emit('createChatRoom', data);
  }

  // Обновить чат-комнату
  updateChatRoom(chatRoomId: string, updates: {
    name?: string;
    isArchived?: boolean;
  }) {
    this.socket?.emit('updateChatRoom', { chatRoomId, updates });
  }

  // Добавить участников
  addParticipants(chatRoomId: string, participantIds: string[]) {
    this.socket?.emit('addParticipants', { chatRoomId, participantIds });
  }

  // Удалить участника
  removeParticipant(chatRoomId: string, participantId: string) {
    this.socket?.emit('removeParticipant', { chatRoomId, participantId });
  }

  // Отправить сообщение
  sendMessage(data: {
    chatRoomId: string;
    content: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
  }) {
    this.socket?.emit('sendMessage', data);
  }

  // Подтвердить доставку сообщения
  confirmMessageDelivery(messageId: string, chatRoomId: string) {
    this.socket?.emit('messageDelivered', { messageId, chatRoomId });
  }

  // Отметить сообщение как прочитанное
  markMessageAsRead(messageId: string, chatRoomId: string) {
    this.socket?.emit('messageRead', { messageId, chatRoomId });
  }

  // Индикатор печати
  setTyping(chatRoomId: string, isTyping: boolean) {
    this.socket?.emit('typing', { chatRoomId, isTyping });
  }

  // Слушатели событий
  onConnected(callback: (data: { userId: string; userRole: string; chatRooms: number }) => void) {
    this.socket?.on('connected', callback);
  }

  onNewMessage(callback: (data: { chatRoomId: string; message: Message }) => void) {
    this.socket?.on('newMessage', callback);
  }

  onUserTyping(callback: (data: { userId: string; chatRoomId: string; isTyping: boolean }) => void) {
    this.socket?.on('userTyping', callback);
  }

  onChatUpdated(callback: (data: { chatRoomId: string }) => void) {
    this.socket?.on('chatUpdated', callback);
  }

  onUserJoined(callback: (data: { userId: string; chatRoomId: string }) => void) {
    this.socket?.on('userJoined', callback);
  }

  onUserLeft(callback: (data: { userId: string; chatRoomId: string }) => void) {
    this.socket?.on('userLeft', callback);
  }

  onChatRoomCreated(callback: (data: { chatRoom: ChatRoom }) => void) {
    this.socket?.on('chatRoomCreated', callback);
  }

  onChatRoomUpdated(callback: (data: { chatRoom: ChatRoom }) => void) {
    this.socket?.on('chatRoomUpdated', callback);
  }

  onParticipantsAdded(callback: (data: { chatRoomId: string; participants: User[] }) => void) {
    this.socket?.on('participantsAdded', callback);
  }

  onParticipantRemoved(callback: (data: { chatRoomId: string; participantId: string }) => void) {
    this.socket?.on('participantRemoved', callback);
  }

  onMessageSent(callback: (data: { messageId: string; chatRoomId: string }) => void) {
    this.socket?.on('messageSent', callback);
  }

  onMessageDelivered(callback: (data: { messageId: string; chatRoomId: string }) => void) {
    this.socket?.on('messageDelivered', callback);
  }

  onMessageRead(callback: (data: { messageId: string; chatRoomId: string }) => void) {
    this.socket?.on('messageRead', callback);
  }

  onError(callback: (error: { message: string; details?: string }) => void) {
    this.socket?.on('error', callback);
  }

  // Удалить слушатели
  removeAllListeners() {
    this.socket?.removeAllListeners();
  }
}

export const websocketService = new WebSocketService();
```

### 2. Хук для WebSocket

```typescript
// hooks/useWebSocket.ts
import { useEffect, useCallback, useRef } from 'react';
import { websocketService } from '@/lib/services/websocketService';

interface UseWebSocketProps {
  token?: string;
  isAuthenticated?: boolean;
}

export const useWebSocket = ({ token, isAuthenticated = false }: UseWebSocketProps) => {
  const isConnected = useRef(false);

  useEffect(() => {
    // Проверяем, что мы в браузере
    if (typeof window === 'undefined') return;

    if (isAuthenticated && token && !isConnected.current) {
      websocketService.connect(token)
        .then(() => {
          isConnected.current = true;
          console.log('WebSocket connected successfully');
        })
        .catch((error) => {
          console.error('Failed to connect WebSocket:', error);
        });
    }

    return () => {
      if (isConnected.current) {
        websocketService.disconnect();
        isConnected.current = false;
      }
    };
  }, [isAuthenticated, token]);

  const joinChatRoom = useCallback((chatRoomId: string) => {
    websocketService.joinChatRoom(chatRoomId);
  }, []);

  const leaveChatRoom = useCallback((chatRoomId: string) => {
    websocketService.leaveChatRoom(chatRoomId);
  }, []);

  const sendMessage = useCallback((data: {
    chatRoomId: string;
    content: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
  }) => {
    websocketService.sendMessage(data);
  }, []);

  const setTyping = useCallback((chatRoomId: string, isTyping: boolean) => {
    websocketService.setTyping(chatRoomId, isTyping);
  }, []);

  return {
    joinChatRoom,
    leaveChatRoom,
    sendMessage,
    setTyping,
    websocketService,
  };
};
```

## Компоненты Next.js

### 1. Компонент чата

```typescript
// components/Chat.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Message, ChatRoom } from '@/types/api';

interface ChatProps {
  chatRoom: ChatRoom;
  currentUserId: string;
  token: string;
  isAuthenticated: boolean;
}

export const Chat: React.FC<ChatProps> = ({ 
  chatRoom, 
  currentUserId, 
  token, 
  isAuthenticated 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { sendMessage, setTyping, websocketService } = useWebSocket({ 
    token, 
    isAuthenticated 
  });

  // Загрузка сообщений при монтировании компонента
  useEffect(() => {
    loadMessages();
  }, [chatRoom.id]);

  // Подключение к WebSocket событиям
  useEffect(() => {
    if (!isAuthenticated) return;

    // Присоединяемся к чат-комнате
    websocketService.joinChatRoom(chatRoom.id);

    // Слушаем новые сообщения
    websocketService.onNewMessage((data) => {
      if (data.chatRoomId === chatRoom.id) {
        setMessages(prev => [...prev, data.message]);
        scrollToBottom();
      }
    });

    // Слушаем индикаторы печати
    websocketService.onUserTyping((data) => {
      if (data.chatRoomId === chatRoom.id && data.userId !== currentUserId) {
        if (data.isTyping) {
          setTypingUsers(prev => [...prev.filter(id => id !== data.userId), data.userId]);
        } else {
          setTypingUsers(prev => prev.filter(id => id !== data.userId));
        }
      }
    });

    return () => {
      websocketService.leaveChatRoom(chatRoom.id);
    };
  }, [chatRoom.id, currentUserId, isAuthenticated]);

  // Автоскролл к последнему сообщению
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Загрузка сообщений
  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/messages/chat-room/${chatRoom.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessages(data.data);
        scrollToBottom();
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  // Отправка сообщения
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newMessage.trim()) {
      sendMessage({
        chatRoomId: chatRoom.id,
        content: newMessage.trim(),
      });
      
      setNewMessage('');
      setTyping(chatRoom.id, false);
      
      // Очищаем таймаут печати
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  // Обработка изменения текста с индикатором печати
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // Отправляем индикатор печати
    if (value.trim() && !isTyping) {
      setIsTyping(true);
      setTyping(chatRoom.id, true);
    }

    // Очищаем предыдущий таймаут
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Устанавливаем новый таймаут для остановки индикатора печати
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      setTyping(chatRoom.id, false);
    }, 3000);
  };

  // Очистка таймаута при размонтировании
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-96 bg-white rounded-lg shadow">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">{chatRoom.name || 'Chat'}</h3>
        <div className="text-sm text-gray-500">
          {chatRoom.participants.length} участников
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${message.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                message.senderId === currentUserId
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              <div className="text-sm">{message.content}</div>
              {message.fileUrl && (
                <div className="mt-2">
                  <a 
                    href={message.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-300 underline"
                  >
                    {message.fileName || 'File'}
                  </a>
                </div>
              )}
              <div className="text-xs mt-1 opacity-75">
                {message.sender.firstName} {message.sender.lastName}
              </div>
            </div>
          </div>
        ))}
        
        {typingUsers.length > 0 && (
          <div className="text-sm text-gray-500 italic">
            Кто-то печатает...
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            placeholder="Введите сообщение..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button 
            type="submit" 
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Отправить
          </button>
        </div>
      </form>
    </div>
  );
};
```

### 2. Компонент списка чатов

```typescript
// components/ChatList.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { ChatRoom } from '@/types/api';

interface ChatListProps {
  token: string;
  onChatSelect: (chatRoom: ChatRoom) => void;
  selectedChatRoomId?: string;
}

export const ChatList: React.FC<ChatListProps> = ({ 
  token, 
  onChatSelect, 
  selectedChatRoomId 
}) => {
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChatRooms();
  }, []);

  const loadChatRooms = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/chat-rooms', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setChatRooms(data.data);
      }
    } catch (error) {
      console.error('Failed to load chat rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-center">Загрузка чатов...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Чаты</h2>
        <button 
          onClick={loadChatRooms}
          className="text-sm text-blue-500 hover:text-blue-700"
        >
          Обновить
        </button>
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {chatRooms.map(chatRoom => (
          <div
            key={chatRoom.id}
            className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
              selectedChatRoomId === chatRoom.id ? 'bg-blue-50' : ''
            }`}
            onClick={() => onChatSelect(chatRoom)}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h4 className="font-medium">{chatRoom.name || 'Без названия'}</h4>
                <p className="text-sm text-gray-500">
                  {chatRoom.participants.length} участников
                </p>
                {chatRoom.lastMessage && (
                  <p className="text-sm text-gray-600 truncate">
                    {chatRoom.lastMessage.content}
                  </p>
                )}
              </div>
              <div className="text-right">
                {chatRoom.unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
                    {chatRoom.unreadCount}
                  </span>
                )}
                <div className="text-xs text-gray-400 mt-1">
                  {chatRoom.lastMessage && 
                    new Date(chatRoom.lastMessage.createdAt).toLocaleDateString()
                  }
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

## Пример использования

### Страница чата

```typescript
// app/chat/page.tsx
'use client';

import { useState } from 'react';
import { ChatList } from '@/components/ChatList';
import { Chat } from '@/components/Chat';
import { ChatRoom } from '@/types/api';

export default function ChatPage() {
  const [selectedChatRoom, setSelectedChatRoom] = useState<ChatRoom | null>(null);
  
  // В реальном приложении токен должен приходить из контекста аутентификации
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
  const isAuthenticated = !!token;

  const handleChatSelect = (chatRoom: ChatRoom) => {
    setSelectedChatRoom(chatRoom);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Необходима авторизация
          </h1>
          <p className="text-gray-600">
            Пожалуйста, войдите в систему для доступа к чату
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <ChatList 
              token={token}
              onChatSelect={handleChatSelect}
              selectedChatRoomId={selectedChatRoom?.id}
            />
          </div>
          <div className="lg:col-span-2">
            {selectedChatRoom ? (
              <Chat 
                chatRoom={selectedChatRoom}
                currentUserId="current-user-id" // В реальном приложении из контекста
                token={token}
                isAuthenticated={isAuthenticated}
              />
            ) : (
              <div className="flex items-center justify-center h-96 bg-white rounded-lg shadow">
                <p className="text-gray-500">Выберите чат для начала общения</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Конфигурация Next.js

### next.config.js

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  env: {
    NEXT_PUBLIC_WS_BASE_URL: process.env.NEXT_PUBLIC_WS_BASE_URL,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  },
};

module.exports = nextConfig;
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## Важные замечания

### CORS и API Routes

**HTTP запросы** (получение чатов, сообщений) проходят через Next.js API routes (`/api/*`) для избежания проблем с CORS:

```typescript
// ✅ Правильно - через API route
fetch('/api/chat-rooms', { headers: { 'Authorization': `Bearer ${token}` } })

// ❌ Неправильно - прямой запрос к бэкенду
fetch('http://localhost:3000/v1/chat-rooms', { headers: { 'Authorization': `Bearer ${token}` } })
```

**WebSocket соединения** подключаются напрямую к бэкенду, так как WebSocket не поддерживает CORS:

```typescript
// ✅ WebSocket подключается напрямую
const socket = io('ws://localhost:3000/chat', { auth: { token } })
```

### Структура проекта

```
odyssea-frontend/
├── app/
│   ├── api/                    # API routes для HTTP запросов
│   │   ├── chat-rooms/
│   │   │   └── route.ts
│   │   └── messages/
│   │       ├── chat-room/
│   │       │   └── [chatRoomId]/
│   │       │       └── route.ts
│   │       ├── upload/
│   │       │   └── route.ts
│   │       └── route.ts
│   ├── chat/
│   │   └── page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── Chat.tsx
│   └── ChatList.tsx
├── hooks/
│   └── useWebSocket.ts
├── lib/
│   ├── constants.ts
│   └── services/
│       └── websocketService.ts
├── types/
│   └── api.ts
├── next.config.js
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

## Заключение

Это руководство предоставляет полную WebSocket интеграцию для Next.js с Odyssea Backend. Включает в себя:

- ✅ **API Routes** для HTTP запросов (избежание CORS)
- ✅ **WebSocket подключение** с автоматическим переподключением
- ✅ **Обработку всех WebSocket событий**
- ✅ **Компоненты для real-time чата**
- ✅ **Индикаторы печати**
- ✅ **TypeScript типы**
- ✅ **Адаптацию для Next.js App Router**

Для начала работы просто скопируйте код в ваш проект и настройте переменные окружения.
