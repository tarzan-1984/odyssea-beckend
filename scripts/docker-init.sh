#!/bin/bash

# Docker initialization script for Odyssea Backend
# This script sets up the database and runs migrations

set -e

echo "🐳 Initializing Odyssea Backend with Docker..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker-compose exec -T postgres pg_isready -U postgres; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✅ PostgreSQL is ready!"

# Run database migrations
echo "🔄 Running database migrations..."
docker-compose exec app yarn prisma:migrate

# Generate Prisma client
echo "🔧 Generating Prisma client..."
docker-compose exec app yarn prisma:generate

# Seed database (optional)
echo "🌱 Seeding database..."
docker-compose exec app yarn prisma:seed || echo "No seed data found"

echo "🎉 Docker initialization completed!"
echo "📚 API Documentation: http://localhost:3000/docs"
echo "🗄️  Prisma Studio: http://localhost:5555"
echo "🔍 Health Check: http://localhost:3000/api/v1/health"
