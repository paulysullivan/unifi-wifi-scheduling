import json
import logging
from datetime import datetime, date, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session
from models import Schedule, Extension, Group, GroupDevice, EnforcementLog, UnifiCredential
from encryption import decrypt
from unifi import UnifiClient

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def _get_unifi_client() -> UnifiClient | None:
    async with async_session() as db:
        result = await db.execute(
            select(UnifiCredential).where(UnifiCredential.is_active == True)
        )
        cred = result.scalar_one_or_none()
        if not cred:
            logger.error("No active UniFi credentials configured")
            return None
        return UnifiClient(
            host=cred.host,
            api_key=decrypt(cred.encrypted_api_key),
            site_id=cred.site_id,
            verify_ssl=cred.verify_ssl,
        )


async def _get_group_macs(group_id: int, db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(GroupDevice.device_mac).where(GroupDevice.group_id == group_id)
    )
    return [row[0] for row in result.all()]


async def _log_enforcement(
    db: AsyncSession,
    group_id: int,
    action: str,
    triggered_by: str,
    macs: list[str],
    success: bool,
    error_message: str | None = None,
):
    log = EnforcementLog(
        group_id=group_id,
        action=action,
        triggered_by=triggered_by,
        device_macs=json.dumps(macs),
        success=success,
        error_message=error_message,
    )
    db.add(log)
    await db.commit()


async def block_group(schedule_id: int):
    async with async_session() as db:
        schedule = await db.get(Schedule, schedule_id)
        if not schedule or not schedule.is_active:
            return

        today = date.today()
        result = await db.execute(
            select(Extension).where(
                and_(
                    Extension.schedule_id == schedule_id,
                    Extension.date == today,
                )
            )
        )
        ext = result.scalar_one_or_none()

        if ext:
            now = datetime.now()
            ext_time_parts = ext.extended_restrict_start.split(":")
            ext_time = now.replace(
                hour=int(ext_time_parts[0]),
                minute=int(ext_time_parts[1]),
                second=0, microsecond=0,
            )
            if now < ext_time:
                # Extension pushes block time later — schedule a one-off
                job_id = f"ext_block_{schedule_id}_{today}"
                try:
                    scheduler.remove_job(job_id)
                except Exception:
                    pass
                scheduler.add_job(
                    block_group,
                    trigger=DateTrigger(run_date=ext_time),
                    args=[schedule_id],
                    id=job_id,
                    replace_existing=True,
                )
                logger.info(
                    f"Schedule {schedule_id}: block deferred to {ext.extended_restrict_start} (extension)"
                )
                return

        macs = await _get_group_macs(schedule.group_id, db)
        if not macs:
            return

        client = await _get_unifi_client()
        if not client:
            await _log_enforcement(
                db, schedule.group_id, "block", "scheduler", macs, False,
                "No active UniFi credentials",
            )
            return

        try:
            succeeded, failed = await client.block_devices(macs)
            success = len(failed) == 0
            error = f"Failed to block: {failed}" if failed else None
            await _log_enforcement(
                db, schedule.group_id, "block", "scheduler", macs, success, error
            )
            logger.info(f"Blocked {len(succeeded)}/{len(macs)} devices for group {schedule.group_id}")
        except Exception as e:
            await _log_enforcement(
                db, schedule.group_id, "block", "scheduler", macs, False, str(e)
            )
            logger.exception(f"Error blocking group {schedule.group_id}")
        finally:
            await client.close()


async def unblock_group(schedule_id: int):
    async with async_session() as db:
        schedule = await db.get(Schedule, schedule_id)
        if not schedule or not schedule.is_active:
            return

        # Don't unblock a manually paused group
        group = await db.get(Group, schedule.group_id)
        if group and group.is_paused:
            logger.info(f"Group {schedule.group_id} is manually paused — skipping scheduled unblock")
            return

        macs = await _get_group_macs(schedule.group_id, db)
        if not macs:
            return

        client = await _get_unifi_client()
        if not client:
            await _log_enforcement(
                db, schedule.group_id, "unblock", "scheduler", macs, False,
                "No active UniFi credentials",
            )
            return

        try:
            succeeded, failed = await client.unblock_devices(macs)
            success = len(failed) == 0
            error = f"Failed to unblock: {failed}" if failed else None
            await _log_enforcement(
                db, schedule.group_id, "unblock", "scheduler", macs, success, error
            )
            logger.info(f"Unblocked {len(succeeded)}/{len(macs)} devices for group {schedule.group_id}")
        except Exception as e:
            await _log_enforcement(
                db, schedule.group_id, "unblock", "scheduler", macs, False, str(e)
            )
            logger.exception(f"Error unblocking group {schedule.group_id}")
        finally:
            await client.close()


def _dow_to_cron(days: list[int]) -> str:
    # APScheduler cron: 0=mon in our schema, cron day_of_week: mon=0
    mapping = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}
    return ",".join(mapping[d] for d in sorted(days) if d in mapping)


def remove_schedule_jobs(schedule_id: int):
    for suffix in ["_block", "_unblock"]:
        job_id = f"schedule_{schedule_id}{suffix}"
        try:
            scheduler.remove_job(job_id)
        except Exception:
            pass
    # Also remove any extension one-offs
    today = date.today()
    try:
        scheduler.remove_job(f"ext_block_{schedule_id}_{today}")
    except Exception:
        pass


