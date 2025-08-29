# Odyssea Backend - NestJS

Backend API для системы управления логистикой Odyssea.

## Система аутентификации

Проект поддерживает два типа аутентификации:

### 1. Email + Password + OTP

Для входа через email и пароль с дополнительной верификацией OTP:

#### Шаг 1: Отправка OTP
```http
POST /auth/login
Content-Type: application/json

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

#### Шаг 2: Верификация OTP
```http
POST /auth/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Ответ:**
```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "refresh-token",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "DRIVER",
    "status": "ACTIVE"
  }
}
```

### 2. Social Login

Для входа через социальные сети (без OTP):

```http
POST /auth/social-login
Content-Type: application/json

{
  "provider": "google",
  "accessToken": "social-access-token"
}
```

**Поддерживаемые провайдеры:**
- `google` - Google OAuth
- `facebook` - Facebook OAuth  
- `apple` - Apple Sign In

### 3. Восстановление пароля

#### Запрос сброса пароля
```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Сброс пароля
```http
POST /auth/reset-password
Content-Type: application/json

{
  "token": "reset-token",
  "newPassword": "newpassword123"
}
```

### 4. Обновление токенов

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh-token"
}
```

### 5. Выход

```http
POST /auth/logout
Content-Type: application/json

{
  "refreshToken": "refresh-token"
}
```

## Установка и запуск

### Требования
- Node.js 18+
- PostgreSQL
- Yarn

### Установка зависимостей
```bash
yarn install
```

### Настройка базы данных
```bash
# Создание миграций
npx prisma migrate dev

# Или для тестовой среды
npx prisma db push
```

### Переменные окружения
Создайте файл `.env` на основе `env.example`:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/odyssea_db"

# Application
PORT=3000
NODE_ENV=development
API_PREFIX=api

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_EXPIRES_IN="15m"

# Swagger
SWAGGER_TITLE="Odyssea API"
SWAGGER_DESCRIPTION="Odyssea Backend API"
SWAGGER_VERSION="1.0"

# SMTP Configuration (для отправки OTP и сброса пароля)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="your-email@gmail.com"

# Frontend URL for password reset links
FRONTEND_URL="http://localhost:3000"

# Google OAuth (для социальной аутентификации)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
```

**Примечание по настройке Gmail SMTP:**
1. Включите двухфакторную аутентификацию в Google аккаунте
2. Создайте пароль приложения в настройках безопасности
3. Используйте пароль приложения вместо обычного пароля

**Примечание по FRONTEND_URL:**
- Эта переменная используется для генерации ссылок сброса пароля
- Если не указана, используется значение по умолчанию `http://localhost:3000`
- В продакшене укажите реальный URL вашего фронтенда

### Запуск в режиме разработки
```bash
yarn start:dev
```

### Запуск тестов
```bash
# Все тесты
yarn test

# Тесты аутентификации
yarn test auth.service

# E2E тесты
yarn test:e2e
```

### Сборка для продакшена
```bash
yarn build
yarn start:prod
```

## API Документация

После запуска сервера, документация Swagger доступна по адресу:
http://localhost:3000/docs

## Структура проекта

```
src/
├── auth/                    # Модуль аутентификации
│   ├── dto/                # Data Transfer Objects
│   ├── auth.controller.ts   # Контроллер аутентификации
│   ├── auth.service.ts     # Сервис аутентификации
│   └── auth.module.ts      # Модуль аутентификации
├── mailer/                 # Модуль отправки email
│   ├── mailer.service.ts   # Сервис отправки email
│   ├── mailer.module.ts    # Модуль mailer
│   └── README.md           # Документация mailer
├── prisma/                 # Prisma ORM
│   └── prisma.service.ts   # Сервис базы данных
├── users/                  # Модуль пользователей
├── config/                 # Конфигурация приложения
│   └── env.config.ts       # Настройки переменных окружения
└── main.ts                 # Точка входа приложения
```

## Безопасность

- Все пароли хешируются с помощью bcrypt
- JWT токены имеют ограниченное время жизни
- OTP коды действительны 5 минут
- Токены сброса пароля действительны 1 час
- Все эндпоинты защищены от брутфорс атак (rate limiting)

## Тестирование

Проект включает полный набор тестов:

- **Unit тесты** - для сервисов и контроллеров
- **E2E тесты** - для полного цикла API
- **Интеграционные тесты** - для работы с базой данных

Запуск тестов:
```bash
yarn test
yarn test:e2e
yarn test:cov  # с покрытием кода
```
# Test Husky
