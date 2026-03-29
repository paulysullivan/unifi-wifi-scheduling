PROJECT_DIR := $(shell pwd)
VENV := $(PROJECT_DIR)/backend/.venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
ALEMBIC := $(VENV)/bin/alembic
PLIST_NAME := com.user.network-schedule-manager
PLIST_DST := $(HOME)/Library/LaunchAgents/$(PLIST_NAME).plist
PORT := $(shell grep '^PORT=' .env 2>/dev/null | cut -d= -f2 || echo 7323)

.PHONY: install dev-backend dev-frontend build-frontend start stop restart logs status db-migrate db-rollback

install: ## Full install: venv, deps, frontend build, launchd setup
	python3.12 -m venv $(VENV)
	$(PIP) install -r backend/requirements.txt
	cd frontend && npm install
	$(MAKE) build-frontend
	$(MAKE) db-migrate
	@mkdir -p logs
	@sed -e 's|VENV_PATH|$(VENV)|g' \
	     -e 's|PROJECT_PATH|$(PROJECT_DIR)|g' \
	     -e 's|PORT_VALUE|$(PORT)|g' \
	     launch-agent.plist > $(PLIST_DST)
	@echo "Installed launchd plist to $(PLIST_DST)"
	@echo "Run 'make start' to start the service"

dev-backend: ## Run backend with --reload for development
	cd backend && $(UVICORN) main:app --reload --host 0.0.0.0 --port $(PORT)

dev-frontend: ## Run Vite dev server (proxies /api to backend)
	cd frontend && npm run dev

build-frontend: ## Run vite build and copy dist/ for FastAPI to serve
	cd frontend && npm run build

start: ## Load and start the launchd service
	launchctl load $(PLIST_DST)
	@echo "Service started"

stop: ## Unload the launchd service
	launchctl unload $(PLIST_DST) 2>/dev/null || true
	@echo "Service stopped"

restart: stop start ## stop + start

logs: ## Tail the service log
	tail -f $(PROJECT_DIR)/logs/service.log

status: ## Check if launchd service is loaded
	@launchctl list | grep $(PLIST_NAME) && echo "Service is loaded" || echo "Service is NOT loaded"

db-migrate: ## Run alembic upgrade head
	cd backend && $(ALEMBIC) upgrade head

db-rollback: ## Run alembic downgrade -1
	cd backend && $(ALEMBIC) downgrade -1
