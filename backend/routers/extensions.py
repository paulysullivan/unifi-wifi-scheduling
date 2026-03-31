from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Extension, Schedule, Group, User
from auth import get_current_user
from config import settings
from schemas import ExtensionCreate, ExtensionResponse

router = APIRouter(prefix="/api/extensions", tags=["extensions"])


def _add_minutes_to_time(time_str: str, minutes: int) -> str:
    h, m = map(int, time_str.split(":"))
    total = h * 60 + m + minutes
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


@router.get("", response_model=list[ExtensionResponse])
async def list_extensions(
    date_filter: date | None = Query(None, alias="date"),
    group_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = select(Extension)
    if date_filter:
        query = query.where(Extension.date == date_filter)
    if group_id:
        query = query.where(Extension.group_id == group_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ExtensionResponse)
async def add_extension(
    body: ExtensionCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    schedule = await db.get(Schedule, body.schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if schedule.group_id != body.group_id:
        raise HTTPException(status_code=400, detail="Schedule does not belong to this group")

    result = await db.execute(
        select(Extension).where(
            and_(
                Extension.group_id == body.group_id,
                Extension.schedule_id == body.schedule_id,
                Extension.date == body.date,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        new_minutes = existing.added_minutes + 15
        if new_minutes > settings.max_extension_minutes:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum extension of {settings.max_extension_minutes} minutes reached",
            )
        existing.added_minutes = new_minutes
        existing.extended_restrict_start = _add_minutes_to_time(
            existing.original_restrict_start, new_minutes
        )
        await db.commit()
        await db.refresh(existing)

        from scheduler import handle_extension_update
        await handle_extension_update(existing, db)

        return existing
    else:
        if 15 > settings.max_extension_minutes:
            raise HTTPException(status_code=400, detail="Extensions are disabled")

        ext = Extension(
            group_id=body.group_id,
            schedule_id=body.schedule_id,
            date=body.date,
            added_minutes=15,
            original_restrict_start=schedule.restrict_start,
            extended_restrict_start=_add_minutes_to_time(schedule.restrict_start, 15),
            created_by=_user.id,
        )
        db.add(ext)
        await db.commit()
        await db.refresh(ext)

        from scheduler import handle_extension_update
        await handle_extension_update(ext, db)

        return ext


@router.delete("/{ext_id}")
async def delete_extension(
    ext_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ext = await db.get(Extension, ext_id)
    if not ext:
        raise HTTPException(status_code=404, detail="Extension not found")
    await db.delete(ext)
    await db.commit()

    from scheduler import reschedule_for_schedule
    await reschedule_for_schedule(ext.schedule_id, db)

    return {"message": "Deleted"}
