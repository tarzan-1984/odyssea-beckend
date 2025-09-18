# WebSocket Integration Guide для Next.js Frontend

## Обзор

Этот гайд описывает полную интеграцию WebSocket функциональности в Next.js приложение для работы с чат-системой Odyssea. Бэкенд использует Socket.IO на базовом namespace (без `/chat`) и JWT аутентификацией.

> **⚠️ Важно:** Namespace `/chat` был удален из бэкенда для лучшей совместимости с хостинг-платформами (например, Render.com). Подключение происходит к базовому URL без namespace.

## Установка зависимостей

```bash
npm install socket.io-client
npm install @types/socket.io-client  # для TypeScript
```

## Архитектура интеграции

### 1. WebSocket Context Provider

Создайте контекст для управления WebSocket соединением:

```typescript
// contexts/WebSocketContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: (token: string) => void;
  disconnect: () => void;
  joinChatRoom: (chatRoomId: string) => void;
  leaveChatRoom: (chatRoomId: string) => void;
  sendMessage: (data: SendMessageData) => void;
  sendTyping: (chatRoomId: string, isTyping: boolean) => void;
  markMessageAsRead: (messageId: string, chatRoomId: string) => void;
}

interface SendMessageData {
  chatRoomId: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = (token: string) => {
    // Disconnect existing connection if any
    if (socket) {
      socket.disconnect();
    }

    // Create new socket connection with authentication
    const newSocket = io(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000', {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
      timeout: 20000,
      forceNew: true
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;

      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setIsConnected(false);

      // Attempt to reconnect if not manually disconnected
      if (reason !== 'io client disconnect') {
        attemptReconnect(token);
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);

      // Attempt to reconnect on connection error
      attemptReconnect(token);
    });

    // Handle authentication errors
    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
      if (error.message?.includes('Unauthorized')) {
        // Token might be expired, try to refresh
        handleAuthError();
      }
    });

    setSocket(newSocket);
  };

  const attemptReconnect = (token: string) => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    reconnectAttempts.current++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000); // Exponential backoff, max 30s

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect(token);
    }, delay);
  };

  const handleAuthError = () => {
    // Implement token refresh logic here
    // For now, we'll just disconnect and let the user re-authenticate
    disconnect();
  };

  const disconnect = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    reconnectAttempts.current = 0;
  };

  const joinChatRoom = (chatRoomId: string) => {
    if (socket && isConnected) {
      socket.emit('joinChatRoom', { chatRoomId });
    }
  };

  const leaveChatRoom = (chatRoomId: string) => {
    if (socket && isConnected) {
      socket.emit('leaveChatRoom', { chatRoomId });
    }
  };

  const sendMessage = (data: SendMessageData) => {
    if (socket && isConnected) {
      socket.emit('sendMessage', data);
    }
  };

  const sendTyping = (chatRoomId: string, isTyping: boolean) => {
    if (socket && isConnected) {
      socket.emit('typing', { chatRoomId, isTyping });
    }
  };

  const markMessageAsRead = (messageId: string, chatRoomId: string) => {
    if (socket && isConnected) {
      socket.emit('messageRead', { messageId, chatRoomId });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  const value: WebSocketContextType = {
    socket,
    isConnected,
    connect,
    disconnect,
    joinChatRoom,
    leaveChatRoom,
    sendMessage,
    sendTyping,
    markMessageAsRead,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
```

### 2. WebSocket Hooks

Создайте специализированные хуки для различных WebSocket функций:

