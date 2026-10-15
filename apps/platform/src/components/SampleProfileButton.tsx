"use client";

import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/profile";
import { SAMPLE_PROFILE } from "@/lib/sample-data";
import { Button } from "./ui";

/** `stay` keeps the user on the current page (the profile appears in place). */
export function SampleProfileButton({
  variant = "secondary",
  label = "Explore with a sample profile",
  stay = false,
}: {
  variant?: "secondary" | "ghost";
  label?: string;
  stay?: boolean;
}) {
  const router = useRouter();
  return (
    <Button
      variant={variant}
      onClick={() => {
        saveProfile({ ...SAMPLE_PROFILE, createdAt: new Date().toISOString() });
        if (!stay) router.push("/dashboard");
      }}
    >
      {label}
    </Button>
  );
}
