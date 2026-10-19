"""Add connection info to devices

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-18

"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("devices") as batch_op:
        batch_op.add_column(sa.Column("is_wired", sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column("network", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("ssid", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("vlan", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("devices") as batch_op:
        batch_op.drop_column("vlan")
        batch_op.drop_column("ssid")
        batch_op.drop_column("network")
        batch_op.drop_column("is_wired")
