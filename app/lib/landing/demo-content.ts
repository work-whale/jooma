/**
 * Hero demo content.
 *
 * REAL JOOMA OUTPUT. Every passage, question, slide and section below came out
 * of the product itself: captured on 17 September 2026 by running the live
 * generators. Regenerate it with `node scripts/capture-demo-output.mjs` and
 * paste the results back here; no component needs editing.
 *
 * Keyed by TOPIC, one per suggestion chip. The chips claim to change the
 * output, so they have to: pressing "Ancient Egypt, Year 5" and getting a water
 * cycle slide back is the kind of small lie that makes a teacher doubt the rest
 * of the page. Four topics across four subjects also shows the range better
 * than one topic ever could.
 *
 * Keeping it real is the point. The page is asking a teacher to believe what
 * Jooma produces, and a hand-written lookalike both flatters the product and
 * drifts from it — the original placeholder advertised a reading-age switcher
 * and per-band worksheet columns that the product has never had.
 *
 * Trimmed, never rewritten: the captures are longer than a hero panel can show,
 * so some questions and sections are dropped. Nothing is reworded, except that
 * the en dashes the generators emit in headings become hyphens (which
 * scripts/check-language.mjs requires on this surface) and the maths worksheet's
 * LaTeX fractions are written plainly, since this page has no maths renderer.
 *
 * The demo is deliberately static rather than wired to a live endpoint. This
 * is the highest traffic page on the site, so a real generation here would
 * need hard IP rate limiting and aggressive caching, and would risk a slow or
 * failed first impression at the exact moment a teacher is deciding whether
 * the product is worth a signup.
 */

export type DemoTabId = "slides" | "comp" | "ws";

export const DEMO_TABS: { id: DemoTabId; label: string; icon: string; solid: string }[] = [
  { id: "slides", label: "Slides", icon: "presentation-chart", solid: "#5B2ED6" },
  { id: "comp", label: "Comprehension", icon: "book-open-text", solid: "#0F8A63" },
  { id: "ws", label: "Worksheets", icon: "file-text", solid: "#0F8A63" },
];

/** The real pitch control on the comprehension tool. Not a reading age: the
 *  tool has never had one. See COMPLEXITY_LEVELS in ComprehensionForm.tsx. */
export type Complexity = "Simple" | "Standard" | "Challenging";

export const COMPLEXITIES: { id: Complexity; label: string; note: string }[] = [
  { id: "Simple", label: "Simple", note: "Shorter sentences, everyday words" },
  { id: "Standard", label: "Standard", note: "Expected for the year group" },
  { id: "Challenging", label: "Challenging", note: "Stretch vocabulary and reasoning" },
];

/** A group of questions under one DfE reading content domain. The generator
 *  emits one Markdown heading per domain, written as "2b - Retrieval". */
export interface DomainGroup {
  code: string;
  label: string;
  questions: { text: string; marks: number }[];
}

export interface DemoSlide {
  title: string;
  subHook: string;
  body: string;
  bullets: string[];
  /** Real callout variants are "key" | "remember" | "fun", each with its own
   *  default label and emoji. See defaultCalloutLabel in slideshow-layouts.ts. */
  callout: { variant: "key" | "remember" | "fun"; emoji: string; label: string; body: string };
  deckTitle: string;
  activeThumb: number;
  thumbCount: number;
}

export interface DemoComprehension {
  title: string;
  paragraphs: string[];
  domains: DomainGroup[];
}

export interface DemoWorksheet {
  title: string;
  meta: string;
  objective: string;
  sections: { name: string; heading: string; marks: string; questions: string[] }[];
  misconceptions: string[];
}

export interface DemoTopic {
  /** What the chip and the topic field show. */
  label: string;
  year: string;
  subject: string;
  slide: DemoSlide;
  /** Only the default topic carries all three complexity levels; the rest
   *  carry the standard one, which is what the switcher falls back to. */
  comprehension: Partial<Record<Complexity, DemoComprehension>>;
  worksheet: DemoWorksheet;
}

