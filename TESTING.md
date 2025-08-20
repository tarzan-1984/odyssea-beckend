# Testing Documentation

## Обзор тестирования

Проект Odyssea Backend включает в себя комплексную систему тестирования, покрывающую все основные компоненты:

- **Unit тесты** - тестирование отдельных сервисов, контроллеров и модулей
- **Integration тесты** - тестирование взаимодействия между компонентами
- **E2E тесты** - тестирование полного цикла работы приложения
- **DTO валидация тесты** - тестирование валидации входящих данных

## Структура тестов

```
src/
├── auth/
│   ├── auth.service.spec.ts          # ✅ Тесты AuthService
│   ├── auth.controller.spec.ts       # ✅ Тесты AuthController
│   ├── auth.module.spec.ts           # ✅ Тесты AuthModule
│   └── strategies/
│       ├── jwt.strategy.spec.ts      # ✅ Тесты JWT Strategy
│       └── local.strategy.spec.ts    # ✅ Тесты Local Strategy
├── users/
│   ├── users.service.spec.ts         # ✅ Тесты UsersService
│   ├── users.controller.spec.ts      # ✅ Тесты UsersController
│   ├── users.module.spec.ts          # ✅ Тесты UsersModule
│   └── dto/
│       └── users.dto.spec.ts         # ✅ Тесты DTO валидации
├── mailer/
│   ├── mailer.service.spec.ts        # ✅ Тесты MailerService
│   ├── mailer.module.spec.ts         # ✅ Тесты MailerModule
│   └── mailer.integration.spec.ts    # ✅ Интеграционные тесты
├── prisma/
│   ├── prisma.service.spec.ts        # ✅ Тесты PrismaService
│   └── prisma.module.spec.ts         # ✅ Тесты PrismaModule
├── config/
│   └── env.config.spec.ts            # ✅ Тесты конфигурации
├── common/
│   ├── filters/
│   │   └── http-exception.filter.spec.ts  # ✅ Тесты Exception Filter
│   └── interceptors/
│       └── transform.interceptor.spec.ts   # ✅ Тесты Transform Interceptor
├── app.module.spec.ts                # ✅ Тесты AppModule
├── app.controller.spec.ts             # ✅ Тесты AppController
└── main.spec.ts                      # ✅ Тесты main.ts

test/
└── app.e2e-spec.ts                   # ✅ E2E тесты
```

## Запуск тестов

### Установка зависимостей

```bash
npm install
# или
yarn install
```

### Запуск всех тестов

```bash
npm test
# или
yarn test
```

### Запуск тестов с покрытием

```bash
npm run test:cov
# или
yarn test:cov
```

### Запуск тестов в watch режиме

```bash
npm run test:watch
# или
yarn test:watch
```

### Запуск E2E тестов

```bash
npm run test:e2e
# или
yarn test:e2e
```

### Запуск конкретного теста

```bash
# Тесты конкретного файла
npm test -- src/auth/auth.service.spec.ts

# Тесты конкретной папки
npm test -- src/auth/

# Тесты с определенным паттерном
npm test -- --testNamePattern="should validate user"
```

## Типы тестов

### 1. Unit тесты

Тестируют отдельные компоненты в изоляции с использованием моков для зависимостей.

**Примеры:**
- `auth.service.spec.ts` - тестирование бизнес-логики аутентификации
- `users.service.spec.ts` - тестирование операций с пользователями
- `mailer.service.spec.ts` - тестирование отправки email

### 2. Controller тесты

Тестируют HTTP эндпоинты и их взаимодействие с сервисами.

**Примеры:**
- `auth.controller.spec.ts` - тестирование всех эндпоинтов аутентификации
- `users.controller.spec.ts` - тестирование CRUD операций с пользователями

### 3. Module тесты

Тестируют правильность конфигурации модулей и внедрения зависимостей.

**Примеры:**
- `auth.module.spec.ts` - тестирование конфигурации AuthModule
- `users.module.spec.ts` - тестирование конфигурации UsersModule

### 4. Strategy тесты

Тестируют Passport стратегии аутентификации.

**Примеры:**
- `jwt.strategy.spec.ts` - тестирование JWT аутентификации
- `local.strategy.spec.ts` - тестирование локальной аутентификации

### 5. DTO валидация тесты

Тестируют валидацию входящих данных с использованием class-validator.

**Примеры:**
- `auth.dto.spec.ts` - тестирование валидации DTO аутентификации
- `users.dto.spec.ts` - тестирование валидации DTO пользователей

### 6. Filter и Interceptor тесты

