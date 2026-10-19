// Server only. Where to go right after joining: profile setup for someone new, the dashboard for
// someone who already has a profile (e.g. the admin, who inherits the data from before accounts).
import { platformStorage } from "../store";
import { ensureMember } from "./members";

export async function afterJoinPath(user: { id: string; email: string }): Promise<string> {
  try {
    await ensureMember(user); // moves the old data in first, for the admin
    const profile = await platformStorage().get(`users/${user.id}/docs/profile`);
    return profile ? "/dashboard" : "/onboarding";
  } catch {
    return "/onboarding";
  }
}
