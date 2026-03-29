# Network Schedule Manager — CLAUDE.md

A web application to manage internet access schedules for devices on a Ubiquiti UniFi network (UDM Pro). Runs persistently on a Mac mini as a local network service.

---

## Project Overview

- **Purpose**: Enforce time-based internet access schedules for groups of network devices, with on-demand per-day time extensions.
- **Network Hardware**: Ubiquiti UDM Pro (accessed via local UniFi network API)
- **Hosting**: Mac mini — persistent background service via macOS launchd
- **Browser Targets**: iOS/Safari, macOS Safari/Chrome, Windows Chrome/Edge

---

## Tech Stack

### Backend
- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Database**: SQLite via SQLAlchemy 2.0 ORM (async) + Alembic migrations
- **Scheduler**: APScheduler 3.x (`AsyncIOScheduler`) for time-based enforcement
- **HTTP Client**: httpx (async) for UniFi API calls
- **Auth**: JWT tokens (`python-jose`) + bcrypt password hashing (`passlib`)
- **Credentials Encryption**: Fernet symmetric encryption (`cryptography`) — UniFi password stored encrypted at rest
- **Server**: Uvicorn

### Frontend
- **Framework**: React 18 + Vite 5
- **Styling**: Tailwind CSS 3 — mobile-first, optimized for iOS/Safari
- **UI Components**: shadcn/ui (or Radix UI primitives if shadcn setup is complex)
- **State / Data Fetching**: TanStack Query v5 (React Query)
- **Routing**: React Router v6
- **HTTP**: Axios
- **Utilities**: date-fns, clsx

### Persistence
- macOS **launchd** (`.plist` in `~/Library/LaunchAgents/`) — restarts on crash, starts on login

---

## Project Structure

```
network-schedule-manager/
├── CLAUDE.md
├── .env                         # Secrets — never commit
├── .env.example                 # Committed template
├── .gitignore
├── Makefile                     # install, start, stop, dev, logs targets
├── launch-agent.plist           # macOS launchd service template
├── backend/
│   ├── main.py                  # FastAPI app entry point, mounts static frontend
│   ├── config.py                # Pydantic Settings — reads from .env
│   ├── database.py              # Async SQLAlchemy engine + session factory
│   ├── models.py                # All SQLAlchemy ORM table models
│   ├── schemas.py               # Pydantic v2 request/response schemas
│   ├── auth.py                  # JWT creation, validation, password hashing
│   ├── scheduler.py             # APScheduler setup, job registration, reconciliation
│   ├── unifi.py                 # Async UniFi API client class
│   ├── encryption.py            # Fernet helpers for encrypting credentials
│   ├── seed.py                  # First-run admin user seeding
│   ├── requirements.txt
│   └── routers/
│       ├── auth.py              # /api/auth/login, /api/auth/me
│       ├── credentials.py       # /api/credentials — CRUD + test connection
│       ├── devices.py           # /api/devices — list, sync, update name
│       ├── groups.py            # /api/groups — CRUD + device membership
│       ├── schedules.py         # /api/schedules — CRUD + toggle active
│       ├── extensions.py        # /api/extensions — add/list/delete time extensions
│       └── status.py            # /api/status — live enforcement state
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js           # Proxies /api/* to backend in dev mode
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx              # Router setup + QueryClient + auth guard
│   │   ├── api/
│   │   │   ├── client.js        # Axios instance with JWT interceptor
│   │   │   ├── auth.js
│   │   │   ├── credentials.js
│   │   │   ├── devices.js
│   │   │   ├── groups.js
│   │   │   ├── schedules.js
│   │   │   ├── extensions.js
│   │   │   └── status.js
│   │   ├── components/
│   │   │   ├── Layout.jsx       # Sidebar nav + mobile bottom nav
│   │   │   ├── GroupCard.jsx
│   │   │   ├── DeviceTable.jsx
│   │   │   ├── ScheduleModal.jsx
│   │   │   ├── ExtendButton.jsx # "+15 min" button with optimistic update
│   │   │   ├── StatusBadge.jsx  # Blocked / Active indicator
│   │   │   └── ConfirmDialog.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx    # Live status, extend buttons, summary cards
│   │   │   ├── Devices.jsx      # Device browser + group assignment
│   │   │   ├── Groups.jsx       # Create/edit groups, manage members
│   │   │   ├── Schedules.jsx    # Schedule editor per group
│   │   │   └── Settings.jsx     # UniFi credentials + change app password
│   │   └── hooks/
│   │       ├── useAuth.js
│   │       └── useStatus.js     # Polls /api/status every 30s
│   └── dist/                    # Built by `vite build`, served by FastAPI
└── data/
    └── network_schedule.db      # SQLite database file
```

