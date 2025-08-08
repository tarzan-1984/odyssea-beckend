# 🔍 Проверка подключения к базе данных

## Обзор

Этот документ описывает различные способы проверки подключения к базе данных в проекте Odyssea Backend.

## Методы проверки

### 1. Через API Endpoints

#### Health Check
```bash
curl http://localhost:3000/api/v1/health
```

**Ответ:**
```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "timestamp": "2025-08-08T09:38:16.484Z"
  }
}
```

#### Database Health Check
```bash
curl http://localhost:3000/api/v1/db-health
```

**Ответ:**
```json
{
  "success": true,
  "message": "Database connection successful",
  "data": {
    "connected": true,
    "userCount": 0,
    "tables": ["_prisma_migrations", "users"]
  }
}
```

### 2. Через скрипт

```bash
yarn db:test
```

**Вывод:**
```
🔌 Testing database connection...
✅ Database connection successful
✅ Database query successful: [ { test: 1 } ]
✅ User model accessible, current user count: 0
✅ Database schema accessible, tables: [ { table_name: '_prisma_migrations' }, { table_name: 'users' } ]
🎉 All database tests passed!
🔌 Database connection closed
✅ Database connection test completed successfully
```

### 3. Через тесты

```bash
# Запуск всех тестов
yarn test

# Запуск только тестов базы данных
yarn test src/prisma/prisma.service.spec.ts
```

### 4. Через Prisma Studio

```bash
yarn prisma:studio
```

Откроет веб-интерфейс для просмотра и управления базой данных.

## Конфигурация

### Переменные окружения

Файл `.env` должен содержать:

```env
DATABASE_URL="postgresql://postgres:root@localhost:5432/odyssea_db?schema=public"
```

### Схема базы данных

Основные таблицы:
- `users` - таблица пользователей
- `_prisma_migrations` - таблица миграций Prisma

## Устранение неполадок

### Проблема: Не удается подключиться к базе данных

**Решение:**
1. Проверьте, что PostgreSQL запущен
2. Убедитесь, что база данных `odyssea_db` существует
3. Проверьте правильность учетных данных в `DATABASE_URL`

```bash
# Создание базы данных
createdb odyssea_db

# Проверка подключения через psql
psql -h localhost -U postgres -d odyssea_db
```

### Проблема: Схема не синхронизирована

**Решение:**
```bash
# Применение миграций
yarn prisma:migrate

# Принудительное применение схемы
yarn db:push
```

### Проблема: Prisma клиент не обновлен

**Решение:**
```bash
# Регенерация клиента
yarn prisma:generate
```

## Мониторинг

### Логи подключения

Приложение логирует все операции с базой данных. Проверьте логи для диагностики проблем.

### Метрики

- Время подключения к базе данных
- Количество активных соединений
- Статистика запросов

## Безопасность

### Рекомендации

1. Используйте сильные пароли для базы данных
2. Ограничьте доступ к базе данных только с необходимых IP
3. Регулярно обновляйте зависимости
4. Используйте SSL для подключений в продакшене

### Переменные окружения для продакшена

```env
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
```

## Автоматизация

### CI/CD Pipeline

Добавьте проверку базы данных в CI/CD:

```yaml
- name: Test Database Connection
  run: yarn db:test
```

### Мониторинг

Настройте алерты для:
- Недоступности базы данных
- Медленных запросов
- Ошибок подключения

