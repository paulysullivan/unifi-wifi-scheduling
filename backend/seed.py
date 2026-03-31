import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import User
from auth import hash_password

logger = logging.getLogger(__name__)


async def seed_admin(db: AsyncSession):
    result = await db.execute(select(User))
    if result.scalars().first() is not None:
        return

    admin = User(
        username=settings.admin_username,
        hashed_password=hash_password(settings.admin_password),
    )
    db.add(admin)
    await db.commit()
    logger.info(f"Seeded admin user: {settings.admin_username}")
