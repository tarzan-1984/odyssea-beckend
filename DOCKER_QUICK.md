# 🐳 Быстрый запуск с Docker

## ⚡ Один клик запуск

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

## 🎯 Что запускается

- **Приложение**: http://localhost:3000
- **Swagger UI**: http://localhost:3000/docs
- **PostgreSQL**: localhost:5432
- **Prisma Studio**: http://localhost:5555 (опционально)

## 🛠️ Основные команды

```bash
# Запуск
yarn docker:compose:up

# Остановка
yarn docker:compose:down

# Логи
yarn docker:compose:logs

# Prisma Studio
yarn docker:compose:studio
```

## 🔍 Проверка

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Database check
curl http://localhost:3000/api/v1/db-health

# Swagger docs
open http://localhost:3000/docs
```

## 🚨 Troubleshooting

```bash
# Перезапуск
docker-compose restart

# Пересборка
docker-compose build --no-cache

# Очистка
docker-compose down -v
```

---

**Готово!** 🎉 Приложение работает в Docker!
