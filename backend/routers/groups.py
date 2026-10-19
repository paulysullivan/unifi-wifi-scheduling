import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Group, Device, GroupDevice, Schedule, EnforcementLog, UnifiCredential
from auth import get_current_user
from encryption import decrypt
from routers.devices import _device_to_response
from unifi import UnifiClient
from schemas import (
    GroupCreate, GroupUpdate, GroupResponse, GroupDetailResponse,
    GroupDevicesUpdate, ScheduleResponse, WlanResponse,
)

router = APIRouter(prefix="/api/groups", tags=["groups"])


def _schedule_summary(schedules: list[Schedule]) -> str | None:
    active = [s for s in schedules if s.is_active]
    if not active:
        return None
    s = active[0]
    days = json.loads(s.days_of_week)
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    day_str = ", ".join(day_names[d] for d in sorted(days) if d < 7)
    return f"{day_str} {s.restrict_start}–{s.restrict_end}"


@router.get("", response_model=list[GroupResponse])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Group).options(selectinload(Group.devices), selectinload(Group.schedules))
    )
    groups = result.scalars().unique().all()
    return [
        GroupResponse(
            id=g.id,
            name=g.name,
            description=g.description,
            color=g.color,
            is_paused=g.is_paused,
            wlan_id=g.wlan_id,
            created_at=g.created_at,
            device_count=len(g.devices),
            schedule_summary=_schedule_summary(g.schedules),
        )
        for g in groups
    ]


@router.post("", response_model=GroupResponse)
async def create_group(
    body: GroupCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    group = Group(
        name=body.name, description=body.description, color=body.color, wlan_id=body.wlan_id,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        color=group.color,
        wlan_id=group.wlan_id,
        created_at=group.created_at,
        device_count=0,
    )


@router.get("/wlans", response_model=list[WlanResponse])
async def list_wlans(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    client = await _get_unifi_client(db)
    try:
        wlans = await client.get_wlans()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not list WiFi networks: {e}")
    finally:
        await client.close()
    return [
        WlanResponse(id=w["_id"], name=w.get("name", w["_id"]), enabled=w.get("enabled", True))
        for w in wlans
    ]


@router.get("/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Group)
        .where(Group.id == group_id)
        .options(selectinload(Group.devices).selectinload(Device.groups), selectinload(Group.schedules))
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    return GroupDetailResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        color=group.color,
        is_paused=group.is_paused,
        wlan_id=group.wlan_id,
        created_at=group.created_at,
        device_count=len(group.devices),
        schedule_summary=_schedule_summary(group.schedules),
        devices=[_device_to_response(d) for d in group.devices],
        schedules=[
            ScheduleResponse(
                id=s.id, group_id=s.group_id, label=s.label,
                days_of_week=json.loads(s.days_of_week),
                restrict_start=s.restrict_start, restrict_end=s.restrict_end,
                is_active=s.is_active, created_at=s.created_at, updated_at=s.updated_at,
            )
            for s in group.schedules
        ],
    )


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    body: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    await db.commit()
    await db.refresh(group)
    return GroupResponse(
        id=group.id, name=group.name, description=group.description,
        color=group.color, is_paused=group.is_paused, wlan_id=group.wlan_id,
        created_at=group.created_at,
    )


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.delete(group)
    await db.commit()
    return {"message": "Deleted"}


@router.put("/{group_id}/devices")
async def set_group_devices(
    group_id: int,
    body: GroupDevicesUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Remove existing memberships
    result = await db.execute(
        select(GroupDevice).where(GroupDevice.group_id == group_id)
    )
    for gd in result.scalars().all():
        await db.delete(gd)

    # Add new memberships
    for mac in body.macs:
        device_result = await db.execute(select(Device).where(Device.mac == mac.lower()))
        if device_result.scalar_one_or_none():
            db.add(GroupDevice(group_id=group_id, device_mac=mac.lower()))

    await db.commit()
    return {"message": f"Updated devices for group {group_id}"}


@router.delete("/{group_id}/devices/{mac}")
async def remove_device_from_group(
    group_id: int,
    mac: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(GroupDevice).where(
            GroupDevice.group_id == group_id,
            GroupDevice.device_mac == mac.lower(),
        )
    )
    gd = result.scalar_one_or_none()
    if not gd:
        raise HTTPException(status_code=404, detail="Device not in group")
    await db.delete(gd)
    await db.commit()
    return {"message": "Removed"}


async def _get_unifi_client(db: AsyncSession) -> UnifiClient:
    result = await db.execute(
        select(UnifiCredential).where(UnifiCredential.is_active == True)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=400, detail="No active UniFi credentials configured")
    return UnifiClient(
        host=cred.host,
        api_key=decrypt(cred.encrypted_api_key),
        site_id=cred.site_id,
        verify_ssl=cred.verify_ssl,
    )


@router.post("/{group_id}/pause")
async def pause_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    macs_result = await db.execute(
        select(GroupDevice.device_mac).where(GroupDevice.group_id == group_id)
    )
    macs = [row[0] for row in macs_result.all()]
    if not macs and not group.wlan_id:
        raise HTTPException(status_code=400, detail="No devices in group")

    client = await _get_unifi_client(db)
    try:
        succeeded, failed = await client.block_devices(macs)
        if group.wlan_id and not await client.set_wlan_enabled(group.wlan_id, False):
            failed.append(f"wlan:{group.wlan_id}")
        group.is_paused = True
        log = EnforcementLog(
            group_id=group_id,
            action="block",
            triggered_by="manual_pause",
            device_macs=json.dumps(macs),
            success=len(failed) == 0,
            error_message=f"Failed: {failed}" if failed else None,
        )
        db.add(log)
        await db.commit()
        return {
            "message": f"Paused — blocked {len(succeeded)}/{len(macs)} devices",
            "blocked": succeeded,
            "failed": failed,
        }
    finally:
        await client.close()


@router.post("/{group_id}/unpause")
async def unpause_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    macs_result = await db.execute(
        select(GroupDevice.device_mac).where(GroupDevice.group_id == group_id)
    )
    macs = [row[0] for row in macs_result.all()]
    if not macs and not group.wlan_id:
        raise HTTPException(status_code=400, detail="No devices in group")

    client = await _get_unifi_client(db)
    try:
        succeeded, failed = await client.unblock_devices(macs)
        if group.wlan_id and not await client.set_wlan_enabled(group.wlan_id, True):
            failed.append(f"wlan:{group.wlan_id}")
        group.is_paused = False
        log = EnforcementLog(
            group_id=group_id,
            action="unblock",
            triggered_by="manual_unpause",
            device_macs=json.dumps(macs),
            success=len(failed) == 0,
            error_message=f"Failed: {failed}" if failed else None,
        )
        db.add(log)
        await db.commit()
        return {
            "message": f"Unpaused — unblocked {len(succeeded)}/{len(macs)} devices",
            "unblocked": succeeded,
            "failed": failed,
        }
    finally:
        await client.close()


@router.get("/{group_id}/logs")
async def get_group_logs(
    group_id: int,
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    result = await db.execute(
        select(EnforcementLog)
        .where(EnforcementLog.group_id == group_id)
        .order_by(desc(EnforcementLog.executed_at))
        .limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "action": log.action,
            "triggered_by": log.triggered_by,
            "device_macs": json.loads(log.device_macs),
            "success": log.success,
            "error_message": log.error_message,
            "executed_at": log.executed_at.isoformat(),
        }
        for log in logs
    ]