---

## Database Schema

All tables managed via Alembic migrations. Use `alembic upgrade head` on first run.

### `users`
Application login accounts (independent of UniFi accounts).
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| username | TEXT | UNIQUE NOT NULL |
| hashed_password | TEXT | bcrypt hash |
| created_at | DATETIME | auto |

### `unifi_credentials`
Stored UniFi controller access details (typically one active record).
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| label | TEXT | e.g. "UDM Pro Home" |
| host | TEXT | e.g. `https://192.168.1.1` |
| username | TEXT | UniFi local admin username |
| encrypted_password | TEXT | Fernet-encrypted UniFi password |
| site_id | TEXT | Default: `default` |
| verify_ssl | BOOLEAN | Default: `false` (UDM Pro uses self-signed cert) |
| is_active | BOOLEAN | Only one should be active at a time |
| last_tested_at | DATETIME | |
| last_test_success | BOOLEAN | |

### `devices`
Cache of devices seen on the UniFi network.
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| mac | TEXT | UNIQUE NOT NULL — primary identifier |
| name | TEXT | Friendly name (user override or from UniFi) |
| hostname | TEXT | From UniFi |
| ip | TEXT | Last known IP |
| device_type | TEXT | e.g. phone, laptop, console, tv |
| last_seen | DATETIME | |
| synced_at | DATETIME | When last synced from UniFi API |

### `groups`
Named collections of devices (e.g. "Kids Devices", "Living Room").
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| name | TEXT | UNIQUE NOT NULL |
| description | TEXT | Optional |
| color | TEXT | Hex color for UI, e.g. `#4f46e5` |
| created_at | DATETIME | |

### `group_devices`
Many-to-many join: groups ↔ devices.
| Column | Type | Notes |
|---|---|---|
| group_id | INTEGER | FK → groups.id |
| device_mac | TEXT | FK → devices.mac |
| PRIMARY KEY | | (group_id, device_mac) |

### `schedules`
Weekly recurring restriction rules per group.
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| group_id | INTEGER | FK → groups.id |
| label | TEXT | Optional, e.g. "Bedtime", "School Hours" |
| days_of_week | TEXT | JSON array of ints: `[0,1,2,3,4]` (0=Mon, 6=Sun) |
| restrict_start | TEXT | `"HH:MM"` — when internet is BLOCKED |
| restrict_end | TEXT | `"HH:MM"` — when internet is RESTORED (may be next day) |
| is_active | BOOLEAN | Default: `true` |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### `extensions`
One-time per-day extension overrides for a group.
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| group_id | INTEGER | FK → groups.id |
| schedule_id | INTEGER | FK → schedules.id (which schedule this extends) |
| date | DATE | Calendar date this applies to (YYYY-MM-DD) |
| added_minutes | INTEGER | Cumulative minutes added (multiples of 15) |
| original_restrict_start | TEXT | `"HH:MM"` — original block time |
| extended_restrict_start | TEXT | `"HH:MM"` — computed: original + added_minutes |
| created_at | DATETIME | |
| created_by | INTEGER | FK → users.id |

Max extension configurable via settings (default: 120 minutes / 2 hours per day per group).

### `enforcement_log`
Audit trail of every block/unblock action.
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| group_id | INTEGER | FK → groups.id |
| action | TEXT | `block` or `unblock` |
| triggered_by | TEXT | `scheduler`, `extension`, `manual`, `startup_reconcile` |
| device_macs | TEXT | JSON array of MACs acted upon |
| success | BOOLEAN | |
| error_message | TEXT | Null on success |
| executed_at | DATETIME | |

---

## API Endpoints

All endpoints except `POST /api/auth/login` require a valid `Authorization: Bearer <token>` header.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Body: `{username, password}`. Returns `{access_token, token_type}` |
| GET | `/api/auth/me` | Returns current user info |

### Credentials
| Method | Path | Description |
|---|---|---|
| GET | `/api/credentials` | List all stored credential sets |
| POST | `/api/credentials` | Create new credential set |
| PUT | `/api/credentials/{id}` | Update credential set |
| DELETE | `/api/credentials/{id}` | Delete credential set |
| POST | `/api/credentials/{id}/test` | Test connectivity; returns `{success, message, site_name}` |
| POST | `/api/credentials/{id}/activate` | Set as the active credential set |

