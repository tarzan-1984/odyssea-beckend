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

## 🛠 Установка и настройка

### Быстрый старт

Для быстрого запуска проекта используйте:
- **[QUICK_START.md](./QUICK_START.md)** - краткий чек-лист для запуска
- **[DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md)** - подробная инструкция для разработчиков
- **[DOCKER_SETUP.md](./DOCKER_SETUP.md)** - настройка с Docker (рекомендуется)

### Пошаговая установка

1. **Клонирование репозитория**
   ```bash
   git clone <repository-url>
   cd Odyssea-backend-nestjs
   ```

2. **Установка зависимостей**
   ```bash
   yarn install
   ```

3. **Настройка базы данных**
   
   Убедитесь, что PostgreSQL установлен и запущен:
   ```bash
   # macOS
   brew install postgresql
   brew services start postgresql
   
   # Создание базы данных
   createdb odyssea_db
   ```

4. **Настройка переменных окружения**
   ```bash
   cp .env.example .env
   ```
   
   Отредактируйте `.env` файл, указав правильный пароль PostgreSQL:
   ```env
   DATABASE_URL="postgresql://postgres:your_password@localhost:5432/odyssea_db?schema=public"
   ```

5. **Инициализация базы данных**
   ```bash
   yarn prisma:generate
   yarn prisma:migrate
   ```

## 🚀 Запуск приложения

### Режим разработки
```bash
yarn start:dev
```

### Продакшн режим
```bash
yarn build
yarn start:prod
```

## 📚 Документация

### API Документация
После запуска приложения, документация Swagger доступна по адресу:
- http://localhost:3000/docs

### Дополнительная документация
- **[SETUP.md](./SETUP.md)** - подробная настройка проекта
- **[DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md)** - инструкция для разработчиков
- **[QUICK_START.md](./QUICK_START.md)** - быстрый старт
- **[DATABASE_CHECK.md](./DATABASE_CHECK.md)** - проверка подключения к базе данных

## 🧪 Тестирование

```bash
# Unit тесты
yarn test

# E2E тесты
yarn test:e2e

# Покрытие кода
yarn test:cov
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

## 🔧 Скрипты

- `yarn start:dev` - запуск в режиме разработки с hot reload
- `yarn build` - сборка проекта
- `yarn start:prod` - запуск в продакшн режиме
- `yarn test` - запуск unit тестов
- `yarn test:e2e` - запуск e2e тестов
- `yarn lint` - проверка кода
- `yarn format` - форматирование кода

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

## 🚀 Деплой

### Подготовка к продакшну
1. Настройте переменные окружения
2. Выполните миграции БД
3. Соберите приложение: `yarn build`

### Мониторинг
- Логирование через встроенные логгеры NestJS
- Health check endpoint: `/api/v1/health`

## 📞 Поддержка

При возникновении вопросов или проблем:
1. Проверьте документацию
2. Посмотрите существующие issues
3. Создайте новый issue с подробным описанием

## 📄 Лицензия

Этот проект является приватным и предназначен для внутреннего использования.
