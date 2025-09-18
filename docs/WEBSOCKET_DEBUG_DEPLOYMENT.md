# WebSocket Debug Guide for Render.com Deployment

## Проблема

Фронтенд успешно подключается к WebSocket и отправляет события, но сервер не отвечает.

## Что было исправлено

### 1. CORS настройки в main.ts

- Добавлен `process.env.FRONTEND_URL` в список разрешенных origins
- Расширены методы HTTP (добавлены PUT, DELETE)
- Добавлен заголовок `X-Requested-With`

### 2. WebSocket адаптер

- Настроен с правильными CORS параметрами
- Добавлена поддержка транспортов `websocket` и `polling`

### 3. Подробное логирование

Добавлено логирование с эмодзи для легкой идентификации:

#### JWT Guard (ws-jwt.guard.ts)

- 🔐 Попытка аутентификации
- ✅ Успешная аутентификация
- ❌ Ошибка аутентификации

#### Chat Gateway (chat.gateway.ts)

- 🟡 Попытка подключения
- ✅ Пользователь аутентифицирован
- 📝 Socket сохранен
- 🏠 Чат-комнаты пользователя
- 🚪 Присоединение к комнатам
- 👤 Присоединение к ролевой комнате
- 🎉 Полное подключение

#### События

- 🔵 joinChatRoom event received
- 🟢 sendMessage event received
- 🔍 Проверка доступа
- ✅ Доступ подтвержден
- 💾 Создание сообщения
- 📢 Трансляция сообщения
- 📤 Подтверждение отправлено

## Как отладить на Render.com

### 1. Деплой с новым кодом

```bash
git add .
git commit -m "Fix WebSocket CORS and add detailed logging"
git push origin main
```

### 2. Проверка логов на Render.com

1. Зайдите в панель Render.com
2. Выберите ваш сервис
3. Перейдите в раздел "Logs"
4. Очистите логи (Clear logs)
5. Попробуйте подключиться с фронтенда

### 3. Что искать в логах

#### Успешное подключение должно показать:

```
🟡 WebSocket connection attempt: { socketId: '...', userId: '...', ... }
🔐 WebSocket JWT Guard: { socketId: '...', hasToken: true, ... }
✅ WebSocket JWT Guard: Authentication successful { userId: '...', userRole: '...' }
✅ WebSocket connection: User authenticated { userId: '...', userRole: '...' }
📝 WebSocket connection: User socket stored { userId: '...', socketId: '...' }
🏠 WebSocket connection: User chat rooms { userId: '...', chatRoomsCount: X }
🚪 WebSocket connection: Joined room { userId: '...', roomId: '...' }
👤 WebSocket connection: Joined role room { userId: '...', role: '...' }
🎉 WebSocket connection: User fully connected { userId: '...', ... }
```

#### При отправке сообщения должно показать:

```
🟢 WebSocket sendMessage event received: { data: {...}, userId: '...', ... }
🔍 WebSocket sendMessage: Verifying access to room { userId: '...', chatRoomId: '...' }
✅ WebSocket sendMessage: Access verified { userId: '...', chatRoomId: '...', roomName: '...' }
💾 WebSocket sendMessage: Creating message { userId: '...', chatRoomId: '...', contentLength: X }
✅ WebSocket sendMessage: Message created { userId: '...', chatRoomId: '...', messageId: '...' }
📢 WebSocket sendMessage: Message broadcasted { userId: '...', chatRoomId: '...', messageId: '...' }
📤 WebSocket sendMessage: Confirmation sent to sender { userId: '...', chatRoomId: '...', messageId: '...' }
🎉 WebSocket sendMessage: Message sent successfully { userId: '...', ... }
```

### 4. Возможные проблемы и решения

#### Проблема: Нет логов подключения

**Причина:** WebSocket не подключается
**Решение:**

- Проверить CORS настройки
- Проверить URL подключения на фронтенде
- Проверить, что сервер запущен

#### Проблема: Есть логи подключения, но нет логов событий

**Причина:** События не доходят до сервера
**Решение:**

- Проверить, что фронтенд отправляет события правильно
- Проверить, что используется правильный namespace (без `/chat`)

#### Проблема: Есть логи событий, но ошибки

**Причина:** Проблемы с базой данных или сервисами
**Решение:**

- Проверить подключение к базе данных
- Проверить, что все сервисы работают
- Проверить права доступа пользователя

#### Проблема: Все логи есть, но фронтенд не получает ответы

**Причина:** Проблемы с трансляцией событий
**Решение:**

- Проверить, что пользователь присоединен к правильным комнатам
- Проверить, что события отправляются в правильные комнаты

### 5. Переменные окружения

Убедитесь, что на Render.com установлены:

```
FRONTEND_URL=https://your-frontend-domain.com
JWT_SECRET=your-jwt-secret
DATABASE_URL=your-database-url
```

### 6. Тестирование

1. Откройте фронтенд
2. Откройте DevTools (F12)
3. Перейдите в Console
4. Попробуйте отправить сообщение
5. Проверьте логи на Render.com

## Дополнительные проверки

### Проверка WebSocket подключения

В консоли браузера выполните:

```javascript
// Проверить статус подключения
console.log('Socket connected:', socket.connected);
console.log('Socket ID:', socket.id);

// Проверить комнаты
console.log('Socket rooms:', socket.rooms);
```

### Проверка событий

```javascript
// Слушать все события
socket.onAny((event, ...args) => {
	console.log('Received event:', event, args);
});
```

## Контакты

Если проблемы продолжаются, предоставьте:

1. Логи с Render.com
2. Логи из консоли браузера
3. Скриншот Network tab в DevTools
4. Информацию о том, на каком этапе происходит сбой
