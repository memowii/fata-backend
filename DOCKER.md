# Docker Setup for FATA Backend

This document provides instructions for running the FATA backend application using Docker with PostgreSQL 16 and Redis.

## Prerequisites

- Docker Desktop (Docker Engine 20.10+ and Docker Compose 2.0+)
- Yarn 1.22+ (for local development only)

## Quick Start

### Development Mode

1. Copy the environment file:
```bash
cp .env.example .env
```

2. Start the development container:
```bash
docker compose up
```

The application will be available at `http://localhost:5000` with hot reload enabled.

PostgreSQL will be available at `localhost:5432` and Redis at `localhost:6379`.

### Production Mode

To test the production build locally:

```bash
# Build and run production container
docker compose --profile production up app-prod
```

The production container will be available at `http://localhost:5001`.

## Docker Commands

### Development

```bash
# Start development container
docker compose up

# Start in detached mode
docker compose up -d

# View logs
docker compose logs -f app

# Stop containers
docker compose down

# Rebuild containers (after dependency changes)
docker compose build --no-cache

# Run tests in container
docker compose exec app yarn test

# Run e2e tests
docker compose exec app yarn test:e2e

# Access container shell
docker compose exec app sh
```

### Production Build

```bash
# Build production image
docker build -t fata-backend:latest --target production .

# Run production container
docker run -p 5000:5000 --env-file .env.production fata-backend:latest

# Run with custom port
docker run -p 8080:5000 -e PORT=5000 fata-backend:latest
```

## Architecture

### Multi-Stage Build

The Dockerfile uses a multi-stage build approach for optimization:

1. **base**: Common setup with Node.js Alpine image
2. **dependencies**: Installs all dependencies for building
3. **build**: Compiles TypeScript to JavaScript
4. **production-dependencies**: Installs only production dependencies
5. **development**: Development stage with all dependencies and hot reload
6. **production**: Optimized production stage with minimal footprint

### Key Features

- **Small image size**: Uses Alpine Linux and multi-stage builds
- **Security**: Runs as non-root user in production
- **Signal handling**: Uses dumb-init for proper process management
- **Layer caching**: Optimized for fast rebuilds
- **Hot reload**: Volume mounting for development

## Environment Variables

Environment variables can be set in multiple ways:

1. `.env` file (development)
2. `.env.production` file (production)
3. Docker Compose environment section
4. Docker run -e flags

### Required Variables

- `PORT`: Application port (default: 5000)
- `NODE_ENV`: Environment (development/production)

### Database Variables

- `POSTGRES_HOST`: PostgreSQL host (default: postgres)
- `POSTGRES_PORT`: PostgreSQL port (default: 5432)
- `POSTGRES_USER`: PostgreSQL user (default: fata_user)
- `POSTGRES_PASSWORD`: PostgreSQL password (default: fata_password)
- `POSTGRES_DB`: PostgreSQL database name (default: fata_db)
- `DATABASE_URL`: Complete PostgreSQL connection string

### Redis Variables

- `REDIS_HOST`: Redis host (default: redis)
- `REDIS_PORT`: Redis port (default: 6379)
- `REDIS_PASSWORD`: Redis password (default: fata_redis_password)
- `REDIS_URL`: Complete Redis connection string

### Optional Variables

See `.env.example` for additional configuration options.

## Volumes

### Development Volumes

- `./src:/usr/src/app/src` - Source code for hot reload
- `./test:/usr/src/app/test` - Test files
- Config files (tsconfig.json, etc.)

### Data Persistence Volumes

- `postgres-data`: PostgreSQL data directory
- `redis-data`: Redis data directory
- `fata-data`: Application data (if needed)

### Production Volumes

No source code volumes are mounted in production for security. All code is baked into the image. Data persistence volumes are still used.

## Networking

The application uses a custom bridge network `fata-network` for container communication. All services (app, postgres, redis) are connected to this network and can communicate using service names as hostnames.

## Troubleshooting

### Container won't start

1. Check logs: `docker compose logs app`
2. Verify port availability: `lsof -i :5000`
3. Check environment variables: `docker compose config`
4. Ensure database and Redis are healthy: `docker compose ps`

### Hot reload not working

1. Ensure volumes are mounted correctly
2. Check file permissions
3. Verify Docker Desktop file sharing settings

### Build failures

1. Clear Docker cache: `docker system prune -a`
2. Update base image: `docker pull node:20-alpine`
3. Check yarn.lock integrity

### Performance issues

1. Increase Docker Desktop resources
2. Use .dockerignore to exclude unnecessary files
3. Enable BuildKit: `DOCKER_BUILDKIT=1 docker build .`

## Best Practices

1. **Never commit .env files** - Use .env.example as template
2. **Use specific versions** - Pin Node.js and dependency versions
3. **Layer caching** - Order Dockerfile commands by change frequency
4. **Security scanning** - Run `docker scan fata-backend:latest`
5. **Size optimization** - Use `docker images` to monitor image sizes

## CI/CD Integration

For CI/CD pipelines:

```bash
# Build with build arguments
docker build \
  --build-arg NODE_ENV=production \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse HEAD) \
  -t fata-backend:$(git rev-parse --short HEAD) \
  --target production .

# Push to registry
docker tag fata-backend:latest your-registry/fata-backend:latest
docker push your-registry/fata-backend:latest
```

## Health Checks

All services include health checks:

### Application Health Check
```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### PostgreSQL Health Check
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER -d $POSTGRES_DB"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s
```

### Redis Health Check
```yaml
healthcheck:
  test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 20s
```

Note: Implement `/health` endpoint in your application first.

## Database and Redis Management

### PostgreSQL Commands

```bash
# Access PostgreSQL shell
make db-shell

# Create database backup
make db-backup

# Restore database from backup
make db-restore FILE=backups/backup_20240101_120000.sql.gz

# View PostgreSQL logs
make logs-db
```

### Redis Commands

```bash
# Access Redis CLI
make redis-shell

# View Redis logs
make logs-redis
```

### Direct Database Access

```bash
# PostgreSQL from host
psql -h localhost -p 5432 -U fata_user -d fata_db

# Redis from host
redis-cli -h localhost -p 6379 -a fata_redis_password
```