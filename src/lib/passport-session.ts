import { useEffect, useState } from "react";
import { passportTestData } from "@/lib/passport-test-data";

export type PassportSkillRecord = (typeof passportTestData)[number]["skills"][number];
export type StudentPassport = (typeof passportTestData)[number];

export function passportVersions(profile: StudentPassport) {
  return [...new Set(profile.skills.map((skill) => Number(skill.version.replace(/^V/i, ""))))].sort((a, b) => a - b);
}

/** Passport ID and version form a collision-free code prefix across the test registry. */
export function versionVerificationCode(profile: StudentPassport, version: number) {
  const passportKey = profile.passportId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const versionKey = `V${version}`;
  let checksum = 0x45d9f3b;
  for (const char of `${profile.studentId}|${profile.passportId}|${versionKey}`) {
    checksum = Math.imul(checksum ^ char.charCodeAt(0), 0x01000193);
  }
  return `BTU-${passportKey}-${versionKey}-${(checksum >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function verifyPassportCode(raw: string) {
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  for (const profile of passportTestData) {
    for (const version of passportVersions(profile)) {
      if (versionVerificationCode(profile, version) !== code) continue;
      const currentVersion = Math.max(...passportVersions(profile));
      return {
        valid: true as const,
        code,
        issuer: "Business and Technology University (BTU)",
        holderInitials: `${profile.firstName[0]}. ${profile.lastName}`,
        passportIdMasked: `${profile.passportId.slice(0, -3)}•••`,
        version,
        issuedAt: profile.issuedAt,
        isCurrent: version === currentVersion,
        currentVersion,
        skillCount: profile.skills.filter((skill) => Number(skill.version.replace(/^V/i, "")) === version).length,
        documentHash: `registry:${profile.studentId}:${versionKey(version)}`,
      };
    }
  }
  return null;
}

function versionKey(version: number) {
  return `v${version}`;
}

/** Read the demo account only in the browser; no passport is exposed during SSR or to guests. */
export function usePassportSession() {
  const [state, setState] = useState<{ ready: boolean; registered: boolean; profile: StudentPassport | null }>({ ready: false, registered: false, profile: null });

  useEffect(() => {
    let profile: StudentPassport | null = null;
    let registered = false;
    try {
      const session = JSON.parse(sessionStorage.getItem("btu-passport-user") ?? "null") as { email?: string; mode?: string } | null;
      if (session?.mode === "registered" && session.email) {
        registered = true;
        profile = passportTestData.find((student) => student.email.toLowerCase() === session.email!.trim().toLowerCase()) ?? null;
      }
    } catch {
      sessionStorage.removeItem("btu-passport-user");
    }
    setState({ ready: true, registered, profile });
  }, []);

  return state;
}

export function savePassportSession(email: string) {
  sessionStorage.setItem("btu-passport-user", JSON.stringify({ email: email.trim(), mode: "registered" }));
}

export function enterGuestMode() {
  sessionStorage.removeItem("btu-passport-user");
  sessionStorage.setItem("btu-passport-mode", "guest");
}

export function clearPassportSession() {
  sessionStorage.removeItem("btu-passport-user");
  sessionStorage.removeItem("btu-passport-mode");
}

export function passportSkillType(category: string) {
  if (category.toLowerCase().includes("advanced")) return "AI_ADVANCED" as const;
  if (category.toLowerCase().includes("applied")) return "AI_APPLIED" as const;
  return "AI_SKILL" as const;
}
