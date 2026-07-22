type Props = {
  usuario: { nombre: string; fotoPerfil?: string | null }
  size?: number
  className?: string
}

// Avatar único para toda la app (botón de cuenta en Bienvenida, topbar de
// VistaPrincipal, carrusel de Mi cuenta): si hay fotoPerfil (preset o foto
// propia) se muestra la imagen; si no, un círculo con la inicial del nombre
// — el mismo fallback que ya existía antes de esta feature.
function Avatar({ usuario, size = 32, className }: Props) {
  if (usuario.fotoPerfil) {
    return (
      <img
        src={usuario.fotoPerfil}
        alt={usuario.nombre}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover shrink-0 ${className ?? ''}`}
      />
    )
  }

  return (
    <span
      className={`grid place-items-center rounded-full shrink-0 font-semibold ${className ?? ''}`}
      style={{ width: size, height: size, background: 'var(--accent)', color: 'var(--bg2)', fontSize: size * 0.4 }}
    >
      {usuario.nombre.charAt(0).toUpperCase()}
    </span>
  )
}

export default Avatar
