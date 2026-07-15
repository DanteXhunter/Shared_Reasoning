"""agregar foto_perfil a usuarios (y fusionar heads)

`imagen_esquema_en_sesiones` (a1c3e5f7b9d0) y `es_admin` (e6a2c4b9f1d3) se
crearon como dos ramas independientes sobre el mismo padre (d5e9f3a1b8c2) y
nunca se fusionaron — `alembic upgrade head` quedaba ambiguo (dos heads).
Esta revisión fusiona ambas ramas y de paso agrega la columna nueva.

Revision ID: f2b8d4c6a1e9
Revises: a1c3e5f7b9d0, e6a2c4b9f1d3
Create Date: 2026-07-14 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f2b8d4c6a1e9'
down_revision: Union[str, Sequence[str], None] = ('a1c3e5f7b9d0', 'e6a2c4b9f1d3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'usuarios',
        sa.Column('foto_perfil', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'foto_perfil')
