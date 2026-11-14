import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm text-zinc-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  )
}

const control =
  'w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3.5 py-3 text-zinc-100 outline-none focus:border-lime-400 transition-colors'

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={control} />

export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={control} />

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-lime-400 px-4 py-3 font-semibold text-zinc-950 active:scale-[0.98] disabled:opacity-50 transition ${className}`}
    />
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{children}</p>
}
