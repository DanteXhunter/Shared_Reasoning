// Redimensiona/comprime una imagen en el navegador (canvas) antes de
// persistirla como data URL — evita filas pesadas en la BD sin rechazar
// archivos por su tamaño original. Nunca agranda una imagen ya más chica que
// `ladoMax`. Se usa tanto para la foto de perfil (ver PanelUsuario.tsx, 512px)
// como para el esquemático subido (ver Bienvenida.tsx, 1200px — necesita más
// detalle para seguir siendo legible como circuito).
export function comprimirImagen(archivo: File, ladoMax: number, calidad = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => {
      const img = new Image()
      img.onload = () => {
        const escala = Math.min(1, ladoMax / Math.max(img.width, img.height))
        const ancho = Math.round(img.width * escala)
        const alto = Math.round(img.height * escala)
        const canvas = document.createElement('canvas')
        canvas.width = ancho
        canvas.height = alto
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('No se pudo procesar la imagen.')); return }
        ctx.drawImage(img, 0, 0, ancho, alto)
        resolve(canvas.toDataURL('image/jpeg', calidad))
      }
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'))
      img.src = lector.result as string
    }
    lector.onerror = () => reject(lector.error)
    lector.readAsDataURL(archivo)
  })
}
