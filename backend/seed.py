import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import User
from auth import hash_password

logger = logging.getLogger(__name__)


async def seed_admin(db: AsyncSession) -> None:
    result = await db.execute(select(User).limit(1))
    if result.scalar_one_or_none() is not None:
        return

    if not settings.admin_password:
        logger.warning("No ADMIN_PASSWORD set in .env — skipping admin seed")
        return

    admin = User(
        username=settings.admin_username,
        hashed_password=hash_password(settings.admin_password),
    )
    db.add(admin)
    await db.commit()
    logger.info(f"Seeded admin user: {settings.admin_username}")
