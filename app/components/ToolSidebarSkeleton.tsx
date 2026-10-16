export default function ToolSidebarSkeleton() {
  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" />
            <div className="hidden md:flex items-center gap-6">
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">

          {/* Sidebar skeleton */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse shrink-0" />
                <div className="h-6 w-36 bg-gray-200 rounded animate-pulse mt-1" />
              </div>
              <div className="space-y-2 pt-1">
                <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-11/12 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-4/5 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-gray-200 animate-pulse shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-gray-200 rounded animate-pulse w-full" />
                      <div className="h-3 bg-gray-200 rounded animate-pulse w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Form skeleton */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                  <div className="h-10 bg-gray-200 rounded-md animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                  <div className="h-10 bg-gray-200 rounded-md animate-pulse" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 bg-gray-200 rounded-md animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-24 bg-gray-200 rounded-md animate-pulse" />
              </div>
              <div className="bg-gray-100 rounded-md p-4 space-y-2">
                <div className="h-4 w-72 bg-gray-200 rounded animate-pulse" />
                <div className="flex gap-5">
                  <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-10 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-11 bg-gray-200 rounded-md animate-pulse" />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