async def reschedule_for_schedule(schedule_id: int, db: AsyncSession):
    remove_schedule_jobs(schedule_id)

    schedule = await db.get(Schedule, schedule_id)
    if not schedule or not schedule.is_active:
        return

    days = json.loads(schedule.days_of_week)
    if not days:
        return

    cron_days = _dow_to_cron(days)
    start_h, start_m = map(int, schedule.restrict_start.split(":"))
    end_h, end_m = map(int, schedule.restrict_end.split(":"))

    scheduler.add_job(
        block_group,
        trigger=CronTrigger(day_of_week=cron_days, hour=start_h, minute=start_m),
        args=[schedule_id],
        id=f"schedule_{schedule_id}_block",
        replace_existing=True,
    )
    scheduler.add_job(
        unblock_group,
        trigger=CronTrigger(day_of_week=cron_days, hour=end_h, minute=end_m),
        args=[schedule_id],
        id=f"schedule_{schedule_id}_unblock",
        replace_existing=True,
    )
    logger.info(f"Registered jobs for schedule {schedule_id}")


async def handle_extension_update(ext: "Extension", db: AsyncSession):
    schedule = await db.get(Schedule, ext.schedule_id)
    if not schedule:
        return

    now = datetime.now()
    start_parts = schedule.restrict_start.split(":")
    original_start = now.replace(
        hour=int(start_parts[0]), minute=int(start_parts[1]),
        second=0, microsecond=0,
    )

    if now < original_start:
        # Not yet blocked — reschedule today's block to extended time
        ext_parts = ext.extended_restrict_start.split(":")
        ext_time = now.replace(
            hour=int(ext_parts[0]), minute=int(ext_parts[1]),
            second=0, microsecond=0,
        )
        job_id = f"ext_block_{schedule.id}_{ext.date}"
        scheduler.add_job(
            block_group,
            trigger=DateTrigger(run_date=ext_time),
            args=[schedule.id],
            id=job_id,
            replace_existing=True,
        )
        logger.info(f"Extension: rescheduled block for schedule {schedule.id} to {ext.extended_restrict_start}")
    elif now >= original_start:
        # Already past original block time — if currently blocked, unblock temporarily
        macs = await _get_group_macs(schedule.group_id, db)
        if macs:
            client = await _get_unifi_client()
            if client:
                try:
                    await client.unblock_devices(macs)
                    await _log_enforcement(
                        db, schedule.group_id, "unblock", "extension", macs, True
                    )
                except Exception as e:
                    logger.exception(f"Error unblocking for extension: {e}")
                finally:
                    await client.close()

        # Schedule re-block at extended time
        ext_parts = ext.extended_restrict_start.split(":")
        ext_time = now.replace(
            hour=int(ext_parts[0]), minute=int(ext_parts[1]),
            second=0, microsecond=0,
        )
        if ext_time > now:
            job_id = f"ext_block_{schedule.id}_{ext.date}"
            scheduler.add_job(
                block_group,
                trigger=DateTrigger(run_date=ext_time),
                args=[schedule.id],
                id=job_id,
                replace_existing=True,
            )


async def reconcile():
    logger.info("Running startup reconciliation...")
    async with async_session() as db:
        result = await db.execute(select(Schedule).where(Schedule.is_active == True))
        schedules = result.scalars().all()

        now = datetime.now()
        current_time = now.strftime("%H:%M")
        current_dow = now.weekday()
        today = date.today()

        for schedule in schedules:
            days = json.loads(schedule.days_of_week)
            if current_dow not in days:
                continue

            start = schedule.restrict_start
            end = schedule.restrict_end

            # Check for extension
            ext_result = await db.execute(
                select(Extension).where(
                    and_(
                        Extension.schedule_id == schedule.id,
                        Extension.date == today,
                    )
                )
            )
            ext = ext_result.scalar_one_or_none()
            if ext:
                start = ext.extended_restrict_start

            # Determine expected state
            if start <= end:
                should_be_blocked = start <= current_time < end
            else:
                should_be_blocked = current_time >= start or current_time < end

            macs = await _get_group_macs(schedule.group_id, db)
            if not macs:
                continue

            client = await _get_unifi_client()
            if not client:
                continue

            try:
                if should_be_blocked:
                    succeeded, failed = await client.block_devices(macs)
                    await _log_enforcement(
                        db, schedule.group_id, "block", "startup_reconcile",
                        macs, len(failed) == 0,
                        f"Failed: {failed}" if failed else None,
                    )
                    logger.info(f"Reconcile: blocked {len(succeeded)} devices for group {schedule.group_id}")
                else:
                    succeeded, failed = await client.unblock_devices(macs)
                    await _log_enforcement(
                        db, schedule.group_id, "unblock", "startup_reconcile",
                        macs, len(failed) == 0,
                        f"Failed: {failed}" if failed else None,
                    )
                    logger.info(f"Reconcile: unblocked {len(succeeded)} devices for group {schedule.group_id}")
            except Exception as e:
                logger.exception(f"Reconcile error for group {schedule.group_id}: {e}")
            finally:
                await client.close()


async def start_scheduler():
    async with async_session() as db:
        result = await db.execute(select(Schedule).where(Schedule.is_active == True))
        for schedule in result.scalars().all():
            await reschedule_for_schedule(schedule.id, db)

    await reconcile()
    scheduler.start()
    logger.info("Scheduler started")


def stop_scheduler():
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
