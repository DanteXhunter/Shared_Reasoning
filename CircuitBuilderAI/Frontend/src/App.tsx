import Protoboard from './components/Protoboard'

function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 gap-4 p-6">
      <h1 className="text-2xl font-bold text-violet-400">Protoboard — Konva</h1>
      <div className="bg-slate-800 p-4 rounded-xl">
        <Protoboard />
      </div>
    </div>
  )
}

export default App
