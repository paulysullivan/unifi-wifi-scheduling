"""Add is_paused to groups

Revision ID: a1b2c3d4e5f6
Revises: fe036217ee2f
Create Date: 2026-04-04

"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "fe036217ee2f"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("groups") as batch_op:
        batch_op.add_column(
            sa.Column("is_paused", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade():
    with op.batch_alter_table("groups") as batch_op:
        batch_op.drop_column("is_paused")
