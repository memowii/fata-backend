# Makefile for Docker operations

# Variables
DOCKER_COMPOSE = docker compose
DOCKER = docker
APP_NAME = fata-backend
IMAGE_NAME = $(APP_NAME):latest
PROD_IMAGE_NAME = $(APP_NAME):prod

# Colors for output
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m # No Color

.PHONY: help
help: ## Show this help message
	@echo "$(GREEN)FATA Backend Docker Commands$(NC)"
	@echo "=============================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

.PHONY: up
up: ## Start development containers
	$(DOCKER_COMPOSE) up

.PHONY: up-d
up-d: ## Start development containers in detached mode
	$(DOCKER_COMPOSE) up -d

.PHONY: down
down: ## Stop and remove containers
	$(DOCKER_COMPOSE) down

.PHONY: build
build: ## Build development image
	$(DOCKER_COMPOSE) build

.PHONY: build-prod
build-prod: ## Build production image
	$(DOCKER) build -t $(PROD_IMAGE_NAME) --target production .

.PHONY: rebuild
rebuild: ## Rebuild containers without cache
	$(DOCKER_COMPOSE) build --no-cache

.PHONY: logs
logs: ## Show container logs
	$(DOCKER_COMPOSE) logs -f app

# Package Management Commands
.PHONY: yarn
yarn: ## Run yarn command in container (usage: make yarn cmd="add express")
	@if [ -z "$(cmd)" ]; then \
		echo "$(RED)Error: No command specified. Usage: make yarn cmd=\"add express\"$(NC)"; \
		exit 1; \
	fi
	@./scripts/yarn-docker.sh $(cmd)

.PHONY: yarn-add
yarn-add: ## Add a package (usage: make yarn-add pkg="express")
	@if [ -z "$(pkg)" ]; then \
		echo "$(RED)Error: No package specified. Usage: make yarn-add pkg=\"express\"$(NC)"; \
		exit 1; \
	fi
	@./scripts/yarn-docker.sh add $(pkg)

.PHONY: yarn-add-dev
yarn-add-dev: ## Add a dev dependency (usage: make yarn-add-dev pkg="@types/node")
	@if [ -z "$(pkg)" ]; then \
		echo "$(RED)Error: No package specified. Usage: make yarn-add-dev pkg=\"@types/node\"$(NC)"; \
		exit 1; \
	fi
	@./scripts/yarn-docker.sh add -D $(pkg)

.PHONY: yarn-remove
yarn-remove: ## Remove a package (usage: make yarn-remove pkg="express")
	@if [ -z "$(pkg)" ]; then \
		echo "$(RED)Error: No package specified. Usage: make yarn-remove pkg=\"express\"$(NC)"; \
		exit 1; \
	fi
	@./scripts/yarn-docker.sh remove $(pkg)

.PHONY: sync-packages
sync-packages: ## Sync package.json and yarn.lock from container to host
	@./scripts/sync-packages.sh from-container

.PHONY: shell
shell: ## Access container shell
	$(DOCKER_COMPOSE) exec app sh

.PHONY: test
test: ## Run tests in container
	$(DOCKER_COMPOSE) exec app yarn test

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	$(DOCKER_COMPOSE) exec app yarn test:watch

.PHONY: test-cov
test-cov: ## Run tests with coverage
	$(DOCKER_COMPOSE) exec app yarn test:cov

.PHONY: test-e2e
test-e2e: ## Run e2e tests
	$(DOCKER_COMPOSE) exec app yarn test:e2e

.PHONY: lint
lint: ## Run linter
	$(DOCKER_COMPOSE) exec app yarn lint

.PHONY: format
format: ## Format code
	$(DOCKER_COMPOSE) exec app yarn format

.PHONY: clean
clean: ## Clean up containers, volumes, and images
	$(DOCKER_COMPOSE) down -v
	$(DOCKER) rmi $(IMAGE_NAME) || true
	$(DOCKER) rmi $(PROD_IMAGE_NAME) || true

.PHONY: prune
prune: ## Remove all unused Docker resources
	$(DOCKER) system prune -af --volumes

.PHONY: prod
prod: ## Run production container
	$(DOCKER_COMPOSE) --profile production up app-prod

.PHONY: prod-run
prod-run: build-prod ## Build and run production container standalone
	$(DOCKER) run -p 5000:5000 --env-file .env.production $(PROD_IMAGE_NAME)

.PHONY: stats
stats: ## Show container resource usage
	$(DOCKER) stats

.PHONY: ps
ps: ## Show running containers
	$(DOCKER_COMPOSE) ps

.PHONY: env-copy
env-copy: ## Copy example environment file
	cp .env.example .env

.PHONY: install
install: env-copy ## Initial setup
	@echo "$(GREEN)Initial setup complete!$(NC)"
	@echo "Run 'make up' to start the development server"

.PHONY: db-shell
db-shell: ## Access PostgreSQL shell
	$(DOCKER_COMPOSE) exec postgres psql -U $(shell grep POSTGRES_USER .env | cut -d '=' -f2 || echo 'fata_user') -d $(shell grep POSTGRES_DB .env | cut -d '=' -f2 || echo 'fata_db')

.PHONY: redis-shell
redis-shell: ## Access Redis CLI
	$(DOCKER_COMPOSE) exec redis redis-cli -a $(shell grep REDIS_PASSWORD .env | cut -d '=' -f2 || echo 'fata_redis_password')

.PHONY: db-backup
db-backup: ## Backup PostgreSQL database
	@mkdir -p backups
	$(DOCKER_COMPOSE) exec postgres pg_dump -U $(shell grep POSTGRES_USER .env | cut -d '=' -f2 || echo 'fata_user') $(shell grep POSTGRES_DB .env | cut -d '=' -f2 || echo 'fata_db') | gzip > backups/backup_$(shell date +%Y%m%d_%H%M%S).sql.gz
	@echo "$(GREEN)Database backup created in backups/$(NC)"

.PHONY: db-restore
db-restore: ## Restore PostgreSQL database from backup (usage: make db-restore FILE=backups/backup_*.sql.gz)
	@test -n "$(FILE)" || (echo "$(RED)Error: FILE parameter required$(NC)" && exit 1)
	@test -f "$(FILE)" || (echo "$(RED)Error: File $(FILE) not found$(NC)" && exit 1)
	gunzip -c $(FILE) | $(DOCKER_COMPOSE) exec -T postgres psql -U $(shell grep POSTGRES_USER .env | cut -d '=' -f2 || echo 'fata_user') $(shell grep POSTGRES_DB .env | cut -d '=' -f2 || echo 'fata_db')
	@echo "$(GREEN)Database restored from $(FILE)$(NC)"

.PHONY: logs-all
logs-all: ## Show all container logs
	$(DOCKER_COMPOSE) logs -f

.PHONY: logs-db
logs-db: ## Show PostgreSQL logs
	$(DOCKER_COMPOSE) logs -f postgres

.PHONY: logs-redis
logs-redis: ## Show Redis logs
	$(DOCKER_COMPOSE) logs -f redis

.PHONY: update-api-docs
update-api-docs: ## Download OpenAPI spec to documentation folder
	@mkdir -p documentation
	curl -s http://localhost:5000/api/v1-json | jq '.' > documentation/api-docs-v1.json
	@echo "$(GREEN)API v1 documentation updated at documentation/api-docs-v1.json$(NC)"