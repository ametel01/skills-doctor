import { tmpdir, userInfo } from "node:os";
import path from "node:path";

export const defaultReportOutputRoot = (): string =>
  path.join(tmpdir(), scopedTempDirectoryName(), "reports");

const scopedTempDirectoryName = (): string => {
  const uid = process.getuid?.();
  if (uid !== undefined) {
    return `skills-doctor-${uid}`;
  }

  try {
    return `skills-doctor-${safePathSegment(userInfo().username)}`;
  } catch {
    return "skills-doctor-user";
  }
};

const safePathSegment = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
