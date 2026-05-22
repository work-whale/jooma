// Curated catalog of unDraw illustrations (CC0 / MIT-style license).
// Each illustration is the raw SVG markup so we don't depend on any external CDN.
// The single-color illustrations all use the placeholder "#6c63ff" which the
// GraphicsPanel can override via a simple color-swap before embedding.

export interface UndrawIllustration {
  name: string;
  keywords: string[];     // helps the search filter
  svg: string;
}

// Note: the SVG strings below are simplified versions of common unDraw scenes.
// They keep the spirit + structure of the originals so previews are recognizable;
// the user can drop these onto a slide and they scale cleanly.

const wrap = (vb: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;

export const UNDRAW_ILLUSTRATIONS: UndrawIllustration[] = [
  {
    name: "Learning",
    keywords: ["learning", "education", "study", "book", "reading"],
    svg: wrap(
      "0 0 240 200",
      `<rect x="40" y="40" width="160" height="120" rx="8" fill="#6c63ff"/>
       <rect x="50" y="50" width="140" height="100" rx="4" fill="#fff"/>
       <line x1="60" y1="70" x2="180" y2="70" stroke="#6c63ff" stroke-width="3"/>
       <line x1="60" y1="90" x2="160" y2="90" stroke="#6c63ff" stroke-width="3" opacity="0.7"/>
       <line x1="60" y1="110" x2="170" y2="110" stroke="#6c63ff" stroke-width="3" opacity="0.7"/>
       <line x1="60" y1="130" x2="140" y2="130" stroke="#6c63ff" stroke-width="3" opacity="0.7"/>
       <circle cx="200" cy="170" r="20" fill="#6c63ff" opacity="0.3"/>`
    ),
  },
  {
    name: "Teamwork",
    keywords: ["team", "collaboration", "people", "group", "work"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="80" cy="80" r="22" fill="#6c63ff"/>
       <rect x="58" y="100" width="44" height="60" rx="8" fill="#6c63ff"/>
       <circle cx="160" cy="80" r="22" fill="#6c63ff" opacity="0.75"/>
       <rect x="138" y="100" width="44" height="60" rx="8" fill="#6c63ff" opacity="0.75"/>
       <circle cx="120" cy="60" r="18" fill="#6c63ff" opacity="0.5"/>
       <rect x="102" y="78" width="36" height="50" rx="6" fill="#6c63ff" opacity="0.5"/>`
    ),
  },
  {
    name: "Ideas",
    keywords: ["idea", "lightbulb", "innovation", "creative", "thinking"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="80" r="50" fill="#6c63ff"/>
       <path d="M105 110 L105 150 L135 150 L135 110 Z" fill="#6c63ff"/>
       <line x1="100" y1="160" x2="140" y2="160" stroke="#6c63ff" stroke-width="6" stroke-linecap="round"/>
       <line x1="100" y1="170" x2="140" y2="170" stroke="#6c63ff" stroke-width="6" stroke-linecap="round"/>
       <path d="M105 80 L120 95 L135 80" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
       <circle cx="40" cy="80" r="5" fill="#6c63ff" opacity="0.5"/>
       <circle cx="200" cy="80" r="5" fill="#6c63ff" opacity="0.5"/>
       <circle cx="60" cy="40" r="4" fill="#6c63ff" opacity="0.4"/>
       <circle cx="180" cy="40" r="4" fill="#6c63ff" opacity="0.4"/>`
    ),
  },
  {
    name: "Reading",
    keywords: ["reading", "book", "library", "literature"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="65" r="20" fill="#6c63ff"/>
       <rect x="100" y="85" width="40" height="50" rx="6" fill="#6c63ff"/>
       <path d="M60 130 L120 110 L180 130 L180 170 L120 150 L60 170 Z" fill="#6c63ff" opacity="0.85"/>
       <line x1="70" y1="140" x2="115" y2="125" stroke="#fff" stroke-width="2"/>
       <line x1="70" y1="150" x2="115" y2="135" stroke="#fff" stroke-width="2"/>
       <line x1="125" y1="125" x2="170" y2="140" stroke="#fff" stroke-width="2"/>
       <line x1="125" y1="135" x2="170" y2="150" stroke="#fff" stroke-width="2"/>`
    ),
  },
  {
    name: "Presentation",
    keywords: ["presentation", "slides", "speaker", "chart"],
    svg: wrap(
      "0 0 240 200",
      `<rect x="30" y="30" width="180" height="110" rx="6" fill="#6c63ff"/>
       <rect x="40" y="40" width="160" height="90" rx="3" fill="#fff"/>
       <rect x="60" y="100" width="20" height="20" fill="#6c63ff"/>
       <rect x="90" y="80" width="20" height="40" fill="#6c63ff" opacity="0.7"/>
       <rect x="120" y="60" width="20" height="60" fill="#6c63ff"/>
       <rect x="150" y="70" width="20" height="50" fill="#6c63ff" opacity="0.7"/>
       <line x1="110" y1="160" x2="130" y2="160" stroke="#6c63ff" stroke-width="6"/>
       <circle cx="120" cy="175" r="10" fill="#6c63ff"/>`
    ),
  },
  {
    name: "Online Learning",
    keywords: ["online", "remote", "laptop", "screen", "digital"],
    svg: wrap(
      "0 0 240 200",
      `<rect x="40" y="50" width="160" height="100" rx="6" fill="#6c63ff"/>
       <rect x="50" y="60" width="140" height="80" rx="3" fill="#fff"/>
       <rect x="60" y="70" width="60" height="60" rx="3" fill="#6c63ff" opacity="0.25"/>
       <circle cx="90" cy="95" r="12" fill="#6c63ff"/>
       <rect x="78" y="110" width="24" height="14" rx="2" fill="#6c63ff"/>
       <line x1="130" y1="80" x2="180" y2="80" stroke="#6c63ff" stroke-width="3"/>
       <line x1="130" y1="95" x2="170" y2="95" stroke="#6c63ff" stroke-width="3" opacity="0.6"/>
       <line x1="130" y1="110" x2="175" y2="110" stroke="#6c63ff" stroke-width="3" opacity="0.6"/>
       <line x1="130" y1="125" x2="160" y2="125" stroke="#6c63ff" stroke-width="3" opacity="0.6"/>
       <rect x="100" y="155" width="40" height="6" rx="2" fill="#6c63ff"/>
       <rect x="80" y="160" width="80" height="6" rx="2" fill="#6c63ff" opacity="0.5"/>`
    ),
  },
  {
    name: "Questions",
    keywords: ["question", "ask", "help", "support", "thinking"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="100" r="70" fill="#6c63ff"/>
       <text x="120" y="135" text-anchor="middle" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="#fff">?</text>
       <circle cx="40" cy="60" r="6" fill="#6c63ff" opacity="0.6"/>
       <circle cx="200" cy="40" r="8" fill="#6c63ff" opacity="0.5"/>
       <circle cx="60" cy="170" r="5" fill="#6c63ff" opacity="0.6"/>`
    ),
  },
  {
    name: "Goals",
    keywords: ["goal", "target", "achievement", "success", "dart"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="100" r="80" fill="#6c63ff"/>
       <circle cx="120" cy="100" r="60" fill="#fff"/>
       <circle cx="120" cy="100" r="40" fill="#6c63ff"/>
       <circle cx="120" cy="100" r="20" fill="#fff"/>
       <circle cx="120" cy="100" r="6" fill="#6c63ff"/>
       <line x1="60" y1="40" x2="120" y2="100" stroke="#6c63ff" stroke-width="4" stroke-linecap="round"/>
       <polygon points="120,100 110,95 115,105" fill="#6c63ff"/>`
    ),
  },
  {
    name: "Communication",
    keywords: ["chat", "message", "talk", "communicate", "speech"],
    svg: wrap(
      "0 0 240 200",
      `<rect x="40" y="40" width="120" height="80" rx="10" fill="#6c63ff"/>
       <polygon points="70,120 90,120 75,140" fill="#6c63ff"/>
       <line x1="60" y1="65" x2="140" y2="65" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
       <line x1="60" y1="85" x2="120" y2="85" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
       <rect x="100" y="80" width="100" height="60" rx="10" fill="#6c63ff" opacity="0.7"/>
       <polygon points="180,140 170,140 185,160" fill="#6c63ff" opacity="0.7"/>
       <line x1="115" y1="100" x2="180" y2="100" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
       <line x1="115" y1="120" x2="160" y2="120" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`
    ),
  },
  {
    name: "Creative",
    keywords: ["creative", "art", "design", "paint", "draw"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="100" r="60" fill="#6c63ff" opacity="0.25"/>
       <circle cx="80" cy="80" r="14" fill="#6c63ff"/>
       <circle cx="160" cy="80" r="14" fill="#6c63ff" opacity="0.7"/>
       <circle cx="80" cy="130" r="14" fill="#6c63ff" opacity="0.7"/>
       <circle cx="160" cy="130" r="14" fill="#6c63ff"/>
       <circle cx="120" cy="60" r="12" fill="#6c63ff" opacity="0.5"/>
       <circle cx="120" cy="150" r="12" fill="#6c63ff" opacity="0.5"/>
       <rect x="100" y="90" width="40" height="20" rx="4" fill="#fff"/>
       <line x1="110" y1="100" x2="130" y2="100" stroke="#6c63ff" stroke-width="3"/>`
    ),
  },
  {
    name: "Celebrate",
    keywords: ["celebrate", "party", "win", "success", "confetti"],
    svg: wrap(
      "0 0 240 200",
      `<polygon points="60,30 80,140 40,140" fill="#6c63ff"/>
       <line x1="60" y1="30" x2="60" y2="20" stroke="#6c63ff" stroke-width="4"/>
       <circle cx="100" cy="60" r="6" fill="#6c63ff" opacity="0.7"/>
       <circle cx="160" cy="40" r="8" fill="#6c63ff"/>
       <circle cx="200" cy="80" r="6" fill="#6c63ff" opacity="0.7"/>
       <rect x="120" y="50" width="12" height="12" fill="#6c63ff" opacity="0.5" transform="rotate(45 126 56)"/>
       <rect x="180" y="120" width="12" height="12" fill="#6c63ff" opacity="0.6" transform="rotate(30 186 126)"/>
       <line x1="130" y1="100" x2="140" y2="90" stroke="#6c63ff" stroke-width="4" stroke-linecap="round"/>
       <line x1="160" y1="100" x2="170" y2="115" stroke="#6c63ff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
       <line x1="100" y1="130" x2="115" y2="135" stroke="#6c63ff" stroke-width="4" stroke-linecap="round"/>`
    ),
  },
  {
    name: "Calendar",
    keywords: ["calendar", "schedule", "plan", "date", "time"],
    svg: wrap(
      "0 0 240 200",
      `<rect x="50" y="50" width="140" height="110" rx="6" fill="#6c63ff"/>
       <rect x="60" y="80" width="120" height="70" rx="3" fill="#fff"/>
       <rect x="60" y="60" width="120" height="20" fill="#6c63ff"/>
       <line x1="75" y1="40" x2="75" y2="65" stroke="#6c63ff" stroke-width="6" stroke-linecap="round"/>
       <line x1="165" y1="40" x2="165" y2="65" stroke="#6c63ff" stroke-width="6" stroke-linecap="round"/>
       <rect x="100" y="100" width="20" height="20" rx="3" fill="#6c63ff" opacity="0.5"/>
       <rect x="125" y="100" width="20" height="20" rx="3" fill="#6c63ff"/>
       <rect x="150" y="100" width="20" height="20" rx="3" fill="#6c63ff" opacity="0.5"/>
       <rect x="75" y="125" width="20" height="20" rx="3" fill="#6c63ff" opacity="0.5"/>
       <rect x="100" y="125" width="20" height="20" rx="3" fill="#6c63ff" opacity="0.5"/>
       <rect x="125" y="125" width="20" height="20" rx="3" fill="#6c63ff" opacity="0.5"/>`
    ),
  },
  {
    name: "Growth",
    keywords: ["growth", "plant", "grow", "nature", "develop"],
    svg: wrap(
      "0 0 240 200",
      `<ellipse cx="120" cy="170" rx="60" ry="12" fill="#6c63ff" opacity="0.3"/>
       <rect x="116" y="100" width="8" height="70" fill="#6c63ff"/>
       <path d="M120 130 Q90 110 80 80 Q110 90 120 120 Z" fill="#6c63ff"/>
       <path d="M120 110 Q150 90 160 60 Q130 70 120 100 Z" fill="#6c63ff" opacity="0.75"/>
       <path d="M120 90 Q100 70 95 50 Q115 60 120 80 Z" fill="#6c63ff" opacity="0.85"/>
       <circle cx="120" cy="50" r="14" fill="#6c63ff"/>`
    ),
  },
  {
    name: "Setup Wizard",
    keywords: ["setup", "config", "settings", "wizard", "gear"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="90" cy="100" r="40" fill="#6c63ff"/>
       <circle cx="90" cy="100" r="14" fill="#fff"/>
       <rect x="84" y="50" width="12" height="20" fill="#6c63ff"/>
       <rect x="84" y="130" width="12" height="20" fill="#6c63ff"/>
       <rect x="40" y="94" width="20" height="12" fill="#6c63ff"/>
       <rect x="120" y="94" width="20" height="12" fill="#6c63ff"/>
       <circle cx="170" cy="80" r="28" fill="#6c63ff" opacity="0.75"/>
       <circle cx="170" cy="80" r="10" fill="#fff"/>
       <rect x="166" y="48" width="8" height="14" fill="#6c63ff" opacity="0.75"/>
       <rect x="166" y="98" width="8" height="14" fill="#6c63ff" opacity="0.75"/>
       <rect x="138" y="76" width="14" height="8" fill="#6c63ff" opacity="0.75"/>
       <rect x="188" y="76" width="14" height="8" fill="#6c63ff" opacity="0.75"/>`
    ),
  },
  {
    name: "Empty",
    keywords: ["empty", "nothing", "blank", "no data"],
    svg: wrap(
      "0 0 240 200",
      `<rect x="60" y="70" width="120" height="90" rx="10" fill="#6c63ff"/>
       <rect x="70" y="80" width="100" height="70" rx="4" fill="#fff"/>
       <line x1="85" y1="100" x2="155" y2="100" stroke="#6c63ff" stroke-width="3" opacity="0.4"/>
       <line x1="85" y1="115" x2="135" y2="115" stroke="#6c63ff" stroke-width="3" opacity="0.4"/>
       <line x1="85" y1="130" x2="145" y2="130" stroke="#6c63ff" stroke-width="3" opacity="0.4"/>
       <circle cx="180" cy="60" r="14" fill="#6c63ff"/>
       <line x1="173" y1="60" x2="187" y2="60" stroke="#fff" stroke-width="3"/>`
    ),
  },
  // ── Classroom & education concepts ──────────────────────────────────────
  {
    name: "Science Lab",
    keywords: ["science", "lab", "beaker", "chemistry", "experiment"],
    svg: wrap(
      "0 0 240 200",
      `<path d="M100 50 L100 100 L70 170 Q70 180 80 180 L160 180 Q170 180 170 170 L140 100 L140 50 Z" fill="#fff" stroke="#6c63ff" stroke-width="6"/>
       <path d="M82 140 L158 140 L160 170 Q160 180 150 180 L90 180 Q80 180 80 170 Z" fill="#ffc857"/>
       <line x1="90" y1="50" x2="150" y2="50" stroke="#6c63ff" stroke-width="6" stroke-linecap="round"/>
       <circle cx="105" cy="155" r="5" fill="#fff" opacity="0.7"/>
       <circle cx="130" cy="165" r="4" fill="#fff" opacity="0.7"/>
       <circle cx="120" cy="125" r="3" fill="#ffc857" opacity="0.6"/>
       <circle cx="135" cy="115" r="2" fill="#ffc857" opacity="0.6"/>`
    ),
  },
  {
    name: "Microscope",
    keywords: ["microscope", "science", "biology", "research"],
    svg: wrap(
      "0 0 240 200",
      `<rect x="60" y="160" width="120" height="14" rx="3" fill="#6c63ff"/>
       <rect x="90" y="150" width="60" height="14" fill="#6c63ff" opacity="0.8"/>
       <rect x="108" y="60" width="24" height="100" rx="4" fill="#6c63ff"/>
       <circle cx="120" cy="55" r="20" fill="#6c63ff"/>
       <rect x="110" y="30" width="20" height="20" rx="2" fill="#1a1a2e"/>
       <circle cx="150" cy="100" r="10" fill="#ffc857"/>
       <rect x="80" y="140" width="80" height="8" fill="#ffc857"/>`
    ),
  },
  {
    name: "Solar System",
    keywords: ["solar", "planet", "space", "astronomy", "orbit"],
    svg: wrap(
      "0 0 240 200",
      `<ellipse cx="120" cy="100" rx="90" ry="35" fill="none" stroke="#6c63ff" stroke-width="2" opacity="0.4"/>
       <ellipse cx="120" cy="100" rx="60" ry="22" fill="none" stroke="#6c63ff" stroke-width="2" opacity="0.5"/>
       <circle cx="120" cy="100" r="22" fill="#ffc857"/>
       <circle cx="180" cy="92" r="9" fill="#6c63ff"/>
       <circle cx="55" cy="115" r="6" fill="#6c63ff" opacity="0.8"/>
       <circle cx="200" cy="50" r="3" fill="#ffc857" opacity="0.6"/>
       <circle cx="40" cy="60" r="3" fill="#ffc857" opacity="0.6"/>
       <circle cx="60" cy="160" r="3" fill="#ffc857" opacity="0.6"/>`
    ),
  },
  {
    name: "Math Equation",
    keywords: ["math", "equation", "numbers", "arithmetic"],
    svg: wrap(
      "0 0 240 200",
      `<rect x="30" y="40" width="180" height="120" rx="10" fill="#1a1a2e"/>
       <rect x="40" y="50" width="160" height="100" rx="4" fill="#1a1a2e"/>
       <text x="120" y="118" text-anchor="middle" font-family="Georgia, serif" font-size="48" font-weight="700" fill="#ffc857">2 + 3 = 5</text>
       <rect x="100" y="160" width="40" height="14" rx="3" fill="#6c63ff"/>`
    ),
  },
  {
    name: "Geometry",
    keywords: ["geometry", "shapes", "triangle", "circle", "square"],
    svg: wrap(
      "0 0 240 200",
      `<polygon points="60,140 30,80 90,80" fill="#6c63ff"/>
       <circle cx="170" cy="120" r="32" fill="#ffc857"/>
       <rect x="120" y="40" width="50" height="40" fill="#6c63ff" opacity="0.7"/>`
    ),
  },
  {
    name: "Bar Chart",
    keywords: ["chart", "bar", "graph", "data", "statistics"],
    svg: wrap(
      "0 0 240 200",
      `<line x1="40" y1="170" x2="210" y2="170" stroke="#1a1a2e" stroke-width="3" stroke-linecap="round"/>
       <line x1="40" y1="40" x2="40" y2="170" stroke="#1a1a2e" stroke-width="3" stroke-linecap="round"/>
       <rect x="60" y="120" width="28" height="50" rx="3" fill="#6c63ff"/>
       <rect x="100" y="80" width="28" height="90" rx="3" fill="#6c63ff" opacity="0.85"/>
       <rect x="140" y="55" width="28" height="115" rx="3" fill="#ffc857"/>
       <rect x="180" y="100" width="28" height="70" rx="3" fill="#6c63ff" opacity="0.7"/>`
    ),
  },
  {
    name: "World Globe",
    keywords: ["globe", "world", "earth", "geography", "map"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="100" r="64" fill="#6c63ff"/>
       <ellipse cx="120" cy="100" rx="64" ry="22" fill="none" stroke="#fff" stroke-width="2" opacity="0.7"/>
       <ellipse cx="120" cy="100" rx="64" ry="44" fill="none" stroke="#fff" stroke-width="2" opacity="0.5"/>
       <line x1="120" y1="36" x2="120" y2="164" stroke="#fff" stroke-width="2" opacity="0.7"/>
       <path d="M75 80 Q90 70 110 80 Q125 88 140 80 Q160 75 170 85 L170 95 Q160 88 145 92 Q125 95 105 90 Q85 88 75 92 Z" fill="#ffc857"/>
       <path d="M85 130 Q105 125 125 132 Q150 140 165 132 L165 145 Q145 152 122 145 Q100 140 85 142 Z" fill="#ffc857" opacity="0.85"/>`
    ),
  },
  {
    name: "Clock",
    keywords: ["clock", "time", "hour", "minute", "schedule"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="100" r="64" fill="#fff" stroke="#6c63ff" stroke-width="8"/>
       <line x1="120" y1="100" x2="120" y2="56" stroke="#6c63ff" stroke-width="5" stroke-linecap="round"/>
       <line x1="120" y1="100" x2="156" y2="100" stroke="#ffc857" stroke-width="5" stroke-linecap="round"/>
       <circle cx="120" cy="100" r="5" fill="#6c63ff"/>
       <circle cx="120" cy="44" r="3" fill="#6c63ff"/>
       <circle cx="176" cy="100" r="3" fill="#6c63ff"/>
       <circle cx="120" cy="156" r="3" fill="#6c63ff"/>
       <circle cx="64" cy="100" r="3" fill="#6c63ff"/>`
    ),
  },
  {
    name: "Atom",
    keywords: ["atom", "molecule", "physics", "science", "nucleus"],
    svg: wrap(
      "0 0 240 200",
      `<ellipse cx="120" cy="100" rx="70" ry="22" fill="none" stroke="#6c63ff" stroke-width="3"/>
       <ellipse cx="120" cy="100" rx="70" ry="22" fill="none" stroke="#6c63ff" stroke-width="3" transform="rotate(60 120 100)"/>
       <ellipse cx="120" cy="100" rx="70" ry="22" fill="none" stroke="#6c63ff" stroke-width="3" transform="rotate(-60 120 100)"/>
       <circle cx="120" cy="100" r="12" fill="#ffc857"/>
       <circle cx="190" cy="100" r="6" fill="#6c63ff"/>
       <circle cx="85" cy="42" r="6" fill="#6c63ff"/>
       <circle cx="85" cy="158" r="6" fill="#6c63ff"/>`
    ),
  },
  {
    name: "Books Stack",
    keywords: ["books", "stack", "library", "reading", "study"],
    svg: wrap(
      "0 0 240 200",
      `<rect x="50" y="150" width="140" height="24" rx="3" fill="#6c63ff"/>
       <rect x="50" y="150" width="20" height="24" fill="#1a1a2e" opacity="0.3"/>
       <g transform="rotate(-4 120 130)">
         <rect x="56" y="118" width="128" height="24" rx="3" fill="#ffc857"/>
         <rect x="56" y="118" width="20" height="24" fill="#1a1a2e" opacity="0.3"/>
       </g>
       <g transform="rotate(3 120 100)">
         <rect x="48" y="88" width="144" height="24" rx="3" fill="#6c63ff" opacity="0.85"/>
         <rect x="48" y="88" width="20" height="24" fill="#1a1a2e" opacity="0.3"/>
       </g>
       <g transform="rotate(-2 120 70)">
         <rect x="60" y="58" width="120" height="24" rx="3" fill="#ffc857" opacity="0.9"/>
         <rect x="60" y="58" width="20" height="24" fill="#1a1a2e" opacity="0.3"/>
       </g>`
    ),
  },
  {
    name: "Art Palette",
    keywords: ["art", "palette", "paint", "colors", "creative"],
    svg: wrap(
      "0 0 240 200",
      `<path d="M120 40 C175 40 200 90 200 130 C200 158 175 168 152 160 C140 156 138 172 122 175 C90 178 50 145 50 105 C50 65 85 40 120 40 Z" fill="#fff" stroke="#6c63ff" stroke-width="5"/>
       <circle cx="95" cy="85" r="11" fill="#6c63ff"/>
       <circle cx="130" cy="72" r="11" fill="#ffc857"/>
       <circle cx="165" cy="98" r="11" fill="#ec4899"/>
       <circle cx="160" cy="135" r="11" fill="#10b981"/>
       <circle cx="115" cy="138" r="11" fill="#0ea5e9"/>`
    ),
  },
  {
    name: "Music Notes",
    keywords: ["music", "note", "song", "melody", "sound"],
    svg: wrap(
      "0 0 240 200",
      `<line x1="40" y1="80" x2="200" y2="80" stroke="#6c63ff" stroke-width="2"/>
       <line x1="40" y1="100" x2="200" y2="100" stroke="#6c63ff" stroke-width="2"/>
       <line x1="40" y1="120" x2="200" y2="120" stroke="#6c63ff" stroke-width="2"/>
       <line x1="40" y1="140" x2="200" y2="140" stroke="#6c63ff" stroke-width="2"/>
       <line x1="40" y1="160" x2="200" y2="160" stroke="#6c63ff" stroke-width="2"/>
       <ellipse cx="85" cy="140" rx="12" ry="9" fill="#1a1a2e" transform="rotate(-18 85 140)"/>
       <line x1="96" y1="138" x2="96" y2="60" stroke="#1a1a2e" stroke-width="3"/>
       <ellipse cx="155" cy="120" rx="12" ry="9" fill="#ffc857" transform="rotate(-18 155 120)"/>
       <line x1="166" y1="118" x2="166" y2="40" stroke="#ffc857" stroke-width="3"/>
       <path d="M96 60 Q130 55 166 40" stroke="#1a1a2e" stroke-width="3" fill="none"/>`
    ),
  },
  {
    name: "Soccer Ball",
    keywords: ["ball", "soccer", "football", "sport", "game"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="100" r="60" fill="#fff" stroke="#6c63ff" stroke-width="4"/>
       <polygon points="120,68 148,86 138,118 102,118 92,86" fill="#1a1a2e"/>
       <line x1="120" y1="68" x2="120" y2="48" stroke="#6c63ff" stroke-width="3"/>
       <line x1="92" y1="86" x2="72" y2="76" stroke="#6c63ff" stroke-width="3"/>
       <line x1="148" y1="86" x2="168" y2="76" stroke="#6c63ff" stroke-width="3"/>
       <line x1="102" y1="118" x2="82" y2="142" stroke="#6c63ff" stroke-width="3"/>
       <line x1="138" y1="118" x2="158" y2="142" stroke="#6c63ff" stroke-width="3"/>`
    ),
  },
  {
    name: "Pencil",
    keywords: ["pencil", "write", "draw", "school", "stationery"],
    svg: wrap(
      "0 0 240 200",
      `<g transform="rotate(-25 120 100)">
         <rect x="105" y="40" width="30" height="20" fill="#1a1a2e"/>
         <rect x="105" y="60" width="30" height="100" fill="#ffc857"/>
         <rect x="105" y="60" width="30" height="6" fill="#1a1a2e" opacity="0.25"/>
         <polygon points="105,160 135,160 120,180" fill="#fff" stroke="#1a1a2e" stroke-width="1"/>
         <polygon points="111,168 129,168 120,180" fill="#1a1a2e"/>
         <rect x="100" y="34" width="40" height="10" rx="2" fill="#6c63ff"/>
       </g>`
    ),
  },
  {
    name: "Pizza Fractions",
    keywords: ["fraction", "pizza", "math", "parts", "divide"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="100" r="70" fill="#ffc857" stroke="#1a1a2e" stroke-width="3"/>
       <line x1="120" y1="30" x2="120" y2="170" stroke="#1a1a2e" stroke-width="3"/>
       <line x1="50" y1="100" x2="190" y2="100" stroke="#1a1a2e" stroke-width="3"/>
       <line x1="70" y1="50" x2="170" y2="150" stroke="#1a1a2e" stroke-width="3"/>
       <line x1="170" y1="50" x2="70" y2="150" stroke="#1a1a2e" stroke-width="3"/>
       <path d="M120 100 L120 30 A70 70 0 0 1 170 50 Z" fill="#6c63ff" opacity="0.85"/>
       <circle cx="130" cy="120" r="6" fill="#ec4899"/>
       <circle cx="100" cy="80" r="6" fill="#10b981"/>`
    ),
  },
  {
    name: "DNA Helix",
    keywords: ["dna", "biology", "helix", "genetics", "science"],
    svg: wrap(
      "0 0 240 200",
      `<path d="M90 30 Q150 70 90 110 Q150 150 90 190" stroke="#6c63ff" stroke-width="5" fill="none"/>
       <path d="M150 30 Q90 70 150 110 Q90 150 150 190" stroke="#ffc857" stroke-width="5" fill="none"/>
       <line x1="100" y1="50" x2="140" y2="50" stroke="#1a1a2e" stroke-width="2"/>
       <line x1="120" y1="80" x2="120" y2="80" stroke="#1a1a2e" stroke-width="2"/>
       <line x1="100" y1="110" x2="140" y2="110" stroke="#1a1a2e" stroke-width="2"/>
       <line x1="100" y1="140" x2="140" y2="140" stroke="#1a1a2e" stroke-width="2"/>
       <line x1="100" y1="170" x2="140" y2="170" stroke="#1a1a2e" stroke-width="2"/>`
    ),
  },
  {
    name: "Compass",
    keywords: ["compass", "navigation", "direction", "geography", "explore"],
    svg: wrap(
      "0 0 240 200",
      `<circle cx="120" cy="100" r="64" fill="#fff" stroke="#6c63ff" stroke-width="6"/>
       <circle cx="120" cy="100" r="50" fill="#fff" stroke="#6c63ff" stroke-width="1" opacity="0.4"/>
       <polygon points="120,50 130,100 120,150 110,100" fill="#ec4899"/>
       <polygon points="120,50 130,100 120,100" fill="#6c63ff"/>
       <circle cx="120" cy="100" r="6" fill="#1a1a2e"/>
       <text x="120" y="38" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#6c63ff">N</text>
       <text x="120" y="178" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#6c63ff">S</text>
       <text x="38" y="106" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#6c63ff">W</text>
       <text x="202" y="106" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#6c63ff">E</text>`
    ),
  },
  {
    name: "Magnet",
    keywords: ["magnet", "magnetic", "physics", "force", "attract"],
    svg: wrap(
      "0 0 240 200",
      `<path d="M70 40 L70 130 Q70 170 120 170 Q170 170 170 130 L170 40 L130 40 L130 130 Q130 140 120 140 Q110 140 110 130 L110 40 Z" fill="#6c63ff"/>
       <rect x="70" y="40" width="40" height="20" fill="#ec4899"/>
       <rect x="130" y="40" width="40" height="20" fill="#1a1a2e"/>
       <text x="90" y="56" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#fff">N</text>
       <text x="150" y="56" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#fff">S</text>
       <line x1="30" y1="100" x2="60" y2="100" stroke="#ffc857" stroke-width="3" stroke-linecap="round"/>
       <line x1="180" y1="100" x2="210" y2="100" stroke="#ffc857" stroke-width="3" stroke-linecap="round"/>
       <line x1="36" y1="80" x2="58" y2="92" stroke="#ffc857" stroke-width="3" stroke-linecap="round"/>
       <line x1="36" y1="120" x2="58" y2="108" stroke="#ffc857" stroke-width="3" stroke-linecap="round"/>
       <line x1="184" y1="80" x2="206" y2="92" stroke="#ffc857" stroke-width="3" stroke-linecap="round"/>
       <line x1="184" y1="120" x2="206" y2="108" stroke="#ffc857" stroke-width="3" stroke-linecap="round"/>`
    ),
  },
  {
    name: "Periodic Table",
    keywords: ["periodic", "table", "chemistry", "elements", "science"],
    svg: wrap(
      "0 0 240 200",
      `<g stroke="#6c63ff" stroke-width="2" fill="#fff">
         <rect x="40" y="40" width="32" height="36"/>
         <rect x="76" y="40" width="32" height="36"/>
         <rect x="148" y="40" width="32" height="36"/>
         <rect x="40" y="80" width="32" height="36"/>
         <rect x="76" y="80" width="32" height="36"/>
         <rect x="112" y="80" width="32" height="36"/>
         <rect x="148" y="80" width="32" height="36" fill="#ffc857"/>
         <rect x="184" y="80" width="32" height="36"/>
         <rect x="40" y="120" width="32" height="36"/>
         <rect x="76" y="120" width="32" height="36" fill="#6c63ff"/>
         <rect x="184" y="40" width="32" height="36"/>
       </g>`
    ),
  },
];

const COLOR_PLACEHOLDER_RE = /#6c63ff/gi;

/**
 * Recolor an unDraw SVG by swapping the placeholder primary color (#6c63ff)
 * with the user's chosen color.
 */
export function recolorUndraw(svg: string, color: string): string {
  return svg.replace(COLOR_PLACEHOLDER_RE, color);
}

/**
 * Encode a recolored SVG as a data URL so it can be dropped onto the slide
 * exactly like Iconify or Pixabay assets.
 */
export function undrawToDataUrl(svg: string): string {
  // Use base64 to keep the URL safe regardless of special characters.
  const utf8 = unescape(encodeURIComponent(svg));
  return `data:image/svg+xml;base64,${btoa(utf8)}`;
}
