import { BookOpen } from "lucide-react";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-[#FAF9F5] rounded-3xl overflow-hidden">
            <div className="bg-amber-50 p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-amber-600" />
                </div>
                <h1 className="text-2xl font-semibold">Comprehension Generator</h1>
              </div>
              <p className="text-sm font-light">
                This tool can be used to create reading comprehension activities. Select your curriculum, year group, text source and reading focuses, then hit generate.
              </p>
            </div>
            <div className="pt-5 pb-6 px-8">
              <div className="h-px bg-gray-200 mb-5" />
              <h2 className="text-md font-semibold text-gray-900 mb-5">How to use it</h2>
              <ol className="space-y-0">
                {[
                  { label: "Choose your text source", detail: "Generate a passage from a topic, or paste your own text.", color: "bg-yellow-400" },
                  { label: "Select content domains", detail: "Pick one or more reading focuses to target specific comprehension skills.", color: "bg-green-500" },
                  { label: "Generate", detail: "Create differentiated reading activities, revision tasks, or assessments.", color: "bg-orange-400" },
                ].map((step, i, arr) => (
                  <li key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className={`w-7 h-7 rounded-full ${step.color} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                        {i + 1}
                      </span>
                      {i < arr.length - 1 && <div className="w-px grow bg-gray-200 my-1.5" />}
                    </div>
                    <div className="pb-5">
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{step.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-2">
          <div className="bg-[#FAF9F5] rounded-3xl p-8 space-y-6">

            {/* Curriculum + Year Group */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Curriculum</label>
                <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-300 bg-white">Select curriculum</div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Year group</label>
                <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-300 bg-white">Select year group</div>
              </div>
            </div>

            {/* Text Source */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Text source</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-gray-200 rounded-md p-4 flex flex-col items-center gap-2 text-sm font-medium text-gray-300 bg-white">
                  <div className="w-5 h-5 rounded bg-gray-100" />
                  Generate for me
                </div>
                <div className="border border-gray-200 rounded-md p-4 flex flex-col items-center gap-2 text-sm font-medium text-gray-300 bg-white">
                  <div className="w-5 h-5 rounded bg-gray-100" />
                  Use my own text
                </div>
              </div>
            </div>

            {/* Topic */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Topic or prompt</label>
              <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-300 bg-white">
                e.g. "The life cycle of a monarch butterfly"
              </div>
            </div>

            {/* Complexity */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800">Complexity</label>
              <div className="flex gap-2">
                {["Simple", "Standard", "Challenging"].map((level) => (
                  <div key={level} className="px-4 py-1.5 rounded-full text-sm font-medium border border-gray-200 text-gray-300 bg-white">
                    {level}
                  </div>
                ))}
              </div>
            </div>

            {/* Content domain */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800">
                Content domain
                <span className="ml-2 text-xs font-normal text-gray-400">KS2 (2a–2h)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { code: "2a", label: "Word meaning" },
                  { code: "2b", label: "Retrieval" },
                  { code: "2c", label: "Summarising" },
                  { code: "2d", label: "Inference" },
                  { code: "2e", label: "Prediction" },
                  { code: "2f", label: "Structure" },
                  { code: "2g", label: "Language choices" },
                  { code: "2h", label: "Comparison" },
                ].map(({ code, label }) => (
                  <div key={code} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-gray-200 text-gray-300 bg-white">
                    <span className="font-semibold">{code}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Question types */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800">
                Question types
                <span className="ml-2 text-xs font-normal text-gray-400">optional</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {["Multiple choice", "Short answer", "Extended writing", "True / False", "Gap fill", "Vocabulary in context"].map((type) => (
                  <div key={type} className="px-3 py-1.5 rounded-full text-sm border border-gray-200 text-gray-300 bg-white">
                    {type}
                  </div>
                ))}
              </div>
            </div>

            {/* Options box */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-300">Questions per domain</span>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 border border-gray-200 rounded-md bg-white" />
                  <span className="w-6 text-center text-sm text-gray-300 tabular-nums">5</span>
                  <div className="w-8 h-8 border border-gray-200 rounded-md bg-white" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-300">Include answer key</span>
                <div className="w-4 h-4 rounded border border-gray-200 bg-white" />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <div className="border border-gray-200 text-gray-300 py-3 px-5 rounded-xl text-sm font-semibold bg-white">
                Reset
              </div>
              <div className="flex-1 bg-gray-200 rounded-xl py-3" />
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
