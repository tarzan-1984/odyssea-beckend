# Odyssea Backend (NestJS)

## Описание

Backend приложение для системы Odyssea, построенное на NestJS с использованием Prisma ORM, двухэтапной JWT аутентификации с OTP и Google OAuth. Система поддерживает автоматическую генерацию временных паролей для неактивных пользователей.

## Технологии

- **NestJS** - основной фреймворк
- **Prisma** - ORM для работы с базой данных
- **PostgreSQL** - база данных
- **JWT** - аутентификация с двухэтапной проверкой
- **OTP** - одноразовые пароли для дополнительной безопасности
- **bcrypt** - хеширование паролей
- **Google OAuth** - социальная аутентификация
- **Nodemailer** - отправка email уведомлений
- **Jest** - тестирование
- **Husky** - Git hooks
- **ESLint + Prettier** - линтинг и форматирование кода
- **Commitlint** - валидация сообщений коммитов

## Установка и запуск

### Предварительные требования

- Node.js 18+
- PostgreSQL
- npm или yarn

### Установка зависимостей

```bash
npm install
```

### Настройка базы данных

1. Создайте базу данных PostgreSQL
2. Скопируйте `.env.example` в `.env` и настройте переменные окружения
3. Запустите миграции:

```bash
npm run prisma:migrate
```

### Запуск приложения

```bash
# Разработка
npm run start:dev

# Продакшн
npm run start:prod
```

## Тестирование

### Запуск всех тестов

```bash
npm test
```

### Запуск тестов в режиме watch

```bash
npm run test:watch
```

### Запуск тестов с покрытием

```bash
npm run test:cov
```

## Git Hooks (Husky)

Проект настроен с использованием Husky для автоматического запуска проверок при коммитах и push.

### Установленные хуки

- **pre-commit**: Запускает lint-staged и тесты
- **commit-msg**: Проверяет формат сообщения коммита
- **pre-push**: Запускает тесты перед отправкой

### Конфигурация

#### Lint-staged

Автоматически форматирует и проверяет staged файлы:

- ESLint для TypeScript файлов в `src/`
- Prettier для всех файлов

#### Commitlint

Проверяет формат сообщений коммитов согласно Conventional Commits:

```
type(scope): description

Примеры:
feat: add user authentication
fix: resolve login issue
docs: update API documentation
test: add unit tests for auth service
```

#### Pre-commit

При каждом коммите:

1. Запускает lint-staged для форматирования и линтинга
2. Запускает все тесты для проверки качества кода

#### Pre-push

Перед отправкой в удаленный репозиторий:

1. Запускает все тесты для предотвращения отправки нерабочего кода

### Настройка Husky

Husky автоматически настраивается при установке зависимостей благодаря скрипту `prepare` в `package.json`.

### Отключение хуков (временное)

```bash
# Отключить все хуки
git config core.hooksPath /dev/null

# Восстановить хуки
git config --unset core.hooksPath
```

## Структура проекта

```
src/
├── auth/           # Аутентификация и авторизация
├── users/          # Управление пользователями
├── mailer/         # Отправка email
├── prisma/         # Конфигурация Prisma
├── common/         # Общие компоненты
└── config/         # Конфигурация приложения

test/
├── jest.setup.ts   # Глобальная настройка Jest
└── jest-e2e.json   # Конфигурация E2E тестов
```

## API Endpoints

### Аутентификация

#### Двухэтапная аутентификация

Система использует двухэтапную аутентификацию для повышения безопасности:

**Этап 1: Проверка email (`POST /v1/auth/login_email`)**

- Принимает только email пользователя
- Проверяет существование пользователя в базе данных
- Если пользователь не найден → возвращает ошибку 401
- Если пользователь найден и статус `INACTIVE` → генерирует временный пароль, отправляет на email, **изменяет статус на `ACTIVE`**, возвращает redirect URL
- Если пользователь найден и статус `ACTIVE` → возвращает redirect URL на страницу ввода пароля

