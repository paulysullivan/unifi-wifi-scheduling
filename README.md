# Network Schedule Manager

A web application to manage internet access schedules for devices on a Ubiquiti UniFi network (UDM Pro). Enforce time-based restrictions for groups of devices, with on-demand per-day time extensions.

Built to run persistently on a local network — as a Docker container, macOS launchd service, or Linux systemd service.

## Features

- **Device discovery** — Sync devices from your UniFi controller automatically
- **Device groups** — Organize devices into named, color-coded groups (e.g. "Kids Devices")
- **Weekly schedules** — Set recurring block/unblock times per group (e.g. "Block weekdays 10 PM - 6 AM")
- **Time extensions** — Grant +15 minute extensions from the dashboard, up to a configurable daily max
- **Live dashboard** — See which groups are currently restricted, with auto-refresh every 30 seconds
- **Startup reconciliation** — On restart, the scheduler checks what _should_ be blocked and corrects any drift
- **Mobile-first UI** — Optimized for iOS Safari with bottom navigation and touch-friendly controls

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), APScheduler |
| Frontend | React 18, Vite 5, Tailwind CSS 3, TanStack Query v5 |
| Database | SQLite (via aiosqlite + Alembic migrations) |
| Auth | JWT (python-jose) + bcrypt password hashing |
| UniFi API | httpx (async), UniFi API key auth, per-device block/unblock via stamgr |
| Encryption | Fernet symmetric encryption for stored UniFi credentials |

## Quick Start (Docker)

Docker is the recommended deployment method.

### Prerequisites

- Docker and Docker Compose
- A Ubiquiti UDM Pro (or compatible UniFi controller) on your local network

### 1. Clone and configure

```bash
git clone <repo-url> && cd manage-network-schedule
cp .env.example .env
```

Edit `.env` and fill in the required values:

```bash
# Generate these:
#   python3 -c "import secrets; print(secrets.token_hex(32))"
#   python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
SECRET_KEY=<generated-secret>
ENCRYPTION_KEY=<generated-fernet-key>

# Set your admin password
ADMIN_PASSWORD=<your-password>

# Adjust port if needed (default: 7323)
PORT=7323

# Add your server's LAN IP for CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:7323,http://<your-lan-ip>:7323
```

### 2. Start

```bash
make docker-up
```

This builds the multi-stage Docker image (Node for frontend, Python for backend), runs database migrations, and starts the app.

### 3. Access

Open `http://localhost:7323` (or `http://<your-lan-ip>:7323` from other devices on your network).

Log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env` file.

### 4. Connect to UniFi

1. Go to **Settings**
2. Add your UDM Pro credentials (URL, API key, site ID)
3. Click **Test Connection**
4. **Activate** the credential set
5. Go to **Devices** and click **Sync from Network**

## Randomized MAC addresses (Apple Private Wi-Fi Address)

Blocking is per MAC address, and iOS/macOS can present a different "private" MAC (per network, and rotating on newer versions, or after "Forget This Network"). To keep up, the app syncs UniFi every 5 minutes. A new device that is in no group and whose hostname matches members of exactly one group is added to that group automatically (and blocked at once if the group is currently restricted). Generic hostnames like "iPhone" are ignored. Matches are logged as `device_follow` in the enforcement log.

**Limitation:** this only works when the device reports a distinctive hostname. Many iPhones, iPads and Watches report a generic one ("iPhone", "iPad", "watch"), which is deliberately ignored because it would match everyone's devices. For those, use the network-side options below.

For stronger protection, combine this with UniFi settings:
- Put the device on a dedicated SSID with a MAC allow list, so an unknown MAC cannot join at all.
- Or turn off Private Wi-Fi Address for that network on the device (Settings > Wi-Fi > network > Private Wi-Fi Address > Off), or enforce it with an MDM-managed Wi-Fi profile.

## Deployment Options

### Docker (recommended)

```bash
make docker-up          # Build and start
make docker-logs        # Tail logs
make docker-restart     # Restart
make docker-down        # Stop and remove
```

Data is persisted in `./data/` via a Docker volume mount. The SQLite database survives container restarts and rebuilds.

### Native macOS (launchd)

Requires Python 3.12 and Node.js installed on the host.

```bash
make install-macos      # Install deps, build frontend, run migrations, install plist
make start-macos        # Start service (runs on login, restarts on crash)
make stop-macos         # Stop service
```

To install to a custom directory:

```bash
make install-macos INSTALL_DIR=/opt/network-schedule
```

### Native Linux (systemd)

```bash
make install-systemd    # Install deps, build, install user service unit
make start-systemd      # Start service
make stop-systemd       # Stop service
make status-systemd     # Check status
```

## Development

Run the backend and frontend separately with hot reload:

```bash
# Terminal 1 — backend (Python, auto-reloads on save)
make dev-backend

