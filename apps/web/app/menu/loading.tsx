// While a store's menu loads: the page's shape, so nothing jumps.
export default function MenuLoading() {
  return (
    <div aria-busy="true" aria-label="Loading the menu">
      <div className="bg-ink">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
          <div className="mt-5 h-14 w-48 animate-pulse rounded bg-white/10" />
          <div className="mt-4 h-5 w-72 animate-pulse rounded bg-white/10" />
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-5 px-4 py-10 sm:px-6 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl bg-white ring-1 ring-stone-200">
            <div className="aspect-[4/3] animate-pulse bg-cream-deep" />
            <div className="space-y-2 p-5">
              <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
              <div className="h-3 w-full animate-pulse rounded bg-stone-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
