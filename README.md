# Jooma

An AI-powered toolkit for teachers and school leaders. Generate lesson plans, worksheets, reports, policies, and more — all tailored to your curriculum, year group, and classroom context.

## Tools

**Planning**
- Lesson Planner
- Topic Overview
- Medium Term Topic Planner
- EYFS Planner
- EYFS Action Plan
- Assembly Planner
- Risk Assessment
- CPD Slideshow Generator

**Literacy**
- Comprehension Generator
- Model Text Generator
- Phonics Support

**Assessment**
- Worksheet Generator
- Model Answer Generator
- Quiz Generator
- Report Writer

**SEND**
- Sensory Activities
- SMART Targets
- One Page Support Profile
- Individual Student Behaviour Plan

**Leadership**
- ECT Report Writer
- Inspection Prep Questions
- Learning Walk Report
- Lesson Observation Report
- Meeting Planner
- Performance Management Targets
- Letter Writer
- Pupil Premium Planner
- Newsletter Writer
- School Improvement Plans
- Policy Generator

## Tech Stack

- **Next.js 16** (App Router)
- **Tailwind CSS v4**
- **Anthropic Claude API** (`claude-sonnet-4-6`)
- **TipTap** (rich text editor)
- **react-icons** (icon library)
- **Bricolage Grotesque** (typography)
- **pptxgenjs / docx / jsPDF** (export formats)

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Create a `.env.local` file in the project root:

```
ANTHROPIC_API_KEY=your_api_key_here
```

3. Run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
