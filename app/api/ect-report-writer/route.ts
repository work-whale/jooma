import { NextRequest, NextResponse } from "next/server";
import { buildSystem } from "@/app/lib/systemPrompt";
import { streamChat } from "@/app/lib/usage";

export interface ECTReportWriterRequest {
  curriculum: string;
  ectName: string;
  subject?: string;
  strengths: string;
  areasForDevelopment: string;
  includeProfessionalDevelopmentPlan: boolean;
}


export async function POST(req: NextRequest) {
  const body: ECTReportWriterRequest = await req.json();

  const { curriculum, ectName, subject, strengths, areasForDevelopment, includeProfessionalDevelopmentPlan } = body;

  if (!curriculum || !ectName?.trim() || !strengths?.trim() || !areasForDevelopment?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const subjectLine = subject?.trim() ? `\n- Subject: ${subject}` : "";

  const pdpSection = includeProfessionalDevelopmentPlan ? `

## Professional Development Plan

After the summary, include a structured Professional Development Plan with:

### Short-term Actions (Next 4–6 weeks)

2 numbered action points, each with:
- **Teacher Standard:** [TS reference and full name]
- **Implementation strategy:** [Specific, concrete steps the ECT should take]
- **Resources required:** [What is needed to complete this action]
- **Success indicators:** [How progress will be measured]

### Medium-term Actions (Next term)

2 numbered action points, each with:
- **Teacher Standard:** [TS reference]
- **Implementation strategy:** [Specific steps]
- **Potential mentors/collaborators:** [Who can support]
- **Expected classroom impact:** [What improvement in outcomes should be seen]

### Long-term Professional Goals (Next 6–12 months)

1–2 overarching goals, each with bullet points for:
- **Teacher Standards:** [Relevant TS references]
- **Professional development opportunities:** [CPD, training, networks]
- **School improvement alignment:** [How this links to school priorities]
- **Career progression impact:** [How this supports the ECT's development]

### Recommended Resources

A categorised list including Professional Literature (2 books), Digital Resources and Communities (2 links/platforms), Subject-Specific Support (2 items), and School-Based Support (2 items).` : "";

  const userPrompt = `Write a formal, evidence-based ECT (Early Career Teacher) assessment report for the following:

- Curriculum: ${curriculum}
- ECT Name: ${ectName}${subjectLine}
- Strengths observed: ${strengths}
- Areas for Development: ${areasForDevelopment}

This report is an official ECT assessment document for use within the UK's Early Career Framework (ECF) induction programme. It must be formal, professional, and structured in a way that would be appropriate for review by a mentor, induction tutor, appropriate body, or headteacher. References to the Teachers' Standards (DfE, 2011) must be accurate — use both the standard number and its full title.

Structure the report as follows:

# ECT Assessment Report: ${ectName}

## Strengths

Write 3 substantial, evidence-based paragraphs documenting ${ectName}'s professional strengths. Each paragraph must:
- Open with a clear statement identifying the strength and the relevant Teacher Standard(s) by number and full title (e.g. "Teacher Standard 1: Set high expectations which inspire, motivate and challenge pupils")
- Provide specific, concrete evidence drawn from lesson observations, pupil work, assessment data, or professional conduct — avoid vague assertions such as "shows enthusiasm"
- Describe the impact of the strength on pupil learning, progress, or wellbeing — not just the behaviour itself
- Use formal, third-person language appropriate for an official ECT assessment report
- Be substantive enough to serve as a genuine professional record — at least 100 words per paragraph

## Areas for Development

Write 3 substantial paragraphs identifying areas where ${ectName} needs to develop further. Each paragraph must:
- Identify the specific Teacher Standard(s) this area relates to, by number and full title
- Describe the current gap or limitation clearly and constructively — based on the evidence provided, without being punitive or demotivating
- Provide 2–3 precise, actionable development steps that ${ectName} should take — specific enough to act on independently (e.g. "Observe [named strategy] in [colleague's] lessons and implement in at least two lessons before next review")
- State the expected impact on pupil outcomes when this area is addressed
- Be constructive in tone — frame development areas as part of normal professional growth, not as failures

## Professional Summary

Write 3 substantive paragraphs:
1. A synthesis of ${ectName}'s key strengths and their overall professional impact to date
2. The principal areas for development, their significance, and the support that will be provided
3. An overall professional judgement — including whether ${ectName} is on track to meet the Teachers' Standards at the end of induction — and a forward-looking statement about professional trajectory${pdpSection}

Throughout the report:
- Use ${ectName}'s full name on first reference, then surname only
- Write in third person throughout
- Use formal, precise language appropriate for an official ECT assessment document
- Reference Teachers' Standards by number and full title at every mention
- Do not use emojis
- Do not use vague descriptors — every claim must be supported by evidence or framed as an observed behaviour`;


  return streamChat({
    toolSlug: "ect-report-writer",
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK school leader, induction tutor, and ECT mentor with comprehensive knowledge of the Early Career Framework (ECF), the Teachers' Standards (DfE, 2011), and the statutory requirements for ECT induction. You have written many formal ECT assessment reports that have been reviewed by appropriate bodies and used in professional review meetings. Your reports are evidence-based, precisely referenced to the Teachers' Standards by number and full title, and written in formal third-person language that meets the standard of an official professional document. You write in professional UK English.") },
      { role: "user", content: userPrompt },
    ],
  });
}
