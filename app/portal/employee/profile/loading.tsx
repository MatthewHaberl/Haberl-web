export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-36 bg-muted rounded-lg" />
        <div className="h-4 w-44 bg-muted rounded-lg" />
      </div>
      <div className="h-56 max-w-lg bg-muted rounded-xl border border-border" />
    </div>
  )
}
