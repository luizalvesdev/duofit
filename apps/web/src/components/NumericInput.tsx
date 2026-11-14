import { useEffect, useState } from 'react'

const parse = (text: string) => {
  const value = Number(text.replace(',', '.'))
  return text.trim() === '' || Number.isNaN(value) ? null : value
}

const format = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

export function NumericInput({ value, onCommit, decimal = false, placeholder, invalid = false, className = '' }: {
  value: number | null
  onCommit: (value: number | null) => void
  decimal?: boolean
  placeholder?: string
  invalid?: boolean
  className?: string
}) {
  const [text, setText] = useState(format(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(format(value))
  }, [value, focused])

  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        setFocused(true)
        e.target.select()
      }}
      onChange={(e) => {
        const next = decimal ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value.replace(/\D/g, '')
        setText(next)
        onCommit(parse(next))
      }}
      onBlur={() => setFocused(false)}
      className={`w-full min-w-0 text-center font-semibold text-zinc-50 outline-none placeholder:font-normal placeholder:text-zinc-500 focus:border-lime-400! focus:ring-4 focus:ring-lime-400/15 ${invalid ? 'border-2! border-red-400!' : ''} ${className || 'h-12 rounded-xl border border-line-strong bg-surface-2'}`}
    />
  )
}
