# ⚡ Быстрый запуск проекта

## Чек-лист для разработчика

### ✅ Предварительные требования

**Вариант 1: Локальная установка**
- [ ] Node.js (версия 18+)
- [ ] Yarn
- [ ] PostgreSQL
- [ ] Git

**Вариант 2: Docker (рекомендуется)**
- [ ] Docker Desktop
- [ ] Docker Compose
- [ ] Git

### 🚀 Пошаговый запуск

#### Вариант 1: Локальная установка

1. **Клонирование проекта**
   ```bash
   git clone <repository-url>
   cd Odyssea-backend-nestjs
   ```

2. **Установка зависимостей**
   ```bash
   yarn install
   ```

3. **Настройка базы данных**
   ```bash
   # Убедитесь, что PostgreSQL запущен
   brew services start postgresql  # macOS
   
   # Создайте базу данных
   createdb odyssea_db
   ```

4. **Настройка переменных окружения**
   ```bash
   cp .env.example .env
   # Отредактируйте .env файл, указав правильный пароль PostgreSQL
   ```

5. **Инициализация базы данных**
   ```bash
   yarn prisma:generate
   yarn db:push
   ```

6. **Запуск приложения**
   ```bash
   yarn start:dev
   ```

#### Вариант 2: Docker (рекомендуется)

1. **Клонирование проекта**
   ```bash
   git clone <repository-url>
   cd Odyssea-backend-nestjs
   ```

2. **Запуск с Docker**
   ```bash
   # Запуск всех сервисов
   yarn docker:compose:up
   
   # Инициализация базы данных
   ./scripts/docker-init.sh
   ```

3. **Проверка работоспособности**
   ```bash
   # Проверка API
   curl http://localhost:3000/api/v1/health
   
   # Проверка базы данных
   curl http://localhost:3000/api/v1/db-health
   ```

### 🔍 Проверка работоспособности

```bash
# Проверка API
curl http://localhost:3000/api/v1/health

# Проверка базы данных
curl http://localhost:3000/api/v1/db-health

# Запуск тестов
yarn test

# Проверка БД через скрипт
yarn db:test
```

### 📚 Полезные ссылки

- **Swagger UI**: http://localhost:3000/docs
- **Prisma Studio**: http://localhost:5555 (запустите `yarn prisma:studio`)

### 🛠️ Основные команды

#### Локальная разработка
```bash
# Разработка
yarn start:dev          # Запуск в режиме разработки
yarn build              # Сборка проекта
yarn lint               # Линтинг кода
yarn format             # Форматирование кода

# База данных
yarn prisma:studio      # Веб-интерфейс для БД
yarn prisma:migrate     # Создание миграции
yarn db:test            # Проверка подключения к БД

# Тестирование
yarn test               # Unit тесты
yarn test:e2e           # E2E тесты
yarn test:cov           # Тесты с покрытием
```

#### Docker команды
```bash
# Docker
yarn docker:compose:up      # Запуск всех сервисов
yarn docker:compose:down    # Остановка всех сервисов
yarn docker:compose:logs    # Просмотр логов
yarn docker:compose:studio  # Запуск Prisma Studio
yarn docker:build           # Сборка образа
yarn docker:run             # Запуск контейнера
```

### ❗ Частые проблемы

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

### 📞 Поддержка

Если что-то не работает:
1. Проверьте логи приложения
2. Убедитесь, что база данных запущена
3. Проверьте переменные окружения
4. Обратитесь к команде разработки

---

**Готово!** 🎉 Приложение должно работать на http://localhost:3000
