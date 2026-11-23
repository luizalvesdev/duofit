import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { useBackClose } from '../lib/backStack'
import { useDismiss } from '../lib/useDismiss'
import { foodLabel, forGrams, round, type Food } from '../lib/diet'
import { NumericInput } from './NumericInput'
import { Button, ErrorText, Field, Input } from './ui'

// Chrome (Android) exposes BarcodeDetector; it is not in the TS DOM lib yet.
type DetectedBarcode = { rawValue: string }
type BarcodeDetectorInstance = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> }
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorInstance
  }
}

type Prefill = { name: string; kcal: number; protein: number; carbs: number; fat: number; servingGrams: number | null }

function MacroLine({ food, grams }: { food: Food; grams: number }) {
  const m = forGrams(food, grams)
  return (
    <p className="text-sm text-zinc-400">
      <b className="text-zinc-100">{round(m.kcal)} kcal</b> · P {round(m.protein)}g · C {round(m.carbs)}g · G {round(m.fat)}g
    </p>
  )
}

export function Scanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const Detector = window.BarcodeDetector
    if (!Detector) {
      setError('Leitor de código não é suportado neste navegador. Use o Chrome no Android, ou cadastre o alimento manualmente.')
      return
    }
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
      } catch {
        setError('Não foi possível abrir a câmera. Confira a permissão.')
        return
      }
      const tick = async () => {
        if (stopped || !videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          const code = codes[0]?.rawValue
          if (code) {
            stopped = true
            onCode(code)
            return
          }
        } catch {
          // ignore a frame that fails to decode
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onCode])

  return (
    <div className="grid gap-4 p-4">
      <button onClick={onCancel} className="justify-self-start text-zinc-400">Voltar</button>
      <h2 className="text-lg font-semibold">Escanear código de barras</h2>
      {error ? (
        <ErrorText>{error}</ErrorText>
      ) : (
        <>
          <video ref={videoRef} className="aspect-square w-full rounded-xl bg-black object-cover" muted playsInline />
          <p className="text-sm text-zinc-500">Aponte a câmera para o código de barras do produto.</p>
        </>
      )}
    </div>
  )
}