# Terminal 2 — frontend (Vite dev server, proxies /api to backend)
make dev-frontend
```

The Vite dev server proxies `/api/*` requests to the backend. The proxy port can be customized with `VITE_API_PORT=<port>`.

### Database migrations

```bash
make db-migrate         # Apply pending migrations (alembic upgrade head)
make db-rollback        # Roll back one migration (alembic downgrade -1)
```

## API Endpoints

All endpoints except `POST /api/auth/login` and `GET /api/health` require `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (unauthenticated) |
| `POST` | `/api/auth/login` | Login, returns JWT |
| `GET` | `/api/auth/me` | Current user info |
| `GET` | `/api/credentials` | List UniFi credential sets |
| `POST` | `/api/credentials` | Create credential set |
| `POST` | `/api/credentials/{id}/test` | Test UniFi connectivity |
| `POST` | `/api/credentials/{id}/activate` | Set as active |
| `GET` | `/api/devices` | List devices (`?group_id=`, `?unassigned=true`) |
| `POST` | `/api/devices/sync` | Sync devices from UniFi |
| `PUT` | `/api/devices/{mac}` | Update device name/type |
| `GET` | `/api/groups` | List groups with device counts |
| `POST` | `/api/groups` | Create group |
| `GET` | `/api/groups/{id}` | Group detail with devices and schedules |
| `PUT` | `/api/groups/{id}/devices` | Set group device membership |
| `GET` | `/api/schedules` | List schedules (`?group_id=`) |
| `POST` | `/api/schedules` | Create schedule |
| `PATCH` | `/api/schedules/{id}/toggle` | Enable/disable schedule |
| `GET` | `/api/extensions` | List extensions (`?date=`, `?group_id=`) |
| `POST` | `/api/extensions` | Add +15 min extension |
| `GET` | `/api/status` | Live enforcement state for all groups |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | Yes | — | JWT signing key |
| `ENCRYPTION_KEY` | Yes | — | Fernet key for encrypting stored UniFi API keys |
| `ADMIN_PASSWORD` | Yes | — | Initial admin password (used once on first run) |
| `ADMIN_USERNAME` | No | `admin` | Initial admin username |
| `DB_PATH` | No | `../data/network_schedule.db` | SQLite database path |
| `PORT` | No | `7323` | Server port |
| `CORS_ORIGINS` | No | `localhost` variants | Comma-separated allowed origins |
| `MAX_EXTENSION_MINUTES` | No | `120` | Max extension minutes per group per day |
| `STATIC_DIR` | No | auto-detected | Path to built frontend files |

## Project Structure

```
manage-network-schedule/
├── Dockerfile                  # Multi-stage build (Node + Python)
├── docker-compose.yml          # Docker deployment config
├── docker-entrypoint.sh        # Migrations + uvicorn startup
├── Makefile                    # All build/deploy targets
├── launch-agent.plist          # macOS launchd template
├── systemd/                    # Linux systemd service template
├── .env.example                # Environment variable template
├── backend/
│   ├── main.py                 # FastAPI app, lifespan, static serving
│   ├── config.py               # Pydantic Settings
│   ├── database.py             # Async SQLAlchemy engine
│   ├── models.py               # ORM models (8 tables)
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── auth.py                 # JWT + bcrypt
│   ├── seed.py                 # First-run admin seeding
│   ├── encryption.py           # Fernet encrypt/decrypt
│   ├── unifi.py                # Async UniFi API client
│   ├── scheduler.py            # APScheduler jobs + reconciliation
│   ├── alembic/                # Database migrations
│   └── routers/                # API route handlers
├── frontend/
│   ├── src/
│   │   ├── pages/              # Login, Dashboard, Devices, Groups, Schedules, Settings
│   │   ├── components/         # Layout, DeviceTable, ScheduleModal, ExtendButton, etc.
│   │   ├── api/                # Axios client + per-resource API functions
│   │   └── hooks/              # useAuth, useStatus
│   └── dist/                   # Built output (served by backend)
└── data/
    └── network_schedule.db     # SQLite database (gitignored)
```

## Security Notes

- UniFi controller passwords are encrypted at rest with Fernet before storage in SQLite
- JWTs expire after 8 hours
- UniFi API keys are encrypted at rest with Fernet before storage
- SSL verification is disabled for UniFi API calls (UDM Pro uses self-signed certificates)
- `.env` and `data/` are gitignored — never commit secrets or the database
- The `.env` file is excluded from Docker images; secrets are injected at runtime via `env_file`
