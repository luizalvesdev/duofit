import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-zinc-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}

const control =
  'w-full min-w-0 h-12 rounded-xl bg-surface-2 border border-line-strong px-3.5 text-zinc-50 outline-none focus:border-lime-400 focus:ring-4 focus:ring-lime-400/15 transition'

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={control} />

export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={control} />

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`h-12 rounded-[14px] bg-lime-400 px-5 font-extrabold text-ink transition hover:bg-lime-300 active:scale-[0.98] disabled:opacity-50 ${className}`}
    />
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{children}</p>
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label-caps">{title}</span>
      {action}
    </div>
  )
}
