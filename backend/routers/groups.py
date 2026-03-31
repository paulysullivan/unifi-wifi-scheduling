import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Group, Device, GroupDevice, Schedule
from auth import get_current_user
from schemas import (
    GroupCreate, GroupUpdate, GroupResponse, GroupDetailResponse,
    GroupDevicesUpdate, DeviceResponse, ScheduleResponse,
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
    group = Group(name=body.name, description=body.description, color=body.color)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        color=group.color,
        created_at=group.created_at,
        device_count=0,
    )


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
        created_at=group.created_at,
        device_count=len(group.devices),
        schedule_summary=_schedule_summary(group.schedules),
        devices=[
            DeviceResponse(
                id=d.id, mac=d.mac, name=d.name, hostname=d.hostname,
                ip=d.ip, device_type=d.device_type, last_seen=d.last_seen,
                synced_at=d.synced_at, groups=[g.name for g in d.groups],
            )
            for d in group.devices
        ],
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
        color=group.color, created_at=group.created_at,
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
