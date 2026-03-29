import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Schedule, Group, User
from auth import get_current_user
from schemas import ScheduleCreate, ScheduleUpdate, ScheduleResponse

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


def _to_response(s: Schedule) -> ScheduleResponse:
    return ScheduleResponse(
        id=s.id,
        group_id=s.group_id,
        label=s.label,
        days_of_week=json.loads(s.days_of_week),
        restrict_start=s.restrict_start,
        restrict_end=s.restrict_end,
        is_active=s.is_active,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


@router.get("", response_model=list[ScheduleResponse])
async def list_schedules(
    group_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = select(Schedule)
    if group_id is not None:
        query = query.where(Schedule.group_id == group_id)
    result = await db.execute(query)
    return [_to_response(s) for s in result.scalars().all()]


@router.post("", response_model=ScheduleResponse)
async def create_schedule(
    body: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    group = await db.get(Group, body.group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    schedule = Schedule(
        group_id=body.group_id,
        label=body.label,
        days_of_week=json.dumps(body.days_of_week),
        restrict_start=body.restrict_start,
        restrict_end=body.restrict_end,
        is_active=body.is_active,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)

    # Re-register scheduler jobs
    from scheduler import reschedule_for_schedule
    await reschedule_for_schedule(schedule.id, db)

    return _to_response(schedule)


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: int,
    body: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    schedule = await db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "days_of_week" and value is not None:
            schedule.days_of_week = json.dumps(value)
        elif field != "days_of_week":
            setattr(schedule, field, value)

    await db.commit()
    await db.refresh(schedule)

    from scheduler import reschedule_for_schedule
    await reschedule_for_schedule(schedule.id, db)

    return _to_response(schedule)


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    schedule = await db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    from scheduler import remove_schedule_jobs
    remove_schedule_jobs(schedule_id)

    await db.delete(schedule)
    await db.commit()
    return {"message": "Deleted"}


@router.patch("/{schedule_id}/toggle", response_model=ScheduleResponse)
async def toggle_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    schedule = await db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    schedule.is_active = not schedule.is_active
    await db.commit()
    await db.refresh(schedule)

    from scheduler import reschedule_for_schedule
    await reschedule_for_schedule(schedule.id, db)

    return _to_response(schedule)
