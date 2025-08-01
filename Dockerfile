# Multi-stage Dockerfile for NestJS application

# Base stage - common dependencies
FROM node:20-alpine AS base
# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init
# Create app directory
WORKDIR /usr/src/app
# Copy package files
COPY package.json yarn.lock ./

# Dependencies stage - install all dependencies
FROM base AS dependencies
# Install all dependencies (including devDependencies for building)
RUN yarn install --frozen-lockfile

# Build stage - build the application
FROM dependencies AS build
# Copy source code
COPY . .
# Build the application
RUN yarn build

# Production dependencies stage - install only production dependencies
FROM base AS production-dependencies
# Install only production dependencies
RUN yarn install --frozen-lockfile --production

# Development stage - for local development with hot reload
FROM base AS development
# Install all dependencies
RUN yarn install --frozen-lockfile
# Copy source code
COPY . .
# Expose port
EXPOSE 5000
# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
# Start development server
CMD ["yarn", "start:dev"]

# Production stage - optimized for production
FROM node:20-alpine AS production
# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init
# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
# Create app directory
WORKDIR /usr/src/app
# Copy production dependencies from production-dependencies stage
COPY --from=production-dependencies --chown=nestjs:nodejs /usr/src/app/node_modules ./node_modules
# Copy built application from build stage
COPY --from=build --chown=nestjs:nodejs /usr/src/app/dist ./dist
# Copy package.json for reference
COPY --chown=nestjs:nodejs package.json ./
# Switch to non-root user
USER nestjs
# Expose port
EXPOSE 5000
# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
# Start production server
CMD ["node", "dist/main"]