```typescript
// hooks/useWebSocketMessages.ts
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';

interface Message {
	id: string;
	content: string;
	senderId: string;
	receiverId?: string | null;
	fileUrl?: string | null;
	fileName?: string | null;
	fileSize?: number | null;
	isRead: boolean;
	createdAt: string;
	sender: {
		id: string;
		firstName: string;
		lastName: string;
		profilePhoto?: string | null;
		role: string;
	};
	receiver?: {
		id: string;
		firstName: string;
		lastName: string;
		profilePhoto?: string | null;
		role: string;
	} | null;
}

interface UseWebSocketMessagesProps {
	chatRoomId: string;
	onNewMessage?: (message: Message) => void;
	onMessageSent?: (data: { messageId: string; chatRoomId: string }) => void;
	onMessageRead?: (data: { messageId: string; readBy: string }) => void;
	onUserTyping?: (data: {
		userId: string;
		chatRoomId: string;
		isTyping: boolean;
	}) => void;
	onError?: (error: { message: string; details?: string }) => void;
}

export const useWebSocketMessages = ({
	chatRoomId,
	onNewMessage,
	onMessageSent,
	onMessageRead,
	onUserTyping,
	onError,
}: UseWebSocketMessagesProps) => {
	const {
		socket,
		isConnected,
		joinChatRoom,
		leaveChatRoom,
		sendMessage,
		sendTyping,
		markMessageAsRead,
	} = useWebSocket();
	const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
	const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
		null,
	);

	// Join chat room when component mounts or chatRoomId changes
	useEffect(() => {
		if (isConnected && chatRoomId) {
			joinChatRoom(chatRoomId);

			return () => {
				leaveChatRoom(chatRoomId);
			};
		}
	}, [isConnected, chatRoomId, joinChatRoom, leaveChatRoom]);

	// Set up event listeners
	useEffect(() => {
		if (!socket) return;

		const handleNewMessage = (data: {
			chatRoomId: string;
			message: Message;
		}) => {
			if (data.chatRoomId === chatRoomId) {
				onNewMessage?.(data.message);
			}
		};

		const handleMessageSent = (data: {
			messageId: string;
			chatRoomId: string;
		}) => {
			if (data.chatRoomId === chatRoomId) {
				onMessageSent?.(data);
			}
		};

		const handleMessageRead = (data: {
			messageId: string;
			readBy: string;
		}) => {
			onMessageRead?.(data);
		};

		const handleUserTyping = (data: {
			userId: string;
			chatRoomId: string;
			isTyping: boolean;
		}) => {
			if (data.chatRoomId === chatRoomId) {
				setIsTyping((prev) => ({
					...prev,
					[data.userId]: data.isTyping,
				}));
				onUserTyping?.(data);
			}
		};

		const handleError = (error: { message: string; details?: string }) => {
			onError?.(error);
		};

		// Register event listeners
		socket.on('newMessage', handleNewMessage);
		socket.on('messageSent', handleMessageSent);
		socket.on('messageRead', handleMessageRead);
		socket.on('userTyping', handleUserTyping);
		socket.on('error', handleError);

		// Cleanup listeners
		return () => {
			socket.off('newMessage', handleNewMessage);
			socket.off('messageSent', handleMessageSent);
			socket.off('messageRead', handleMessageRead);
			socket.off('userTyping', handleUserTyping);
			socket.off('error', handleError);
		};
	}, [
		socket,
		chatRoomId,
		onNewMessage,
		onMessageSent,
		onMessageRead,
		onUserTyping,
		onError,
	]);

	// Send message function
	const sendMessageHandler = useCallback(
		(data: {
			content: string;
			fileUrl?: string;
			fileName?: string;
			fileSize?: number;
		}) => {
			sendMessage({
				chatRoomId,
				...data,
			});
		},
		[sendMessage, chatRoomId],
	);

	// Send typing indicator with debouncing
	const sendTypingHandler = useCallback(
		(isTyping: boolean) => {
			sendTyping(chatRoomId, isTyping);

			// Auto-stop typing indicator after 3 seconds
			if (isTyping) {
				if (typingTimeout) {
					clearTimeout(typingTimeout);
				}

				const timeout = setTimeout(() => {
					sendTyping(chatRoomId, false);
				}, 3000);

				setTypingTimeout(timeout);
			} else {
				if (typingTimeout) {
					clearTimeout(typingTimeout);
					setTypingTimeout(null);
				}
			}
		},
		[sendTyping, chatRoomId, typingTimeout],
	);

	// Mark message as read
	const markAsRead = useCallback(
		(messageId: string) => {
			markMessageAsRead(messageId, chatRoomId);
		},
		[markMessageAsRead, chatRoomId],
	);

	// Cleanup typing timeout on unmount
	useEffect(() => {
		return () => {
			if (typingTimeout) {
				clearTimeout(typingTimeout);
			}
		};
	}, [typingTimeout]);

	return {
		sendMessage: sendMessageHandler,
		sendTyping: sendTypingHandler,
		markAsRead,
		isTyping,
	};
};
```

### 3. Chat Room Management Hook

