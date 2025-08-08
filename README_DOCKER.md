# 🐳 Odyssea Backend - Docker Setup

## 🎯 Быстрый старт с Docker

### Предварительные требования
- Docker Desktop
- Docker Compose

### ⚡ Один клик запуск

```bash
# 1. Клонировать проект
git clone <repository-url>
cd Odyssea-backend-nestjs

# 2. Запустить всё с Docker
yarn docker:compose:up

# 3. Инициализировать базу данных
./scripts/docker-init.sh

# 4. Проверить работу
curl http://localhost:3000/api/v1/health
```

## 🏗️ Архитектура

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   NestJS App    │    │   PostgreSQL    │    │  Prisma Studio  │
│   Port: 3000    │    │   Port: 5432    │    │   Port: 5555    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Docker Network │
                    │ odyssea-network │
                    └─────────────────┘
```

## 📁 Docker файлы

- `Dockerfile` - образ приложения
- `docker-compose.yml` - оркестрация сервисов
- `.dockerignore` - исключения для сборки
- `scripts/docker-init.sh` - инициализация БД

## 🛠️ Доступные команды

### Основные команды
```bash
yarn docker:compose:up      # Запуск всех сервисов
yarn docker:compose:down    # Остановка всех сервисов
yarn docker:compose:logs    # Просмотр логов
yarn docker:compose:studio  # Запуск Prisma Studio
```

### Дополнительные команды
```bash
yarn docker:build           # Сборка образа
yarn docker:run             # Запуск контейнера
```

## 🌐 Доступные сервисы

| Сервис | URL | Описание |
|--------|-----|----------|
| Приложение | http://localhost:3000 | NestJS API |
| Swagger UI | http://localhost:3000/docs | API документация |
| Prisma Studio | http://localhost:5555 | Управление БД |
| PostgreSQL | localhost:5432 | База данных |

## 🔍 Проверка работоспособности

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Database check
curl http://localhost:3000/api/v1/db-health

# Swagger docs
open http://localhost:3000/docs
```

## 🚨 Troubleshooting

### Проблема: Контейнеры не запускаются
```bash
# Проверка статуса
docker-compose ps

# Просмотр логов
docker-compose logs

# Пересборка
docker-compose build --no-cache
```

### Проблема: База данных недоступна
```bash
# Проверка подключения
docker-compose exec postgres pg_isready -U postgres

# Перезапуск БД
docker-compose restart postgres
```

### Очистка
```bash
# Остановка и удаление
docker-compose down

# Удаление с данными
docker-compose down -v

# Полная очистка
docker system prune -a
```

## 📚 Документация

- **[DOCKER_SETUP.md](./DOCKER_SETUP.md)** - подробная настройка Docker
- **[DOCKER_QUICK.md](./DOCKER_QUICK.md)** - быстрый старт
- **[QUICK_START.md](./QUICK_START.md)** - общий быстрый старт

## 🎉 Преимущества Docker

✅ **Изолированная среда** - никаких конфликтов зависимостей  
✅ **Быстрый запуск** - один клик для запуска всего  
✅ **Консистентность** - одинаковое окружение для всех  
✅ **Простота** - не нужно устанавливать PostgreSQL локально  
✅ **Масштабируемость** - легко развернуть в продакшене  

---

**Готово!** 🎉 Проект полностью готов к работе с Docker!
