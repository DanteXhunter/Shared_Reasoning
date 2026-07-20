"""token compartido en sesiones

Agrega `token_compartido` a `sesiones` — un token aleatorio (no adivinable)
que habilita compartir un circuito por link (#feat compartir-sesion). Nulo por
defecto: solo se genera cuando el dueño pide compartir (POST
/sesiones/{id}/compartir). Único e indexado porque se busca por token, nunca
por id de sesión, al resolver el link.

Revision ID: 33a461e7fb20
Revises: b8f4c1a6e2d7
Create Date: 2026-07-16 10:33:58.341061

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '33a461e7fb20'
down_revision: Union[str, None] = 'b8f4c1a6e2d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sesiones', sa.Column('token_compartido', sa.String(length=64), nullable=True))
    op.create_index('ix_sesiones_token_compartido', 'sesiones', ['token_compartido'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_sesiones_token_compartido', table_name='sesiones')
    op.drop_column('sesiones', 'token_compartido')
