// Resaltado de sintaxis JSON ligero (sin librerías).
// Colorea claves, textos, números, booleanos y null.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function resaltar(obj: unknown): string {
  const json = escapeHtml(JSON.stringify(obj, null, 2))
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-amber-300' // número
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'text-violet-300' : 'text-emerald-300' // clave : texto
      } else if (/true|false/.test(match)) {
        cls = 'text-sky-300'
      } else if (/null/.test(match)) {
        cls = 'text-slate-500 italic'
      }
      return `<span class="${cls}">${match}</span>`
    },
  )
}

type Props = { data: unknown; className?: string }

function JsonView({ data, className = '' }: Props) {
  return (
    <pre
      className={`text-xs leading-relaxed overflow-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: resaltar(data) }}
    />
  )
}

export default JsonView
