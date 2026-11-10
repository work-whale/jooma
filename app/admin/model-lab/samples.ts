// Fixed sample inputs for the model lab.
//
// The point of a fixed input is comparability: the same prompt run on two
// models is the only way to judge whether the cheaper one is good enough. These
// are deliberately realistic — a real trip letter, a real set of pupil targets —
// because a toy input ("write about dogs") flatters every model equally and
// tells you nothing about the tools teachers actually use.
//
// Each body matches its route's request interface exactly. The lab adds
// __labModel / __labEffort / __labVerbosity on top before posting.
//
// Coverage is chosen to span the range where terra's economics flip: short
// output (letter-writer, 2k) through to the longest (lesson-planner, 8k).

export interface LabTool {
  slug: string;
  label: string;
  /** max_completion_tokens the route requests — the main driver of cost. */
  maxTokens: number;
  /** What this case is useful for testing. */
  note: string;
  body: Record<string, unknown>;
}

export const LAB_TOOLS: LabTool[] = [
  {
    slug: "letter-writer",
    label: "Letter writer",
    maxTokens: 2000,
    note: "Shortest output. Plain prose, no structure — the easiest case for a cheap model.",
    body: {
      recipient: "parents",
      tone: "Semi-formal",
      content:
        "Year 4 trip to the Natural History Museum on Tuesday 14 May. Coach leaves school at 8:45am and returns by 4:15pm. Cost is £8.50 per pupil, payable via ParentPay by 7 May. Pupils need a packed lunch, a coat, and school uniform. Two parent helpers are still needed — please contact the school office.",
    },
  },
  {
    slug: "smart-targets",
    label: "SMART targets",
    maxTokens: 4096,
    note: "Short, highly structured. Tests whether a cheap model keeps to a strict format.",
    body: {
      curriculum: "English National Curriculum",
      yearGroup: "Year 3",
      targets:
        "Pupil struggles to use full stops and capital letters consistently when writing independently. Can identify them correctly in someone else's writing but does not apply them in their own. Also finds it hard to stay on task during extended writing.",
    },
  },
  {
    slug: "newsletter-writer",
    label: "Newsletter writer",
    maxTokens: 4000,
    note: "Multi-section prose. Tests tonal consistency across separate blocks.",
    body: {
      newsletterTitle: "Spring Term Newsletter",
      schoolName: "St Mary's Primary School",
      tone: "Warm and friendly",
      sections: [
        "World Book Day was a huge success — thank you to everyone who helped with costumes. Year 2 raised £145 for the school library.",
        "Parents' evening is on 12 and 14 March. Booking opens on the school app from Monday 4 March.",
        "A reminder that the school gates now close at 8:50am. Please arrive by 8:45am to avoid a late mark.",
        "Congratulations to the Year 6 football team, who reached the district semi-finals for the first time in five years.",
      ],
    },
  },
  {
    slug: "report-writer",
    label: "Report writer",
    maxTokens: 4096,
    note: "Two pupils as references. Tests pronouns, the [PUPIL] placeholder and no invented attainment.",
    body: {
      yearGroup: "Year 4",
      subjects: ["Maths", "English"],
      scale: "primary",
      length: "standard",
      tone: "encouraging",
      nextSteps: true,
      // References, never names: the form swaps names out before sending.
      pupils: [
        {
          ref: "p1",
          pronouns: "she",
          attainment: { Maths: "Expected standard", English: "Greater depth" },
          effort: "Excellent",
          note: "Confident with written methods for addition and subtraction and explains her reasoning clearly. Finds two-step word problems hard. Reads widely and recommends books to a classmate.",
          nextStep: "Identify the operation in two-step word problems on her own.",
        },
        {
          ref: "p2",
          pronouns: "he",
          attainment: { Maths: "Working towards", English: "Expected standard" },
          effort: "Inconsistent",
          note: "Times tables much improved since the autumn. Handwriting is inconsistent at length and he rarely uses paragraphs. Loved the Romans topic.",
          nextStep: "",
        },
      ],
      chunkIndex: 0,
    },
  },
  {
    slug: "comprehension-generator",
    label: "Comprehension generator",
    maxTokens: 4096,
    note: "Most complex input. Generates a passage AND questions — tests instruction-following under many constraints.",
    body: {
      curriculum: "English National Curriculum",
      yearGroup: "Year 5",
      textSource: "generate",
      topic: "The Great Fire of London",
      passageWordCount: 300,
      contentDomains: [
        "2a – give/explain the meaning of words in context",
        "2b – retrieve and record information",
        "2d – make inferences from the text",
      ],
      questionTypes: ["Retrieval", "Inference", "Vocabulary"],
      numQuestions: 6,
      complexity: "Standard",
      includeAnswerKey: true,
    },
  },
  {
    slug: "lesson-planner",
    label: "Lesson planner",
    maxTokens: 8192,
    note: "Longest output (8k). This is where terra stops being cheaper than gpt-4o — the key cost case.",
    body: {
      curriculum: "English National Curriculum",
      yearGroup: "Year 6",
      subject: "Science",
      topic: "Classification of living things",
      learningObjective:
        "To classify living things into broad groups according to observable characteristics and based on similarities and differences.",
      differentiate: "yes",
      differentiationLevels: ["WTS", "EXS", "GDS"],
      outputDetail: "detailed",
      additionalInfo:
        "Mixed-ability class of 30. Four pupils with EAL, two with an EHCP for processing speed. One 60-minute lesson; a set of laminated organism cards is available.",
    },
  },
];

export function labToolBySlug(slug: string): LabTool | undefined {
  return LAB_TOOLS.find((t) => t.slug === slug);
}
