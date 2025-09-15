# Odyssea Complete API - Updated Postman Collection

## Обзор

Обновленная Postman коллекция `Odyssea-Complete-API-Updated.postman_collection.json` объединяет все API endpoints проекта Odyssea, включая новый webhook endpoint для синхронизации с внешней TMS системой.

## Структура коллекции

### 1. Authentication

- **User Login (Email + Password)** - Вход с email и паролем
- **Verify OTP** - Подтверждение OTP кода
- **Social Login (Google)** - Вход через Google OAuth
- **Google OAuth Callback** - Обработка Google OAuth callback
- **Forgot Password** - Запрос сброса пароля
- **Reset Password** - Сброс пароля по токену
- **Refresh Token** - Обновление access token
- **Logout** - Выход из системы

### 2. Users

- **Get All Users** - Получение всех пользователей с пагинацией и фильтрацией
- **Get User by External ID** - Получение пользователя по внешнему ID
- **Get User by ID** - Получение пользователя по внутреннему ID
- **Update User (Admin only)** - Обновление пользователя (только для админов)
- **Delete User (Admin only)** - Удаление пользователя (только для админов)
- **Change User Status (Admin only)** - Изменение статуса пользователя (только для админов)

### 3. Sync & Webhooks (НОВОЕ!)

- **Sync DB - Add Driver** - Добавление водителя через TMS webhook
- **Sync DB - Update Driver** - Обновление водителя через TMS webhook
- **Sync DB - Delete Driver** - Удаление водителя через TMS webhook
- **Sync DB - Add Employee** - Добавление сотрудника через TMS webhook
- **Sync DB - Update Employee** - Обновление сотрудника через TMS webhook
- **Sync DB - Delete Employee** - Удаление сотрудника через TMS webhook

### 4. Chat Rooms

- **Create Chat Room** - Создание чат-комнаты
- **Get User Chat Rooms** - Получение чат-комнат пользователя
- **Get Chat Room by ID** - Получение чат-комнаты по ID
- **Archive Chat Room** - Архивирование чат-комнаты
- **Add Participants to Chat Room** - Добавление участников в чат-комнату
- **Search Users for Chat** - Поиск пользователей для добавления в чат

### 5. Messages

- **Send Message** - Отправка сообщения
- **Upload File** - Загрузка файла
- **Get Chat Room Messages** - Получение сообщений чат-комнаты
- **Search Messages in Chat Room** - Поиск сообщений в чат-комнате
- **Get Message Statistics** - Получение статистики сообщений
- **Get Unread Message Count** - Получение количества непрочитанных сообщений
- **Mark Message as Read** - Отметка сообщения как прочитанного
- **Delete Message** - Удаление сообщения

### 6. Health Check & Documentation

- **Health Check** - Проверка работоспособности API
- **Swagger Documentation** - Доступ к Swagger документации
- **Swagger JSON** - Получение Swagger спецификации в JSON формате

## Переменные коллекции

| Переменная       | Описание                      | Пример значения                                                    |
| ---------------- | ----------------------------- | ------------------------------------------------------------------ |
| `baseUrl`        | Базовый URL API               | `http://localhost:3000`                                            |
| `apiPrefix`      | Префикс версии API            | `v1`                                                               |
| `accessToken`    | JWT access token              | Автоматически устанавливается                                      |
| `refreshToken`   | JWT refresh token             | Автоматически устанавливается                                      |
| `userEmail`      | Email тестового пользователя  | `test@example.com`                                                 |
| `userPassword`   | Пароль тестового пользователя | `password123`                                                      |
| `userId`         | ID пользователя               | Автоматически устанавливается                                      |
| `externalUserId` | Внешний ID пользователя       | `27`                                                               |
| `chatRoomId`     | ID чат-комнаты                | Автоматически устанавливается                                      |
| `messageId`      | ID сообщения                  | Автоматически устанавливается                                      |
| `externalApiKey` | API ключ для sync endpoints   | `60ba7220fe1ea9c9ea213d31d9529d9e4b6830e9259132be1a7b9ee855a44720` |

## Настройка для использования

### 1. Импорт коллекции

