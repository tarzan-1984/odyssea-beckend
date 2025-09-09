# WebSocket Chat Setup Guide

## Обзор

Этот гайд поможет вам настроить и протестировать WebSocket функциональность для чат-системы в вашем NestJS приложении.

## Что было реализовано

### 1. Улучшенный ChatGateway
- ✅ Обработка отправки сообщений через WebSocket
- ✅ Улучшенная система индикаторов печати с автоматическим таймаутом
- ✅ Создание и обновление чат-комнат через WebSocket
- ✅ Управление участниками чат-комнат
- ✅ Система уведомлений о статусе сообщений

### 2. Интеграция с существующими сервисами
- ✅ Автоматическая рассылка сообщений через WebSocket при отправке через HTTP API
- ✅ Расширенные методы в ChatRoomsService
- ✅ Полная интеграция с системой аутентификации

### 3. Документация и тестирование
- ✅ Подробная документация API
- ✅ Тестовый клиент на TypeScript
- ✅ HTML интерфейс для тестирования в браузере

## Быстрый старт

### 1. Убедитесь, что сервер запущен

```bash
npm run start:dev
```

### 2. Получите JWT токен

Сначала авторизуйтесь через API и получите JWT токен:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com", "password": "your-password"}'
```

### 3. Тестирование через HTML интерфейс

1. Откройте `test-websocket.html` в браузере
2. Вставьте полученный JWT токен
3. Нажмите "Connect"
4. Создайте или присоединитесь к чат-комнате
5. Начните отправлять сообщения!

### 4. Тестирование через TypeScript клиент

```bash
# Установите зависимости для тестирования
npm install socket.io-client

# Запустите тестовый скрипт
npx ts-node src/scripts/test-websocket.ts
```

## API События

### Подключение
```javascript
const socket = io('http://localhost:3000/chat', {
  auth: { token: 'your-jwt-token' }
});
```

### Основные события

#### Создание чат-комнаты
```javascript
socket.emit('createChatRoom', {
  name: 'My Chat Room',
  type: 'GROUP',
  participantIds: ['user1', 'user2']
});
```

#### Присоединение к комнате
```javascript
socket.emit('joinChatRoom', {
  chatRoomId: 'room_123'
});
```

#### Отправка сообщения
```javascript
socket.emit('sendMessage', {
  chatRoomId: 'room_123',
  content: 'Hello everyone!'
});
```

#### Индикатор печати
```javascript
// Начать печатать
socket.emit('typing', {
  chatRoomId: 'room_123',
  isTyping: true
});

// Остановить печатать
socket.emit('typing', {
  chatRoomId: 'room_123',
  isTyping: false
});
```

## Конфигурация

### Переменные окружения

Убедитесь, что в вашем `.env` файле установлены:

```env
# WebSocket настройки
FRONTEND_URL=http://localhost:3000

# JWT настройки
JWT_SECRET=your-jwt-secret

# База данных
DATABASE_URL=your-database-url
```

### CORS настройки

WebSocket сервер настроен для работы с фронтендом по адресу `FRONTEND_URL`. Если ваш фронтенд работает на другом порту, обновите настройки в `chat.gateway.ts`:

```typescript
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
```

## Производственное развертывание

### 1. Redis для кластеризации

Для масштабирования в продакшене рекомендуется использовать Redis:

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io redis socket.io-redis
```

### 2. Мониторинг

Добавьте метрики для мониторинга:

```typescript
// В ChatGateway
getOnlineUsersCount(): number {
  return this.userSockets.size;
}

isUserOnline(userId: string): boolean {
  return this.userSockets.has(userId);
}
```

### 3. Логирование

Все WebSocket события логируются. Для продакшена настройте структурированное логирование:

```typescript
console.log(`User ${userId} sent message in room ${chatRoomId}`);
```

## Отладка

### 1. Включите подробное логирование

```javascript
const socket = io('http://localhost:3000/chat', {
  auth: { token: 'your-jwt-token' }
});

// Логирование всех событий
socket.onAny((event, ...args) => {
  console.log('Socket event:', event, args);
});
```

### 2. Проверьте соединение

```javascript
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

### 3. Обработка ошибок

```javascript
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});
```

## Безопасность

### 1. Аутентификация
- Все WebSocket соединения требуют валидный JWT токен
- Токен проверяется при каждом подключении

### 2. Авторизация
- Проверка прав доступа к чат-комнатам
- Валидация всех входящих данных

### 3. Rate Limiting
- Рекомендуется добавить rate limiting для WebSocket событий
- Ограничение частоты отправки сообщений

## Производительность

### 1. Оптимизация соединений
- Автоматическая очистка неактивных соединений
- Таймауты для индикаторов печати

### 2. Масштабирование
- Используйте Redis для кластеризации
- Load balancer с sticky sessions

### 3. Мониторинг
- Отслеживание количества активных соединений
- Мониторинг производительности WebSocket событий

## Поддержка

Если у вас возникли проблемы:

1. Проверьте логи сервера
2. Убедитесь, что JWT токен валиден
3. Проверьте CORS настройки
4. Используйте HTML тестовый интерфейс для отладки

## Дополнительные ресурсы

- [Socket.IO Documentation](https://socket.io/docs/)
- [NestJS WebSockets](https://docs.nestjs.com/websockets/gateways)
- [WebSocket API Documentation](./WEBSOCKET_API.md)