### Devices
| Method | Path | Description |
|---|---|---|
| GET | `/api/devices` | List cached devices. Query params: `?group_id=`, `?unassigned=true` |
| POST | `/api/devices/sync` | Trigger live sync from UniFi API; returns count of devices found |
| PUT | `/api/devices/{mac}` | Update device name or type |

### Groups
| Method | Path | Description |
|---|---|---|
| GET | `/api/groups` | List all groups with device count and active schedule summary |
| POST | `/api/groups` | Create group |
| GET | `/api/groups/{id}` | Get group with member devices and schedules |
| PUT | `/api/groups/{id}` | Update group metadata |
| DELETE | `/api/groups/{id}` | Delete group (devices are not deleted) |
| PUT | `/api/groups/{id}/devices` | Replace device membership. Body: `{macs: [...]}` |
| DELETE | `/api/groups/{id}/devices/{mac}` | Remove one device from group |

### Schedules
| Method | Path | Description |
|---|---|---|
| GET | `/api/schedules` | List all schedules. Query: `?group_id=` |
| POST | `/api/schedules` | Create schedule |
| PUT | `/api/schedules/{id}` | Update schedule |
| DELETE | `/api/schedules/{id}` | Delete schedule |
| PATCH | `/api/schedules/{id}/toggle` | Enable/disable without deleting |

### Extensions
| Method | Path | Description |
|---|---|---|
| GET | `/api/extensions` | List extensions. Query: `?date=YYYY-MM-DD&group_id=` |
| POST | `/api/extensions` | Add +15 min to a group for today. Body: `{group_id, schedule_id, date}`. Idempotent — each call adds 15 more minutes. Returns 400 if max reached. |
| DELETE | `/api/extensions/{id}` | Remove extension (reverts to original schedule time) |

### Status
| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Returns real-time enforcement state for all groups: `{group_id, name, is_restricted, active_schedule, extension_minutes_today, restrict_start_effective}` |

---

## UniFi API Integration (`unifi.py`)

### Authentication
- `POST {host}/api/auth/login` — body: `{"username": ..., "password": ...}`
- Response sets a `TOKEN` cookie and returns a `X-Csrf-Token` header
- All subsequent requests must include both the cookie and `X-Csrf-Token` header
- UDM Pro requires the `/proxy/network/` path prefix on all network API calls
- SSL verification must be disabled (`verify=False` in httpx) — UDM Pro uses a self-signed certificate
- Implement session caching so login is not repeated on every API call; re-authenticate on 401

### Device Discovery
Sync both endpoints and merge results; prefer data from the active clients endpoint:
- Active clients: `GET {host}/proxy/network/api/s/{site}/stat/sta`
- All known clients: `GET {host}/proxy/network/api/s/{site}/stat/alluser`

Map these UniFi fields to the `devices` table: `mac`, `name` (or `hostname`), `ip`, `last_seen`, `oui` (for device type hints).

### Blocking Strategy — Per-Device Block/Unblock
Use the UniFi `stamgr` command endpoint to block and unblock individual clients by MAC address. This is the most reliable method on UDM Pro for per-device control.

**Block a device** (cuts internet access):
```
POST {host}/proxy/network/api/s/{site}/cmd/stamgr
Body: {"cmd": "block-sta", "mac": "<mac_address>"}
```

**Unblock a device** (restores internet access):
```
POST {host}/proxy/network/api/s/{site}/cmd/stamgr
Body: {"cmd": "unblock-sta", "mac": "<mac_address>"}
```

When a schedule fires for a group, iterate over all device MACs in the group and send individual block/unblock commands. Log each batch to `enforcement_log`.

> **Note on Traffic Rules**: If the user requests a migration to UniFi Traffic Rules in the future, the endpoint is `GET/POST/PUT /proxy/network/v2/api/site/{site}/trafficrules`. Traffic rules offer group-level control but require more setup. Per-device block-sta is used here for simplicity and reliability.

### Error Handling in `unifi.py`
- Retry up to 3 times with exponential backoff on network errors
- On 401, re-authenticate and retry once
- On 5xx, log error and mark `enforcement_log` entry as failed
- Surface connection errors clearly in the `/api/credentials/{id}/test` response

---

## Scheduler Logic (`scheduler.py`)

Uses **APScheduler `AsyncIOScheduler`** with in-memory job store (jobs are re-registered from DB on startup).

### On Application Startup
1. Load all active schedules from the database
2. For each schedule, register two APScheduler cron jobs:
   - One for `restrict_start` (block group) on each day in `days_of_week`
   - One for `restrict_end` (unblock group) on each day in `days_of_week`
