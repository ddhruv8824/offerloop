import { ComingSoon } from "@/components/ComingSoon";

export default function Companies() {
  return (
    <ComingSoon
      toolId="companies"
      meanwhile={{
        label: "Open Job Finder",
        href: "/jobs",
        text: "Meanwhile, Job Finder shows each company's employee rating, benefits and size, and what pay to ask for.",
      }}
    />
  );
}
