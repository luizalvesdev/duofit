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
      className={`w-full rounded-lg bg-zinc-800 py-2 text-center font-semibold outline-none placeholder:font-normal placeholder:text-zinc-500 focus:ring-1 focus:ring-lime-400 ${invalid ? 'ring-1 ring-red-500' : ''} ${className}`}
    />
  )
}
