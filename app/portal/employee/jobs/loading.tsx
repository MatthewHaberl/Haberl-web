export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-32 bg-muted rounded-lg" />
        <div className="h-4 w-40 bg-muted rounded-lg" />
      </div>
      <div className="h-5 w-28 bg-muted rounded-lg" />
      <div className="grid sm:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted rounded-xl border border-border" />
        ))}
      </div>
    </div>
  )
}
