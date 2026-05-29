# Deploy to Render.com

## Prerequisites

- Render.com account
- PostgreSQL database (Neon.tech recommended)
- Environment variables configured

## Environment Variables

Set these environment variables in your Render.com service:

```bash
# Database Configuration
DATABASE_URL="postgresql://username:password@host/database?sslmode=require"
DIRECT_URL="postgresql://username:password@host/database?sslmode=require"

# Application Configuration
PORT=3000
NODE_ENV=production
API_PREFIX=v1

# JWT Configuration
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Swagger
SWAGGER_TITLE="Odyssea API"
SWAGGER_DESCRIPTION="Odyssea Backend API Documentation"
SWAGGER_VERSION=1.0

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# Frontend URL
FRONTEND_URL=https://your-frontend-domain.com
```

## Build Configuration

### Build Command
```bash
yarn install --frozen-lockfile && yarn playwright install-deps chromium && yarn playwright install chromium && yarn build
```

This matches `render.yaml`. Playwright installs Chromium for the HERE reverse geocode endpoint (`GET /v1/geocoding/here/reverse`).

**Render RAM:** Chromium needs ~512 MB+ at runtime. If the service crashes on geocode requests, upgrade from Starter to Standard (1 GB+).

**Alternative**: If you prefer to use the standard build command without Playwright, make sure `@nestjs/cli` is in your `dependencies` (not `devDependencies`).

### Start Command
```bash
yarn start:prod
```

## Important Notes

1. **Prisma Client Generation**: The `postinstall` script automatically generates the Prisma client after dependencies are installed.

2. **Database Migration**: Use `prisma db push` for schema changes in development/test environment.

3. **Environment**: Make sure `NODE_ENV=production` is set in Render.com.

4. **Port**: The application will use the `PORT` environment variable or default to 3000.

## Troubleshooting

### Prisma Client Issues
If you encounter Prisma client errors:
1. Check that `DATABASE_URL` and `DIRECT_URL` are correctly set
2. Ensure the database is accessible from Render.com
3. Verify that the `postinstall` script ran successfully

### Build Failures
1. Check the build logs for specific error messages
2. Ensure all environment variables are set
3. Verify that the database connection is working

### Playwright / HERE geocode (503 on `/v1/geocoding/here/reverse`)
1. Build log must show successful `playwright install chromium`
2. If build fails on `install-deps`, retry deploy or check [Playwright system deps](https://playwright.dev/docs/browsers#install-system-dependencies)
3. Optional env: `HERE_PLAYWRIGHT_TIMEOUT_MS=45000`, `HERE_MAPS_DEFAULT_ZOOM=16`
4. Local setup: `yarn playwright:install`

## Database Setup

1. Create a PostgreSQL database (Neon.tech recommended)
2. Set the connection URLs in environment variables
3. The application will automatically create tables on first run

## Security Notes

- Never commit `.env` files to version control
- Use strong, unique JWT secrets
- Enable SSL for database connections
- Use environment-specific configuration
