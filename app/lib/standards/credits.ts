/*
 * The credit each standards licence asks for, on its own so the Terms page can
 * show them without loading the curriculum registry. Shown under the "Align to
 * curriculum" card whenever that framework's statements are listed, and in
 * section 13 of /terms.
 */

import type { FrameworkId } from "@/app/lib/curricula/types";

/** Scotland's Es and Os: Crown copyright, reused under the Open Government
 *  Licence v3.0 (education.gov.scot/terms-of-use). Also stored with the data. */
const CFE_CREDIT =
  "Curriculum for Excellence experiences and outcomes: © Crown copyright, Education Scotland. Contains public sector information licensed under the Open Government Licence v3.0.";

/** Northern Ireland's statutory requirements, from the 2007 Order on
 *  legislation.gov.uk (Open Government Licence v3.0). Also stored with the data. */
const NIC_CREDIT =
  "Northern Ireland Curriculum statutory requirements, from The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007: © Crown copyright. Contains public sector information licensed under the Open Government Licence v3.0.";

/** The credit each licence asks for, shown under the card whenever that
 *  framework's statements are listed. tests/unit/standards.spec.ts holds these
 *  equal to the credit stored with the data. */
export const FRAMEWORK_CREDIT: Record<FrameworkId, string> = {
  "ccss-math":
    "Common Core State Standards: © Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.",
  "ccss-ela":
    "Common Core State Standards: © Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.",
  ngss: "NGSS is a registered trademark of WestEd. Neither WestEd nor the lead states and partners that developed the Next Generation Science Standards were involved in the production of this product, and do not endorse it.",
  ac9: "© Australian Curriculum, Assessment and Reporting Authority (ACARA) 2010 to present, unless otherwise indicated. This material was downloaded from the Australian Curriculum website (accessed 15 November 2026) and was modified. The material is licensed under CC BY 4.0.",
  "cfe-early": CFE_CREDIT,
  "cfe-first": CFE_CREDIT,
  "cfe-second": CFE_CREDIT,
  "cfe-third-fourth": CFE_CREDIT,
  "nic-fs": NIC_CREDIT,
  "nic-ks1": NIC_CREDIT,
  "nic-ks2": NIC_CREDIT,
  "nic-ks3": NIC_CREDIT,
  "nic-ks4": NIC_CREDIT,
};

