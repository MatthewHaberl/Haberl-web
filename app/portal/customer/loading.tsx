export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-44 bg-muted rounded-lg" />
        <div className="h-4 w-64 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-xl border border-border" />
        ))}
      </div>
      <div className="h-52 bg-muted rounded-xl border border-border" />
      <div className="h-52 bg-muted rounded-xl border border-border" />
    </div>
  )
}
