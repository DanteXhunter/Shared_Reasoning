import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

/**
 * Renderiza el markdown de las respuestas del asistente.
 *
 * Antes se pintaba `{m.texto}` en crudo: React no interpreta markdown y HTML
 * colapsa los saltos de línea, así que una respuesta con lista numerada llegaba
 * como un párrafo único. El modelo ya generaba la estructura; se perdía al
 * pintarla.
 *
 * Se mapea cada elemento a mano en vez de usar el plugin `prose` de Tailwind
 * Typography: el proyecto tiene su propio sistema de temas por variables CSS
 * (--ink, --bg2, --border...), y `prose` trae una paleta propia que habría que
 * sobrescribir entera para que respete el tema claro/oscuro.
 *
 * SEGURIDAD: no se habilita `rehype-raw`. Sin él, react-markdown NO ejecuta
 * HTML embebido en el texto — importante porque este contenido lo genera un LLM
 * que a su vez procesó texto del usuario. Es la contraparte de salida de la
 * sanitización de entrada que hace agents/seguridad.py.
 */

const componentes: Components = {
  // El margen va entre bloques hermanos (no arriba del primero ni abajo del
  // último) para que la burbuja no quede con espacio muerto en los bordes.
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,

  ul: ({ children }) => <ul className="my-2 first:mt-0 last:mb-0 pl-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 first:mt-0 last:mb-0 pl-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,

  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  // `code` cubre tanto el código en línea como el interior de un bloque. Solo
  // el de línea se estiliza acá; el de bloque lo envuelve `pre`, que ya pone
  // fondo y scroll, y estilizar ambos duplicaría el fondo.
  code: ({ className, children }) => {
    const esBloque = Boolean(className)
    if (esBloque) return <code className={className}>{children}</code>
    return (
      <code
        className="px-1 py-0.5 rounded text-[0.9em] font-mono"
        style={{ background: 'var(--bg1)', border: '1px solid var(--border)' }}
      >
        {children}
      </code>
    )
  },

  // overflow-x-auto es obligatorio, no cosmético: la columna del chat baja
  // hasta 280px (ANCHO_CHAT_MIN) y sin scroll propio una línea larga de código
  // desbordaría el layout entero.
  pre: ({ children }) => (
    <pre
      className="my-2 first:mt-0 last:mb-0 p-2.5 rounded-lg overflow-x-auto text-xs font-mono"
      style={{ background: 'var(--bg1)', border: '1px solid var(--border)' }}
    >
      {children}
    </pre>
  ),

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
      style={{ color: 'var(--accent)' }}
    >
      {children}
    </a>
  ),

  // El system prompt le pide al modelo que no use encabezados (no caben en una
  // columna estrecha). Si igual manda uno, se degrada a texto en negrita en
  // vez de a un título gigante que rompa la escala visual de la burbuja.
  h1: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 font-semibold">{children}</p>,

  blockquote: ({ children }) => (
    <blockquote className="my-2 first:mt-0 last:mb-0 pl-3 border-l-2" style={{ borderColor: 'var(--border)' }}>
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-3" style={{ borderColor: 'var(--border)' }} />,

  // Las tablas tampoco están permitidas por ancho, pero si llega una, que
  // scrollee en vez de desbordar.
  table: ({ children }) => (
    <div className="my-2 first:mt-0 last:mb-0 overflow-x-auto">
      <table className="text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-semibold border" style={{ borderColor: 'var(--border)' }}>{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1 border" style={{ borderColor: 'var(--border)' }}>{children}</td>
  ),
}

function MensajeMarkdown({ texto }: { texto: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
      {texto}
    </ReactMarkdown>
  )
}

export default MensajeMarkdown
