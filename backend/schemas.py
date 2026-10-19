from datetime import datetime, date
from pydantic import BaseModel


# Auth
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# Credentials
class CredentialCreate(BaseModel):
    label: str | None = None
    host: str
    api_key: str
    site_id: str = "default"
    verify_ssl: bool = False


class CredentialUpdate(BaseModel):
    label: str | None = None
    host: str | None = None
    api_key: str | None = None
    site_id: str | None = None
    verify_ssl: bool | None = None


class CredentialResponse(BaseModel):
    id: int
    label: str | None
    host: str
    site_id: str
    verify_ssl: bool
    is_active: bool
    last_tested_at: datetime | None
    last_test_success: bool | None

    model_config = {"from_attributes": True}


class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    site_name: str | None = None


# Devices
class DeviceResponse(BaseModel):
    id: int
    mac: str
    name: str | None
    hostname: str | None
    ip: str | None
    device_type: str | None
    last_seen: datetime | None
    synced_at: datetime | None
    is_wired: bool | None = None
    network: str | None = None
    ssid: str | None = None
    vlan: int | None = None
    groups: list[str] = []

    model_config = {"from_attributes": True}


class DeviceUpdate(BaseModel):
    name: str | None = None
    device_type: str | None = None


class SyncResponse(BaseModel):
    devices_found: int
    new_devices: int
    updated_devices: int


# Groups
class GroupCreate(BaseModel):
    name: str
    description: str | None = None
    color: str | None = "#4f46e5"
    wlan_id: str | None = None


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    wlan_id: str | None = None


class GroupResponse(BaseModel):
    id: int
    name: str
    description: str | None
    color: str | None
    is_paused: bool = False
    wlan_id: str | None = None
    created_at: datetime
    device_count: int = 0
    schedule_summary: str | None = None

    model_config = {"from_attributes": True}


class GroupDetailResponse(GroupResponse):
    devices: list[DeviceResponse] = []
    schedules: list["ScheduleResponse"] = []


class WlanResponse(BaseModel):
    id: str
    name: str
    enabled: bool


class GroupDevicesUpdate(BaseModel):
    macs: list[str]


# Schedules
class ScheduleCreate(BaseModel):
    group_id: int
    label: str | None = None
    days_of_week: list[int]
    restrict_start: str  # HH:MM
    restrict_end: str  # HH:MM
    is_active: bool = True


class ScheduleUpdate(BaseModel):
    label: str | None = None
    days_of_week: list[int] | None = None
    restrict_start: str | None = None
    restrict_end: str | None = None
    is_active: bool | None = None


class ScheduleResponse(BaseModel):
    id: int
    group_id: int
    label: str | None
    days_of_week: list[int]
    restrict_start: str
    restrict_end: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# Extensions
class ExtensionCreate(BaseModel):
    group_id: int
    schedule_id: int
    date: date


class ExtensionResponse(BaseModel):
    id: int
    group_id: int
    schedule_id: int
    date: date
    added_minutes: int
    original_restrict_start: str
    extended_restrict_start: str
    created_at: datetime
    created_by: int | None = None

    model_config = {"from_attributes": True}


# Status
class GroupStatusResponse(BaseModel):
    group_id: int
    name: str
    color: str | None
    is_restricted: bool
    is_paused: bool = False
    active_schedule: ScheduleResponse | None
    extension_minutes_today: int
    restrict_start_effective: str | None
    restrict_end: str | None
    device_count: int