**Этап 2: Ввод пароля (`POST /v1/auth/login_password`)**

- Принимает email и password
- Проверяет учетные данные пользователя
- Если пароль верный → отправляет OTP код на email
- Если пароль неверный → возвращает ошибку 401

**Этап 3: Подтверждение OTP (`POST /v1/auth/verify-otp`)**

- Принимает email и OTP код
- Проверяет код и возвращает JWT токены при успехе

#### Эндпоинты аутентификации

- `POST /v1/auth/login_email` - Вход с email (проверка пользователя и отправка временного пароля если неактивен)
- `POST /v1/auth/login_password` - Вход с email/password (отправка OTP)
- `POST /v1/auth/verify-otp` - Подтверждение OTP
- `POST /v1/auth/social-login` - Вход через социальные сети
- `GET /v1/auth/google` - Google OAuth callback
- `POST /v1/auth/forgot-password` - Восстановление пароля
- `POST /v1/auth/reset-password` - Сброс пароля
- `POST /v1/auth/refresh-token` - Обновление токена
- `POST /v1/auth/logout` - Выход

#### Примеры запросов

**1. Проверка email:**

```json
POST /v1/auth/login_email
{
  "email": "user@example.com"
}
```

**Ответ для неактивного пользователя (после генерации пароля):**

```json
{
	"message": "Password for login sent to your email user@example.com",
	"redirectUrl": "http://localhost:3000/login-password"
}
```

**Ответ для активного пользователя:**

```json
{
	"message": "Please enter your password to continue",
	"redirectUrl": "http://localhost:3000/login-password"
}
```

**2. Ввод пароля:**

```json
POST /v1/auth/login_password
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Ответ:**

```json
{
	"message": "OTP code sent to your email"
}
```

**3. Подтверждение OTP:**

```json
POST /v1/auth/verify-otp
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Ответ:**

```json
{
	"accessToken": "jwt-access-token",
	"refreshToken": "jwt-refresh-token",
	"user": {
		"id": "user-id",
		"email": "user@example.com",
		"firstName": "John",
		"lastName": "Doe",
		"role": "ADMINISTRATOR",
		"status": "ACTIVE",
		"avatar": "avatar-url"
	}
}
```

#### Статусы пользователей

Система поддерживает следующие статусы пользователей:

- **`ACTIVE`** - Активный пользователь, может входить в систему
- **`INACTIVE`** - Неактивный пользователь, при входе получает временный пароль
- **`SUSPENDED`** - Заблокированный пользователь
- **`PENDING`** - Ожидающий активации

#### Временные пароли

Для пользователей со статусом `INACTIVE` система автоматически:

1. Генерирует временный пароль длиной 8 символов
2. Хеширует пароль с помощью bcrypt
3. Обновляет пароль в базе данных
4. **Изменяет статус пользователя на `ACTIVE`**
5. Отправляет пароль на email пользователя
6. Перенаправляет на страницу ввода пароля

#### Email уведомления

Система отправляет следующие типы email:

- **Временный пароль** - для неактивных пользователей
- **OTP код** - для подтверждения входа
- **Восстановление пароля** - для сброса пароля

### Пользователи

- `GET /v1/users` - Список пользователей с пагинацией и фильтрацией
- `POST /v1/users` - Создание пользователя
- `GET /v1/users/:id` - Получение пользователя по ID
- `PUT /v1/users/:id` - Обновление пользователя
- `DELETE /v1/users/:id` - Удаление пользователя
- `PUT /v1/users/:id/status` - Изменение статуса пользователя

#### Получение списка пользователей

**Эндпоинт:** `GET /v1/users`

**Описание:** Возвращает список пользователей с пагинацией, фильтрацией и сортировкой.

