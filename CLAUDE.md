# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS backend application (fata-backend) built with TypeScript. It uses the NestJS framework for building scalable Node.js server-side applications.

## Common Development Commands

### Running the Application
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
# Run unit tests
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

### Module Pattern
NestJS uses a modular architecture where functionality is organized into modules. Each module typically contains:
- Controllers: Handle HTTP requests
- Services: Business logic implementation
- Module definition: Wires controllers and providers together

### Environment Configuration
The application uses ConfigModule for environment management. Set environment variables in a `.env` file at the project root.