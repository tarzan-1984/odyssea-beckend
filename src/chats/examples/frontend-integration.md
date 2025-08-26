# Frontend Integration Examples

This document provides practical examples of how to integrate the chat functionality with your frontend application.

## React/TypeScript Example

### 1. Chat Context Provider

```typescript
// src/contexts/ChatContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface ChatContextType {
  socket: Socket | null;
  isConnected: boolean;
  chatRooms: ChatRoom[];
  currentChatRoom: ChatRoom | null;
  messages: Message[];
  sendMessage: (content: string, fileUrl?: string) => Promise<void>;
  createChatRoom: (participantIds: string[], type: 'DIRECT' | 'GROUP') => Promise<void>;
  joinChatRoom: (chatRoomId: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [currentChatRoom, setCurrentChatRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;

    const newSocket = io('http://localhost:3000/chat', {
      auth: { token }
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to chat server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from chat server');
    });

    newSocket.on('newMessage', (data) => {
      if (data.chatRoomId === currentChatRoom?.id) {
        setMessages(prev => [...prev, data.message]);
      }
      // Update chat rooms list to show new message
      updateChatRooms();
    });

    newSocket.on('userTyping', (data) => {
      // Handle typing indicators
      console.log('User typing:', data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const sendMessage = async (content: string, fileUrl?: string) => {
    if (!currentChatRoom || !socket) return;

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        },
        body: JSON.stringify({
          chatRoomId: currentChatRoom.id,
          content,
          fileUrl,
          fileName: fileUrl ? 'attached_file' : undefined,
          fileSize: fileUrl ? 0 : undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const createChatRoom = async (participantIds: string[], type: 'DIRECT' | 'GROUP') => {
    try {
      const response = await fetch('/api/chat-rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        },
        body: JSON.stringify({
          type,
          participantIds
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create chat room');
      }

      const chatRoom = await response.json();
      setChatRooms(prev => [...prev, chatRoom]);
      setCurrentChatRoom(chatRoom);
    } catch (error) {
      console.error('Error creating chat room:', error);
    }
  };

  const joinChatRoom = (chatRoomId: string) => {
    if (!socket) return;

    socket.emit('joinChatRoom', { chatRoomId });
    loadChatRoomMessages(chatRoomId);
  };

  const loadChatRoomMessages = async (chatRoomId: string) => {
    try {
      const response = await fetch(`/api/messages/chat-room/${chatRoomId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load messages');
      }

      const data = await response.json();
      setMessages(data.messages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const updateChatRooms = async () => {
    try {
      const response = await fetch('/api/chat-rooms', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load chat rooms');
      }

      const rooms = await response.json();
      setChatRooms(rooms);
    } catch (error) {
      console.error('Error updating chat rooms:', error);
    }
  };

  useEffect(() => {
    updateChatRooms();
  }, []);

  return (
    <ChatContext.Provider value={{
      socket,
      isConnected,
      chatRooms,
      currentChatRoom,
      messages,
      sendMessage,
      createChatRoom,
      joinChatRoom
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
```

### 2. Chat Room List Component

```typescript
// src/components/ChatRoomList.tsx
import React from 'react';
import { useChat } from '../contexts/ChatContext';

export const ChatRoomList: React.FC = () => {
  const { chatRooms, currentChatRoom, joinChatRoom } = useChat();

  return (
    <div className="chat-room-list">
      <h3>Chats</h3>
      {chatRooms.map((room) => (
        <div
          key={room.id}
          className={`chat-room-item ${currentChatRoom?.id === room.id ? 'active' : ''}`}
          onClick={() => joinChatRoom(room.id)}
        >
          <div className="chat-room-info">
            <h4>{room.name}</h4>
            {room.lastMessage && (
              <p className="last-message">
                {room.lastMessage.sender.firstName}: {room.lastMessage.content}
              </p>
            )}
          </div>
          {room.unreadCount > 0 && (
            <span className="unread-badge">{room.unreadCount}</span>
          )}
        </div>
      ))}
    </div>
  );
};
```

### 3. Chat Messages Component

```typescript
// src/components/ChatMessages.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../contexts/ChatContext';

export const ChatMessages: React.FC = () => {
  const { currentChatRoom, messages, sendMessage } = useChat();
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    await sendMessage(newMessage);
    setNewMessage('');
    setIsTyping(false);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!isTyping) {
      setIsTyping(true);
      // Emit typing indicator
    }
  };

  if (!currentChatRoom) {
    return <div className="no-chat-selected">Select a chat to start messaging</div>;
  }

  return (
    <div className="chat-messages">
      <div className="chat-header">
        <h3>{currentChatRoom.name}</h3>
        <span className="participant-count">
          {currentChatRoom.participants.length} participants
        </span>
      </div>

      <div className="messages-container">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.sender.id === 'current-user-id' ? 'own' : 'other'}`}
          >
            <div className="message-header">
              <span className="sender-name">
                {message.sender.firstName} {message.sender.lastName}
              </span>
              <span className="message-time">
                {new Date(message.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">
              {message.content}
              {message.fileUrl && (
                <div className="file-attachment">
                  <a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
                    📎 {message.fileName}
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input">
        <input
          type="text"
          value={newMessage}
          onChange={handleTyping}
          placeholder="Type a message..."
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <button onClick={handleSendMessage}>Send</button>
      </div>
    </div>
  );
};
```

### 4. File Upload Component

```typescript
// src/components/FileUpload.tsx
import React, { useState } from 'react';

interface FileUploadProps {
  onFileUploaded: (fileData: { url: string; fileName: string; fileSize: number }) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUploaded }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/messages/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const fileData = await response.json();
      onFileUploaded(fileData);
    } catch (error) {
      console.error('Upload error:', error);
      alert('File upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="file-upload">
      <input
        type="file"
        onChange={handleFileSelect}
        disabled={isUploading}
        accept="image/*,application/pdf,text/*"
      />
      {isUploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span>{uploadProgress}%</span>
        </div>
      )}
    </div>
  );
};
```

### 5. User Search Component

```typescript
// src/components/UserSearch.tsx
import React, { useState, useEffect } from 'react';
import { useChat } from '../contexts/ChatContext';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  profilePhoto?: string;
}

export const UserSearch: React.FC = () => {
  const { createChatRoom } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(`/api/chat-rooms/search/users?query=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const users = await response.json();
      setSearchResults(users);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const handleUserSelect = (user: User) => {
    if (!selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers(prev => [...prev, user]);
    }
  };

  const handleUserDeselect = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
  };

  const startChat = async () => {
    if (selectedUsers.length === 0) return;

    const participantIds = selectedUsers.map(u => u.id);
    const type = selectedUsers.length === 1 ? 'DIRECT' : 'GROUP';

    await createChatRoom(participantIds, type);
    setSelectedUsers([]);
    setSearchQuery('');
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  return (
    <div className="user-search">
      <div className="search-input">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for users..."
        />
      </div>

      {searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.map((user) => (
            <div
              key={user.id}
              className="search-result-item"
              onClick={() => handleUserSelect(user)}
            >
              <img 
                src={user.profilePhoto || '/default-avatar.png'} 
                alt="Profile" 
                className="profile-photo"
              />
              <div className="user-info">
                <span className="user-name">
                  {user.firstName} {user.lastName}
                </span>
                <span className="user-role">{user.role}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedUsers.length > 0 && (
        <div className="selected-users">
          <h4>Selected Users:</h4>
          {selectedUsers.map((user) => (
            <div key={user.id} className="selected-user">
              <span>{user.firstName} {user.lastName}</span>
              <button onClick={() => handleUserDeselect(user.id)}>Remove</button>
            </div>
          ))}
          <button onClick={startChat} className="start-chat-btn">
            Start Chat
          </button>
        </div>
      )}
    </div>
  );
};
```

## Vue.js Example

### 1. Chat Store (Pinia)

```typescript
// src/stores/chat.ts
import { defineStore } from 'pinia';
import { io, Socket } from 'socket.io-client';

interface ChatState {
  socket: Socket | null;
  isConnected: boolean;
  chatRooms: ChatRoom[];
  currentChatRoom: ChatRoom | null;
  messages: Message[];
}

export const useChatStore = defineStore('chat', {
  state: (): ChatState => ({
    socket: null,
    isConnected: false,
    chatRooms: [],
    currentChatRoom: null,
    messages: []
  }),

  actions: {
    connect() {
      const token = localStorage.getItem('jwt_token');
      if (!token) return;

      this.socket = io('http://localhost:3000/chat', {
        auth: { token }
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.loadChatRooms();
      });

      this.socket.on('newMessage', (data) => {
        if (data.chatRoomId === this.currentChatRoom?.id) {
          this.messages.push(data.message);
        }
        this.loadChatRooms();
      });
    },

    async loadChatRooms() {
      try {
        const response = await fetch('/api/chat-rooms', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
          }
        });
        this.chatRooms = await response.json();
      } catch (error) {
        console.error('Error loading chat rooms:', error);
      }
    },

    async sendMessage(content: string, fileUrl?: string) {
      if (!this.currentChatRoom) return;

      try {
        await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
          },
          body: JSON.stringify({
            chatRoomId: this.currentChatRoom.id,
            content,
            fileUrl
          })
        });
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  }
});
```

## Angular Example

### 1. Chat Service

```typescript
// src/app/services/chat.service.ts
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private socket: Socket;
  private chatRoomsSubject = new BehaviorSubject<ChatRoom[]>([]);
  private messagesSubject = new BehaviorSubject<Message[]>([]);

  chatRooms$ = this.chatRoomsSubject.asObservable();
  messages$ = this.messagesSubject.asObservable();

  constructor() {
    this.initializeSocket();
  }

  private initializeSocket() {
    const token = localStorage.getItem('jwt_token');
    this.socket = io(`${environment.apiUrl}/chat`, {
      auth: { token }
    });

    this.socket.on('connect', () => {
      console.log('Connected to chat server');
      this.loadChatRooms();
    });

    this.socket.on('newMessage', (data) => {
      const currentMessages = this.messagesSubject.value;
      this.messagesSubject.next([...currentMessages, data.message]);
    });
  }

  async loadChatRooms() {
    try {
      const response = await fetch('/api/chat-rooms', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        }
      });
      const chatRooms = await response.json();
      this.chatRoomsSubject.next(chatRooms);
    } catch (error) {
      console.error('Error loading chat rooms:', error);
    }
  }

  async sendMessage(content: string, chatRoomId: string) {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        },
        body: JSON.stringify({
          chatRoomId,
          content
        })
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
}
```

## CSS Styling Examples

### 1. Basic Chat Styling

```css
/* src/styles/chat.css */
.chat-container {
  display: flex;
  height: 100vh;
  background: #f5f5f5;
}