function CreateFood({
  initialName,
  prefill,
  onCreated,
  onCancel,
}: {
  initialName: string
  prefill?: Prefill | null
  onCreated: (food: Food) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(prefill?.name ?? initialName)
  const [portion, setPortion] = useState<number | null>(prefill ? 100 : null)
  const [values, setValues] = useState<Record<'kcal' | 'protein' | 'carbs' | 'fat', number | null>>(
    prefill ? { kcal: prefill.kcal, protein: prefill.protein, carbs: prefill.carbs, fat: prefill.fat } : { kcal: null, protein: null, carbs: null, fat: null },
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (name.trim().length < 2 || !portion || Object.values(values).some((v) => v === null)) {
      return setError('Preencha nome, porção e os 4 valores do rótulo.')
    }
    const per100 = (v: number) => Math.round((v / portion) * 1000) / 10
    setSaving(true)
    try {
      const { food } = await api<{ food: Food }>('/diet/foods', {
        method: 'POST',
        body: {
          name,
          kcal: per100(values.kcal!),
          protein: per100(values.protein!),
          carbs: per100(values.carbs!),
          fat: per100(values.fat!),
          servingName: `1 porção (${prefill?.servingGrams ?? portion}g)`,
          servingGrams: prefill?.servingGrams ?? portion,
        },
      })
      onCreated(food)
    } catch {
      setError('Não foi possível salvar. Confira os valores.')
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 p-4">
      <h2 className="text-lg font-semibold">Novo alimento</h2>
      <p className="text-sm text-zinc-500">
        {prefill ? 'Valores por 100 g vindos do código de barras — confira antes de salvar.' : 'Copie da tabela nutricional da embalagem.'}
      </p>
      <Field label="Nome">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </Field>
      <Field label={prefill ? 'Porção dos valores abaixo (g)' : 'Porção do rótulo (g ou ml)'}>
        <NumericInput decimal value={portion} onCommit={setPortion} placeholder="30" />
      </Field>
      <div className="grid grid-cols-4 gap-2">
        {([['kcal', 'Kcal'], ['protein', 'Prot.'], ['carbs', 'Carbo'], ['fat', 'Gord.']] as const).map(([key, label]) => (
          <label key={key} className="grid gap-1 text-center">
            <span className="text-xs text-zinc-500">{label}</span>
            <NumericInput decimal value={values[key]} onCommit={(v) => setValues((prev) => ({ ...prev, [key]: v }))} />
          </label>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar alimento'}</Button>
      <button onClick={onCancel} className="text-sm text-zinc-500">Cancelar</button>
    </div>
  )
}

export function FoodSearch({ title, onAdd, onClose }: { title: string; onAdd: (food: Food, grams: number) => Promise<void> | void; onClose: () => void }) {
  const { closing, dismiss } = useDismiss()
  useBackClose(() => (scanning ? setScanning(false) : selected ? setSelected(null) : creating ? setCreating(false) : dismiss(onClose)))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[] | null>(null)
  const [recent, setRecent] = useState<Food[]>([])
  const [selected, setSelected] = useState<Food | null>(null)
  const [grams, setGrams] = useState<number | null>(100)
  const [creating, setCreating] = useState(false)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api<{ foods: Food[] }>('/diet/foods/recent').then((r) => setRecent(r.foods)).catch(() => {})
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) return setResults(null)
    const timer = setTimeout(() => {
      api<{ foods: Food[] }>(`/diet/foods?q=${encodeURIComponent(query)}`).then((r) => setResults(r.foods)).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const pick = (food: Food) => {
    setSelected(food)
    setGrams(food.lastGrams ?? food.servingGrams ?? 100)
  }

  async function onCode(code: string) {
    setScanning(false)
    setNotice('Buscando produto…')
    try {
      const data = await api<Prefill>(`/diet/foods/barcode/${code}`)
      setPrefill(data)
      setNotice('')
      setCreating(true)
    } catch (e) {
      // Not found / no nutrition / lookup failed: fall back to manual entry.
      setPrefill(null)
      setNotice(e instanceof ApiError && e.code === 'not_found' ? 'Produto não encontrado na base. Cadastre manualmente.' : 'Não deu para buscar. Cadastre manualmente.')
      setCreating(true)
    }
  }

  // Reads a nutrition-table photo with the AI and opens the create form prefilled (per-100g values).
  async function onLabelPhoto(file: File) {
    setNotice('Lendo a tabela nutricional…')
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.onerror = () => rej(r.error)
        r.readAsDataURL(file)
      })
      const data = await api<Omit<Prefill, 'name'> & { name: string | null }>('/ai/nutrition-from-label', {
        method: 'POST',
        body: { image: dataUrl.split(',')[1], mediaType: file.type },
      })
      setPrefill({ ...data, name: data.name || query || 'Produto do rótulo', servingGrams: data.servingGrams ?? null })
      setNotice('')
      setCreating(true)
    } catch {
      setNotice('Não deu para ler a tabela. Tente uma foto mais nítida ou cadastre manualmente.')
    }
  }

  async function confirm() {
    if (!selected || !grams) return
    setAdding(true)
    await onAdd(selected, grams)
    setAdding(false)
  }

  const list = results ?? recent

  return (
    <div data-closing={closing || undefined} className="anim-sheet fixed inset-0 z-50 flex flex-col overflow-y-auto bg-zinc-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {scanning ? (
        <Scanner onCancel={() => setScanning(false)} onCode={onCode} />
      ) : creating ? (
        <CreateFood
          initialName={query}
          prefill={prefill}
          onCancel={() => { setCreating(false); setPrefill(null) }}
          onCreated={(food) => { setCreating(false); setPrefill(null); pick(food) }}
        />
      ) : selected ? (
        <div className="grid gap-4 p-4">
          <button onClick={() => setSelected(null)} className="justify-self-start text-zinc-400">Voltar</button>
          <h2 className="text-lg font-semibold">{foodLabel(selected.name)}</h2>
          <Field label="Quantidade (g)">
            <NumericInput decimal value={grams} onCommit={setGrams} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {[...(selected.servingGrams ? [selected.servingGrams] : []), 50, 100, 150, 200].map((g) => (
              <button key={g} onClick={() => setGrams(g)} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300">
                {g === selected.servingGrams ? selected.servingName : `${g}g`}
              </button>
            ))}
          </div>
          {grams ? <MacroLine food={selected} grams={grams} /> : null}
          <Button onClick={confirm} disabled={!grams || adding}>{adding ? 'Adicionando…' : `Adicionar em ${title}`}</Button>
        </div>
      ) : (
        <>
          <header className="flex items-center gap-3 border-b border-zinc-900 p-4">
            <button onClick={() => dismiss(onClose)} className="shrink-0 text-zinc-400">Fechar</button>
            <Input autoFocus placeholder="Buscar alimento (ex: frango grelhado)" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button onClick={() => { setNotice(''); setScanning(true) }} className="shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-lime-400" aria-label="Escanear código de barras">
              Escanear
            </button>
            <button onClick={() => labelRef.current?.click()} className="shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-lime-400" aria-label="Foto da tabela nutricional">
              Tabela
            </button>
            <input
              ref={labelRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onLabelPhoto(file)
              }}
            />
          </header>
          {notice && <p className="px-4 pt-3 text-sm text-amber-300">{notice}</p>}
          <ul className="flex-1 px-4 pb-8">
            {!results && recent.length > 0 && <li className="pt-3 text-xs uppercase tracking-wide text-zinc-600">Recentes</li>}
            {list.map((food) => (
              <li key={food.id}>
                <button onClick={() => pick(food)} className="w-full border-b border-zinc-900 py-3 text-left">
                  <p className="font-medium">{foodLabel(food.name)}</p>
                  <p className="text-xs text-zinc-500">
                    {round(food.kcal)} kcal · P {food.protein} · C {food.carbs} · G {food.fat} por 100g
                    {food.source === 'custom' && ' · seu'}
                  </p>
                </button>
              </li>
            ))}
            {results?.length === 0 && <li className="py-6 text-center text-zinc-500">Nada encontrado.</li>}
            <li>
              <button onClick={() => { setPrefill(null); setCreating(true) }} className="w-full py-4 text-center text-lime-400">+ Cadastrar alimento da embalagem</button>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