**Параметры запроса:**
- `page` (number, optional) - Номер страницы (по умолчанию: 1)
- `limit` (number, optional) - Количество элементов на странице (по умолчанию: 10)
- `role` (string, optional) - Фильтр по роли пользователя
- `status` (string, optional) - Фильтр по статусу пользователя
- `search` (string, optional) - Поиск по имени и email
- `sort` (string, optional) - Сортировка в формате JSON

**Пример запроса:**
```bash
GET /v1/users?page=1&limit=10&search=john&sort={"role":"asc"}
```

**Ответ:**
```json
{
  "data": [
    {
      "id": "clx1234567890",
      "externalId": "12345",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phone": "+1234567890",
      "location": "New York, NY",
      "type": "Truck",
      "vin": "1HGBH41JXMN109186",
      "profilePhoto": "https://example.com/photo.jpg",
      "role": "DRIVER",
      "status": "ACTIVE",
      "createdAt": "2025-01-27T10:00:00.000Z",
      "updatedAt": "2025-01-27T10:00:00.000Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 10,
    "total_count": 100,
    "total_pages": 10,
    "has_next_page": true,
    "has_prev_page": false
  },
  "timestamp": "2025-01-27T10:00:00.000Z",
  "path": "/v1/users"
}
```

**Поля пользователя:**
- `id` - Уникальный идентификатор пользователя
- `externalId` - ID из внешней системы (для импортированных пользователей)
- `firstName` - Имя пользователя
- `lastName` - Фамилия пользователя
- `email` - Email адрес
- `phone` - Номер телефона
- `location` - Местоположение
- `type` - Тип транспортного средства
- `vin` - VIN номер транспортного средства
- `profilePhoto` - URL фото профиля
- `role` - Роль пользователя (DRIVER, ADMINISTRATOR, DISPATCHER_EXPEDITE, RECRUITER, TRACKING)
- `status` - Статус пользователя (ACTIVE, INACTIVE, SUSPENDED, PENDING)
- `createdAt` - Дата создания
- `updatedAt` - Дата последнего обновления

**Информация о пагинации:**
- `current_page` - Текущая страница
- `per_page` - Количество элементов на странице
- `total_count` - Общее количество пользователей
- `total_pages` - Общее количество страниц
- `has_next_page` - Есть ли следующая страница
- `has_prev_page` - Есть ли предыдущая страница

### Импорт водителей

Система поддерживает импорт водителей из внешнего TMS API с фоновой обработкой и отслеживанием дубликатов.

#### Внешний API

**URL:** `https://www.endurance-tms.com/wp-json/tms/v1/drivers`

**Заголовки:**
- `X-API-Key: tms_api_key_2024_driver_access`

#### Эндпоинты импорта

- `POST /v1/users/import-drivers` - Запуск фонового импорта водителей
- `GET /v1/users/import-status/:jobId` - Получение статуса импорта водителей
- `POST /v1/users/import-users` - Запуск фонового импорта пользователей
- `GET /v1/users/import-users-status/:jobId` - Получение статуса импорта пользователей

#### Процесс импорта

1. **Запуск импорта** - создается фоновая задача с уникальным ID
2. **Обработка страниц** - система последовательно обрабатывает страницы данных
3. **Проверка дубликатов** - проверяется существование пользователей по `externalId` и `email`
4. **Обновление/создание** - существующие пользователи обновляются, новые создаются
5. **Отслеживание дубликатов** - ведется учет водителей с дублирующимися email

#### Маппинг полей

| Поле внешнего API | Поле в базе данных | Описание |
|-------------------|-------------------|----------|
| `id` | `externalId` | Уникальный ID водителя из внешней системы |
| `role` | `role` | Роль пользователя |
| `driver_name` | `firstName`, `lastName` | Имя и фамилия (разделяются по пробелу) |
| `driver_email` | `email` | Email адрес |
| `driver_phone` | `phone` | Номер телефона |
| `home_location` | `location` | Местоположение |
| `type` | `type` | Тип транспортного средства |
| `vin` | `vin` | VIN номер транспортного средства |