```typescript
// hooks/useWebSocketChatRooms.ts
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';

interface ChatRoom {
	id: string;
	name?: string;
	type: 'DIRECT' | 'GROUP' | 'LOAD';
	loadId?: string;
	participants: Array<{
		id: string;
		firstName: string;
		lastName: string;
		profilePhoto?: string | null;
		role: string;
	}>;
	createdAt: string;
	updatedAt: string;
}

interface UseWebSocketChatRoomsProps {
	onChatRoomCreated?: (chatRoom: ChatRoom) => void;
	onChatRoomUpdated?: (data: {
		chatRoomId: string;
		updatedChatRoom: ChatRoom;
		updatedBy: string;
	}) => void;
	onParticipantsAdded?: (data: {
		chatRoomId: string;
		newParticipants: any[];
		addedBy: string;
	}) => void;
	onParticipantRemoved?: (data: {
		chatRoomId: string;
		removedUserId: string;
		removedBy: string;
	}) => void;
	onError?: (error: { message: string; details?: string }) => void;
}

export const useWebSocketChatRooms = ({
	onChatRoomCreated,
	onChatRoomUpdated,
	onParticipantsAdded,
	onParticipantRemoved,
	onError,
}: UseWebSocketChatRoomsProps) => {
	const { socket, isConnected } = useWebSocket();
	const [isLoading, setIsLoading] = useState(false);

	// Set up event listeners
	useEffect(() => {
		if (!socket) return;

		const handleChatRoomCreated = (chatRoom: ChatRoom) => {
			onChatRoomCreated?.(chatRoom);
		};

		const handleChatRoomUpdated = (data: {
			chatRoomId: string;
			updatedChatRoom: ChatRoom;
			updatedBy: string;
		}) => {
			onChatRoomUpdated?.(data);
		};

		const handleParticipantsAdded = (data: {
			chatRoomId: string;
			newParticipants: any[];
			addedBy: string;
		}) => {
			onParticipantsAdded?.(data);
		};

		const handleParticipantRemoved = (data: {
			chatRoomId: string;
			removedUserId: string;
			removedBy: string;
		}) => {
			onParticipantRemoved?.(data);
		};

		const handleError = (error: { message: string; details?: string }) => {
			setIsLoading(false);
			onError?.(error);
		};

		// Register event listeners
		socket.on('chatRoomCreated', handleChatRoomCreated);
		socket.on('chatRoomUpdated', handleChatRoomUpdated);
		socket.on('participantsAdded', handleParticipantsAdded);
		socket.on('participantRemoved', handleParticipantRemoved);
		socket.on('error', handleError);

		// Cleanup listeners
		return () => {
			socket.off('chatRoomCreated', handleChatRoomCreated);
			socket.off('chatRoomUpdated', handleChatRoomUpdated);
			socket.off('participantsAdded', handleParticipantsAdded);
			socket.off('participantRemoved', handleParticipantRemoved);
			socket.off('error', handleError);
		};
	}, [
		socket,
		onChatRoomCreated,
		onChatRoomUpdated,
		onParticipantsAdded,
		onParticipantRemoved,
		onError,
	]);

	// Create chat room
	const createChatRoom = useCallback(
		(data: {
			name?: string;
			type: 'DIRECT' | 'GROUP' | 'LOAD';
			loadId?: string;
			participantIds: string[];
		}) => {
			if (socket && isConnected) {
				setIsLoading(true);
				socket.emit('createChatRoom', data);
			}
		},
		[socket, isConnected],
	);

	// Update chat room
	const updateChatRoom = useCallback(
		(data: {
			chatRoomId: string;
			updates: { name?: string; isArchived?: boolean };
		}) => {
			if (socket && isConnected) {
				setIsLoading(true);
				socket.emit('updateChatRoom', data);
			}
		},
		[socket, isConnected],
	);

	// Add participants
	const addParticipants = useCallback(
		(data: { chatRoomId: string; participantIds: string[] }) => {
			if (socket && isConnected) {
				setIsLoading(true);
				socket.emit('addParticipants', data);
			}
		},
		[socket, isConnected],
	);

	// Remove participant
	const removeParticipant = useCallback(
		(data: { chatRoomId: string; participantId: string }) => {
			if (socket && isConnected) {
				setIsLoading(true);
				socket.emit('removeParticipant', data);
			}
		},
		[socket, isConnected],
	);

	return {
		createChatRoom,
		updateChatRoom,
		addParticipants,
		removeParticipant,
		isLoading,
	};
};
```

