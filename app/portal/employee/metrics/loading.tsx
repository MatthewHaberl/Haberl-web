export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="h-4 w-56 bg-muted rounded-lg" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 bg-muted rounded-xl border border-border" />
        ))}
      </div>
    </div>
  )
}
