# Система нотификаций Odyssea

## Обзор

Система нотификаций Odyssea автоматически отправляет email уведомления пользователям о непрочитанных сообщениях в чатах. Система работает с помощью крон-задач, которые выполняются каждые 15 минут.

## Компоненты системы

### 1. NotificationsService
- **Файл**: `src/notifications/notifications.service.ts`
- **Функции**:
  - Отправка уведомлений о непрочитанных сообщениях
  - Создание записей уведомлений в базе данных
  - Получение уведомлений пользователя
  - Отметка уведомлений как прочитанных

### 2. NotificationsController
- **Файл**: `src/notifications/notifications.controller.ts`
- **Эндпоинты**:
  - `GET /notifications` - Получить уведомления пользователя
  - `POST /notifications/:id/read` - Отметить уведомление как прочитанное
  - `POST /notifications/mark-all-read` - Отметить все уведомления как прочитанные

### 3. NotificationsCron
- **Файл**: `src/notifications/notifications.cron.ts`
- **Функции**:
  - Крон-задача каждые 15 минут для проверки непрочитанных сообщений
  - Автоматическая отправка email уведомлений

## Настройка

### Переменные окружения

Добавьте следующие переменные в ваш `.env` файл:

```env
# URL фронтенда для ссылок в email
FRONTEND_URL="https://your-frontend-domain.com"

# SMTP настройки для отправки email
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="your-email@gmail.com"
```

### Зависимости

Убедитесь, что установлена зависимость для крон-задач:

```bash
npm install @nestjs/schedule
```

## Как это работает

### 1. Проверка непрочитанных сообщений

Каждые 15 минут крон-задача:
1. Ищет все непрочитанные сообщения в базе данных
2. Группирует их по пользователям и чатам
3. Для каждого пользователя с непрочитанными сообщениями отправляет email

### 2. Отправка email уведомлений

Email содержит:
- Красивый HTML шаблон с логотипом Odyssea
- Список чатов с непрочитанными сообщениями
- Количество непрочитанных сообщений для каждого чата
- Прямые ссылки на чаты
- Кнопку для открытия всех чатов

### 3. Управление уведомлениями

Пользователи могут:
- Просматривать свои уведомления через API
- Отмечать уведомления как прочитанные
- Отмечать все уведомления как прочитанные

## API Endpoints

### Получить уведомления пользователя
```http
GET /notifications?page=1&limit=20
Authorization: Bearer <jwt-token>
```

**Ответ:**
```json
{
  "notifications": [
    {
      "id": "notification-id",
      "title": "Новое сообщение",
      "message": "У вас есть непрочитанные сообщения",
      "type": "message",
      "isRead": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

### Отметить уведомление как прочитанное
```http
POST /notifications/:id/read
Authorization: Bearer <jwt-token>
```

### Отметить все уведомления как прочитанные
```http
POST /notifications/mark-all-read
Authorization: Bearer <jwt-token>
```

## Тестирование

### Ручное тестирование

Запустите тестовый скрипт для проверки работы системы:

```bash
npm run test:notifications
```

### Проверка крон-задач

Крон-задачи автоматически запускаются при старте приложения. Логи можно найти в консоли:

```
[NotificationsCron] Running unread message notifications cron job...
[NotificationsService] Starting unread message notifications check...
[NotificationsService] Found 3 users with unread messages
[NotificationsService] Notification sent successfully to user@example.com
```

## Настройка частоты уведомлений

Для изменения частоты отправки уведомлений отредактируйте файл `src/notifications/notifications.cron.ts`:

```typescript
// Каждые 15 минут
@Cron('0 */15 * * * *')

// Каждые 30 минут
@Cron('0 */30 * * * *')

// Каждый час
@Cron('0 0 * * * *')
```

## Безопасность

- Все API endpoints защищены JWT аутентификацией
- Email уведомления отправляются только авторизованным пользователям
- Пользователи могут отписаться от уведомлений через администратора

## Мониторинг

Система логирует все операции:
- Успешную отправку уведомлений
- Ошибки при отправке
- Количество пользователей с непрочитанными сообщениями

## Troubleshooting

### Email не отправляются

1. Проверьте настройки SMTP в `.env`
2. Убедитесь, что SMTP сервер доступен
3. Проверьте логи приложения на наличие ошибок

### Крон-задачи не работают

1. Убедитесь, что `@nestjs/schedule` установлен
2. Проверьте, что `ScheduleModule.forRoot()` импортирован в `AppModule`
3. Проверьте логи на наличие ошибок инициализации

### Неправильные ссылки в email

1. Проверьте переменную `FRONTEND_URL` в `.env`
2. Убедитесь, что URL корректный и доступен