/** Actions under the slide. All four are real capabilities. */
export const SLIDE_ACTIONS = ["Present", "Export to PowerPoint", "Change theme", "Add a video"];

export const DEMO_TOPICS: Record<string, DemoTopic> = {
  // ── The water cycle, Year 4 Science ────────────────────────────────────────
  "water-cycle": {
    label: "The water cycle, Year 4 Science",
    year: "Year 4",
    subject: "Science",
    slide: {
      deckTitle: "The Water Cycle: Nature's Recyclist",
      title: "Evaporation: Water's Rise to the Sky",
      subHook: "What makes puddles disappear?",
      body: "Through **evaporation**, water transforms from liquid to **vapour** thanks to the heat from the Sun. This process happens in lakes, rivers, and even your garden puddles!",
      bullets: [
        "**Rain**: Liquid water droplets fall when clouds can't hold them anymore.",
        "**Snow**: Ice crystals form in colder temperatures and fall gently to the ground.",
        "**Sleet**: Frozen raindrops that make walking tricky!",
      ],
      callout: {
        variant: "fun",
        emoji: "🦉",
        label: "Fun fact",
        body: "The Sun heats around 1 million tonnes of water per second.",
      },
      activeThumb: 3,
      thumbCount: 10,
    },
    comprehension: {
      Simple: {
        title: "The Magic of the Water Cycle",
        paragraphs: [
          "In the peaceful village of Greenwood, a lively stream ran through the centre, bringing joy and life to the community. This stream was part of a larger story known as the water cycle, a magical journey that helped water travel from one place to another. Every sunny morning, as the sun's warm rays touched the water, tiny droplets would dance up into the sky. This was the beginning of evaporation, where water changed into a gas called water vapour.",
          "Higher up in the sky, the vapour gathered together, forming fluffy clouds. This part of the cycle was called condensation. As the clouds floated over Greenwood, they collected more and more water until they became heavy. Eventually, they could hold no more and the water fell as rain, quenching the land and filling the river once again.",
        ],
        domains: [
          {
            code: "2a",
            label: "Word Meaning",
            questions: [
              { text: 'Explain the meaning of the word "evaporation" as used in the text.', marks: 1 },
              {
                text: 'What does the word "quenching" mean in the sentence: "the water fell as rain, quenching the land and filling the river once again"?',
                marks: 1,
              },
            ],
          },
          {
            code: "2b",
            label: "Retrieval",
            questions: [
              { text: "What is the name of the village where the water cycle story takes place?", marks: 1 },
              { text: "List the three stages of the water cycle mentioned in the passage.", marks: 2 },
            ],
          },
          {
            code: "2d",
            label: "Inference",
            questions: [
              {
                text: "Why do the villagers likely find the water cycle important, based on the text? Use evidence from the text to explain your answer.",
                marks: 2,
              },
            ],
          },
        ],
      },
      Standard: {
        title: "The Water Cycle: Nature's Journey",
        paragraphs: [
          "In the heart of every weather system lies the ever-turning wheel of the water cycle. This natural process is essential for life on Earth, providing fresh water to plants, animals, and humans. Though you can't always see it, the cycle is constantly at work, a remarkable transformation from lakes and oceans to the clouds above.",
          "The journey begins with the energy from the sun, which warms rivers, lakes, and seas. This heat causes the water to evaporate, turning it into vapour that rises into the air. As the vapour ascends, it cools and condenses into tiny droplets. These droplets gather together, forming clouds.",
        ],
        domains: [
          {
            code: "2a",
            label: "Vocabulary",
            questions: [
              { text: 'Explain what the word "evaporate" means in the context of the passage.', marks: 1 },
              {
                text: 'Find and explain the meaning of the word "transpiration" as used in the passage.',
                marks: 1,
              },
            ],
          },
          {
            code: "2b",
            label: "Retrieval",
            questions: [
              { text: "What role does the sun play in the water cycle, according to the passage?", marks: 1 },
              { text: "List two forms of precipitation mentioned in the text.", marks: 1 },
            ],
          },
          {
            code: "2d",
            label: "Inference",
            questions: [
              {
                text: 'Why might the author describe the water cycle as a "delicate dance"? Provide evidence from the text to support your answer.',
                marks: 2,
              },
            ],
          },
        ],
      },
      Challenging: {
        title: "The Water Cycle Adventure",
        paragraphs: [
          "In the heart of the forest, where tall trees touched the sky, there was a magical pond. This pond was not just any ordinary water body; it was the starting point of an extraordinary journey, the water cycle. Ollie the raindrop lived in this pond and, like every other droplet, longed for an adventure.",
          "As days passed, the once-soft cloud grew heavy and dark. Then, with a rumble of thunder, Ollie felt a sprinkle of excitement as he began his descent back to Earth. Down he plummeted, past the soaring eagles and swaying treetops, landing with a joyful splash into the river.",
        ],
        domains: [
          {
            code: "2a",
            label: "Vocabulary",
            questions: [
              {
                text: 'What is the meaning of the word "whispering" as used in the sentence: "the sun shone brightly, whispering to Ollie"?',
                marks: 1,
              },
              {
                text: 'Find and explain the meaning of the phrase "sprinkle of excitement" as it is used in the text.',
                marks: 2,
              },
            ],
          },
          {
            code: "2b",
            label: "Retrieval",
            questions: [
              { text: "Where does Ollie's journey begin?", marks: 1 },
              { text: "How does Ollie change when he first leaves the pond?", marks: 2 },
            ],
          },
          {
            code: "2d",
            label: "Inference",
            questions: [
              {
                text: 'Using evidence from the text, explain why Ollie might consider the water cycle a "never-ending story of movement and transformation".',
                marks: 3,
              },
            ],
          },
        ],
      },
    },
    worksheet: {
      title: "Understanding the Water Cycle",
      meta: "2014 National Curriculum | Year 4 | Science",
      objective: "I am learning to describe the stages of the water cycle.",
      sections: [
        {
          name: "Section A",
          heading: "Knowledge Recall",
          marks: "1 mark each",
          questions: [
            "What is the process called where water turns into vapour?",
            "Which stage of the water cycle involves clouds releasing precipitation?",
            "What do we call the process of water soaking into the ground?",
          ],
        },
        {
          name: "Section B",
          heading: "Understanding",
          marks: "2 marks each",
          questions: [
            "Explain what happens during condensation in the water cycle.",
            "How do plants contribute to the water cycle?",
          ],
        },
        {
          name: "Section C",
          heading: "Application",
          marks: "3 to 4 marks each",
          questions: [
            "Imagine it has not rained for several weeks. How might this affect the stages of the water cycle?",
          ],
        },
        {
          name: "Section D",
          heading: "Analysis and Evaluation",
          marks: "6 to 8 marks",
          questions: [
            "Discuss the impact of human activities, such as building cities and cutting down forests, on the water cycle.",
          ],
        },
      ],
      misconceptions: [
        "Evaporation only happens from large bodies of water.",
        "Clouds are formed only from water vapour.",
        "Precipitation only refers to rain.",
      ],
    },
  },

  // ── Equivalent fractions, Year 4 Maths ─────────────────────────────────────
  fractions: {
    label: "Equivalent fractions, Year 4",
    year: "Year 4",
    subject: "Maths",
    slide: {
      deckTitle: "Fractions: Unveiling Equivalences",
      title: "Unveiling Equivalent Fractions",
      subHook: "Why are these fractions equivalent?",
      body: "**Equivalent fractions** are fractions that may look different but have the same value. Whether you have 1/2 or 2/4 of the pizza, you're still enjoying the same amount!",
      bullets: ["**1/2** and **2/4**", "**3/6** and **1/2**", "**4/8** and **1/2**"],
      callout: {
        variant: "fun",
        emoji: "🦉",
        label: "Fun fact",
        body: "Fractions are just a clever way of sharing things evenly!",
      },
      activeThumb: 3,
      thumbCount: 10,
    },
    comprehension: {
      Standard: {
        title: "Understanding Equivalent Fractions",
        paragraphs: [
          "Ella loved visiting her grandfather's bakery every Saturday. The sweet smell of freshly baked bread and pastries always welcomed her with open arms. This Saturday, Grandfather was preparing his special apple tarts when he called Ella over. \"Ella,\" he said, \"I've got a little challenge for you. Can you help me understand how we can have the same amount of tart, even if we cut it differently?\"",
          "Curious, Ella listened closely. Grandfather placed a single tart on the counter and cut it into two equal halves. \"Each piece is half the tart,\" he explained. Then, he took another tart and cut it into four equal parts. \"See these pieces? Each is one quarter. But two quarters together are the same as half the tart!\"",
        ],
        domains: [
          {
            code: "2a",
            label: "Word Meaning",
            questions: [
              { text: 'What does the word "equivalent" mean in the context of the passage?', marks: 1 },
              {
                text: 'In the text, what does "welcomed her with open arms" suggest about how Ella feels about the bakery?',
                marks: 2,
              },
            ],
          },
          {
            code: "2b",
            label: "Retrieval",
            questions: [
              {
                text: "What are the two different ways Grandfather cuts the tarts to show equivalent fractions?",
                marks: 1,
              },
            ],
          },
          {
            code: "2c",
            label: "Summarising",
            questions: [
              {
                text: "Summarise how Grandfather explains equivalent fractions to Ella in no more than two sentences.",
                marks: 2,
              },
            ],
          },
        ],
      },
    },
    worksheet: {
      title: "Equivalent Fractions: Understanding Relationships",
      meta: "2014 National Curriculum | Year 4 | Maths",
      objective: "I am learning to recognise and show families of common equivalent fractions.",
      sections: [
        {
          name: "Section A",
          heading: "Knowledge Recall",
          marks: "1 mark each",
          questions: [
            'Define the term "equivalent fractions".',
            "Write two fractions that are equivalent to 1/2.",
            "What is the numerator in the fraction 3/4?",
          ],
        },
        {
          name: "Section B",
          heading: "Understanding",
          marks: "2 marks each",
          questions: [
            "Explain why 2/4 is equivalent to 1/2. Use a diagram to support your answer.",
            "Which fraction is larger, 3/8 or 3/4? Explain your reasoning.",
          ],
        },
        {
          name: "Section C",
          heading: "Application",
          marks: "3 to 4 marks each",
          questions: [
            "Draw a number line from 0 to 1 and show where 1/2, 2/4 and 4/8 are located.",
          ],
        },
        {
          name: "Section D",
          heading: "Analysis and Evaluation",
          marks: "6 to 8 marks",
          questions: [
            "Explain how you could convince a classmate that 3/6 and 1/2 are the same, using more than one method.",
          ],
        },
      ],
      misconceptions: [
        "A bigger denominator always means a bigger fraction.",
        "Equivalent fractions must look similar.",
        "You can add the same number to the top and bottom to make an equivalent fraction.",
      ],
    },
  },

  // ── Ancient Egypt, Year 5 History ──────────────────────────────────────────
  egypt: {
    label: "Ancient Egypt, Year 5",
    year: "Year 5",
    subject: "History",
    slide: {
      deckTitle: "Mysteries of Ancient Egypt",
      title: "The Lifeblood of Egypt",
      subHook: "The River Nile: A flowing gift.",
      body: "The **River Nile** is more than a river; it's the heart of Egypt. Without the Nile, much of Egypt would be desert. Its annual **flooding** deposited rich silt, ideal for farming.",
      bullets: [
        "**Farming**: The Nile's floods enabled agriculture.",
        "**Transport**: Boats carried goods and people up and down the river.",
        "**Settlement**: It allowed large cities to thrive in an otherwise harsh environment.",
      ],
      callout: {
        variant: "remember",
        emoji: "🧠",
        label: "Remember",
        body: "Without the Nile, Ancient Egypt might never have existed.",
      },
      activeThumb: 3,
      thumbCount: 10,
    },
    comprehension: {
      Standard: {
        title: "Ancient Egypt: The Mystery of the Nile",
        paragraphs: [
          "The Nile River, often referred to as the lifeblood of Ancient Egypt, played a pivotal role in the development of one of history's greatest civilisations. Flowing north through the arid desert, the Nile brought with it rich silt and fertile lands which allowed crops like wheat and barley to flourish. Without this mighty river, the Egyptians might never have built their magnificent temples and pyramids.",
          "Every year, the river would flood, and although it might seem like a disaster, the Egyptians saw it as a blessing. The floodwaters deposited nutrient-rich soil over the farmlands, renewing the earth and ensuring bountiful harvests. The river was not just a source of life but also a means of transportation, connecting villages and towns that stretched along its banks.",
        ],
        domains: [
          {
            code: "2a",
            label: "Vocabulary",
            questions: [
              { text: 'What does the word "arid" mean as used in the passage?', marks: 1 },
              {
                text: 'Explain the meaning of "bountiful" and how it relates to the harvests in Ancient Egypt.',
                marks: 2,
              },
            ],
          },
          {
            code: "2b",
            label: "Retrieval",
            questions: [
              {
                text: "What crops are mentioned as being grown in Ancient Egypt due to the Nile's fertility?",
                marks: 1,
              },
              { text: "According to the passage, who is believed to have created the Nile?", marks: 1 },
            ],
          },
          {
            code: "2d",
            label: "Inference",
            questions: [
              {
                text: "Using evidence from the text, explain why the annual flooding of the Nile was considered a blessing by the Ancient Egyptians.",
                marks: 2,
              },
            ],
          },
        ],
      },
    },
    worksheet: {
      title: "Ancient Egypt and the River Nile",
      meta: "2014 National Curriculum | Year 5 | History",
      objective: "I am learning to explain how the River Nile shaped life in Ancient Egypt.",
      sections: [
        {
          name: "Section A",
          heading: "Knowledge Recall",
          marks: "1 mark each",
          questions: [
            "In which direction does the River Nile flow?",
            "Name two crops grown on the banks of the Nile.",
            "What was deposited on the farmland when the Nile flooded?",
          ],
        },
        {
          name: "Section B",
          heading: "Understanding",
          marks: "2 marks each",
          questions: [
            "Explain why the Egyptians welcomed the annual flood rather than fearing it.",
            "Describe two ways the Nile was used for transport.",
          ],
        },
        {
          name: "Section C",
          heading: "Application",
          marks: "3 to 4 marks each",
          questions: [
            "Imagine the Nile stopped flooding for ten years. Explain what might happen to Egyptian farming and settlements.",
          ],
        },
        {
          name: "Section D",
          heading: "Analysis and Evaluation",
          marks: "6 to 8 marks",
          questions: [
            'Assess the claim that "Ancient Egypt was a gift of the Nile". Use evidence to support your argument.',
          ],
        },
      ],
      misconceptions: [
        "Ancient Egypt was entirely desert with no farmland.",
        "The pyramids were built by enslaved people alone.",
        "Flooding is always a disaster for farmers.",
      ],
    },
  },

  // ── Persuasive writing, Year 6 English ─────────────────────────────────────
  persuasive: {
    label: "Persuasive writing, Year 6",
    year: "Year 6",
    subject: "English",
    slide: {
      deckTitle: "The Power of Persuasion",
      title: "The Essence of Persuasion",
      subHook: "Why do some words move us to action?",
      body: "At the heart of convincing arguments lies **empathy**, understanding the audience's needs and desires. Using emotional appeals, writers can **influence** readers' thoughts and decisions.",
      bullets: [
        "**Metaphor**: Paints a picture the reader cannot unsee.",
        "**Hyperbole**: Overstates the case to make it land.",
        "**Rhetorical questions**: Invite the reader to agree with you.",
      ],
      callout: {
        variant: "remember",
        emoji: "🧠",
        label: "Remember",
        body: "**Connection** with the audience is key to persuasion.",
      },
      activeThumb: 3,
      thumbCount: 10,
    },
    comprehension: {
      Standard: {
        title: "The Benefits of Walking to School",
        paragraphs: [
          "In the bustling town of Greenford, a group of eager children marched to school, their cheerful chatter harmonising with the rhythmic patter of their feet. Rosie, a ten-year-old advocate for walking, had started this revolution with a simple plan: convince her peers to embrace walking over other means of transport. She argued passionately that walking not only kept them fit but also reduced the town's pollution, making the air fresher for everyone.",
          "The children, each clad in vivid jackets to stand out against the morning mist, found unexpected joy in their daily trek. They began to notice small details missed during their usual car rides, the early bloom of lavender in the community garden, the melodic trills of birds welcoming the day, and the friendly nods of neighbours tending to their lives.",
        ],
        domains: [
          {
            code: "2a",
            label: "Word Meaning",
            questions: [
              {
                text: 'What does "advocate" mean as used in the passage? Use the context to explain your answer.',
                marks: 2,
              },
            ],
          },
          {
            code: "2d",
            label: "Inference",
            questions: [
              {
                text: 'Why do you think the text describes Rosie\'s plan as a "revolution"? Use evidence from the text to support your answer.',
                marks: 3,
              },
            ],
          },
          {
            code: "2g",
            label: "Language Choices",
            questions: [
              {
                text: 'How does the author use the phrase "rhythmic patter of their feet" to enhance the description of the children walking?',
                marks: 2,
              },
            ],
          },
        ],
      },
    },
    worksheet: {
      title: "Persuasive Writing: Choosing Words that Convince",
      meta: "2014 National Curriculum | Year 6 | English",
      objective: "I am learning to use rhetorical devices to persuade a reader.",
      sections: [
        {
          name: "Section A",
          heading: "Knowledge Recall",
          marks: "1 mark each",
          questions: [
            "Name three features of persuasive writing.",
            "What is a rhetorical question?",
            "Give one example of hyperbole.",
          ],
        },
        {
          name: "Section B",
          heading: "Understanding",
          marks: "2 marks each",
          questions: [
            "Explain why a writer might address the reader directly as you.",
            "Describe how a statistic can strengthen an argument.",
          ],
        },
        {
          name: "Section C",
          heading: "Application",
          marks: "3 to 4 marks each",
          questions: [
            "Write an opening paragraph persuading your head teacher to lengthen break time. Use at least two devices.",
          ],
        },
        {
          name: "Section D",
          heading: "Analysis and Evaluation",
          marks: "6 to 8 marks",
          questions: [
            "Compare two adverts and evaluate which is more persuasive, explaining your reasoning.",
          ],
        },
      ],
      misconceptions: [
        "Persuasive writing just means using lots of adjectives.",
        "A strong opinion is enough without evidence.",
        "Rhetorical questions always need answering in the text.",
      ],
    },
  },
};

/** The topic the hero loads with. */
export const DEFAULT_TOPIC_KEY = "water-cycle";

/** The suggestion chips, in the order they are printed. The default topic is
 *  already in the field, so it is not offered as a chip. */
export const DEMO_CHIP_KEYS = ["fractions", "egypt", "persuasive"];

export const DEMO_TOPIC = DEMO_TOPICS[DEFAULT_TOPIC_KEY].label;
