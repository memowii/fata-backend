# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS backend application (fata-backend) built with TypeScript. It uses the NestJS framework for building scalable Node.js server-side applications. The project is containerized with Docker and includes PostgreSQL 16 and Redis for data persistence and caching.

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

### Running the Application (Local Development)
```bash
# Development with hot reload
yarn start:dev

# Production mode
yarn start:prod

# Debug mode
yarn start:debug
```

### Build and Quality Checks
```bash
# Build the project
yarn build

# Run linter (auto-fix enabled)
yarn lint

# Format code with Prettier
yarn format
```

### Testing
```bash
# Run tests in Docker container (recommended)
make test
make test-watch
make test-cov
make test-e2e

# Run unit tests locally
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage report
yarn test:cov

# Run e2e tests
yarn test:e2e

# Debug tests
yarn test:debug
```

## Architecture

### Core Structure
- **NestJS Application**: Built on the modular architecture pattern
- **Entry Point**: `src/main.ts` - Bootstraps the application on port from `PORT` env variable or 5000
- **Root Module**: `src/app.module.ts` - Main application module with ConfigModule for environment variables
- **Configuration**: Uses `@nestjs/config` for environment variable management

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
3. The application will be available at `http://localhost:5000`
4. PostgreSQL at `localhost:5432` and Redis at `localhost:6379`

See `DOCKER.md` for detailed Docker documentation and `Makefile` for available commands.

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
- **Base path is /auth not /api/auth**: Register endpoint is `POST /auth/register`
- **Swagger docs**: Available at `http://localhost:5000/api`
- **Raw API spec**: Available at `http://localhost:5000/api-json`

### Docker Volume Mounting
- **package.json and yarn.lock need special handling**: Use delegated mounts
- **Hot reload works for src/**: TypeScript files auto-compile on change
- **Templates need restart**: After modifying .hbs files, restart container

### Debugging in Docker
- **Always check logs first**: `docker compose logs app | grep -i error`
- **Container health**: Verify with `curl http://localhost:5000/health`
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