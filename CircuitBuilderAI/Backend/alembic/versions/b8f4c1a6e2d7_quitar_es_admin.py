"""quitar es_admin de usuarios

El presupuesto de tokens por usuario (que era lo único que exentaba a los
admins) se eliminó — `.env` pasó a usar las API keys de la cuenta común del
proyecto, así que el gasto ya es compartido y consciente entre el equipo, sin
necesidad de una cuota individual ni de un rol exento de ella (ver #76).

Revision ID: b8f4c1a6e2d7
Revises: a3d7e2f9c5b1
Create Date: 2026-07-15 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b8f4c1a6e2d7'
down_revision: Union[str, None] = 'a3d7e2f9c5b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('usuarios', 'es_admin')


def downgrade() -> None:
    op.add_column(
        'usuarios',
        sa.Column('es_admin', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
