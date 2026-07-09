"""agregar imagen_esquema a sesiones

Revision ID: a1c3e5f7b9d0
Revises: d5e9f3a1b8c2
Create Date: 2026-07-09 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1c3e5f7b9d0'
down_revision: Union[str, None] = 'd5e9f3a1b8c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Data URL (base64) del esquemático subido, para restaurarlo al reabrir una
    # sesión desde el historial (antes solo vivía en memoria del navegador).
    op.add_column(
        'sesiones',
        sa.Column('imagen_esquema', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('sesiones', 'imagen_esquema')
