export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-36 bg-muted rounded-lg" />
          <div className="h-4 w-28 bg-muted rounded-lg" />
        </div>
        <div className="h-10 w-28 bg-muted rounded-lg" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 bg-muted rounded-xl border border-border" />
      ))}
    </div>
  )
}
