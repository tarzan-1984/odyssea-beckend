# Odyssea Backend

Backend API для проекта Odyssea, построенный на NestJS с PostgreSQL и Prisma.

## 🚀 Технологии

- **NestJS** - фреймворк для создания эффективных и масштабируемых серверных приложений
- **PostgreSQL** - реляционная база данных
- **Prisma** - современный ORM для TypeScript и Node.js
- **Swagger** - документация API
- **Jest** - тестирование
- **TypeScript** - типизированный JavaScript

## 📋 Требования

- Node.js 18+ 
- PostgreSQL 12+
- Yarn (рекомендуется) или npm

## ⚡ Быстрый старт

### 1. Клонирование и установка
```bash
git clone <repository-url>
cd Odyssea-backend-nestjs
yarn install
```

### 2. Настройка базы данных

#### Установка PostgreSQL

**macOS (через Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
Скачайте и установите PostgreSQL с официального сайта.

#### Создание базы данных
```bash
# Создание базы данных
createdb odyssea_db
```

### 3. Настройка переменных окружения
```bash
cp .env.example .env
```

Отредактируйте файл `.env`:
```env
# Database Configuration
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/odyssea_db?schema=public"

# Application Configuration
PORT=3000
NODE_ENV=development
API_PREFIX=v1

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Swagger Configuration
SWAGGER_TITLE=Odyssea API
SWAGGER_DESCRIPTION=Odyssea Backend API Documentation
SWAGGER_VERSION=1.0
```

**Важно:** Замените `your_password` на ваш пароль от PostgreSQL.

### 4. Инициализация базы данных
```bash
# Генерация Prisma клиента
yarn prisma:generate

# Применение схемы к базе данных
yarn db:push


```

### 5. Запуск приложения
```bash
# Режим разработки (с автоперезагрузкой)
yarn start:dev
```

Приложение будет доступно по адресу: http://localhost:3000

## 🔍 Проверка работоспособности

```bash
# Проверка API
curl http://localhost:3000/v1

# Запуск тестов
yarn test


```

## 🌐 Доступные URL

- **Приложение**: http://localhost:3000
- **API**: http://localhost:3000/v1
- **Swagger UI**: http://localhost:3000/docs
- **Prisma Studio**: http://localhost:5555 (запустите `yarn prisma:studio`)

## 🛠️ Основные команды

### Разработка
```bash
yarn start:dev          # Запуск в режиме разработки
yarn build              # Сборка проекта
yarn start:prod         # Запуск в продакшн режиме
yarn lint               # Линтинг кода
yarn format             # Форматирование кода
```

### База данных
```bash
yarn prisma:generate    # Обновить клиент Prisma
yarn prisma:migrate     # Создание миграции
yarn prisma:studio      # Веб-интерфейс для БД
yarn db:push            # Применить схему к БД
yarn db:reset           # Сбросить БД (удалит все данные!)

```

### Тестирование
```bash
yarn test               # Unit тесты
yarn test:e2e           # E2E тесты
yarn test:cov           # Тесты с покрытием
```

## 📁 Структура проекта

```
src/
├── config/           # Конфигурация приложения
├── core/             # Основные компоненты (фильтры, guards, interceptors)
├── modules/          # Модули приложения
├── prisma/           # Prisma сервис и конфигурация
├── shared/           # Общие компоненты (DTOs, типы, утилиты)
└── app.module.ts     # Главный модуль приложения
```

## 🎯 Рабочий процесс разработки

### 1. Изменить схему базы данных
```prisma
// prisma/schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  username  String   @unique
  password  String
  phone     String?  // ← Добавили новое поле
  role      UserRole @default(USER)
  status    Status   @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}
```

### 2. Применить изменения
```bash
yarn db:push
```

### 3. Обновить клиент
```bash
yarn prisma:generate
```

### 4. Проверить изменения
```bash
yarn prisma:studio
```

## 📊 Prisma Migrations

### Зачем нужны Migrations?

Prisma Migrations - это система управления версиями базы данных, которая позволяет:

- ✅ **Отслеживать изменения** в структуре БД
- ✅ **Применять изменения** безопасно и контролируемо
- ✅ **Откатывать изменения** при необходимости
- ✅ **Синхронизировать схему** между разработчиками

### Использование Migrations

```bash
# Создание миграции
yarn prisma:migrate

# Применение миграций в продакшене
yarn prisma:migrate:deploy

# Проверка статуса миграций
npx prisma migrate status
```

### Резервное копирование
```bash
# Создать резервную копию
pg_dump -U postgres odyssea_db > backup.sql

# Применить миграции
yarn prisma:migrate

# При необходимости восстановить
psql -U postgres -d odyssea_db < backup.sql
```

## 📝 Конвенции кода

### TypeScript
- Используйте строгую типизацию
- Избегайте `any` типа
- Документируйте публичные методы с JSDoc

### NestJS
- Следуйте модульной архитектуре
- Один контроллер на модуль
- Используйте DTOs для валидации входных данных
- Разделяйте бизнес-логику в сервисах

### База данных
- Используйте Prisma для работы с БД
- Создавайте миграции для изменений схемы
- Тестируйте запросы к БД

## 🤝 Командная разработка

### Git Flow
1. Создавайте feature ветки от `develop`
2. Используйте conventional commits
3. Создавайте Pull Request для слияния

### Code Review
- Все изменения должны проходить code review
- Используйте линтеры и форматтеры
- Покрывайте новый код тестами

## ❗ Частые проблемы

**Проблема**: Не удается подключиться к базе данных
```bash
# Решение: проверьте пароль в .env файле
# Убедитесь, что PostgreSQL запущен
brew services list | grep postgresql
```

**Проблема**: Ошибки TypeScript
```bash
# Решение: пересоберите проект
rm -rf dist
yarn build
```

**Проблема**: Ошибки в тестах
```bash
# Решение: очистите кэш
yarn cache clean
rm -rf node_modules yarn.lock
yarn install
```

## 🚀 Деплой

### Подготовка к продакшну
1. Настройте переменные окружения
2. Выполните миграции БД: `yarn prisma:migrate:deploy`
3. Соберите приложение: `yarn build`

### Мониторинг
- Логирование через встроенные логгеры NestJS
- Health check endpoint: `/api/v1/health`

## 🎯 Следующие шаги

1. **Добавить новые модели** в `prisma/schema.prisma`
2. **Создать сервисы** в `src/modules/`
3. **Добавить контроллеры** для новых endpoints
4. **Написать тесты** для новой функциональности
5. **Добавление аутентификации** (JWT токены, Guards)
6. **Расширение API** (CRUD операции, валидация данных)

## 📞 Поддержка

При возникновении вопросов или проблем:
1. Проверьте документацию
2. Посмотрите существующие issues
3. Создайте новый issue с подробным описанием

## 📄 Лицензия

Этот проект является приватным и предназначен для внутреннего использования.

---

**Готово к разработке!** 🎉
