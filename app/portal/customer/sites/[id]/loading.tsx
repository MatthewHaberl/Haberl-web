export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-56 bg-muted rounded-lg" />
          <div className="h-4 w-40 bg-muted rounded-lg" />
        </div>
        <div className="h-7 w-20 bg-muted rounded-full" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-xl border border-border" />
        ))}
      </div>
      <div className="h-48 bg-muted rounded-xl border border-border" />
      <div className="h-48 bg-muted rounded-xl border border-border" />
    </div>
  )
}
