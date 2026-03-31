import json
from datetime import datetime, date
from fastapi import APIRouter, Depends
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Group, Schedule, Extension
from auth import get_current_user
from schemas import GroupStatusResponse, ScheduleResponse

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("", response_model=list[GroupStatusResponse])
async def get_status(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Group).options(selectinload(Group.devices), selectinload(Group.schedules))
    )
    groups = result.scalars().unique().all()
    now = datetime.now()
    today = date.today()
    current_time = now.strftime("%H:%M")
    current_dow = now.weekday()  # 0=Mon

    statuses = []
    for group in groups:
        active_schedule = None
        is_restricted = False
        extension_minutes = 0
        effective_start = None
        effective_end = None

        for schedule in group.schedules:
            if not schedule.is_active:
                continue
            days = json.loads(schedule.days_of_week)
            if current_dow not in days:
                continue

            start = schedule.restrict_start
            end = schedule.restrict_end

            # Check for extensions
            ext_result = await db.execute(
                select(Extension).where(
                    and_(
                        Extension.group_id == group.id,
                        Extension.schedule_id == schedule.id,
                        Extension.date == today,
                    )
                )
            )
            ext = ext_result.scalar_one_or_none()
            if ext:
                extension_minutes = ext.added_minutes
                start = ext.extended_restrict_start

            # Determine if currently restricted
            if start <= end:
                # Same-day window (e.g., 22:00 to 23:59)
                restricted = start <= current_time < end
            else:
                # Overnight window (e.g., 22:00 to 06:00)
                restricted = current_time >= start or current_time < end

            if restricted:
                is_restricted = True
                active_schedule = schedule
                effective_start = start
                effective_end = end
                break
            elif current_dow in days:
                # Not yet restricted but schedule exists for today
                if active_schedule is None:
                    active_schedule = schedule
                    effective_start = start
                    effective_end = end

        sched_resp = None
        if active_schedule:
            sched_resp = ScheduleResponse(
                id=active_schedule.id,
                group_id=active_schedule.group_id,
                label=active_schedule.label,
                days_of_week=json.loads(active_schedule.days_of_week),
                restrict_start=active_schedule.restrict_start,
                restrict_end=active_schedule.restrict_end,
                is_active=active_schedule.is_active,
                created_at=active_schedule.created_at,
                updated_at=active_schedule.updated_at,
            )

        statuses.append(GroupStatusResponse(
            group_id=group.id,
            name=group.name,
            color=group.color,
            is_restricted=is_restricted,
            active_schedule=sched_resp,
            extension_minutes_today=extension_minutes,
            restrict_start_effective=effective_start,
            restrict_end=effective_end,
            device_count=len(group.devices),
        ))

    return statuses
