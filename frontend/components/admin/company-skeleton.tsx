const placeholder = "animate-pulse rounded-md bg-white/[0.07] motion-reduce:animate-none";

export function CompanyContentSkeleton() {
  return (
    <div role="status" className="flex min-w-0 flex-col gap-9">
      <span className="sr-only">Carregando dados da empresa...</span>
      <div aria-hidden="true">
        <section className="pb-7">
          <div className="flex items-center gap-4">
            <div className={`${placeholder} size-11 shrink-0 rounded-xl`} />
            <div className="space-y-2">
              <div className={`${placeholder} h-5 w-44 max-w-[55vw]`} />
              <div className={`${placeholder} h-3 w-28`} />
            </div>
            <div className={`${placeholder} ml-auto hidden h-4 w-32 sm:block`} />
          </div>
        </section>

        <nav className="mb-8 flex gap-7 overflow-hidden border-b border-white/[0.07] pb-3">
          {[72, 58, 53, 60].map((width) => <div key={width} className={`${placeholder} h-4 shrink-0`} style={{ width }} />)}
        </nav>

        <div className="grid grid-cols-3 divide-x divide-white/[0.07] border-y border-white/[0.07] py-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="px-4 first:pl-1 last:pr-1">
              <div className={`${placeholder} h-6 w-7`} />
              <div className={`${placeholder} mt-2 h-3 w-full max-w-28`} />
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section>
            <div className={`${placeholder} mb-3 h-4 w-32`} />
            <div className="border-y border-white/[0.07]">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-3 py-3">
                  <div className={`${placeholder} size-8 shrink-0 rounded-full`} />
                  <div className="space-y-2">
                    <div className={`${placeholder} h-3.5 w-32`} />
                    <div className={`${placeholder} h-3 w-44 max-w-[48vw]`} />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <div className={`${placeholder} mb-3 h-4 w-28`} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex aspect-square flex-col rounded-xl border border-white/[0.06] bg-white/[0.018] p-3">
                  <div className={`${placeholder} size-8 rounded-lg`} />
                  <div className={`${placeholder} mt-auto h-3.5 w-3/4`} />
                  <div className={`${placeholder} mt-2 h-3 w-1/2`} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function CompanyPageSkeleton() {
  return (
    <main className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[calc(6rem+env(safe-area-inset-top))] max-w-7xl items-center justify-between px-5 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
          <div className="space-y-2" aria-hidden="true">
            <div className={`${placeholder} h-4 w-20`} />
            <div className={`${placeholder} hidden h-3 w-44 sm:block`} />
          </div>
          <div className={`${placeholder} h-8 w-28 rounded-full sm:w-36`} aria-hidden="true" />
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <CompanyContentSkeleton />
      </div>
    </main>
  );
}
