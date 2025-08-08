# 👨‍💻 Инструкция для разработчиков

## Быстрый старт

### 1. Клонирование и установка зависимостей

```bash
# Клонируйте репозиторий
git clone <repository-url>
cd Odyssea-backend-nestjs

# Установите зависимости
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
# Подключитесь к PostgreSQL
psql -U postgres

# Создайте базу данных
CREATE DATABASE odyssea_db;

# Выйдите из psql
\q
```

### 3. Настройка переменных окружения

```bash
# Скопируйте файл с переменными окружения
cp .env.example .env
```

Отредактируйте файл `.env`:
```env
# Database Configuration
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/odyssea_db?schema=public"

# Application Configuration
PORT=3000
NODE_ENV=development
API_PREFIX=api/v1

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

# Заполнение базы тестовыми данными (опционально)
yarn prisma:seed
```

### 5. Запуск приложения

```bash
# Режим разработки (с автоперезагрузкой)
yarn start:dev
```

Приложение будет доступно по адресу: http://localhost:3000

## Проверка работоспособности

### 1. Проверка API

```bash
# Общий health check
curl http://localhost:3000/api/v1/health

# Проверка подключения к базе данных
curl http://localhost:3000/api/v1/db-health
```

### 2. Проверка базы данных

```bash
# Запуск скрипта проверки БД
yarn db:test

# Открытие Prisma Studio (веб-интерфейс для БД)
yarn prisma:studio
```

### 3. Запуск тестов

```bash
# Все тесты
yarn test

# Тесты с покрытием
yarn test:cov

# E2E тесты
yarn test:e2e
```

## Полезные команды

### Работа с базой данных

```bash
# Создание новой миграции
yarn prisma:migrate

# Принудительное применение схемы
yarn db:push

# Сброс базы данных
yarn db:reset

# Просмотр базы данных
yarn prisma:studio
```

### Разработка

```bash
# Линтинг кода
yarn lint

# Форматирование кода
yarn format

# Сборка проекта
yarn build

# Запуск в продакшн режиме
yarn start:prod
```

## Структура проекта

```
src/
├── config/           # Конфигурация приложения
├── core/             # Основные компоненты
├── modules/          # Модули приложения
│   └── users/        # Модуль пользователей
├── prisma/           # Prisma сервис и конфигурация
├── shared/           # Общие компоненты
└── app.module.ts     # Главный модуль
```

## API Endpoints

После запуска приложения доступны следующие endpoints:

- **Swagger UI**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/api/v1/health
- **Database Health**: http://localhost:3000/api/v1/db-health
- **API Base**: http://localhost:3000/api/v1

## Troubleshooting

### Проблема: Не удается подключиться к базе данных

**Решение:**
1. Убедитесь, что PostgreSQL запущен
2. Проверьте правильность пароля в `DATABASE_URL`
3. Убедитесь, что база данных `odyssea_db` существует

```bash
# Проверка статуса PostgreSQL
brew services list | grep postgresql

# Создание базы данных
createdb odyssea_db
```

### Проблема: Ошибки в тестах

**Решение:**
```bash
# Очистка кэша
yarn cache clean

# Переустановка зависимостей
rm -rf node_modules yarn.lock
yarn install
```

### Проблема: TypeScript ошибки

**Решение:**
```bash
# Очистка сборки
rm -rf dist

# Пересборка
yarn build
```

## Рабочий процесс

### Добавление нового модуля

1. Создайте папку в `src/modules/`
2. Создайте контроллер, сервис и модуль
3. Добавьте модуль в `app.module.ts`
4. Напишите тесты
5. Обновите документацию

### Работа с базой данных

1. Измените `prisma/schema.prisma`
2. Создайте миграцию: `yarn prisma:migrate`
3. Обновите сервисы для работы с новыми моделями
4. Напишите тесты для новых операций

### Code Style

- Используйте TypeScript строгую типизацию
- Документируйте публичные методы
- Следуйте NestJS конвенциям
- Покрывайте код тестами

## Полезные ссылки

- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Поддержка

При возникновении проблем:
1. Проверьте логи приложения
2. Убедитесь, что база данных запущена
3. Проверьте переменные окружения
4. Обратитесь к команде разработки