3. Run **reconciliation**: compare what the schedule says the current state should be vs. what it was last recorded as in `enforcement_log`. Re-apply if there is a discrepancy (e.g. service was offline during a scheduled block event).

### When a Block Job Fires (`restrict_start` time)
1. Check `extensions` table for an override on today's date for this group/schedule
2. If an extension exists and `extended_restrict_start` is in the future, reschedule the block job to fire at `extended_restrict_start` for today only (use a one-off `date` trigger)
3. Otherwise, call `unifi.block_devices(group_mac_list)` and log result

### When an Unblock Job Fires (`restrict_end` time)
1. Call `unifi.unblock_devices(group_mac_list)` and log result
2. No extension logic needed for unblock times

### When an Extension Is Added via API
1. Calculate new `extended_restrict_start`
2. If the group is not yet blocked (i.e., current time is before the original `restrict_start`), reschedule today's block job to the new time
3. If the group is already blocked (extension added after block began — unusual but handle gracefully), unblock immediately and schedule a re-block at the extension end time

### When a Schedule Is Created, Updated, or Deleted
1. Remove all existing APScheduler jobs for that schedule's `id`
2. Re-register jobs from the updated schedule data
3. Run reconciliation for the affected group

---

## Frontend Pages

### Login (`/login`)
- Username + password form, centered on screen
- On success, store JWT in `localStorage`, redirect to Dashboard
- On failure, show inline error message
- Auto-redirect to Dashboard if already authenticated

### Dashboard (`/`)
- **Summary bar**: total groups, groups currently restricted, total extensions used today
- **"Restricted Now" section**: card for each currently restricted group showing:
  - Group name, color badge, device count
  - Current restrict window (e.g. "Restricted until 6:00 AM")
  - Minutes of extension used today / max allowed
  - **"+ Extend 15 min"** button — POST to `/api/extensions`, disabled when max reached
  - Effective new end time shown optimistically after click
- Auto-refresh via `useStatus` hook polling `/api/status` every 30 seconds
- Manual refresh button

### Devices (`/devices`)
- Searchable, scrollable table of all network devices
- Columns: Name (editable inline), MAC, IP, Last Seen, Group(s)
- **"Sync from Network"** button — POST `/api/devices/sync`, shows count of new devices found
- Unassigned devices shown with a highlighted row
- Click row → slide-out panel to edit name, assign/remove from groups via multi-select
- Mobile: collapsible rows, essential columns only (Name, Group)

### Groups (`/groups`)
- Color-coded group cards in a responsive grid
- Each card: name, device count, schedule summary (e.g. "Weekdays 10 PM–6 AM")
- **"New Group"** button → modal with name, description, color picker
- Click card → detail view:
  - Member devices list with remove button per device
  - Device search/add picker (dropdown of unassigned devices)
  - Schedules list for this group with quick-toggle

### Schedules (`/schedules`)
- List view grouped by group name
- Each schedule row: label, days chips (M T W T F S S), time range, active toggle
- **"New Schedule"** button → modal with:
  - Group selector (dropdown)
  - Optional label
  - Day-of-week checkboxes (Mon–Sun, multiple allowed)
  - Time pickers: "Block at" (`restrict_start`) and "Unblock at" (`restrict_end`)
  - Note: if unblock time is earlier in the day than block time, it is treated as next-day
  - Active toggle
- Edit/delete icons per schedule row

### Settings (`/settings`)
- **UniFi Connection** section:
  - Form: Controller URL, Username, Password, Site ID
  - "Test Connection" button → live feedback (green checkmark or error message)
  - Save button
- **App Account** section:
  - Change admin password form (current password + new password + confirm)
- **Extension Limit** section:
  - Number input for max extension minutes per day per group (default: 120)

---

## macOS Persistence (launchd)

### `launch-agent.plist` Template
Generate this file with actual paths filled in during `make install`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.network-schedule-manager</string>

  <key>ProgramArguments</key>
  <array>
    <string>VENV_PATH/bin/uvicorn</string>
    <string>main:app</string>
    <string>--host</string>
    <string>0.0.0.0</string>
    <string>--port</string>
    <string>8080</string>
  </array>

  <key>WorkingDirectory</key>
  <string>PROJECT_PATH/backend</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>VENV_PATH/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>PROJECT_PATH/logs/service.log</string>

  <key>StandardErrorPath</key>
  <string>PROJECT_PATH/logs/service.err</string>
</dict>
</plist>
```

### `Makefile` Targets

```makefile
PROJECT_DIR := $(shell pwd)
VENV := $(PROJECT_DIR)/backend/.venv
PLIST_NAME := com.user.network-schedule-manager
PLIST_DST := $(HOME)/Library/LaunchAgents/$(PLIST_NAME).plist