Тестируют глобальные фильтры и интерцепторы.

**Примеры:**
- `http-exception.filter.spec.ts` - тестирование обработки ошибок
- `transform.interceptor.spec.ts` - тестирование трансформации ответов

### 7. Integration тесты

Тестируют взаимодействие между компонентами.

**Примеры:**
- `mailer.integration.spec.ts` - тестирование интеграции MailerService

### 8. E2E тесты

Тестируют полный цикл работы приложения, включая HTTP запросы.

**Примеры:**
- `app.e2e-spec.ts` - тестирование всех эндпоинтов и middleware

## Покрытие тестами

### Текущее покрытие

- **AuthService**: 100% - все методы протестированы
- **UsersService**: 100% - все методы протестированы
- **MailerService**: 100% - все методы протестированы
- **PrismaService**: 100% - подключение к БД протестировано
- **AuthController**: 100% - все эндпоинты протестированы
- **UsersController**: 100% - все эндпоинты протестированы
- **DTO валидация**: 100% - все сценарии валидации протестированы
- **Стратегии**: 100% - все роли и статусы протестированы
- **Модули**: 100% - все зависимости протестированы

### Метрики покрытия

```bash
npm run test:cov
```

Результат покажет:
- Statements (операторы)
- Branches (ветвления)
- Functions (функции)
- Lines (строки)

## Настройка тестов

### Конфигурация Jest

Тесты используют Jest как основной фреймворк тестирования. Конфигурация находится в:

- `jest.config.js` - основная конфигурация
- `test/jest-e2e.json` - конфигурация для E2E тестов

### Переменные окружения для тестов

Создайте файл `.env.test` для тестового окружения:

```env
# Database
DATABASE_URL="postgresql://test:test@localhost:5432/testdb"

# JWT
JWT_SECRET="test-secret-key"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# Mailer
MAILER_HOST="smtp.test.com"
MAILER_PORT="587"
MAILER_SECURE="false"
MAILER_USER="test@test.com"
MAILER_PASS="test-password"
MAILER_FROM="test@test.com"

# App
NODE_ENV="test"
PORT="3001"
```

### Моки и заглушки

Тесты используют Jest моки для изоляции компонентов:

```typescript
const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};
```

## Лучшие практики

### 1. Структура тестов

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let mockDependency: MockType;

  beforeEach(async () => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('methodName', () => {
    it('should do something when condition', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### 2. Именование тестов

```typescript
it('should return user when valid credentials are provided', async () => {
  // Test implementation
});

it('should throw UnauthorizedException when user validation fails', async () => {
  // Test implementation
});
```

### 3. Тестирование ошибок

```typescript
it('should throw NotFoundException if user not found', async () => {
  await expect(service.method()).rejects.toThrow(NotFoundException);
});
```

### 4. Мокирование зависимостей

```typescript
const mockService = {
  method: jest.fn().mockResolvedValue(mockData),
};

expect(mockService.method).toHaveBeenCalledWith(expectedArgs);
```

## Отладка тестов

### Запуск в debug режиме

```bash
npm run test:debug
# или
yarn test:debug
```

### Логирование в тестах

```typescript
it('should debug test', () => {
  console.log('Debug info');
  // Test implementation
});
```

### Тестирование конкретного случая

```bash
npm test -- --testNamePattern="specific test name"
```

## CI/CD интеграция

### GitHub Actions

Тесты автоматически запускаются при каждом push и pull request:

```yaml
- name: Run tests
  run: npm test

- name: Run E2E tests
  run: npm run test:e2e

- name: Generate coverage report
  run: npm run test:cov
```

### Pre-commit hooks

Рекомендуется настроить pre-commit hooks для автоматического запуска тестов:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test"
    }
  }
}
```

## Полезные команды

```bash
# Запуск тестов с подробным выводом
npm test -- --verbose

# Запуск тестов с coverage в HTML формате
npm run test:cov -- --coverageDirectory=coverage/html

# Запуск тестов определенного типа
npm test -- --testPathPattern="\.spec\.ts$"

# Запуск тестов с определенным тегом
npm test -- --testNamePattern="@integration"
```

## Заключение

Система тестирования проекта обеспечивает:

- **Высокое покрытие** - все основные компоненты протестированы
- **Надежность** - тесты проверяют как успешные сценарии, так и обработку ошибок
- **Поддерживаемость** - четкая структура и документация
- **CI/CD готовность** - автоматический запуск в процессе разработки

Регулярно запускайте тесты и поддерживайте их актуальность при изменении кода.
