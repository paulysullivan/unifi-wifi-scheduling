PROJECT_DIR := $(shell pwd)
INSTALL_DIR ?= $(PROJECT_DIR)
VENV := $(INSTALL_DIR)/backend/.venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
ALEMBIC := $(VENV)/bin/alembic
PORT := $(shell grep '^PORT=' .env 2>/dev/null | cut -d= -f2 || echo 7323)

# macOS launchd
PLIST_NAME := com.user.network-schedule-manager
PLIST_DST := $(HOME)/Library/LaunchAgents/$(PLIST_NAME).plist

# Linux systemd
SERVICE_NAME := network-schedule-manager
SERVICE_DST := $(HOME)/.config/systemd/user/$(SERVICE_NAME).service

.PHONY: docker-build docker-up docker-down docker-logs docker-restart \
        install-deps build-frontend db-migrate db-rollback \
        install-macos start-macos stop-macos \
        install-systemd start-systemd stop-systemd status-systemd \
        install start stop restart logs status \
        dev-backend dev-frontend

# =============================================================================
# Docker (preferred)
# =============================================================================

docker-build: ## Build Docker image
	docker compose build

docker-up: ## Start app in Docker (builds if needed)
	docker compose up -d --build

docker-down: ## Stop and remove Docker container
	docker compose down

docker-logs: ## Tail Docker container logs
	docker compose logs -f

docker-restart: ## Restart Docker container
	docker compose restart

# =============================================================================
# Development
# =============================================================================

dev-backend: ## Run backend with --reload for development
	cd $(INSTALL_DIR)/backend && $(UVICORN) main:app --reload --host 0.0.0.0 --port $(PORT)

dev-frontend: ## Run Vite dev server (proxies /api to backend)
	cd $(INSTALL_DIR)/frontend && npm run dev

# =============================================================================
# Shared build targets
# =============================================================================

install-deps: ## Install Python + Node dependencies
	python3.12 -m venv $(VENV)
	$(PIP) install -r $(INSTALL_DIR)/backend/requirements.txt
	cd $(INSTALL_DIR)/frontend && npm install

build-frontend: ## Build frontend with Vite
	cd $(INSTALL_DIR)/frontend && npm run build

db-migrate: ## Run alembic upgrade head
	cd $(INSTALL_DIR)/backend && $(ALEMBIC) upgrade head

db-rollback: ## Run alembic downgrade -1
	cd $(INSTALL_DIR)/backend && $(ALEMBIC) downgrade -1

# =============================================================================
# macOS (launchd)
# =============================================================================

install-macos: install-deps build-frontend db-migrate ## Full native macOS install
	@mkdir -p $(INSTALL_DIR)/logs
	@sed -e 's|VENV_PATH|$(VENV)|g' \
	     -e 's|PROJECT_PATH|$(INSTALL_DIR)|g' \
	     -e 's|PORT_VALUE|$(PORT)|g' \
	     $(PROJECT_DIR)/launch-agent.plist > $(PLIST_DST)
	@echo "Installed launchd plist to $(PLIST_DST)"
	@echo "Run 'make start-macos' to start the service"

start-macos: ## Load and start the launchd service
	launchctl load $(PLIST_DST)
	@echo "Service started"

stop-macos: ## Unload the launchd service
	launchctl unload $(PLIST_DST) 2>/dev/null || true
	@echo "Service stopped"

# =============================================================================
# Linux (systemd)
# =============================================================================

install-systemd: install-deps build-frontend db-migrate ## Full native Linux install
	@mkdir -p $(INSTALL_DIR)/logs
	@mkdir -p $(HOME)/.config/systemd/user
	@sed -e 's|INSTALL_PATH|$(INSTALL_DIR)|g' \
	     -e 's|INSTALL_USER|$(USER)|g' \
	     -e 's|PORT_VALUE|$(PORT)|g' \
	     $(PROJECT_DIR)/systemd/network-schedule-manager.service > $(SERVICE_DST)
	@systemctl --user daemon-reload
	@echo "Installed systemd unit to $(SERVICE_DST)"
	@echo "Run 'make start-systemd' to start the service"

start-systemd: ## Start the systemd service
	systemctl --user start $(SERVICE_NAME)
	@echo "Service started"

stop-systemd: ## Stop the systemd service
	systemctl --user stop $(SERVICE_NAME)
	@echo "Service stopped"

status-systemd: ## Check systemd service status
	systemctl --user status $(SERVICE_NAME)

# =============================================================================
# Backward-compatible aliases (default to macOS)
# =============================================================================

install: install-macos
start: start-macos
stop: stop-macos
restart: stop start
logs: ## Tail the service log
	tail -f $(INSTALL_DIR)/logs/service.log
status: ## Check if launchd service is loaded
	@launchctl list | grep $(PLIST_NAME) && echo "Service is loaded" || echo "Service is NOT loaded"
