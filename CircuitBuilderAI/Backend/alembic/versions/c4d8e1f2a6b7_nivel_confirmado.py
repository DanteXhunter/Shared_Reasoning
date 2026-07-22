"""agregar nivel_confirmado a usuarios

Revision ID: c4d8e1f2a6b7
Revises: b2f1a7c9d3e4
Create Date: 2026-07-08 16:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c4d8e1f2a6b7'
down_revision: Union[str, None] = 'b2f1a7c9d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'usuarios',
        sa.Column('nivel_confirmado', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'nivel_confirmado')
