import { ComingSoon } from "@/components/ComingSoon";

export default function InterviewCoach() {
  return (
    <ComingSoon
      toolId="interview"
      meanwhile={{ label: "Open DSA Prep", href: "/dsa", text: "Meanwhile, practice the most-asked coding questions for the companies you're targeting." }}
    />
  );
}
