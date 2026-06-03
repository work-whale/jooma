import {
  Cpu, Zap, Hexagon, BarChart3, Code2, BookOpen,
  GraduationCap, Users, ClipboardList,
} from "lucide-react";

// Placeholder partner logos (icon + name), greyed like the mockup's logo cloud.
// Swap for real partner SVGs when available.
const LOGOS = [
  { name: "Software", icon: Cpu },
  { name: "Techlify", icon: Zap },
  { name: "Blockly", icon: Hexagon },
  { name: "Marketly", icon: BarChart3 },
  { name: "Codelify", icon: Code2 },
  { name: "Edutech", icon: BookOpen },
];

// One marquee group, repeated so a single group is wider than the viewport —
// otherwise the -50% loop leaves a gap on wide screens.
const TRACK = [...LOGOS, ...LOGOS, ...LOGOS];

const PERSONAS = [
  {
    badge: "Teacher",
    title: "Smarter lesson planning",
    desc: "Generate curriculum-aligned lessons, classroom activities, and teaching materials in minutes.",
    icon: GraduationCap,
    tint: "#FCEFD2",
    ink: "#C98A00",
  },
  {
    badge: "Tutor",
    title: "Personalised learning support",
    desc: "Adapt resources, homework, and explanations to match individual learning needs instantly.",
    icon: Users,
    tint: "#DCEFE2",
    ink: "#2E9D54",
  },
  {
    badge: "Teaching assistant",
    title: "AI support for daily tasks",
    desc: "Automate worksheets, quizzes, and lesson preparation with intelligent AI support.",
    icon: ClipboardList,
    tint: "#E5E9FB",
    ink: "#3B6FF5",
  },
];

export default function SocialProof() {
  return (
    <section className="py-14">
      {/* Caption */}
      <p className="text-center text-sm mb-9 px-4" style={{ color: "#8a8078" }}>
        Used by educators, schools, and homeschooling
        <br className="hidden sm:block" /> families across the UK
      </p>

      {/* Logo marquee — full-bleed, edge to edge */}
      <div
        className="relative overflow-hidden w-full mb-16"
        style={{
          maskImage: "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
        }}
      >
        <div className="flex w-max lp-marquee">
          {[0, 1].map((group) => (
            <ul key={group} className="flex items-center gap-x-14 pr-14 shrink-0" aria-hidden={group === 1}>
              {TRACK.map((l, i) => (
                <li key={i} className="flex items-center gap-2 shrink-0" style={{ color: "#aaa49a" }}>
                  <l.icon className="w-5 h-5" />
                  <span className="text-lg font-semibold tracking-tight">{l.name}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* Persona cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto px-4 sm:px-6">
        {PERSONAS.map((p) => (
          <div
            key={p.badge}
            className="rounded-2xl border p-6 flex flex-col items-center text-center"
            style={{ backgroundColor: "#FBFAF6", borderColor: "#E9E6DC" }}
          >
            <span
              className="px-3 py-1 rounded-full text-xs font-medium border mb-6"
              style={{ backgroundColor: "#FFFFFF", borderColor: "#E2DFD4", color: "#6b6055" }}
            >
              {p.badge}
            </span>

            {/* Illustration — placeholder (swap for real artwork) */}
            <div className="h-40 flex items-center justify-center mb-6">
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center"
                style={{ backgroundColor: p.tint }}
              >
                <p.icon className="w-12 h-12" style={{ color: p.ink }} strokeWidth={1.6} />
              </div>
            </div>

            <h3 className="text-lg font-bold mb-2" style={{ color: "#030303" }}>{p.title}</h3>
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: "#6b6055" }}>{p.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
