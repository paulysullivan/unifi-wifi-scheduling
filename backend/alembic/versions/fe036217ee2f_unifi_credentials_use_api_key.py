"""unifi credentials use api key

Revision ID: fe036217ee2f
Revises: ed33cf412d4d
Create Date: 2026-03-31 18:43:17.778785

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fe036217ee2f'
down_revision: Union[str, Sequence[str], None] = 'ed33cf412d4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Replace username/encrypted_password with encrypted_api_key on unifi_credentials."""
    with op.batch_alter_table('unifi_credentials') as batch_op:
        batch_op.add_column(sa.Column('encrypted_api_key', sa.Text(), nullable=True))
        batch_op.drop_column('username')
        batch_op.drop_column('encrypted_password')

    # Make encrypted_api_key non-nullable after adding (existing rows will need re-entry)
    with op.batch_alter_table('unifi_credentials') as batch_op:
        batch_op.alter_column('encrypted_api_key', nullable=False, existing_type=sa.Text(),
                              server_default='')


def downgrade() -> None:
    """Restore username/encrypted_password on unifi_credentials."""
    with op.batch_alter_table('unifi_credentials') as batch_op:
        batch_op.add_column(sa.Column('username', sa.Text(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('encrypted_password', sa.Text(), nullable=False, server_default=''))
        batch_op.drop_column('encrypted_api_key')