.chat-room-list {
  width: 300px;
  background: white;
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
}

.chat-room-item {
  padding: 15px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.2s;
}

.chat-room-item:hover {
  background-color: #f8f9fa;
}

.chat-room-item.active {
  background-color: #e3f2fd;
  border-left: 4px solid #2196f3;
}

.chat-messages {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-header {
  padding: 15px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.messages-container {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
}

.message {
  margin-bottom: 15px;
  max-width: 70%;
}

.message.own {
  margin-left: auto;
}

.message.other {
  margin-right: auto;
}

.message-content {
  padding: 10px 15px;
  border-radius: 18px;
  background: white;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.message.own .message-content {
  background: #2196f3;
  color: white;
}

.message-input {
  padding: 15px;
  background: white;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 10px;
}

.message-input input {
  flex: 1;
  padding: 10px;
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  outline: none;
}

.message-input button {
  padding: 10px 20px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
}

.unread-badge {
  background: #f44336;
  color: white;
  border-radius: 50%;
  padding: 2px 6px;
  font-size: 12px;
  min-width: 18px;
  text-align: center;
}
```

## Testing Examples

### 1. Jest Test for Chat Service

```typescript
// src/services/__tests__/chat.service.test.ts
import { ChatService } from '../chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      on: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn()
    };

    jest.mock('socket.io-client', () => ({
      io: jest.fn(() => mockSocket)
    }));

    service = new ChatService();
  });

  it('should connect to socket on initialization', () => {
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('should handle new messages', () => {
    const mockMessage = { id: '1', content: 'Test message' };
    const mockData = { chatRoomId: 'room1', message: mockMessage };

    // Simulate new message event
    const connectCallback = mockSocket.on.mock.calls.find(
      call => call[0] === 'newMessage'
    )[1];
    connectCallback(mockData);

    expect(service.messages).toContain(mockMessage);
  });
});
```

## Performance Tips

1. **Debounce search queries** to avoid excessive API calls
2. **Virtualize long message lists** for better performance
3. **Lazy load chat rooms** and messages
4. **Cache user data** to reduce API calls
5. **Use WebSocket reconnection** with exponential backoff
6. **Implement message queuing** for offline scenarios
7. **Optimize file uploads** with progress indicators and chunking

## Error Handling

1. **Network errors** - Implement retry logic
2. **Authentication errors** - Redirect to login
3. **File upload errors** - Show user-friendly error messages
4. **WebSocket disconnections** - Automatic reconnection
5. **Rate limiting** - Show appropriate messages to users

