# Google Auth Dev Mode Support

## Overview
Добавлена поддержка dev режима для Google OAuth авторизации. Теперь можно передавать URL фронтенда в параметрах запроса для корректного редиректа в dev окружении.

## API Changes

### GET /auth/social-login
Добавлен новый опциональный query параметр `frontendUrl`.

**Параметры:**
- `frontendUrl` (optional, string) - URL фронтенда для редиректа после авторизации

**Примеры использования:**

1. **Production режим (без параметра):**
   ```
   GET /auth/social-login
   ```
   Использует `process.env.FRONTEND_URL` для редиректа.

2. **Dev режим (с параметром):**
   ```
   GET /auth/social-login?frontendUrl=http://localhost:3000
   ```
   Использует переданный URL для редиректа.

## How it works

1. **Инициация авторизации:** При вызове `/auth/social-login` с параметром `frontendUrl`, этот URL сохраняется в `state` параметре Google OAuth запроса.

2. **Callback обработка:** В методе `/auth/google/callback` извлекается `frontendUrl` из `state` параметра и используется для всех редиректов (успешная авторизация, ошибки, запрет доступа).

3. **Fallback:** Если `state` параметр отсутствует или не может быть распарсен, используется `process.env.FRONTEND_URL` как fallback.

## Frontend Integration

На фронтенде (Next.js) нужно передавать текущий URL в параметре `frontendUrl`:

```javascript
// В dev режиме
const frontendUrl = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3000' 
  : process.env.NEXT_PUBLIC_FRONTEND_URL;

// Редирект на Google Auth
window.location.href = `/auth/social-login?frontendUrl=${encodeURIComponent(frontendUrl)}`;
```

### Пример реализации на Next.js

```typescript
// pages/auth/google.tsx или app/auth/google/page.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function GoogleAuth() {
  const router = useRouter();

  useEffect(() => {
    // Определяем URL фронтенда в зависимости от окружения
    const frontendUrl = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:3000' 
      : process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;

    // Редиректим на backend с параметром frontendUrl
    const backendUrl = `${process.env.NEXT_PUBLIC_API_URL}/auth/social-login`;
    const redirectUrl = `${backendUrl}?frontendUrl=${encodeURIComponent(frontendUrl)}`;
    
    window.location.href = redirectUrl;
  }, []);

  return <div>Redirecting to Google Auth...</div>;
}
```

### Обработка callback'ов

После успешной авторизации Google перенаправит пользователя на:
- **Успех:** `${frontendUrl}/auth-success?payload=${encryptedPayload}`
- **Ошибка:** `${frontendUrl}/signin?error=${errorMessage}`

```typescript
// pages/auth-success.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function AuthSuccess() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { payload } = router.query;
    
    if (payload && typeof payload === 'string') {
      try {
        // Расшифровываем payload (нужно реализовать функцию расшифровки)
        const decryptedData = decryptPayload(payload);
        setUser(decryptedData.user);
        
        // Сохраняем токены
        localStorage.setItem('accessToken', decryptedData.accessToken);
        localStorage.setItem('refreshToken', decryptedData.refreshToken);
        
        // Редиректим на главную страницу
        router.push('/dashboard');
      } catch (error) {
        console.error('Failed to decrypt payload:', error);
        router.push('/signin?error=Authentication failed');
      }
    } else {
      router.push('/signin');
    }
    
    setLoading(false);
  }, [router]);

  if (loading) {
    return <div>Processing authentication...</div>;
  }

  return <div>Welcome, {user?.firstName}!</div>;
}
```

## Error Handling

Система обрабатывает следующие сценарии:
- Отсутствие `state` параметра
- Некорректный JSON в `state` параметре
- Отсутствие `frontendUrl` в `state` данных

Во всех случаях используется fallback на `process.env.FRONTEND_URL`.

## Logging

Добавлено логирование для отладки:
- `frontendUrl from query:` - переданный URL из параметра
- `targetFrontendUrl:` - финальный URL, который будет использован
- `Using frontend URL for redirect:` - URL, используемый для редиректа в callback

## Testing

Добавлены комплексные тесты для нового функционала:

### Тесты для `googleAuth` метода:
- ✅ Редирект с дефолтным frontend URL (production режим)
- ✅ Редирект с кастомным frontend URL (dev режим)
- ✅ Проверка всех обязательных OAuth параметров

### Тесты для `googleCallback` метода:
- ✅ Успешный редирект с кастомным frontend URL
- ✅ Редирект на страницу ошибки для роли DRIVER с кастомным frontend URL
- ✅ Использование дефолтного frontend URL когда state не предоставлен
- ✅ Использование дефолтного frontend URL при ошибке парсинга state
- ✅ Обработка ошибок сервиса с кастомным frontend URL
- ✅ Обработка ошибок сервиса с дефолтным frontend URL при ошибке парсинга state
- ✅ Корректная обработка пустого state объекта

### Покрытие тестами:
- **Все сценарии редиректа**: успех, ошибки, запрет доступа
- **Обработка ошибок**: парсинг state, ошибки сервиса
- **Fallback механизмы**: использование дефолтного URL
- **Валидация параметров**: корректность OAuth URL, state параметра

Все тесты проходят успешно (23/23 для AuthController, 222/222 для всего проекта).
