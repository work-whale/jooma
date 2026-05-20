const CARDS = [0, 1, 2, 3];

export default function SlideshowLoadingAnimation({ label = "Loading slideshow" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-8">
      <style>{`
        @keyframes float-slideshow-load {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50%       { transform: translateY(-8px) rotate(-1.5deg); }
        }
      `}</style>
      <div className="relative w-52 h-32">
        {CARDS.map((i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              transform: `translate(${(i - 1.5) * 6}px, ${(i - 1.5) * 6}px) rotate(${(i - 1.5) * 2.5}deg)`,
              zIndex: 4 - i,
            }}
          >
            <div
              className="absolute inset-0 rounded-xl bg-white border"
              style={{
                borderColor: "#DAD8D0",
                boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
                animation: "float-slideshow-load 0.9s cubic-bezier(0.45, 0, 0.55, 1) infinite",
                animationDelay: `${i * 0.12}s`,
              }}
            />
          </div>
        ))}
      </div>
      <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">{label}</p>
    </div>
  );
}
