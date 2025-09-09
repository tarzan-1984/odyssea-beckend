# WebSocket API Documentation

## Обзор

WebSocket API обеспечивает real-time коммуникацию для чат-системы. Все события происходят в namespace `/chat` и требуют JWT аутентификации.

## Подключение

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000/chat', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

## События

### Подключение и отключение

#### `connected`
Срабатывает при успешном подключении к WebSocket серверу.

**Ответ:**
```javascript
{
  userId: "user_123",
  userRole: "DRIVER",
  chatRooms: 5
}
```

#### `disconnect`
Срабатывает при отключении от сервера.

### Управление чат-комнатами

#### `joinChatRoom`
Присоединиться к чат-комнате.

**Отправка:**
```javascript
socket.emit('joinChatRoom', {
  chatRoomId: "chat_room_123"
});
```

**Ответы:**
- `joinedChatRoom` - успешное присоединение
- `userJoined` - уведомление другим участникам
- `error` - ошибка доступа

#### `leaveChatRoom`
Покинуть чат-комнату.

**Отправка:**
```javascript
socket.emit('leaveChatRoom', {
  chatRoomId: "chat_room_123"
});
```

**Ответы:**
- `leftChatRoom` - успешный выход
- `userLeft` - уведомление другим участникам

#### `createChatRoom`
Создать новую чат-комнату.

**Отправка:**
```javascript
socket.emit('createChatRoom', {
  name: "Load #12345 Discussion", // опционально
  type: "LOAD", // DIRECT, GROUP, LOAD
  loadId: "load_123", // опционально
  participantIds: ["user_1", "user_2"]
});
```

**Ответы:**
- `chatRoomCreated` - комната создана
- `error` - ошибка создания

#### `updateChatRoom`
Обновить информацию о чат-комнате.

**Отправка:**
```javascript
socket.emit('updateChatRoom', {
  chatRoomId: "chat_room_123",
  updates: {
    name: "New Room Name", // опционально
    isArchived: false // опционально
  }
});
```

**Ответы:**
- `chatRoomUpdated` - комната обновлена
- `error` - ошибка обновления

#### `addParticipants`
Добавить участников в чат-комнату.

**Отправка:**
```javascript
socket.emit('addParticipants', {
  chatRoomId: "chat_room_123",
  participantIds: ["user_3", "user_4"]
});
```

**Ответы:**
- `participantsAdded` - участники добавлены
- `addedToChatRoom` - уведомление новым участникам
- `error` - ошибка добавления

#### `removeParticipant`
Удалить участника из чат-комнаты.

**Отправка:**
```javascript
socket.emit('removeParticipant', {
  chatRoomId: "chat_room_123",
  participantId: "user_3"
});
```

**Ответы:**
- `participantRemoved` - участник удален
- `removedFromChatRoom` - уведомление удаленному участнику
- `error` - ошибка удаления

### Сообщения

#### `sendMessage`
Отправить сообщение через WebSocket.

**Отправка:**
```javascript
socket.emit('sendMessage', {
  chatRoomId: "chat_room_123",
  content: "Hello! How is the delivery going?",
  fileUrl: "https://drive.google.com/file/123", // опционально
  fileName: "delivery_photo.jpg", // опционально
  fileSize: 1024000 // опционально
});
```

**Ответы:**
- `messageSent` - сообщение отправлено
- `newMessage` - новое сообщение для всех участников
- `error` - ошибка отправки

#### `messageDelivered`
Подтвердить доставку сообщения.

**Отправка:**
```javascript
socket.emit('messageDelivered', {
  messageId: "message_123",
  chatRoomId: "chat_room_123"
});
```

**Ответы:**
- `messageDeliveredConfirmed` - подтверждение получено

#### `messageRead`
Отметить сообщение как прочитанное.

**Отправка:**
```javascript
socket.emit('messageRead', {
  messageId: "message_123",
  chatRoomId: "chat_room_123"
});
```

**Ответы:**
- `messageRead` - уведомление отправителю о прочтении

### Индикаторы печати

#### `typing`
Отправить индикатор печати.