1. Откройте Postman
2. Нажмите "Import"
3. Выберите файл `Odyssea-Complete-API-Updated.postman_collection.json`

### 2. Настройка переменных

1. Откройте коллекцию
2. Перейдите на вкладку "Variables"
3. Обновите значения переменных под ваше окружение:
    - `baseUrl` - URL вашего сервера (dev/staging/prod)
    - `externalApiKey` - API ключ для sync endpoints
    - `userEmail` и `userPassword` - тестовые данные

### 3. Аутентификация

1. Запустите запрос "User Login (Email + Password)"
2. Получите OTP код из email
3. Запустите запрос "Verify OTP" с полученным кодом
4. Access и refresh токены автоматически сохранятся в переменных

## Особенности Sync & Webhooks

### Аутентификация

Все sync endpoints используют API ключ аутентификацию через заголовок `x-api-key`.

### Поддерживаемые операции

- **ADD** - Создание нового пользователя (driver/employee)
- **UPDATE** - Обновление существующего пользователя
- **DELETE** - Удаление пользователя

### Поля для водителей (driver_data)

- `driver_id` - ID водителя во внешней системе
- `driver_name` - Полное имя водителя
- `driver_email` - Email водителя
- `driver_phone` - Телефон водителя
- `home_location` - Домашняя локация
- `vehicle_type` - Тип транспортного средства
- `vin` - VIN номер транспортного средства

### Поля для сотрудников (user_data)

- `id` - ID сотрудника во внешней системе
- `user_email` - Email сотрудника
- `display_name` - Отображаемое имя
- `first_name` - Имя
- `last_name` - Фамилия
- `roles` - Роли сотрудника
- `user_registered` - Дата регистрации
- `acf_fields` - Дополнительные поля:
    - `permission_view` - Права просмотра
    - `initials_color` - Цвет инициалов
    - `work_location` - Рабочая локация
    - `phone_number` - Номер телефона
    - `flt` - FLT флаг
    - `deactivate_account` - Флаг деактивации аккаунта

### Автоматическое тестирование

Коллекция включает автоматические тесты для:

- Проверки статус кодов ответов
- Валидации JSON структуры
- Автоматического сохранения токенов и ID
- Проверки времени ответа
- Валидации бизнес-логики (например, статус INACTIVE при deactivate_account: true)

## Примеры использования

### Создание водителя

```json
{
	"type": "add",
	"role": "driver",
	"timestamp": "2025-09-12 04:31:45",
	"source": "tms-statistics",
	"driver_data": {
		"driver_id": "3343",
		"driver_name": "Test Driver 2",
		"driver_email": "tdev13105@gmail.com",
		"driver_phone": "(013) 242-3423",
		"home_location": "NM",
		"vehicle_type": "sprinter-van",
		"vin": "44444421224"
	}
}
```

### Обновление сотрудника с деактивацией

```json
{
	"type": "update",
	"role": "employee",
	"timestamp": "2025-09-12 11:02:41",
	"source": "tms-statistics",
	"user_data": {
		"id": 27,
		"user_email": "milchenko2k16+55995@gmail.com",
		"display_name": "Serhii Milchenko",
		"first_name": "Serhii",
		"last_name": "Milchenkos",
		"roles": ["dispatcher"],
		"user_registered": "2025-09-11 14:15:00",
		"acf_fields": {
			"permission_view": [],
			"initials_color": "#0d6efd",
			"work_location": "pl",
			"phone_number": "(667) 290-7550",
			"flt": false,
			"deactivate_account": true
		}
	}
}
```

## Troubleshooting

### Ошибка 401 Unauthorized

- Проверьте правильность API ключа в переменной `externalApiKey`
- Убедитесь, что заголовок `x-api-key` передается корректно

### Ошибка 400 Bad Request

- Проверьте структуру JSON payload
- Убедитесь, что все обязательные поля присутствуют
- Проверьте правильность значений enum полей

### Ошибка 404 Not Found

- Для UPDATE/DELETE операций убедитесь, что пользователь существует
- Проверьте правильность external ID

## Поддержка

Для вопросов и поддержки обращайтесь к команде разработки или создавайте issue в репозитории проекта.