#### Примеры запросов

**1. Запуск импорта:**

```json
POST /v1/users/import-drivers
{
  "page": 1,
  "per_page": 30,
  "search": ""
}
```

**Ответ:**

```json
{
  "jobId": "import-1695998400000",
  "message": "Background import process started. Job ID: import-1695998400000. Check status at /v1/users/import-status/import-1695998400000"
}
```

**2. Проверка статуса импорта:**

```json
GET /v1/users/import-status/import-1695998400000
```

**Ответ (в процессе):**

```json
{
  "status": "processing",
  "progress": 45.5,
  "processedPages": 15,
  "totalImported": 450,
  "totalUpdated": 25,
  "totalSkipped": 8,
  "duplicateEmails": [3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110],
  "isComplete": false,
  "startTime": "2025-09-29T15:00:00.000Z"
}
```

**Ответ (завершен):**

```json
{
  "status": "completed",
  "progress": 100,
  "processedPages": 38,
  "totalImported": 1115,
  "totalUpdated": 0,
  "totalSkipped": 15,
  "duplicateEmails": [3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110, 3111, 3112, 3113, 3114, 3115, 3116, 3117],
  "isComplete": true,
  "startTime": "2025-09-29T15:00:00.000Z",
  "endTime": "2025-09-29T15:05:30.000Z"
}
```

#### Особенности импорта

- **Фоновая обработка** - импорт выполняется в фоне, не блокируя API
- **Отслеживание дубликатов** - система автоматически пропускает водителей с дублирующимися email
- **Обновление существующих** - если водитель уже существует по `externalId`, его данные обновляются
- **Безопасность** - эндпоинты импорта не требуют аутентификации (`@SkipAuth()`)
- **Ограничения** - обрабатывается максимум 5 страниц за один запрос для предотвращения таймаутов
- **Логирование** - подробные логи процесса импорта в консоли NestJS

#### Статусы задач импорта

- **`processing`** - импорт выполняется
- **`completed`** - импорт завершен успешно
- **`failed`** - импорт завершился с ошибкой

#### Обработка ошибок

- **Дублирующиеся email** - водители с дублирующимися email пропускаются и добавляются в список `duplicateEmails`
- **Таймауты** - система автоматически ограничивает количество обрабатываемых страниц
- **Ошибки сети** - повторные попытки подключения к внешнему API
- **Ошибки базы данных** - индивидуальная обработка каждого водителя для предотвращения отката всей транзакции

### Импорт пользователей

Система поддерживает импорт пользователей из внешнего TMS API с фоновой обработкой и отслеживанием дубликатов.

#### Внешний API

**URL:** `https://www.endurance-tms.com/wp-json/tms/v1/users`

**Заголовки:**
- `X-API-Key: tms_api_key_2024_driver_access`

#### Маппинг полей

| Поле внешнего API | Поле в базе данных | Описание |
|-------------------|-------------------|----------|
| `id` | `externalId` | Уникальный ID пользователя из внешней системы |
| `user_email` | `email` | Email адрес |
| `first_name` | `firstName` | Имя пользователя |
| `last_name` | `lastName` | Фамилия пользователя |
| `roles` | `role` | Роль пользователя (маппинг см. ниже) |
| `acf_fields.phone_number` | `phone` | Номер телефона |
| `acf_fields.work_location` | `location` | Местоположение работы |

#### Маппинг ролей

