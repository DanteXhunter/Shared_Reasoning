"""agregar es_admin a usuarios

Revision ID: e6a2c4b9f1d3
Revises: d5e9f3a1b8c2
Create Date: 2026-07-09 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e6a2c4b9f1d3'
down_revision: Union[str, None] = 'd5e9f3a1b8c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'usuarios',
        sa.Column('es_admin', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'es_admin')
