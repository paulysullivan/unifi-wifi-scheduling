from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Device, UnifiCredential, GroupDevice
from auth import get_current_user
from encryption import decrypt
from schemas import DeviceResponse, DeviceUpdate, SyncResponse
from unifi import UnifiClient

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _device_to_response(device: Device) -> DeviceResponse:
    return DeviceResponse(
        id=device.id,
        mac=device.mac,
        name=device.name,
        hostname=device.hostname,
        ip=device.ip,
        device_type=device.device_type,
        last_seen=device.last_seen,
        synced_at=device.synced_at,
        groups=[g.name for g in device.groups] if device.groups else [],
    )


@router.get("", response_model=list[DeviceResponse])
async def list_devices(
    group_id: int | None = Query(None),
    unassigned: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = select(Device).options(selectinload(Device.groups))

    if group_id is not None:
        query = query.join(GroupDevice).where(GroupDevice.group_id == group_id)
    elif unassigned:
        subq = select(GroupDevice.device_mac)
        query = query.where(~Device.mac.in_(subq))

    query = query.order_by(Device.name, Device.mac)
    result = await db.execute(query)
    return [_device_to_response(d) for d in result.scalars().unique().all()]


@router.post("/sync", response_model=SyncResponse)
async def sync_devices(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(UnifiCredential).where(UnifiCredential.is_active == True)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=400, detail="No active UniFi credentials configured")

    client = UnifiClient(
        host=cred.host,
        api_key=decrypt(cred.encrypted_api_key),
        site_id=cred.site_id,
        verify_ssl=cred.verify_ssl,
    )
    try:
        unifi_devices = await client.sync_devices()
    finally:
        await client.close()

    new_count = 0
    updated_count = 0
    now = datetime.utcnow()

    for ud in unifi_devices:
        result = await db.execute(select(Device).where(Device.mac == ud["mac"]))
        existing = result.scalar_one_or_none()
        if existing:
            existing.hostname = ud.get("hostname") or existing.hostname
            existing.ip = ud.get("ip") or existing.ip
            existing.device_type = ud.get("device_type") or existing.device_type
            existing.last_seen = ud.get("last_seen") or existing.last_seen
            if not existing.name:
                existing.name = ud.get("name")
            existing.synced_at = now
            updated_count += 1
        else:
            device = Device(
                mac=ud["mac"],
                name=ud.get("name"),
                hostname=ud.get("hostname"),
                ip=ud.get("ip"),
                device_type=ud.get("device_type"),
                last_seen=ud.get("last_seen"),
                synced_at=now,
            )
            db.add(device)
            new_count += 1

    await db.commit()
    return SyncResponse(
        devices_found=len(unifi_devices),
        new_devices=new_count,
        updated_devices=updated_count,
    )


@router.put("/{mac}", response_model=DeviceResponse)
async def update_device(
    mac: str,
    body: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Device).where(Device.mac == mac.lower()).options(selectinload(Device.groups))
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
    await db.commit()
    await db.refresh(device)
    return _device_to_response(device)
