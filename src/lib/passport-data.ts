export type SkillType = "AI_SKILL" | "AI_APPLIED" | "AI_ADVANCED";

export const TYPE_LABEL: Record<SkillType, string> = {
  AI_SKILL: "AI Skill",
  AI_APPLIED: "AI Applied Skill",
  AI_ADVANCED: "AI Advanced Skill",
};

export function formatDate(iso: string, language: "en" | "ka" = "en") {
  if (language === "ka") {
    const date = new Date(iso + "T00:00:00");
    const months = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];
    return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export type ActivityStatus = "completed" | "processing" | "pending" | "failed";
