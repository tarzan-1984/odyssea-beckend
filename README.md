# Odyssea Backend (NestJS)

## Описание

Backend приложение для системы Odyssea, построенное на NestJS с использованием Prisma ORM, JWT аутентификации и Google OAuth.

## Технологии

- **NestJS** - основной фреймворк
- **Prisma** - ORM для работы с базой данных
- **PostgreSQL** - база данных
- **JWT** - аутентификация
- **Google OAuth** - социальная аутентификация
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
- `POST /v1/auth/login` - Вход с email/password
- `POST /v1/auth/verify-otp` - Подтверждение OTP
- `POST /v1/auth/social-login` - Вход через социальные сети
- `GET /v1/auth/google` - Google OAuth callback
- `POST /v1/auth/forgot-password` - Восстановление пароля
- `POST /v1/auth/reset-password` - Сброс пароля
- `POST /v1/auth/refresh-token` - Обновление токена
- `POST /v1/auth/logout` - Выход

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
