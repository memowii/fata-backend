#!/bin/bash

# Script to synchronize package.json and yarn.lock between container and host
# This ensures that package installations in the container are reflected on the host

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Synchronizing package files between container and host...${NC}"

# Function to sync files from container to host
sync_from_container() {
    echo -e "${GREEN}Copying package.json from container to host...${NC}"
    docker compose exec -T app cat package.json > package.json.tmp
    mv package.json.tmp package.json
    
    echo -e "${GREEN}Copying yarn.lock from container to host...${NC}"
    docker compose exec -T app cat yarn.lock > yarn.lock.tmp
    mv yarn.lock.tmp yarn.lock
    
    echo -e "${GREEN}✅ Package files synchronized successfully!${NC}"
}

# Function to sync files from host to container (rebuild)
sync_to_container() {
    echo -e "${GREEN}Rebuilding container with updated package files...${NC}"
    docker compose build app --no-cache
    docker compose up -d app
    echo -e "${GREEN}✅ Container rebuilt with updated packages!${NC}"
}

# Main logic
case "${1:-}" in
    from-container)
        sync_from_container
        ;;
    to-container)
        sync_to_container
        ;;
    *)
        echo "Usage: $0 {from-container|to-container}"
        echo ""
        echo "  from-container: Copy package.json and yarn.lock from container to host"
        echo "  to-container:   Rebuild container with host's package.json and yarn.lock"
        exit 1
        ;;
esac