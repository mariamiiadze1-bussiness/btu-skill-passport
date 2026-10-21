import type { SkillType } from "@/lib/passport-data";
import { cn } from "@/lib/utils";

export function Stamp({ type, size = "md" }: { type: SkillType; size?: "sm" | "md" }) {
  const s = size === "sm";
  if (type === "AI_SKILL")
    return (
      <div aria-label="AI Skill stamp" className={cn("stamp-tri grid shrink-0 place-items-end bg-stamp-red pb-1.5 text-center font-display uppercase leading-none text-destructive-foreground", s ? "h-10 w-11 text-[6px]" : "h-16 w-[72px] text-[8px]")}>
        <span>AI<br />Skill</span>
      </div>
    );
  if (type === "AI_APPLIED")
    return (
      <div aria-label="AI Applied Skill stamp" className={cn("shrink-0 -rotate-6 rounded-sm bg-stamp-purple px-2 py-1 text-center font-display uppercase leading-tight text-destructive-foreground", s ? "text-[7px]" : "text-[10px]")}>
        AI Applied Skill
        <div className="font-sans text-[0.8em] font-medium normal-case opacity-90">applied learning</div>
      </div>
    );
  return (
    <div aria-label="AI Advanced Skill stamp" className={cn("grid shrink-0 place-items-center rounded-full border-2 border-dashed border-stamp-cyan bg-stamp-navy text-center font-display uppercase leading-none text-destructive-foreground", s ? "h-10 w-10 text-[6px]" : "h-16 w-16 text-[8px]")}>
      AI<br />Adv.<br />Skill
    </div>
  );
}

export function Asterisks({ n = 3, vertical = false }: { n?: number; vertical?: boolean }) {
  return (
    <div aria-hidden className={cn("flex gap-1 font-display text-2xl leading-none text-primary", vertical && "flex-col")}>
      {Array.from({ length: n }).map((_, i) => <span key={i}>✱</span>)}
    </div>
  );
}

export function BrandTag({ className }: { className?: string }) {
  return (
    <div className={cn("inline-block bg-primary px-3 py-1.5 font-display text-xs uppercase leading-tight text-primary-foreground", className)}>
      <span className="font-sans font-semibold">AI Skills</span><br />Digital Passport
    </div>
  );
}
