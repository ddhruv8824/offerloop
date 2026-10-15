/**
 * The app was called JobSwitch, and browsers that used it keep their data under "jobswitch.*"
 * keys. On first load after the rename, copy each one to its "offerloop.*" key (never over newer
 * data) and remove the old one, so the profile, tracker and DSA list carry over.
 */
const RENAMED = ["profile.v1", "tracker.v1", "dsa.v1", "jobs.seen.v1"];

if (typeof window !== "undefined") {
  try {
    for (const name of RENAMED) {
      const old = localStorage.getItem(`jobswitch.${name}`);
      if (old === null) continue;
      if (localStorage.getItem(`offerloop.${name}`) === null) localStorage.setItem(`offerloop.${name}`, old);
      localStorage.removeItem(`jobswitch.${name}`);
    }
  } catch {
    // Storage blocked: nothing to carry over.
  }
}

export {};