### 4. Notifications Hook

```typescript
// hooks/useWebSocketNotifications.ts
'use client';

import { useEffect, useCallback } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';

interface Notification {
	id: string;
	title: string;
	message: string;
	type: string;
	isRead: boolean;
	createdAt: string;
	chatRoomId?: string;
}

interface RoleBroadcast {
	role: string;
	message: {
		title: string;
		content: string;
	};
}

interface UseWebSocketNotificationsProps {
	onNotification?: (notification: Notification) => void;
	onRoleBroadcast?: (broadcast: RoleBroadcast) => void;
	onError?: (error: { message: string; details?: string }) => void;
}

export const useWebSocketNotifications = ({
	onNotification,
	onRoleBroadcast,
	onError,
}: UseWebSocketNotificationsProps) => {
	const { socket } = useWebSocket();

	useEffect(() => {
		if (!socket) return;

		const handleNotification = (notification: Notification) => {
			onNotification?.(notification);
		};

		const handleRoleBroadcast = (broadcast: RoleBroadcast) => {
			onRoleBroadcast?.(broadcast);
		};

		const handleError = (error: { message: string; details?: string }) => {
			onError?.(error);
		};

		// Register event listeners
		socket.on('notification', handleNotification);
		socket.on('roleBroadcast', handleRoleBroadcast);
		socket.on('error', handleError);

		// Cleanup listeners
		return () => {
			socket.off('notification', handleNotification);
			socket.off('roleBroadcast', handleRoleBroadcast);
			socket.off('error', handleError);
		};
	}, [socket, onNotification, onRoleBroadcast, onError]);

	// Mark notification as read (if you have this functionality)
	const markNotificationAsRead = useCallback((notificationId: string) => {
		// Implement if your backend supports this
		console.log('Mark notification as read:', notificationId);
	}, []);

	return {
		markNotificationAsRead,
	};
};
```

### 5. Chat Component Example

```typescript
// components/Chat.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWebSocketMessages } from '@/hooks/useWebSocketMessages';

interface ChatProps {
  chatRoomId: string;
  currentUserId: string;
}

export const Chat: React.FC<ChatProps> = ({ chatRoomId, currentUserId }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    sendMessage,
    sendTyping,
    markAsRead,
    isTyping: typingUsers,
  } = useWebSocketMessages({
    chatRoomId,
    onNewMessage: (message) => {
      setMessages(prev => [...prev, message]);
      // Mark message as read if it's not from current user
      if (message.senderId !== currentUserId) {
        markAsRead(message.id);
      }
    },
    onMessageSent: (data) => {
      console.log('Message sent:', data);
    },
    onMessageRead: (data) => {
      console.log('Message read:', data);
      // Update message read status in UI
    },
    onUserTyping: (data) => {
      setIsTyping(prev => ({
        ...prev,
        [data.userId]: data.isTyping
      }));
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle message input change with typing indicator
  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // Send typing indicator
    if (value.trim()) {
      sendTyping(true);

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set new timeout to stop typing indicator
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 1000);
    } else {
      sendTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  // Handle message send
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (newMessage.trim()) {
      sendMessage({
        content: newMessage.trim(),
      });
      setNewMessage('');
      sendTyping(false);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  // Get typing users list
  const typingUsersList = Object.entries(typingUsers)
    .filter(([userId, isTyping]) => isTyping && userId !== currentUserId)
    .map(([userId]) => userId);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                message.senderId === currentUserId
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              <p className="text-sm">{message.content}</p>
              <p className="text-xs opacity-70 mt-1">
                {new Date(message.createdAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {typingUsersList.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-4 py-2 rounded-lg">
              <p className="text-sm text-gray-600">
                {typingUsersList.length === 1 ? 'Someone is typing...' : 'Multiple people are typing...'}
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <form onSubmit={handleSendMessage} className="p-4 border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={handleMessageChange}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};
```

### 6. App Setup

```typescript
// app/layout.tsx или pages/_app.tsx
import { WebSocketProvider } from '@/contexts/WebSocketContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WebSocketProvider>
          {children}
        </WebSocketProvider>
      </body>
    </html>
  );
}
```

