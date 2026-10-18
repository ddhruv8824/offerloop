// Server only. Everyone whose workflows the scheduler runs.
import { authMode, LOCAL_USER } from "./auth/config";
import { memberIds } from "./auth/members";

export async function allUserIds(): Promise<string[]> {
  return authMode() === "accounts" ? memberIds() : [LOCAL_USER.id];
}
