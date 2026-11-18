import { ListChecks, ArrowLeft } from "lucide-react";

const inputClass = "w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-300 bg-gray-50";
const selectClass = "w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-300 bg-gray-50";

export default function Loading() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                  <ListChecks className="w-5 h-5 text-indigo-600" />
                </div>
                <h1 className="text-lg font-bold text-gray-900 mt-1.5">Topic Overview</h1>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                This tool can be used to generate a topic overview. Simply provide the year group, subject
                and topic and the AI will generate a structured overview with lesson summaries.
              </p>
              <div className="mt-5 pt-5 border-t border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Guidance</h2>
                <ol className="space-y-3">
                  {[
                    "Be specific with the topic name. Use the language from your curriculum documentation.",
                    "Set the number of lessons to match your actual scheme of work.",
                    "Ideas for use: planning a new unit, sharing an overview with students or parents.",
                  ].map((tip, i) => (
                    <li key={i} className="flex gap-3 text-sm text-gray-600">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {tip}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <ArrowLeft className="w-4 h-4" />
              Back to all tools
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Curriculum</label>
                  <select disabled className={selectClass}><option>Select curriculum</option></select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Year Group</label>
                  <select disabled className={selectClass}><option>Select year group</option></select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Subject</label>
                <input disabled placeholder="e.g. Mathematics" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Topic</label>
                <textarea disabled rows={3} placeholder="e.g. Pythagoras' Theorem and trigonometric ratios" className={`${inputClass} resize-none`} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Number of lessons</label>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 border border-gray-200 rounded-md bg-gray-50" />
                  <span className="text-gray-300 text-sm">6</span>
                  <div className="w-8 h-8 border border-gray-200 rounded-md bg-gray-50" />
                </div>
              </div>
              <button disabled className="w-full bg-indigo-300 text-white py-2.5 px-6 rounded-md text-sm font-medium cursor-not-allowed">
                Generate
              </button>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
