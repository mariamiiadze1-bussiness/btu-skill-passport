export type SkillType = "AI_SKILL" | "AI_APPLIED" | "AI_ADVANCED";

export interface Skill {
  id: string;
  name: string;
  type: SkillType;
  category: string;
  earnedThrough: string;
  dateEarned: string;
  description: string;
}

export interface PassportVersion {
  version: number;
  issuedAt: string;
  verificationCode: string;
  skillIds: string[];
  status: "active" | "superseded";
}

export const TYPE_LABEL: Record<SkillType, string> = {
  AI_SKILL: "AI Skill",
  AI_APPLIED: "AI Applied Skill",
  AI_ADVANCED: "AI Advanced Skill",
};

export const student = {
  firstName: "Nino",
  lastName: "Beridze",
  program: "BSc Business Administration",
  passportId: "BTU-AISP-2026-04718",
  originalIssueDate: "2026-02-14",
};

export const skills: Skill[] = [
  { id: "s1", name: "Prompt Engineering", type: "AI_SKILL", category: "Generative AI", earnedThrough: "Guest Speaker Session", dateEarned: "2026-02-10", description: "Applied prompting techniques for text, image and data generation tasks." },
  { id: "s2", name: "AI Ethics & Responsible Use", type: "AI_SKILL", category: "Governance", earnedThrough: "Workshop", dateEarned: "2026-03-22", description: "Explored bias, data privacy and responsible AI use in real-world contexts." },
  { id: "s3", name: "AI Workflow Automation", type: "AI_APPLIED", category: "Productivity", earnedThrough: "Bootcamp (3 days)", dateEarned: "2026-05-08", description: "Combined multiple AI tools to automate a routine task and optimise workflow." },
  { id: "s4", name: "Data Analysis with AI", type: "AI_ADVANCED", category: "Data", earnedThrough: "Academic Course", dateEarned: "2026-06-30", description: "In-depth knowledge and practical skills in data analysis using AI tools." },
  { id: "s5", name: "AI Agents", type: "AI_APPLIED", category: "Engineering", earnedThrough: "Hackathon", dateEarned: "2026-09-19", description: "Built and tested a simple AI agent including prompt design and evaluation." },
];

export const versions: PassportVersion[] = [
  { version: 1, issuedAt: "2026-02-14", verificationCode: "7KQ2-M9XA", skillIds: ["s1"], status: "superseded" },
  { version: 2, issuedAt: "2026-05-12", verificationCode: "P4TR-81ZD", skillIds: ["s1", "s2", "s3"], status: "superseded" },
  { version: 3, issuedAt: "2026-09-24", verificationCode: "X3BN-5VHC", skillIds: ["s1", "s2", "s3", "s4", "s5"], status: "active" },
];

export const latestVersion = versions.find((v) => v.status === "active")!;

export function formatDate(iso: string, language: "en" | "ka" = "en") {
  if (language === "ka") {
    const date = new Date(iso + "T00:00:00");
    const months = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];
    return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Public lookup — returns only what is needed to confirm authenticity. */
export function verifyCode(raw: string) {
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  const v = versions.find((x) => x.verificationCode === code);
  if (!v) return { valid: false as const, code };
  return {
    valid: true as const,
    code,
    issuer: "Business and Technology University (BTU)",
    holderInitials: `${student.firstName[0]}. ${student.lastName}`,
    passportIdMasked: student.passportId.replace(/\d{3}(\d{2})$/, "•••$1"),
    version: v.version,
    issuedAt: v.issuedAt,
    isCurrent: v.status === "active",
    currentVersion: latestVersion.version,
    skillCount: v.skillIds.length,
    documentHash: hashFor(v.verificationCode),
  };
}

function hashFor(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return "sha256:" + (h >>> 0).toString(16).padStart(8, "0") + "…" + s.replace("-", "").toLowerCase();
}

export type ActivityStatus = "completed" | "processing" | "pending" | "failed";
export const adminActivity: { id: string; student: string; passportId: string; action: string; version: number; at: string; status: ActivityStatus }[] = [
  { id: "a1", student: "Nino Beridze", passportId: "BTU-AISP-2026-04718", action: "Passport v3 generated", version: 3, at: "2026-09-24 10:12", status: "completed" },
  { id: "a2", student: "Giorgi Kapanadze", passportId: "BTU-AISP-2026-03311", action: "Skill update: AI Agents", version: 2, at: "2026-10-20 16:40", status: "processing" },
  { id: "a3", student: "Ana Lomidze", passportId: "BTU-AISP-2026-05102", action: "Awaiting skill confirmation", version: 1, at: "2026-10-20 14:05", status: "pending" },
  { id: "a4", student: "Luka Tsiklauri", passportId: "BTU-AISP-2026-02874", action: "PDF signing failed", version: 4, at: "2026-10-19 09:58", status: "failed" },
  { id: "a5", student: "Mariam Gelashvili", passportId: "BTU-AISP-2026-06023", action: "Passport v2 generated", version: 2, at: "2026-10-18 11:21", status: "completed" },
];

export const pendingReviews = [
  { id: "r1", student: "Ana Lomidze", passportId: "BTU-AISP-2026-05102", skill: "Prompt Engineering", type: "AI_SKILL" as SkillType, source: "Workshop · 12 Oct 2026", evidence: "Attendance + assessment 86%" },
  { id: "r2", student: "Ana Lomidze", passportId: "BTU-AISP-2026-05102", skill: "Data Analysis with AI", type: "AI_ADVANCED" as SkillType, source: "Academic Course · Fall 2026", evidence: "Final grade A-" },
  { id: "r3", student: "Giorgi Kapanadze", passportId: "BTU-AISP-2026-03311", skill: "AI Agents", type: "AI_APPLIED" as SkillType, source: "Hackathon · 18 Oct 2026", evidence: "Project submission reviewed" },
];

export const verificationLog = [
  { code: "X3BN-5VHC", at: "2026-10-21 09:14", result: "Valid · current" },
  { code: "P4TR-81ZD", at: "2026-10-20 17:02", result: "Valid · superseded" },
  { code: "ZZZZ-0000", at: "2026-10-20 12:47", result: "Not found" },
  { code: "X3BN-5VHC", at: "2026-10-19 08:30", result: "Valid · current" },
];
