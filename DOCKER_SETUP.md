# 🐳 Docker Setup для Odyssea Backend

## Обзор

Этот документ описывает, как запустить проект Odyssea Backend с использованием Docker и Docker Compose.

## Предварительные требования

- Docker Desktop
- Docker Compose

## Быстрый запуск с Docker

### 1. Запуск всех сервисов

```bash
# Запуск приложения и базы данных
yarn docker:compose:up

# Или напрямую через docker-compose
docker-compose up -d
```

### 2. Инициализация базы данных

```bash
# Запуск скрипта инициализации
./scripts/docker-init.sh
```

### 3. Проверка работоспособности

```bash
# Проверка API
curl http://localhost:3000/api/v1/health

# Проверка базы данных
curl http://localhost:3000/api/v1/db-health

# Просмотр логов
yarn docker:compose:logs
```

## Доступные сервисы

### Основные сервисы

- **Приложение**: http://localhost:3000
- **PostgreSQL**: localhost:5432
- **Swagger UI**: http://localhost:3000/docs
- **API Base**: http://localhost:3000/api/v1

### Дополнительные сервисы

```bash
# Запуск Prisma Studio
yarn docker:compose:studio

# Prisma Studio будет доступен по адресу:
# http://localhost:5555
```

## Docker команды

### Основные команды

```bash
# Запуск всех сервисов
yarn docker:compose:up

# Остановка всех сервисов
yarn docker:compose:down

# Просмотр логов
yarn docker:compose:logs

# Запуск только приложения (без базы данных)
docker-compose up app

# Запуск только базы данных
docker-compose up postgres
```

### Работа с контейнерами

```bash
# Вход в контейнер приложения
docker-compose exec app sh

# Выполнение команд в контейнере
docker-compose exec app yarn prisma:migrate
docker-compose exec app yarn test

# Просмотр логов конкретного сервиса
docker-compose logs app
docker-compose logs postgres
```

### База данных

```bash
# Подключение к PostgreSQL
docker-compose exec postgres psql -U postgres -d odyssea_db

# Создание резервной копии
docker-compose exec postgres pg_dump -U postgres odyssea_db > backup.sql

# Восстановление из резервной копии
docker-compose exec -T postgres psql -U postgres -d odyssea_db < backup.sql
```

## Конфигурация

### Переменные окружения

Все переменные окружения настроены в `docker-compose.yml`:

```yaml
environment:
  DATABASE_URL: postgresql://postgres:root@postgres:5432/odyssea_db?schema=public
  PORT: 3000
  NODE_ENV: development
  # ... другие переменные
```

### Портфолио

- **3000**: Приложение
- **5432**: PostgreSQL
- **5555**: Prisma Studio (опционально)

### Volumes

- `postgres_data`: Данные PostgreSQL
- `.:/app`: Исходный код (для разработки)
- `/app/node_modules`: Node modules (оптимизация)

## Разработка с Docker

### Hot Reload

Приложение настроено для разработки с hot reload:

```bash
# Запуск в режиме разработки
docker-compose up

# Изменения в коде автоматически перезагружаются
```

### Отладка

```bash
# Просмотр логов в реальном времени
docker-compose logs -f app

# Вход в контейнер для отладки
docker-compose exec app sh
```

### Тестирование

```bash
# Запуск тестов в контейнере
docker-compose exec app yarn test

# Запуск E2E тестов
docker-compose exec app yarn test:e2e
```

## Продакшн

### Сборка образа

```bash
# Сборка образа
yarn docker:build

# Запуск контейнера
yarn docker:run
```

### Продакшн конфигурация

Создайте `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: odyssea_db
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  app:
    build: .
    environment:
      DATABASE_URL: ${DATABASE_URL}
      NODE_ENV: production
    depends_on:
      - postgres

volumes:
  postgres_data:
```

## Troubleshooting

### Проблема: Контейнеры не запускаются

```bash
# Проверка статуса контейнеров
docker-compose ps

# Просмотр логов
docker-compose logs

# Пересборка образов
docker-compose build --no-cache
```

### Проблема: База данных недоступна

```bash
# Проверка подключения к PostgreSQL
docker-compose exec postgres pg_isready -U postgres

# Перезапуск только базы данных
docker-compose restart postgres
```

### Проблема: Приложение не подключается к БД

```bash
# Проверка переменных окружения
docker-compose exec app env | grep DATABASE

# Перезапуск приложения
docker-compose restart app
```

### Очистка

```bash
# Остановка и удаление контейнеров
docker-compose down

# Удаление volumes (данные БД)
docker-compose down -v

# Полная очистка
docker system prune -a
```

## Полезные команды

```bash
# Статус сервисов
docker-compose ps

# Использование ресурсов
docker stats

# Просмотр образов
docker images

# Очистка неиспользуемых ресурсов
docker system prune
```

## Мониторинг

### Логи

```bash
# Все логи
docker-compose logs

# Логи конкретного сервиса
docker-compose logs app

# Логи в реальном времени
docker-compose logs -f
```

### Метрики

```bash
# Использование ресурсов
docker stats

# Информация о контейнерах
docker inspect odyssea-app
```

---

**Готово!** 🎉 Приложение готово к работе с Docker!
