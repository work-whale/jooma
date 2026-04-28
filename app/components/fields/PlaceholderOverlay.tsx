export default function PlaceholderOverlay({ text, area }: { text: string; area?: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute left-4 pointer-events-none select-none text-sm text-gray-400 ${
        area ? "top-3" : "inset-y-0 flex items-center"
      }`}
    >
      {text}<span className="animate-pulse">|</span>
    </span>
  );
}