| Внешняя роль | Внутренняя роль | Описание |
|--------------|-----------------|----------|
| `administrator` | `ADMINISTRATOR` | Администратор |
| `moderator` | `ADMINISTRATOR` | Модератор (маппится в администратор) |
| `dispatcher` | `DISPATCHER_EXPEDITE` | Диспетчер |
| `recruiter`, `recruiter-tl` | `RECRUITER` | Рекрутер |
| `driver_updates` | `DRIVER` | Водитель |
| `tracking`, `morning_tracking`, `nightshift_tracking` | `TRACKING` | Отслеживание |
| `accounting` | `ADMINISTRATOR` | Бухгалтер (маппится в администратор) |
| `billing` | `ADMINISTRATOR` | Биллинг (маппится в администратор) |

#### Примеры запросов

**1. Запуск импорта пользователей:**

```json
POST /v1/users/import-users
{
  "page": 1,
  "per_page": 30,
  "search": ""
}
```

**Ответ:**

```json
{
  "jobId": "import-users-1695998400000",
  "message": "Background import process started. Job ID: import-users-1695998400000. Check status at /v1/users/import-users-status/import-users-1695998400000"
}
```

**2. Проверка статуса импорта пользователей:**

```json
GET /v1/users/import-users-status/import-users-1695998400000
```

**Ответ (в процессе):**

```json
{
  "status": "processing",
  "progress": 50.0,
  "processedPages": 1,
  "totalImported": 25,
  "totalUpdated": 3,
  "totalSkipped": 2,
  "duplicateEmails": [82, 14],
  "isComplete": false,
  "startTime": "2025-09-29T15:00:00.000Z"
}
```

**Ответ (завершен):**

```json
{
  "status": "completed",
  "progress": 100,
  "processedPages": 2,
  "totalImported": 56,
  "totalUpdated": 0,
  "totalSkipped": 0,
  "duplicateEmails": [],
  "isComplete": true,
  "startTime": "2025-09-29T15:00:00.000Z",
  "endTime": "2025-09-29T15:02:15.000Z"
}
```

#### Особенности импорта пользователей

- **Фоновая обработка** - импорт выполняется в фоне, не блокируя API
- **Отслеживание дубликатов** - система автоматически пропускает пользователей с дублирующимися email
- **Обновление существующих** - если пользователь уже существует по `externalId`, его данные обновляются
- **Маппинг ролей** - внешние роли автоматически маппятся на внутренние роли системы
- **Безопасность** - эндпоинты импорта не требуют аутентификации (`@SkipAuth()`)
- **Ограничения** - обрабатывается максимум 5 страниц за один запрос для предотвращения таймаутов
- **Логирование** - подробные логи процесса импорта в консоли NestJS

## Переменные окружения

Создайте файл `.env` на основе `.env.example`:

```env
# База данных
DATABASE_URL="postgresql://user:password@localhost:5432/odyssea"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# SMTP
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="your-email@gmail.com"

# Приложение
PORT=3001
NODE_ENV=development
API_PREFIX="/v1"
FRONTEND_URL="http://localhost:3000"

# Шифрование
ENCRYPTION_SECRET="your-encryption-secret-key"
```

## Разработка

### Добавление новых тестов

1. Создайте файл `.spec.ts` рядом с тестируемым файлом
2. Используйте Jest и NestJS TestingModule
3. Запустите тесты: `npm test`

### Форматирование кода

```bash
# Автоматическое форматирование
npm run format

# Линтинг с автоматическим исправлением
npm run lint:fix
```

### Миграции базы данных

```bash
# Создание миграции
npx prisma migrate dev --name migration_name

# Применение миграций
npm run prisma:migrate:deploy

# Сброс базы данных
npm run db:reset
```

## Деплой

### Подготовка к продакшну

```bash
# Сборка
npm run build:prod

# Генерация Prisma клиента
npm run prisma:generate

# Применение миграций
npm run prisma:migrate:deploy
```

### Запуск в продакшне

```bash
npm run start:prod
```

## Поддержка

При возникновении проблем:

1. Проверьте логи приложения
2. Убедитесь, что все переменные окружения настроены
3. Проверьте, что база данных доступна
4. Запустите тесты: `npm test`

## Лицензия

UNLICENSED
