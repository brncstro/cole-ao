export default function Loading() {
  return (
    <div role="status" aria-label="A carregar" className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-black/5" />
      <div className="h-10 w-full rounded bg-black/5" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded bg-black/5" />
        ))}
      </div>
    </div>
  );
}
