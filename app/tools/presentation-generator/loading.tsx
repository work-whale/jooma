import { Monitor } from "lucide-react";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-[#FAF9F5] rounded-3xl overflow-hidden">
            <div className="bg-violet-50 p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5 text-violet-600" />
                </div>
                <h1 className="text-2xl font-semibold">Presentation Generator</h1>
              </div>
              <p className="text-sm font-light">
                Generate a fully designed PowerPoint presentation with AI-created images. Enter your topic and the AI builds the slides — ready to download and edit.
              </p>
            </div>
            <div className="pt-5 pb-6 px-8">
              <div className="h-px bg-gray-200 mb-5" />
              <h2 className="text-md font-semibold text-gray-900 mb-5">How to use it</h2>
              <ol className="space-y-0">
                {[
                  { label: "Enter your topic", detail: "Be specific — include the subject, year group, and any key focus areas.", color: "bg-yellow-400" },
                  { label: "Set slides and tone", detail: "Choose how many slides and the tone that suits your audience.", color: "bg-green-500" },
                  { label: "Download", detail: "Get a fully designed .pptx file ready to open in PowerPoint or Google Slides.", color: "bg-orange-400" },
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

            {/* Topic */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Topic</label>
              <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-300 bg-white h-24" />
              <p className="text-xs text-gray-400">Be specific — include the subject, year group, and any key focus areas.</p>
            </div>

            {/* Slides + Tone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Number of slides</label>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden w-36">
                  <div className="px-3 py-3 border-r border-gray-200 bg-white"><div className="w-4 h-4 bg-gray-100 rounded" /></div>
                  <div className="flex-1 text-center text-sm text-gray-300 py-3">10</div>
                  <div className="px-3 py-3 border-l border-gray-200 bg-white"><div className="w-4 h-4 bg-gray-100 rounded" /></div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Tone</label>
                <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-300 bg-white">Educational</div>
              </div>
            </div>

            {/* Additional instructions */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Additional instructions <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-300 bg-white" />
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <div className="border border-gray-200 text-gray-300 py-3 px-5 rounded-xl text-sm font-semibold bg-white">Reset</div>
              <div className="flex-1 bg-gray-200 rounded-xl py-3" />
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
