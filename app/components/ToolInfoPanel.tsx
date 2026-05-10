import Card from "@/app/components/ui/Card";

interface Step {
  label: string;
  detail: string;
  optional?: boolean;
}

interface ToolInfoPanelProps {
  icon: React.ReactNode;
  heroBg?: string;
  title: string;
  description: string;
  steps: Step[];
}

const STEP_COLORS = ["bg-yellow-400", "bg-green-500", "bg-orange-400", "bg-blue-500"];

export default function ToolInfoPanel({
  icon,
  heroBg = "bg-gray-50",
  title,
  description,
  steps,
}: ToolInfoPanelProps) {
  return (
    <Card className="overflow-hidden p-0">
      <div className={`p-6 rounded-2xl ${heroBg}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shrink-0">
            {icon}
          </div>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        <p className="text-sm font-light">{description}</p>
      </div>
      <div className="pt-5 pb-6 px-8">
        <div className="h-px bg-gray-200 mb-5" />
        <h2 className="text-md font-semibold text-gray-900 mb-5">How to use it</h2>
        <ol className="space-y-0">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className={`w-7 h-7 rounded-full ${STEP_COLORS[i % STEP_COLORS.length]} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                  {i + 1}
                </span>
                {i < steps.length - 1 && <div className="w-px grow bg-gray-200 my-1.5" />}
              </div>
              <div className="pb-5">
                <p className="text-sm font-semibold text-gray-800 leading-tight">
                  {step.label}
                  {step.optional && <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
