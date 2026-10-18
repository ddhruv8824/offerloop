"use client";

import "./storage-rename";
import { useCallback, useEffect, useState } from "react";
import { markChanged } from "./sync";
import type { CareerProfile } from "./types";

/**
 * The career profile: kept in this browser's localStorage and mirrored to your account
 * (see sync.ts), so it follows you to other devices.
 */
const KEY = "offerloop.profile.v1";
const EVENT = "offerloop:profile";

function read(): CareerProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CareerProfile) : null;
  } catch {
    return null;
  }
}

/** The saved profile right now (null when there isn't one, or outside the browser). */
export function getProfile(): CareerProfile | null {
  return typeof window === "undefined" ? null : read();
}

export function saveProfile(profile: CareerProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Storage blocked (private mode): the session continues without persistence.
  }
  markChanged("profile");
  window.dispatchEvent(new Event(EVENT));
}

export function clearProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  markChanged("profile");
  window.dispatchEvent(new Event(EVENT));
}

/** `ready` is false until the first client read, so pages don't flash the wrong state. */
export function useProfile() {
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setProfile(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: CareerProfile) => saveProfile(next), []);
  return { profile, ready, update };
}

/** Which of a job's skills the profile already covers. */
export function skillOverlap(jobSkills: string[], profileSkills: string[]) {
  const have = new Set(profileSkills.map((s) => s.toLowerCase()));
  return {
    matched: jobSkills.filter((s) => have.has(s.toLowerCase())),
    missing: jobSkills.filter((s) => !have.has(s.toLowerCase())),
  };
}
