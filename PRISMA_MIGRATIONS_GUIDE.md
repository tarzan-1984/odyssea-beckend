# 📊 Prisma Migrations - Зачем они нужны?

## 🤔 Что такое Prisma Migrations?

Prisma Migrations - это система управления версиями базы данных, которая позволяет:

1. **Отслеживать изменения** в структуре БД
2. **Применять изменения** безопасно и контролируемо
3. **Откатывать изменения** при необходимости
4. **Синхронизировать схему** между разработчиками

## 🎯 Зачем нужны Migrations?

### 1. **Версионный контроль базы данных**

Без migrations:
```
❌ Изменения в БД теряются при пересоздании
❌ Нет истории изменений
❌ Сложно откатить изменения
❌ Проблемы при работе в команде
```

С migrations:
```
✅ Все изменения отслеживаются
✅ Можно откатить к любой версии
✅ История изменений в Git
✅ Безопасное применение изменений
```

### 2. **Безопасность данных**

```sql
-- Безопасное добавление колонки
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- Безопасное изменение типа
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255);

-- Безопасное удаление колонки
ALTER TABLE users DROP COLUMN old_field;
```

### 3. **Командная разработка**

```bash
# Разработчик A создает миграцию
yarn prisma:migrate

# Разработчик B получает изменения
git pull
yarn prisma:migrate

# Все работают с одинаковой схемой БД
```

## 📁 Структура Migrations

```
prisma/
├── schema.prisma          # Схема данных
├── migrations/            # Папка с миграциями
│   ├── 20250808093700_/  # Первая миграция
│   │   └── migration.sql  # SQL файл миграции
│   └── migration_lock.toml # Блокировка версии Prisma
└── seed.ts               # Наполнение данными
```

## 🔄 Жизненный цикл миграции

### 1. **Изменение схемы**
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

### 2. **Создание миграции**
```bash
yarn prisma:migrate
# Prisma создаст файл миграции автоматически
```

### 3. **Применение миграции**
```bash
# В продакшене
yarn prisma:migrate:deploy

# В разработке
yarn prisma:migrate
```

## 🛠️ Основные команды

### Создание и применение миграций
```bash
# Создать и применить миграцию
yarn prisma:migrate

# Только создать миграцию (без применения)
yarn prisma:migrate dev --create-only

# Применить миграции в продакшене
yarn prisma:migrate:deploy
```

### Управление схемой
```bash
# Принудительно применить схему (без миграций)
yarn db:push

# Сбросить базу данных
yarn db:reset

# Просмотреть статус миграций
npx prisma migrate status
```

### Отладка
```bash
# Просмотр SQL миграции
cat prisma/migrations/20250808093700_/migration.sql

# Проверка схемы
npx prisma validate

# Генерация клиента
yarn prisma:generate
```

## 📊 Примеры использования

### Добавление нового поля
```prisma
// 1. Изменить схему
model User {
  // ... существующие поля
  phone String?  // ← Новое поле
}
```

```bash
# 2. Создать миграцию
yarn prisma:migrate
```

```sql
-- 3. Prisma создаст SQL
ALTER TABLE "public"."users" ADD COLUMN "phone" TEXT;
```

### Изменение типа поля
```prisma
// 1. Изменить схему
model User {
  // ... существующие поля
  email String @unique @db.VarChar(255)  // ← Изменили тип
}
```

```sql
-- 2. Prisma создаст безопасную миграцию
ALTER TABLE "public"."users" ALTER COLUMN "email" TYPE VARCHAR(255);
```

### Добавление индекса
```prisma
// 1. Изменить схему
model User {
  // ... существующие поля
  @@index([createdAt])  // ← Новый индекс
}
```

```sql
-- 2. Prisma создаст индекс
CREATE INDEX "users_createdAt_idx" ON "public"."users"("createdAt");
```

## 🚨 Важные моменты

### 1. **Никогда не редактируйте миграции вручную**
```bash
❌ НЕ ДЕЛАЙТЕ ЭТОГО:
vim prisma/migrations/20250808093700_/migration.sql

✅ ВМЕСТО ЭТОГО:
# Измените schema.prisma и создайте новую миграцию
yarn prisma:migrate
```

### 2. **Всегда применяйте миграции в правильном порядке**
```bash
# В команде
git pull                    # Получить изменения
yarn prisma:migrate         # Применить миграции
yarn prisma:generate        # Обновить клиент
```

### 3. **Резервное копирование перед большими изменениями**
```bash
# Создать резервную копию
docker-compose exec postgres pg_dump -U postgres odyssea_db > backup.sql

# Применить миграции
yarn prisma:migrate

# При необходимости восстановить
docker-compose exec -T postgres psql -U postgres -d odyssea_db < backup.sql
```

## 🔄 Рабочий процесс

### Для разработки
```bash
# 1. Изменить схему
vim prisma/schema.prisma

# 2. Создать миграцию
yarn prisma:migrate

# 3. Проверить изменения
yarn prisma:studio

# 4. Запустить тесты
yarn test

# 5. Закоммитить изменения
git add .
git commit -m "feat: add phone field to User model"
```

### Для продакшена
```bash
# 1. Применить миграции
yarn prisma:migrate:deploy

# 2. Проверить статус
npx prisma migrate status

# 3. Обновить клиент
yarn prisma:generate
```

## 🎯 Преимущества использования Migrations

✅ **Версионный контроль** - все изменения отслеживаются  
✅ **Безопасность** - изменения применяются контролируемо  
✅ **Командная работа** - все работают с одинаковой схемой  
✅ **Откат изменений** - можно вернуться к любой версии  
✅ **Документация** - SQL файлы служат документацией  
✅ **Автоматизация** - CI/CD может применять миграции  

## 📚 Полезные ссылки

- [Prisma Migrations Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Migration Commands](https://www.prisma.io/docs/reference/api-reference/command-reference)
- [Best Practices](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate)

---

**Вывод:** Migrations - это основа безопасной и контролируемой работы с базой данных! 🎯
