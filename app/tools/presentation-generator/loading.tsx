import { Monitor } from "lucide-react";

export default function Loading() {
  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
            <Monitor className="w-5 h-5 text-violet-600" />
          </div>
          <div className="h-7 w-40 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="h-10 w-44 bg-gray-200 rounded-xl animate-pulse" />
      </div>

      {/* Search */}
      <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-[#FAF9F5] rounded-2xl overflow-hidden animate-pulse">
            <div className="aspect-video bg-gray-200" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
