# 🚀 Начинаем разработку!

## ✅ Что уже настроено

- ✅ NestJS приложение
- ✅ PostgreSQL база данных
- ✅ Prisma ORM
- ✅ Docker (опционально)
- ✅ Тесты и документация

## 🎯 Простой рабочий процесс

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

## 🛠️ Основные команды

```bash
# Разработка
yarn start:dev          # Запуск приложения
yarn build              # Сборка проекта

# База данных
yarn db:push            # Применить схему к БД
yarn prisma:generate    # Обновить клиент
yarn prisma:studio      # Веб-интерфейс для БД
yarn db:reset           # Сбросить БД (удалит все данные!)

# Тестирование
yarn test               # Запуск тестов
yarn test:e2e           # E2E тесты

# Docker (опционально)
yarn docker:compose:up  # Запуск с Docker
```

## 🌐 Доступные URL

- **Приложение**: http://localhost:3000
- **API**: http://localhost:3000/api/v1
- **Swagger**: http://localhost:3000/docs
- **Prisma Studio**: http://localhost:5555

## 🔍 Проверка работы

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Database check
curl http://localhost:3000/api/v1/db-health
```

## 📚 Документация

- **[SIMPLE_DEVELOPMENT.md](./SIMPLE_DEVELOPMENT.md)** - упрощенная разработка
- **[QUICK_START.md](./QUICK_START.md)** - быстрый старт
- **[DOCKER_SETUP.md](./DOCKER_SETUP.md)** - работа с Docker

## 🎯 Следующие шаги

1. **Добавить новые модели** в `prisma/schema.prisma`
2. **Создать сервисы** в `src/modules/`
3. **Добавить контроллеры** для новых endpoints
4. **Написать тесты** для новой функциональности

---

**Готово к разработке!** 🎉
