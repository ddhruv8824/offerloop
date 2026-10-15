import { ComingSoon } from "@/components/ComingSoon";

export default function Companies() {
  return (
    <ComingSoon
      toolId="companies"
      meanwhile={{
        label: "See jobs for you",
        href: "/dashboard",
        text: "Meanwhile, the jobs on your dashboard show each company's employee rating, benefits and size, and what pay to ask for.",
      }}
    />
  );
}
