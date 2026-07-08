"""cascade e indices en sesiones y chat_mensajes

Revision ID: b2f1a7c9d3e4
Revises: ef6f00ca0b57
Create Date: 2026-07-08 15:40:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'b2f1a7c9d3e4'
down_revision: Union[str, None] = 'ef6f00ca0b57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- sesiones.usuario_id: FK con ON DELETE CASCADE + índice ---
    op.drop_constraint('sesiones_usuario_id_fkey', 'sesiones', type_='foreignkey')
    op.create_foreign_key(
        'sesiones_usuario_id_fkey', 'sesiones', 'usuarios',
        ['usuario_id'], ['id'], ondelete='CASCADE',
    )
    op.create_index('ix_sesiones_usuario_id', 'sesiones', ['usuario_id'])

    # --- chat_mensajes.sesion_id: FK con ON DELETE CASCADE + índice ---
    op.drop_constraint('chat_mensajes_sesion_id_fkey', 'chat_mensajes', type_='foreignkey')
    op.create_foreign_key(
        'chat_mensajes_sesion_id_fkey', 'chat_mensajes', 'sesiones',
        ['sesion_id'], ['id'], ondelete='CASCADE',
    )
    op.create_index('ix_chat_mensajes_sesion_id', 'chat_mensajes', ['sesion_id'])
    op.create_index('ix_chat_mensajes_timestamp', 'chat_mensajes', ['timestamp'])


def downgrade() -> None:
    op.drop_index('ix_chat_mensajes_timestamp', table_name='chat_mensajes')
    op.drop_index('ix_chat_mensajes_sesion_id', table_name='chat_mensajes')
    op.drop_constraint('chat_mensajes_sesion_id_fkey', 'chat_mensajes', type_='foreignkey')
    op.create_foreign_key(
        'chat_mensajes_sesion_id_fkey', 'chat_mensajes', 'sesiones',
        ['sesion_id'], ['id'],
    )

    op.drop_index('ix_sesiones_usuario_id', table_name='sesiones')
    op.drop_constraint('sesiones_usuario_id_fkey', 'sesiones', type_='foreignkey')
    op.create_foreign_key(
        'sesiones_usuario_id_fkey', 'sesiones', 'usuarios',
        ['usuario_id'], ['id'],
    )
