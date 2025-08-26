# Odyssea Authentication API - Postman Collection

## 📥 Импорт коллекции

1. **Скачайте файл** `Odyssea-Authentication-API.postman_collection.json`
2. **Откройте Postman**
3. **Нажмите "Import"** (в правом верхнем углу)
4. **Перетащите файл** или выберите его через "Upload Files"
5. **Коллекция появится** в левой панели

## 🔧 Настройка переменных

### Для продакшена:
Если ваш бекенд развернут на продакшн сервере, измените переменную `baseUrl`:
1. Откройте коллекцию в Postman
2. Нажмите на значок шестеренки (⚙️) рядом с названием коллекции
3. Измените значение `baseUrl` на URL вашего продакшн сервера
4. Например: `https://your-api-domain.com` или `https://api.yourapp.com`

### Автоматические переменные (уже настроены):
- `baseUrl`: `http://localhost:3000` - базовый URL бекенда
- `apiPrefix`: `v1` - префикс API версии
- `userEmail`: `test@example.com` - тестовый email
- `userPassword`: `password123` - тестовый пароль
- `databaseUrl`: URL подключения к PostgreSQL базе данных (только для справки)

### Переменные, которые заполняются автоматически:
- `accessToken` - JWT токен доступа (заполняется после верификации OTP)
- `refreshToken` - JWT токен обновления (заполняется после верификации OTP)

## 🚀 Последовательность тестирования

### 1. Подготовка
1. **Запустите бекенд** (`yarn start:dev`)
2. **Проверьте доступность** через "Health Check" запрос
3. **Убедитесь, что Swagger доступен** через "Local Development" запрос

### 2. Основной flow аутентификации
1. **User Login** → получаете сообщение о том, что OTP отправлен на email
2. **Verify OTP** → получаете токены (access + refresh) и данные пользователя
3. **Refresh Token** → обновляете access token
4. **Logout** → выходите из системы

### 3. Дополнительные функции
- **Forgot Password** → запрос на сброс пароля
- **Reset Password** → сброс пароля по токену
- **Social Login** → вход через социальные сети

## 📋 Описание запросов

### 🔐 User Login (Email + Password)
- **URL**: `POST {{baseUrl}}/{{apiPrefix}}/auth/login`
- **Body**: `{ "email": "{{userEmail}}", "password": "{{userPassword}}" }`
- **Ответ**: сообщение о том, что OTP код отправлен на email

### 🔑 Verify OTP
- **URL**: `POST {{baseUrl}}/{{apiPrefix}}/auth/verify-otp`
- **Body**: `{ "email": "{{userEmail}}", "otp": "123456" }`
- **Ответ**: access token, refresh token, данные пользователя
- **Важно**: после успешного ответа токены автоматически сохраняются в переменные

### 🔄 Refresh Token
- **URL**: `POST {{baseUrl}}/{{apiPrefix}}/auth/refresh`
- **Body**: `{ "refreshToken": "{{refreshToken}}" }`
- **Ответ**: новый access token

### 🚪 Logout
- **URL**: `POST {{baseUrl}}/{{apiPrefix}}/auth/logout`
- **Headers**: `Authorization: Bearer {{accessToken}}`
- **Body**: `{ "refreshToken": "{{refreshToken}}" }`
- **Ответ**: сообщение об успешном выходе

### 📧 Forgot Password
- **URL**: `POST {{baseUrl}}/{{apiPrefix}}/auth/forgot-password`
- **Body**: `{ "email": "{{userEmail}}" }`
- **Ответ**: сообщение о том, что email отправлен (если пользователь существует)

### 🔒 Reset Password
- **URL**: `POST {{baseUrl}}/{{apiPrefix}}/auth/reset-password`
- **Body**: `{ "token": "reset_token_here", "newPassword": "newpassword123" }`
- **Ответ**: сообщение об успешном сбросе пароля

### 🌐 Social Login
- **URL**: `POST {{baseUrl}}/{{apiPrefix}}/auth/social-login`
- **Body**: `{ "provider": "google", "accessToken": "social_token_here" }`
- **Ответ**: access token, refresh token, данные пользователя

## ⚠️ Важные моменты

### Rate Limiting
- **Login, OTP, Social Login**: максимум 5 запросов за 5 минут
- **Forgot Password, Reset Password**: максимум 3 запроса за 5 минут

### Валидация
- **Email**: должен быть валидным email адресом
- **Password**: минимум 6 символов
- **OTP**: ровно 6 цифр
- **Token**: непустая строка

### Безопасность
- **Logout** требует валидный JWT токен в заголовке `Authorization`
- Все токены имеют ограниченное время жизни
- Refresh token используется для получения нового access token

## 🧪 Тестирование

### Автоматические тесты
Коллекция включает автоматические тесты:
- Проверка времени ответа (< 5 секунд)
- Проверка валидности JSON ответа

### Ручное тестирование
1. **Измените переменные** `userEmail` и `userPassword` на реальные данные
2. **Проверьте все endpoints** по порядку
3. **Убедитесь в корректности** ответов и статус кодов

## 🔍 Отладка

### Логи в консоли
- Все запросы логируются в консоль Postman
- Токены автоматически сохраняются в переменные
- Ошибки валидации показывают детали проблем

### Swagger документация
- Доступна по адресу: `http://localhost:3000/docs`
- Содержит полное описание API
- Позволяет тестировать endpoints прямо в браузере

## 📝 Примечания

- Коллекция настроена для локальной разработки (`localhost:3000`)
- Для продакшена измените переменную `baseUrl`
- Все запросы используют API версию `v1`
- Токены автоматически управляются через переменные коллекции

## ⚠️ Важно понимать:

### Postman vs База данных
- **Postman** делает HTTP запросы к вашему NestJS бекенду
- **Бекенд** сам подключается к PostgreSQL базе данных
- **Переменная `databaseUrl`** добавлена только для справки - Postman не подключается к базе данных напрямую

### Архитектура запросов:
```
Postman → HTTP Request → NestJS Backend → PostgreSQL Database
```

Ваш бекенд использует `DATABASE_URL` из `.env` файла для подключения к базе данных, а Postman тестирует HTTP API endpoints.