### 7. Authentication Integration

```typescript
// hooks/useAuth.ts
'use client';

import { useEffect } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';

export const useAuth = () => {
	const { connect, disconnect, isConnected } = useWebSocket();

	// Connect to WebSocket when user logs in
	const login = async (email: string, password: string) => {
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email, password }),
			});

			const data = await response.json();

			if (data.access_token) {
				// Store token in localStorage or secure storage
				localStorage.setItem('token', data.access_token);

				// Connect to WebSocket with token
				connect(data.access_token);

				return data;
			}
		} catch (error) {
			console.error('Login error:', error);
			throw error;
		}
	};

	// Disconnect from WebSocket when user logs out
	const logout = () => {
		localStorage.removeItem('token');
		disconnect();
	};

	// Auto-connect on app start if token exists
	useEffect(() => {
		const token = localStorage.getItem('token');
		if (token && !isConnected) {
			connect(token);
		}
	}, [connect, isConnected]);

	return {
		login,
		logout,
		isConnected,
	};
};
```

## Environment Variables

Создайте файл `.env.local`:

```env
NEXT_PUBLIC_WS_URL=ws://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Обработка ошибок

### 1. Connection Errors

- Автоматическое переподключение с экспоненциальной задержкой
- Обработка ошибок аутентификации
- Fallback на polling если WebSocket недоступен

### 2. Message Errors

- Retry механизм для отправки сообщений
- Обработка ошибок доставки
- Показ статуса сообщений пользователю

### 3. Network Issues

- Детекция потери соединения
- Очередь сообщений для офлайн режима
- Синхронизация при восстановлении соединения

## Best Practices

### 1. Performance

- Используйте `useCallback` для стабильности ссылок
- Очищайте таймауты при размонтировании компонентов
- Ограничивайте количество перерендеров

### 2. Security

- Никогда не храните токены в localStorage в production
- Используйте httpOnly cookies для токенов
- Валидируйте все входящие данные

### 3. UX

- Показывайте статус соединения
- Предупреждайте о проблемах с сетью
- Обеспечивайте плавную работу в офлайн режиме

## Тестирование

### 1. Unit Tests

```typescript
// __tests__/WebSocketContext.test.tsx
import { renderHook, act } from '@testing-library/react';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
	io: jest.fn(() => ({
		on: jest.fn(),
		off: jest.fn(),
		emit: jest.fn(),
		disconnect: jest.fn(),
	})),
}));

describe('WebSocketContext', () => {
	it('should connect with valid token', () => {
		const { result } = renderHook(() => useWebSocket(), {
			wrapper: WebSocketProvider,
		});

		act(() => {
			result.current.connect('valid-token');
		});

		expect(result.current.isConnected).toBe(true);
	});
});
```

### 2. Integration Tests

- Тестируйте полный цикл отправки сообщений
- Проверяйте обработку ошибок
- Тестируйте переподключение

## Troubleshooting

### Common Issues

1. **Connection Failed**
    - Проверьте CORS настройки на бэкенде
    - Убедитесь что токен валидный
    - Проверьте URL WebSocket сервера (без `/chat` namespace)
    - Убедитесь что namespace `/chat` удален из бэкенда

2. **Messages Not Received**
    - Проверьте что пользователь присоединен к комнате
    - Убедитесь что обработчики событий зарегистрированы
    - Проверьте что URL не содержит `/chat` namespace

3. **Typing Indicators Not Working**
    - Проверьте debouncing логику
    - Убедитесь что таймауты очищаются
    - Проверьте права доступа к комнате

4. **Namespace Issues**
    - Если видите ошибки с namespace, убедитесь что бэкенд не использует `namespace: '/chat'`
    - Подключайтесь к базовому URL: `ws://localhost:3000` вместо `ws://localhost:3000/chat`
    - Проверьте что на хостинге (Render.com) нет ограничений на namespace

### Debug Mode

Включите debug режим для Socket.IO:

```typescript
const socket = io(url, {
	auth: { token },
	debug: true, // Enable debug logs
});
```

## Заключение

Эта интеграция обеспечивает полную функциональность real-time чата с вашим NestJS бэкендом. WebSocket соединение автоматически управляется, включая переподключение и обработку ошибок. Все основные функции чата (сообщения, typing indicators, уведомления) реализованы с учетом best practices для production использования.
