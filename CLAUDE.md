# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS backend application (fata-backend) built with TypeScript. It uses the NestJS framework for building scalable Node.js server-side applications. The project is containerized with Docker and includes PostgreSQL 16 and Redis for data persistence and caching.

IMPORTANT: The development of this project is mainly through Docker, so use Docker not local development.

## General project context

To gain a general context of what we're building and project's docs you can read these files:

@documentation/from-article-to-audio-srs-v1.2.md <br>
@documentation/api-docs-v1.json
@Makefile
@AWS_SES_SETUP.md
@DOCKER.md
@PACKAGE_MANAGEMENT.md

## Common Development Commands

### Docker Commands (Recommended)
```bash
# Start development containers (PostgreSQL, Redis, and app)
make up
# or
docker compose up

# Start in detached mode
make up-d

# Stop containers
make down

# Access container shell
make shell

# View logs
make logs
```

### Testing
```bash
# Run tests in Docker container (recommended)
make test
make test-watch
make test-cov
make test-e2e
```

## Architecture

### Core Structure
- **NestJS Application**: Built on the modular architecture pattern
- **Entry Point**: `src/main.ts` - Bootstraps the application on port from `PORT` env variable or 5000
- **Root Module**: `src/app.module.ts` - Main application module with ConfigModule for environment variables
- **Configuration**: Uses `@nestjs/config` for environment variable management
- **API Versioning**: Uses URL-based versioning with `/api/v1` prefix for all endpoints

### Key Technologies
- **Framework**: NestJS 11.x with Express adapter
- **Language**: TypeScript 5.7
- **Testing**: Jest for unit/integration tests
- **Build Tool**: NestJS CLI with SWC compiler
- **Package Manager**: Yarn 1.22
- **Containerization**: Docker with multi-stage builds
- **Database**: PostgreSQL 16
- **Cache**: Redis
- **Development**: Docker Compose for local development environment

### Module Pattern
NestJS uses a modular architecture where functionality is organized into modules. Each module typically contains:
- Controllers: Handle HTTP requests
- Services: Business logic implementation
- Module definition: Wires controllers and providers together

### Environment Configuration
The application uses ConfigModule for environment management. Set environment variables in a `.env` file at the project root.

### Docker Setup
The project includes a complete Docker setup with:
- **Development container** with hot reload and volume mounting
- **Production-optimized container** with multi-stage builds
- **PostgreSQL 16** database container
- **Redis** cache container
- **Docker Compose** configuration for easy local development
- **Makefile** with convenient commands for Docker operations

To get started with Docker:
1. Copy the environment file: `make env-copy` or `cp .env.example .env`
2. Start the development environment: `make up` or `docker compose up`
3. The application will be available at `http://localhost:5000` or chosen port from the .env file
4. PostgreSQL at `localhost:5432` and Redis at `localhost:6379` or the chose ports from the .env file

## Important Learnings and Best Practices

### Package Management in Docker
- **Always use Make commands for package management**: `make yarn-add pkg="package-name"`
- **Never run yarn directly in host**: Packages must be installed in container
- **Sync issues**: If package.json gets out of sync, run `make sync-packages`
- **Check both locations**: Verify packages exist in both container and host package.json

### NestJS Build Configuration
- **Template files need special handling**: Add to nest-cli.json:
  ```json
  "compilerOptions": {
    "assets": [{"include": "**/*.hbs", "watchAssets": true}]
  }
  ```
- **Build output structure**: Compiled files go to `dist/` but may have different paths than source
- **Static files**: Place templates and assets that need copying in src folder

### Email Service with AWS SES
- **Development mode**: System auto-detects missing AWS credentials and simulates emails
- **Sandbox limitations**: Can only send to verified emails until production access granted
- **Template paths**: Email templates may need hardcoded paths due to build variations
- **Always verify**: Check logs for "MessageId" to confirm SES sending

### API Endpoints
- **API Version**: All endpoints use `/api/v1` prefix for versioning
- **Base path**: Register endpoint is `POST /api/v1/auth/register`
- **Swagger docs**: Available at `http://localhost:$PORT/api/v1`
- **Raw API spec**: Available at `http://localhost:$PORT/api/v1-json`
- **Versioning Strategy**: API uses URL-based versioning (e.g., `/api/v1`, `/api/v2`)

### Docker Volume Mounting
- **package.json and yarn.lock need special handling**: Use delegated mounts
- **Hot reload works for src/**: TypeScript files auto-compile on change
- **Templates need restart**: After modifying .hbs files, restart container

### Debugging in Docker
- **Always check logs first**: `docker compose logs app | grep -i error`
- **Container health**: Verify with `curl http://localhost:$PORT/health`
- **TypeScript errors prevent startup**: Fix compilation errors before container runs
- **Environment variables**: Restart container after .env changes

### Testing Email Templates
- **Use simple passwords for testing**: Avoid special characters in curl commands
- **Test with verified emails**: In AWS SES sandbox, recipient must be verified
- **Check template loading**: Look for "Successfully loaded X email templates" in logs
- **Button visibility**: Use dark solid colors (#2c3e50) not light gradients

### Common Pitfalls to Avoid
- **Don't assume package installation persists**: Always check package.json
- **Don't trust TypeScript path resolution**: May need explicit paths in runtime
- **Don't skip log checking**: Many issues are clearly shown in logs
- **Don't use complex passwords in curl**: JSON escaping causes issues