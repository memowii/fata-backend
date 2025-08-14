# Package Management in Docker

## Overview
This project runs inside Docker containers, which creates challenges for keeping package.json and yarn.lock synchronized between the container and host filesystem. This document explains how to properly manage packages.

## The Problem
When you install packages inside a Docker container using `docker compose exec app yarn add <package>`, the changes to package.json and yarn.lock happen inside the container but don't always sync back to the host filesystem due to volume mounting limitations.

## The Solution
We've implemented several methods to ensure proper synchronization:

### Method 1: Using Make Commands (Recommended)
The easiest way to manage packages is using the provided Make commands that automatically handle synchronization:

```bash
# Add a production dependency
make yarn-add pkg="express"

# Add a development dependency
make yarn-add-dev pkg="@types/node"

# Remove a package
make yarn-remove pkg="express"

# Run any yarn command
make yarn cmd="upgrade @nestjs/core"

# Manually sync files from container to host
make sync-packages
```

### Method 2: Using the yarn-docker Script
You can also use the wrapper script directly:

```bash
# Add a package
./scripts/yarn-docker.sh add express

# Add a dev dependency
./scripts/yarn-docker.sh add -D @types/node

# Remove a package
./scripts/yarn-docker.sh remove express

# Any other yarn command
./scripts/yarn-docker.sh upgrade
```

### Method 3: Manual Synchronization
If you've already run yarn commands inside the container and need to sync:

```bash
# Copy package.json and yarn.lock from container to host
./scripts/sync-packages.sh from-container

# Or use the make command
make sync-packages
```

## How It Works

### Automatic Synchronization
The `yarn-docker.sh` script:
1. Runs the yarn command inside the Docker container
2. Detects if the command modifies packages (add, remove, upgrade, install)
3. Automatically copies package.json and yarn.lock from the container back to the host
4. Ensures both files stay in sync

### Docker Compose Override
The `docker-compose.override.yml` file uses "delegated" volume mounts which improve performance and allow better write access from the container to the host.

## Best Practices

### ✅ DO:
- Always use the provided Make commands or scripts for package management
- Run `make sync-packages` if you notice package.json is out of sync
- Commit both package.json and yarn.lock after adding/removing packages
- Restart the container after major package changes: `docker compose restart app`

### ❌ DON'T:
- Don't run `yarn add` directly on the host (unless you also run `yarn install` in the container)
- Don't edit package.json manually without syncing
- Don't ignore yarn.lock changes

## Common Scenarios

### Adding a new package
```bash
# Example: Adding AWS SDK
make yarn-add pkg="@aws-sdk/client-s3"

# The script will:
# 1. Run yarn add inside container
# 2. Sync package.json to host
# 3. Sync yarn.lock to host
```

### Adding multiple packages
```bash
# Add multiple packages at once
make yarn cmd="add express helmet cors"
```

### Upgrading packages
```bash
# Upgrade all packages
make yarn cmd="upgrade"

# Upgrade specific package
make yarn cmd="upgrade @nestjs/core@latest"
```

### After pulling changes from git
If someone else added packages:
```bash
# Install new packages in container
docker compose exec app yarn install

# Or rebuild the container
docker compose down
docker compose up --build
```

## Troubleshooting

### Package.json out of sync
If you see different packages in container vs host:
```bash
# Force sync from container to host
make sync-packages
```

### Container can't find packages
If the container can't find installed packages:
```bash
# Rebuild the container
docker compose down
docker compose build --no-cache
docker compose up
```

### Permission issues
If you get permission errors:
```bash
# Ensure scripts are executable
chmod +x scripts/*.sh

# Check Docker is running
docker compose ps
```

### Yarn.lock conflicts
If you have yarn.lock merge conflicts:
```bash
# Delete yarn.lock and regenerate
rm yarn.lock
docker compose exec app yarn install
make sync-packages
```

## Quick Reference

| Task | Command |
|------|---------|
| Add package | `make yarn-add pkg="package-name"` |
| Add dev package | `make yarn-add-dev pkg="package-name"` |
| Remove package | `make yarn-remove pkg="package-name"` |
| Update all | `make yarn cmd="upgrade"` |
| Install packages | `docker compose exec app yarn install` |
| Sync files | `make sync-packages` |
| Check installed | `docker compose exec app yarn list` |

## Technical Details

### Volume Mounting Strategy
- Source code: Mounted with `delegated` flag for better performance
- package.json/yarn.lock: Mounted with `delegated` to allow container writes
- node_modules: NOT mounted (container-only) to prevent conflicts

### Delegated vs Cached vs Consistent
- `delegated`: Container's view is authoritative (best for container writes)
- `cached`: Host's view is authoritative (best for host writes)
- `consistent`: Full consistency (slower performance)

We use `delegated` for package files to ensure container changes propagate to host.

## Integration with CI/CD
When deploying or in CI/CD pipelines, always use the container's package.json:
```bash
# Build production image
docker build -t app:prod .

# The Dockerfile copies package.json and runs yarn install
# No need for synchronization in production
```