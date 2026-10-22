import type { SkillType } from "@/lib/passport-data";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** BTU's stamp artwork (the same images the PDF uses), tilted slightly like a real stamp. */
const STAMPS: Record<SkillType, { src: string; label: string; className: string }> = {
  AI_SKILL: { src: "/stamps/ai-skill.png", label: "AI Skill stamp", className: "aspect-[328/284] -rotate-3" },
  AI_APPLIED: { src: "/stamps/ai-applied-skill.png", label: "AI Applied Skill stamp", className: "aspect-[656/211] rotate-[-5deg]" },
  AI_ADVANCED: { src: "/stamps/ai-advanced-skill.png", label: "AI Advanced Skill stamp", className: "aspect-square rotate-3" },
};

export function Stamp({ type, size = "md" }: { type: SkillType; size?: "sm" | "md" }) {
  const { t } = useI18n();
  const stamp = STAMPS[type];
  const height = type === "AI_APPLIED" ? (size === "sm" ? "h-6" : "h-8") : size === "sm" ? "h-10" : "h-16";
  return <img src={stamp.src} alt={t(stamp.label)} className={cn("w-auto shrink-0 select-none", height, stamp.className)} draggable={false} />;
}

export function Asterisks({ n = 3, vertical = false }: { n?: number; vertical?: boolean }) {
  return (
    <div aria-hidden className={cn("flex gap-1 font-display text-2xl leading-none text-primary", vertical && "flex-col")}>
      {Array.from({ length: n }).map((_, i) => <span key={i}>✱</span>)}
    </div>
  );
}

export function BrandTag({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn("inline-block bg-primary px-3 py-1.5 font-display text-xs uppercase leading-tight text-primary-foreground", className)}>
      <span className="font-sans font-semibold">{t("AI Skills")}</span><br />{t("Digital Passport")}
    </div>
  );
}
