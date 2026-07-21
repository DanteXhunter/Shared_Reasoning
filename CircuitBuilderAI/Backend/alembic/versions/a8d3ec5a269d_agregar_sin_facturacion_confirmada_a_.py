"""agregar sin_facturacion_confirmada a usuarios

Revision ID: a8d3ec5a269d
Revises: 33a461e7fb20
Create Date: 2026-07-21 15:52:14.500047

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a8d3ec5a269d'
down_revision: Union[str, None] = '33a461e7fb20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'usuarios',
        sa.Column('sin_facturacion_confirmada', postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'sin_facturacion_confirmada')
