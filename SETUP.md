# 🚀 Настройка проекта Odyssea Backend

## Быстрый старт

### 1. Установка зависимостей
```bash
yarn install
```

### 2. Настройка базы данных

#### Создание базы данных PostgreSQL
```sql
CREATE DATABASE odyssea_db;
```

#### Настройка переменных окружения
Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

Отредактируйте `.env` файл:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/odyssea_db?schema=public"
```

### 3. Инициализация базы данных
```bash
# Генерация Prisma клиента
yarn prisma:generate

# Создание и применение миграций
yarn prisma:migrate

# Заполнение базы тестовыми данными (опционально)
yarn prisma:seed
```

### 4. Запуск приложения
```bash
# Режим разработки
yarn start:dev

# Продакшн режим
yarn build
yarn start:prod
```

## 📚 API Документация

После запуска приложения:
- **Swagger UI**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/api/v1/health
- **API Base URL**: http://localhost:3000/api/v1

## 🧪 Тестирование

```bash
# Unit тесты
yarn test

# E2E тесты
yarn test:e2e

# Покрытие кода
yarn test:cov
```

## 🔧 Полезные команды

### Prisma команды
```bash
# Генерация клиента
yarn prisma:generate

# Создание миграции
yarn prisma:migrate

# Просмотр базы данных
yarn prisma:studio

# Сброс базы данных
yarn db:reset
```

### Разработка
```bash
# Линтинг
yarn lint

# Форматирование кода
yarn format

# Сборка
yarn build
```

## 📁 Структура проекта

```
src/
├── config/           # Конфигурация приложения
│   └── env.config.ts
├── core/             # Основные компоненты
├── modules/          # Модули приложения
│   └── users/        # Пример модуля пользователей
├── prisma/           # Prisma сервис и конфигурация
│   ├── prisma.service.ts
│   ├── prisma.module.ts
│   └── seed.ts
├── shared/           # Общие компоненты
│   ├── controllers/
│   ├── dto/
│   └── types/
└── app.module.ts     # Главный модуль
```

## 🔄 Рабочий процесс

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

## 🚨 Troubleshooting

### Проблемы с базой данных
```bash
# Сброс базы данных
yarn db:reset

# Принудительное применение схемы
yarn db:push
```

### Проблемы с зависимостями
```bash
# Очистка кэша
yarn cache clean

# Переустановка зависимостей
rm -rf node_modules yarn.lock
yarn install
```

### Проблемы с TypeScript
```bash
# Очистка сборки
rm -rf dist

# Пересборка
yarn build
```

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи приложения
2. Убедитесь, что база данных запущена
3. Проверьте переменные окружения
4. Обратитесь к команде разработки
