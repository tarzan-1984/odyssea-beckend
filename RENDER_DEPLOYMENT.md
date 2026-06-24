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
yarn install --frozen-lockfile && yarn playwright:install:render && yarn build
```

Set runtime env `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers` (already in `render.yaml`). Without it, Chromium is installed to `~/.cache/ms-playwright` during build but is **not available at runtime** on Render → 503 "browser is not available".

Use `&&` between steps, not `;` — otherwise a failed `playwright:install:render` still allows `yarn build` to succeed and you deploy without Chromium.

Do **not** add `.playwright-browsers/` to `.gitignore` — Render may omit gitignored paths from the deploy artifact even when browsers are installed during build.

This matches `render.yaml`. Playwright installs Chromium for the HERE reverse geocode endpoint (`GET /v1/geocoding/here/reverse`).

**Render RAM:** Chromium needs ~512 MB+ at runtime on top of NestJS. Starter (512 MB total) is often too small — upgrade to Standard (1 GB+) or Pro if geocode still fails after redeploy.

**Alternative**: If you prefer to use the standard build command without Playwright, make sure `@nestjs/cli` is in your `dependencies` (not `devDependencies`).

### Start Command
```bash
yarn start:prod
```

Schema sync runs **once per deploy** (`yarn release:prod` in `buildCommand`), not on every crash restart. Running `prisma db push` on each restart caused exit 1 when the DB was briefly unavailable during recovery.

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

### Instance failed: Exited with status 1 (after geolocation deploy)
1. **Render → Logs** — filter around crash time (e.g. 8:25 PM). Look for:
   - `FATAL ERROR: Reached heap limit` or `Killed` → OOM (Starter 512 MB + Chromium)
   - `prisma db push` / `Can't reach database` → DB unavailable during restart
   - `Failed to connect to geo database` → geo DB blip (app now starts without PostGIS)
2. **Render → Metrics** — memory spikes before crashes confirm OOM
3. Driver location updates no longer call Playwright/HERE (only PostGIS → cache → Nominatim). HERE API endpoint is unchanged.
4. Apply geo indexes on production geo DB if not done yet:
   ```bash
   GEO_DATABASE_URL="..." yarn db:migrate:geo-zips-indexes
   ```
5. If HERE geocode endpoint is used heavily, upgrade Render plan to Standard (1 GB+ RAM)

### Playwright / HERE geocode (503 on `/v1/geocoding/here/reverse`)
1. Build command must use `&&` (see above), not `;`
2. Build log must show successful `playwright install chromium` into `.playwright-browsers/`
3. Runtime logs `Executable doesn't exist at .../.playwright-browsers/...` → browsers missing at deploy; fix gitignore + rebuild
4. Runtime must have `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers` (see `render.yaml`)
5. Build error `su: Authentication failure` on `install-deps` — do not use `playwright install-deps` on Render (no root); `playwright:install:render` installs only the browser binary
6. If Chromium crashes (missing `.so` or OOM), try Docker with Playwright image or upgrade Render plan (more RAM)
7. Optional env: `HERE_PLAYWRIGHT_TIMEOUT_MS=45000`, `HERE_MAPS_DEFAULT_ZOOM=16`
8. Local setup: `yarn playwright:install` (add `playwright install-deps chromium` locally if launch fails)

## Database Setup

1. Create a PostgreSQL database (Neon.tech recommended)
2. Set the connection URLs in environment variables
3. The application will automatically create tables on first run

## Security Notes

- Never commit `.env` files to version control
- Use strong, unique JWT secrets
- Enable SSL for database connections
- Use environment-specific configuration
