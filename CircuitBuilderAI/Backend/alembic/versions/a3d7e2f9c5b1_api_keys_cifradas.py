"""agregar api_keys_cifradas a usuarios

Revision ID: a3d7e2f9c5b1
Revises: f2b8d4c6a1e9
Create Date: 2026-07-14 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a3d7e2f9c5b1'
down_revision: Union[str, None] = 'f2b8d4c6a1e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'usuarios',
        sa.Column('api_keys_cifradas', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'api_keys_cifradas')
