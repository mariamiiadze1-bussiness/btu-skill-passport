import { getRouteApi } from "@tanstack/react-router";

import type { PassportView } from "@/server/passports";

export type StudentPassport = NonNullable<PassportView>;
export type PassportVersionView = StudentPassport["versions"][number];
export type PassportSkillRecord = PassportVersionView["skills"][number];

const rootRoute = getRouteApi("__root__");

/** The signed-in user from the root route's server check, or null. */
export function useSession() {
  return rootRoute.useRouteContext({ select: (context) => context.session });
}

export function passportSkillType(category: string) {
  if (category.toLowerCase().includes("advanced")) return "AI_ADVANCED" as const;
  if (category.toLowerCase().includes("applied")) return "AI_APPLIED" as const;
  return "AI_SKILL" as const;
}
