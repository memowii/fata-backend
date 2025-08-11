#!/bin/bash

# Wrapper script for yarn commands that ensures package.json and yarn.lock stay synchronized
# Usage: ./scripts/yarn-docker.sh add <package-name>
#        ./scripts/yarn-docker.sh remove <package-name>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if docker compose is running
if ! docker compose ps app | grep -q "Up"; then
    echo -e "${RED}Error: Docker container is not running. Start it with: docker compose up -d${NC}"
    exit 1
fi

# Get the command
YARN_CMD="$@"

if [ -z "$YARN_CMD" ]; then
    echo -e "${RED}Error: No yarn command provided${NC}"
    echo "Usage: $0 <yarn-command>"
    echo "Example: $0 add express"
    echo "         $0 remove express"
    echo "         $0 add -D @types/node"
    exit 1
fi

echo -e "${BLUE}Running: yarn ${YARN_CMD}${NC}"

# Run yarn command in container
docker compose exec app yarn ${YARN_CMD}

# Check if the command likely modified packages (add, remove, upgrade, etc.)
if [[ "$YARN_CMD" =~ ^(add|remove|upgrade|install) ]]; then
    echo -e "${YELLOW}Package modification detected. Synchronizing files...${NC}"
    
    # Copy package.json from container to host
    echo -e "${GREEN}Copying package.json from container to host...${NC}"
    docker compose exec -T app cat package.json > package.json.tmp
    mv package.json.tmp package.json
    
    # Copy yarn.lock from container to host
    echo -e "${GREEN}Copying yarn.lock from container to host...${NC}"
    docker compose exec -T app cat yarn.lock > yarn.lock.tmp
    mv yarn.lock.tmp yarn.lock
    
    echo -e "${GREEN}✅ Package files synchronized successfully!${NC}"
else
    echo -e "${BLUE}Command completed (no package sync needed)${NC}"
fi