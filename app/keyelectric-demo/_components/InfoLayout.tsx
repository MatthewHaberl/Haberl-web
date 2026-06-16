import { Breadcrumb } from './Breadcrumb'

export function InfoLayout({
  title,
  subtitle,
  trail,
  children,
  wide = false,
}: {
  title: string
  subtitle?: string
  trail: { label: string; href?: string }[]
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div>
      <div className="bg-[var(--ke-slate)] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <h1 className="text-3xl font-extrabold md:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-white/70">{subtitle}</p>}
        </div>
      </div>
      <Breadcrumb trail={trail} />
      <div className={`mx-auto ${wide ? 'max-w-7xl' : 'max-w-4xl'} px-4 pb-14`}>{children}</div>
    </div>
  )
}
