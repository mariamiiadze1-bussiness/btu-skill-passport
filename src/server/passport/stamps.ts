/** The three BTU stamp types. Badge codes follow the workbook's rule (column N is derived from the category). */
export const STAMP_CATEGORIES = {
  "AI Skill": { type: "AI_SKILL", badgeCode: "BDG-AI-001" },
  "AI Applied Skill": { type: "AI_APPLIED", badgeCode: "BDG-AI-002" },
  "AI Advanced Skill": { type: "AI_ADVANCED", badgeCode: "BDG-AI-003" },
} as const;

export type SkillCategory = keyof typeof STAMP_CATEGORIES;
export type StampType = (typeof STAMP_CATEGORIES)[SkillCategory]["type"];

export function isSkillCategory(value: string): value is SkillCategory {
  return Object.hasOwn(STAMP_CATEGORIES, value);
}

export function stampType(category: string): StampType {
  return isSkillCategory(category) ? STAMP_CATEGORIES[category].type : "AI_SKILL";
}