install:          ## Full install: venv, deps, frontend build, launchd setup
dev-backend:      ## Run backend with --reload for development
dev-frontend:     ## Run Vite dev server (proxies /api to :8080)
build-frontend:   ## Run `vite build` and copy dist/ for FastAPI to serve
start:            ## Load and start the launchd service
stop:             ## Unload the launchd service
restart:          ## stop + start
logs:             ## Tail the service log
status:           ## Check if launchd service is loaded
db-migrate:       ## Run `alembic upgrade head`
db-rollback:      ## Run `alembic downgrade -1`
```

### FastAPI Serving the Frontend
In `main.py`, after all API routers are registered, mount the built frontend:

```python
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app.mount("/assets", StaticFiles(directory="../frontend/dist/assets"), name="assets")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    return FileResponse("../frontend/dist/index.html")
```

This allows the React SPA to handle all client-side routes while FastAPI handles `/api/*`.

---

## Environment Variables (`.env`)

```bash
# Application secrets
SECRET_KEY=               # JWT signing key — generate: python -c "import secrets; print(secrets.token_hex(32))"
ENCRYPTION_KEY=           # Fernet key for credential encryption — generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Database
DB_PATH=../data/network_schedule.db

# Server
PORT=8080
CORS_ORIGINS=http://localhost:5173,http://localhost:8080  # Add Mac mini local IP

# First-run admin seeding (used only once if no users exist in DB)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=           # Set a strong password before first run

# Extension limits
MAX_EXTENSION_MINUTES=120
```

Provide `.env.example` with all keys present but values empty.

---

## Key Python Libraries (`requirements.txt`)

```
fastapi>=0.111
uvicorn[standard]>=0.29
sqlalchemy[asyncio]>=2.0
aiosqlite>=0.20
alembic>=1.13
pydantic>=2.7
pydantic-settings>=2.3
python-jose[cryptography]>=3.3
passlib[bcrypt]>=1.7
httpx>=0.27
apscheduler>=3.10
cryptography>=42.0
python-dotenv>=1.0
python-multipart>=0.0.9
```

## Key Frontend Libraries (`package.json`)

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "@tanstack/react-query": "^5",
    "axios": "^1",
    "date-fns": "^3",
    "clsx": "^2"
  },
  "devDependencies": {
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^3",
    "autoprefixer": "^10",
    "postcss": "^8"
  }
}
```

---

## Security Notes

- UniFi controller password is encrypted at rest with Fernet before being stored in SQLite. The encryption key lives in `.env` only.
- JWT secret is in `.env` only. JWTs expire after 8 hours; include a refresh mechanism.
- SSL verification is intentionally disabled for the UniFi API connection because UDM Pro uses a self-signed certificate. This is expected and documented.
- CORS is restricted to localhost and explicitly configured Mac mini IP addresses only.
- `.env` and `data/` are in `.gitignore`. Never commit secrets or the database.
- All destructive API calls (delete group, delete schedule) require re-authentication via the current session token only — no additional confirmation step in the API, but the UI should show a confirmation dialog.

---

## Build and Implementation Order (for Claude Code)

1. **Project scaffold** — create directory structure, `.env.example`, `.gitignore`, `Makefile` skeleton
2. **Backend: models + database** — SQLAlchemy async models, Alembic config + initial migration
3. **Backend: auth** — JWT creation/validation, bcrypt hashing, seed script for first admin user
4. **Backend: UniFi client** (`unifi.py`) — login, device sync, block-sta, unblock-sta, test connection
5. **Backend: all routers** — implement in order: auth → credentials → devices → groups → schedules → extensions → status
6. **Backend: scheduler** — APScheduler setup, job registration from DB, startup reconciliation, extension handling
7. **Backend: main.py** — wire up app, routers, lifespan events (scheduler start/stop), static file serving
8. **Frontend: scaffold** — Vite + React + Tailwind + React Router + TanStack Query setup
9. **Frontend: API layer** — Axios client with JWT interceptor, all API call functions
10. **Frontend: pages** — Login → Dashboard → Devices → Groups → Schedules → Settings
11. **Frontend: mobile polish** — ensure all pages work well on iOS/Safari (touch targets, bottom nav)
12. **Frontend: `vite build`** — confirm backend serves the built SPA correctly
13. **launchd** — finalize `launch-agent.plist` template, implement `make install` to fill in real paths
14. **End-to-end test** — login → add UDM Pro credentials → test connection → sync devices → create group → add devices → create schedule → verify enforcement fires → test extend button
