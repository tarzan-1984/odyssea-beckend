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

- `GET /v1/users/list` - Список пользователей с пагинацией и фильтрацией
- `POST /v1/users` - Создание пользователя
- `GET /v1/users/:id` - Получение пользователя по ID
- `PUT /v1/users/:id` - Обновление пользователя
- `DELETE /v1/users/:id` - Удаление пользователя
- `PUT /v1/users/:id/status` - Изменение статуса пользователя

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
