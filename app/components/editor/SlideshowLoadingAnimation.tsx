const CARDS = [0, 1, 2, 3];

export default function SlideshowLoadingAnimation({ label = "Loading slideshow" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-16">
      <style>{`
        @keyframes float-slideshow-load {
          /* Lift + tilt */
          0%   { transform: translateY(0px)  rotate(0deg); }
          30%  { transform: translateY(-16px) rotate(-6deg); }
          /* Fall straight through baseline into the recoil — no waypoint at
             0px, so the motion stays fluid like a real bounce. */
          60%  { transform: translateY(6px)  rotate(2.5deg); }
          /* Settle, then hold for the rest of the cycle so each card has a
             clear gap between bounces. */
          75%  { transform: translateY(0px)  rotate(0deg); }
          100% { transform: translateY(0px)  rotate(0deg); }
        }
      `}</style>
      <div className="relative w-52 h-32">
        {CARDS.map((i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              transform: `translate(${(i - 1.5) * 8}px, ${(i - 1.5) * 6}px) rotate(${(i - 1.5) * 5}deg)`,
              zIndex: 4 - i,
            }}
          >
            <div
              className="absolute inset-0 rounded-xl bg-white border"
              style={{
                borderColor: "#DAD8D0",
                boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
                animation: "float-slideshow-load 1.4s cubic-bezier(0.34, 1.4, 0.64, 1) infinite",
                animationDelay: `${i * 0.14}s`,
              }}
            />
          </div>
        ))}
      </div>
      <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">{label}</p>
    </div>
  );
}