**Отправка:**
```javascript
// Начать печатать
socket.emit('typing', {
  chatRoomId: "chat_room_123",
  isTyping: true
});

// Остановить печатать
socket.emit('typing', {
  chatRoomId: "chat_room_123",
  isTyping: false
});
```

**Ответы:**
- `userTyping` - индикатор печати для других участников

**Примечание:** Индикатор автоматически исчезает через 3 секунды, если не отправлен `isTyping: false`.

### Уведомления

#### `notification`
Получить уведомление от системы.

**Структура:**
```javascript
{
  id: "notification_123",
  title: "New Message",
  message: "You have a new message in Load #12345",
  type: "MESSAGE",
  isRead: false,
  createdAt: "2024-01-15T11:00:00Z"
}
```

#### `roleBroadcast`
Широковещательное сообщение для роли.

**Структура:**
```javascript
{
  role: "DRIVER",
  message: {
    title: "System Maintenance",
    content: "System will be down for maintenance at 2 AM"
  }
}
```

## Обработка ошибок

Все ошибки приходят в событии `error`:

```javascript
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
  // error.message - описание ошибки
  // error.details - дополнительные детали (опционально)
});
```

## Примеры использования

### Базовое подключение и отправка сообщения

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000/chat', {
  auth: {
    token: localStorage.getItem('jwt-token')
  }
});

// Обработка подключения
socket.on('connected', (data) => {
  console.log('Connected:', data);
  
  // Присоединиться к чат-комнате
  socket.emit('joinChatRoom', {
    chatRoomId: 'chat_room_123'
  });
});

// Обработка новых сообщений
socket.on('newMessage', (data) => {
  console.log('New message:', data.message);
  // Обновить UI с новым сообщением
});

// Отправка сообщения
function sendMessage(chatRoomId, content) {
  socket.emit('sendMessage', {
    chatRoomId,
    content
  });
}

// Индикатор печати
function startTyping(chatRoomId) {
  socket.emit('typing', {
    chatRoomId,
    isTyping: true
  });
}

function stopTyping(chatRoomId) {
  socket.emit('typing', {
    chatRoomId,
    isTyping: false
  });
}
```

### Создание чат-комнаты

```javascript
// Создать групповую чат-комнату
socket.emit('createChatRoom', {
  name: 'Team Discussion',
  type: 'GROUP',
  participantIds: ['user_1', 'user_2', 'user_3']
});

// Создать чат-комнату для груза
socket.emit('createChatRoom', {
  name: 'Load #12345 Discussion',
  type: 'LOAD',
  loadId: 'load_123',
  participantIds: ['driver_1', 'dispatcher_1']
});

// Создать прямой чат
socket.emit('createChatRoom', {
  type: 'DIRECT',
  participantIds: ['user_1', 'user_2']
});
```

### Управление участниками

```javascript
// Добавить участников
socket.emit('addParticipants', {
  chatRoomId: 'chat_room_123',
  participantIds: ['user_4', 'user_5']
});

// Удалить участника
socket.emit('removeParticipant', {
  chatRoomId: 'chat_room_123',
  participantId: 'user_4'
});
```

## Безопасность

1. **Аутентификация**: Все WebSocket соединения требуют валидный JWT токен
2. **Авторизация**: Проверка прав доступа к чат-комнатам
3. **Валидация**: Все входящие данные валидируются
4. **Логирование**: Все действия логируются для аудита

## Производительность

1. **Масштабирование**: Используйте Redis для кластеризации в продакшене
2. **Таймауты**: Индикаторы печати автоматически исчезают через 3 секунды
3. **Очистка**: Соединения автоматически очищаются при отключении
4. **Мониторинг**: Доступны методы для мониторинга онлайн пользователей

## Отладка

Включите подробное логирование в development режиме:

```javascript
const socket = io('ws://localhost:3000/chat', {
  auth: {
    token: 'your-jwt-token'
  },
  transports: ['websocket', 'polling']
});

// Логирование всех событий
socket.onAny((event, ...args) => {
  console.log('Socket event:', event, args);
});
```
