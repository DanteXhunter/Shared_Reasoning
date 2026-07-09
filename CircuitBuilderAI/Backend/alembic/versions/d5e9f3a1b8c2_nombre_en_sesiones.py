"""agregar nombre a sesiones

Revision ID: d5e9f3a1b8c2
Revises: c4d8e1f2a6b7
Create Date: 2026-07-08 23:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd5e9f3a1b8c2'
down_revision: Union[str, None] = 'c4d8e1f2a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'sesiones',
        sa.Column('nombre', sa.String(length=200), nullable=False,
                  server_default='Circuito sin nombre'),
    )


def downgrade() -> None:
    op.drop_column('sesiones', 'nombre')
