// The skill catalogue behind onboarding: suggestions for a target role, autocomplete that
// fixes spelling ("langraph" → "LangGraph"), and finding skills in resume text.
// Pure and dependency-free (tested in scripts/skills.test.mjs).
//
// Names match the ones job matching uses (lib/jobs.ts), so a skill picked here is found
// in job descriptions.

export type RoleFamily = "ai" | "data" | "frontend" | "backend" | "fullstack" | "mobile" | "devops" | "qa" | "security";

interface SkillDef {
  name: string;
  /** Other ways people write it. */
  aliases?: string[];
  /** Roles it's typical for — the order inside each family is its suggestion order. */
  roles: RoleFamily[];
  /** Too short or ambiguous to find in free text ("Go", "R"): only match the exact case. */
  exactCase?: boolean;
}

const SKILLS: SkillDef[] = [
  // ── AI / ML ──
  { name: "Python", roles: ["ai", "data", "backend"] },
  { name: "LLMs", aliases: ["LLM", "Large Language Models", "Generative AI", "GenAI", "Gen AI"], roles: ["ai"] },
  { name: "LangChain", roles: ["ai"] },
  { name: "LangGraph", aliases: ["Lang Graph"], roles: ["ai"] },
  { name: "RAG", aliases: ["Retrieval-Augmented Generation", "Retrieval Augmented Generation"], roles: ["ai"] },
  { name: "Prompt Engineering", aliases: ["Prompting"], roles: ["ai"] },
  { name: "AI Agents", aliases: ["Agentic AI", "Agents", "Multi-Agent Systems"], roles: ["ai"] },
  { name: "OpenAI API", aliases: ["OpenAI", "GPT-4", "ChatGPT API"], roles: ["ai"] },
  { name: "Claude API", aliases: ["Anthropic API", "Anthropic"], roles: ["ai"] },
  { name: "Gemini API", aliases: ["Google Gemini"], roles: ["ai"] },
  { name: "Hugging Face", aliases: ["HuggingFace", "HF Transformers"], roles: ["ai"] },
  { name: "Transformers", roles: ["ai"] },
  { name: "Vector Databases", aliases: ["Vector DB", "Vector Database", "Vector Store"], roles: ["ai"] },
  { name: "Embeddings", aliases: ["Text Embeddings"], roles: ["ai"] },
  { name: "Pinecone", roles: ["ai"] },
  { name: "FAISS", roles: ["ai"] },
  { name: "ChromaDB", aliases: ["Chroma"], roles: ["ai"] },
  { name: "Weaviate", roles: ["ai"] },
  { name: "Qdrant", roles: ["ai"] },
  { name: "pgvector", roles: ["ai"] },
  { name: "LlamaIndex", aliases: ["Llama Index", "GPT Index"], roles: ["ai"] },
  { name: "CrewAI", aliases: ["Crew AI"], roles: ["ai"] },
  { name: "AutoGen", roles: ["ai"] },
  { name: "MCP", aliases: ["Model Context Protocol"], roles: ["ai"] },
  { name: "Fine-tuning", aliases: ["Fine tuning", "Finetuning", "Fine-tuned", "LoRA", "QLoRA", "PEFT"], roles: ["ai"] },
  { name: "LLM Evaluation", aliases: ["LLM Evals", "Evals"], roles: ["ai"] },
  { name: "Semantic Search", roles: ["ai"] },
  { name: "Ollama", roles: ["ai"] },
  { name: "vLLM", roles: ["ai"] },
  { name: "Machine Learning", aliases: ["ML"], roles: ["ai", "data"] },
  { name: "Deep Learning", aliases: ["DL"], roles: ["ai"] },
  { name: "NLP", aliases: ["Natural Language Processing"], roles: ["ai"] },
  { name: "Computer Vision", aliases: ["CV"], roles: ["ai"] },
  { name: "PyTorch", aliases: ["Torch"], roles: ["ai"] },
  { name: "TensorFlow", aliases: ["Tensor Flow"], roles: ["ai"] },
  { name: "Keras", roles: ["ai"] },
  { name: "scikit-learn", aliases: ["sklearn", "scikit learn", "Scikit"], roles: ["ai", "data"] },
  { name: "NumPy", roles: ["ai", "data"] },
  { name: "Pandas", roles: ["ai", "data"] },
  { name: "OpenCV", roles: ["ai"] },
  { name: "MLOps", aliases: ["ML Ops"], roles: ["ai", "devops"] },
  { name: "MLflow", aliases: ["ML Flow"], roles: ["ai"] },
  { name: "Weights & Biases", aliases: ["wandb", "W&B"], roles: ["ai"] },
  { name: "AWS SageMaker", aliases: ["SageMaker"], roles: ["ai"] },
  { name: "Vertex AI", roles: ["ai"] },
  { name: "Amazon Bedrock", aliases: ["Bedrock"], roles: ["ai"] },
  { name: "Streamlit", roles: ["ai", "data"] },
  { name: "Gradio", roles: ["ai"] },
  { name: "Reinforcement Learning", aliases: ["RL", "RLHF"], roles: ["ai"] },
  { name: "Statistics", roles: ["ai", "data"] },

  // ── Data ──
  { name: "SQL", roles: ["data", "backend", "ai"] },
  { name: "Spark", aliases: ["PySpark", "Apache Spark"], roles: ["data"] },
  { name: "Airflow", aliases: ["Apache Airflow"], roles: ["data"] },
  { name: "dbt", roles: ["data"] },
  { name: "Snowflake", roles: ["data"] },
  { name: "BigQuery", aliases: ["Big Query"], roles: ["data"] },
  { name: "Databricks", roles: ["data"] },
  { name: "Kafka", aliases: ["Apache Kafka"], roles: ["data", "backend"] },
  { name: "ETL", aliases: ["ELT", "Data Pipelines"], roles: ["data"] },
  { name: "Data Modeling", aliases: ["Data Modelling"], roles: ["data"] },
  { name: "Data Visualization", aliases: ["Data Visualisation"], roles: ["data"] },
  { name: "Tableau", roles: ["data"] },
  { name: "Power BI", aliases: ["PowerBI"], roles: ["data"] },
  { name: "Excel", aliases: ["MS Excel", "Microsoft Excel"], roles: ["data"] },
  { name: "R", roles: ["data"], exactCase: true },
  { name: "Hadoop", roles: ["data"] },

  // ── Frontend ──
  { name: "JavaScript", aliases: ["JS", "ES6"], roles: ["frontend", "fullstack", "backend"] },
  { name: "TypeScript", aliases: ["TS"], roles: ["frontend", "fullstack", "backend"] },
  { name: "React", aliases: ["React.js", "ReactJS"], roles: ["frontend", "fullstack"] },
  { name: "Next.js", aliases: ["NextJS"], roles: ["frontend", "fullstack"] },
  { name: "HTML", aliases: ["HTML5"], roles: ["frontend"] },
  { name: "CSS", aliases: ["CSS3"], roles: ["frontend"] },
  { name: "Tailwind CSS", aliases: ["Tailwind", "TailwindCSS"], roles: ["frontend"] },
  { name: "Redux", aliases: ["Redux Toolkit"], roles: ["frontend"] },
  { name: "Vue", aliases: ["Vue.js", "VueJS"], roles: ["frontend"] },
  { name: "Angular", aliases: ["AngularJS"], roles: ["frontend"] },
  { name: "Svelte", aliases: ["SvelteKit"], roles: ["frontend"] },
  { name: "Testing Library", aliases: ["React Testing Library", "RTL"], roles: ["frontend", "qa"] },
  { name: "Jest", roles: ["frontend", "qa"] },
  { name: "Vite", roles: ["frontend"] },
  { name: "Webpack", roles: ["frontend"] },
  { name: "Accessibility", aliases: ["a11y", "WCAG"], roles: ["frontend"] },
  { name: "Figma", roles: ["frontend"] },

  // ── Backend ──
  { name: "Node.js", aliases: ["Node", "NodeJS"], roles: ["backend", "fullstack"] },
  { name: "Express", aliases: ["Express.js", "ExpressJS"], roles: ["backend", "fullstack"] },
  { name: "NestJS", aliases: ["Nest.js"], roles: ["backend"] },
  { name: "FastAPI", aliases: ["Fast API"], roles: ["backend", "ai"] },
  { name: "Django", roles: ["backend"] },
  { name: "Flask", roles: ["backend", "ai"] },
  { name: "Java", roles: ["backend"] },
  { name: "Spring Boot", aliases: ["Spring", "SpringBoot"], roles: ["backend"] },
  { name: "Go", aliases: ["Golang"], roles: ["backend", "devops"], exactCase: true },
  { name: "Rust", roles: ["backend"] },
  { name: "C++", aliases: ["CPP"], roles: ["backend"] },
  { name: "C#", aliases: [".NET", "dotnet", "ASP.NET"], roles: ["backend"] },
  { name: "Ruby on Rails", aliases: ["Rails", "Ruby"], roles: ["backend"] },
  { name: "PHP", aliases: ["Laravel"], roles: ["backend"] },
  { name: "PostgreSQL", aliases: ["Postgres"], roles: ["backend", "data", "fullstack"] },
  { name: "MySQL", roles: ["backend", "data"] },
  { name: "MongoDB", aliases: ["Mongo"], roles: ["backend", "fullstack"] },
  { name: "Redis", roles: ["backend"] },
  { name: "Elasticsearch", aliases: ["Elastic Search", "OpenSearch"], roles: ["backend"] },
  { name: "RabbitMQ", roles: ["backend"] },
  { name: "REST APIs", aliases: ["REST", "RESTful APIs", "REST API"], roles: ["backend", "fullstack"] },
  { name: "GraphQL", roles: ["backend", "frontend", "fullstack"] },
  { name: "gRPC", roles: ["backend"] },
  { name: "Microservices", aliases: ["Micro-services", "Microservice"], roles: ["backend"] },
  { name: "System Design", aliases: ["Distributed Systems"], roles: ["backend", "fullstack"] },

  // ── Mobile ──
  { name: "React Native", roles: ["mobile"] },
  { name: "Flutter", aliases: ["Dart"], roles: ["mobile"] },
  { name: "Android", roles: ["mobile"] },
  { name: "Kotlin", roles: ["mobile", "backend"] },
  { name: "iOS", roles: ["mobile"] },
  { name: "Swift", aliases: ["SwiftUI"], roles: ["mobile"] },

  // ── DevOps / cloud ──
  { name: "Docker", roles: ["devops", "backend", "ai"] },
  { name: "Kubernetes", aliases: ["K8s"], roles: ["devops", "backend"] },
  { name: "AWS", aliases: ["Amazon Web Services"], roles: ["devops", "backend", "ai"] },
  { name: "GCP", aliases: ["Google Cloud", "Google Cloud Platform"], roles: ["devops", "backend"] },
  { name: "Azure", aliases: ["Microsoft Azure"], roles: ["devops", "backend"] },
  { name: "Terraform", roles: ["devops"] },
  { name: "CI/CD", aliases: ["CICD", "Continuous Integration"], roles: ["devops", "backend"] },
  { name: "GitHub Actions", roles: ["devops"] },
  { name: "Jenkins", roles: ["devops"] },
  { name: "Linux", roles: ["devops", "backend"] },
  { name: "Bash", aliases: ["Shell Scripting", "Shell"], roles: ["devops"] },
  { name: "Ansible", roles: ["devops"] },
  { name: "Prometheus", roles: ["devops"] },
  { name: "Grafana", roles: ["devops"] },
  { name: "Git", aliases: ["GitHub", "GitLab"], roles: ["frontend", "backend", "fullstack", "devops", "ai", "data"] },

  // ── QA ──
  { name: "Selenium", roles: ["qa"] },
  { name: "Playwright", roles: ["qa", "frontend"] },
  { name: "Cypress", roles: ["qa", "frontend"] },
  { name: "Postman", aliases: ["API Testing"], roles: ["qa", "backend"] },
  { name: "Test Automation", aliases: ["Automation Testing"], roles: ["qa"] },
  { name: "Manual Testing", roles: ["qa"] },
  { name: "JMeter", roles: ["qa"] },

  // ── Security ──
  { name: "Network Security", roles: ["security"] },
  { name: "Penetration Testing", aliases: ["Pen Testing", "Pentesting"], roles: ["security"] },
  { name: "OWASP", roles: ["security"] },
  { name: "SIEM", aliases: ["Splunk"], roles: ["security"] },
  { name: "IAM", aliases: ["Identity and Access Management"], roles: ["security", "devops"] },

  // ── Ways of working ──
  { name: "Agile", aliases: ["Scrum"], roles: [] },
  { name: "Data Structures & Algorithms", aliases: ["DSA", "Data Structures", "Algorithms"], roles: [] },
];

const FAMILY_PATTERNS: Array<[RoleFamily, RegExp]> = [
  ["ai", /\bai\b|artificial intelligence|machine learning|\bml\b|\bllm|gen\s?ai|generative|deep learning|\bnlp\b|computer vision|prompt|applied scientist|research (?:engineer|scientist)/i],
  ["data", /data|analyst|analytics|\betl\b|business intelligence|\bbi\b/i],
  ["mobile", /mobile|android|\bios\b|react native|flutter/i],
  ["frontend", /front[\s-]?end|\bui\b|web developer|react|angular|vue/i],
  ["fullstack", /full[\s-]?stack|product engineer|mern|mean/i],
  ["backend", /back[\s-]?end|server|\bapi\b|java|python developer|node|golang/i],
  ["devops", /devops|\bsre\b|site reliability|cloud|infrastructure|platform engineer/i],
  ["qa", /\bqa\b|quality|\btest|sdet|automation engineer/i],
  ["security", /security|\bsoc\b|penetration|cyber/i],
];

/** Which kind of role a free-text target role is ("AI engineer" → "ai"), or null. */
export function roleFamily(targetRole: string): RoleFamily | null {
  const role = targetRole ?? "";
  return FAMILY_PATTERNS.find(([, re]) => re.test(role))?.[0] ?? null;
}

/** The first suggestions for each kind of role; the rest follow in catalogue order. */
const TOP: Partial<Record<RoleFamily, string[]>> = {
  ai: ["Python", "LLMs", "LangChain", "LangGraph", "RAG", "Vector Databases", "Prompt Engineering", "AI Agents",
    "PyTorch", "Hugging Face", "Machine Learning", "Deep Learning", "NLP", "FastAPI", "OpenAI API", "Fine-tuning"],
  data: ["SQL", "Python", "Pandas", "Spark", "Airflow", "dbt", "Snowflake", "Power BI", "Tableau", "Excel"],
  frontend: ["JavaScript", "TypeScript", "React", "Next.js", "HTML", "CSS", "Tailwind CSS", "Redux"],
  backend: ["Python", "Java", "Node.js", "SQL", "PostgreSQL", "REST APIs", "Docker", "System Design"],
  fullstack: ["JavaScript", "TypeScript", "React", "Node.js", "Next.js", "PostgreSQL", "MongoDB", "REST APIs"],
  devops: ["Docker", "Kubernetes", "AWS", "Terraform", "CI/CD", "Linux", "Bash", "GitHub Actions"],
};

const key = (s: string) => s.trim().toLowerCase();
/** "Lang Graph", "lang-graph", "LangGraph" → "langgraph". */
const squash = (s: string) => key(s).replace(/[\s.\-_/]+/g, "");

const has = (list: string[], name: string) => list.some((s) => key(s) === key(name));

/** Skills to suggest for a target role, best first, leaving out ones already picked. */
export function suggestedSkills(targetRole: string, picked: string[] = [], limit = 16): string[] {
  const family = roleFamily(targetRole);
  const names = family
    ? [...(TOP[family] ?? []), ...SKILLS.filter((s) => s.roles.includes(family)).map((s) => s.name)]
    : ["Python", "JavaScript", "SQL", "Git", "Docker", "Data Structures & Algorithms"];
  return [...new Set(names)].filter((n) => !has(picked, n)).slice(0, limit);
}

/**
 * Typos between two words: a wrong, missing or extra letter, or two swapped letters
 * ("pytroch" → "pytorch") each count as one. Capped: returns max + 1 once it's larger.
 */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    [before, prev] = [prev, row];
  }
  return prev[b.length];
}

/** How many typos still count as the same word, by length ("langraph" vs "langgraph" = 1). */
const allowedTypos = (length: number) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

export interface SkillMatch {
  name: string;
  /** exact = the name or an alias · prefix/contains = partial typing · typo = close spelling */
  kind: "exact" | "prefix" | "contains" | "typo";
}

/** Autocomplete: catalogue skills matching what's typed, best first. */
export function searchSkills(query: string, picked: string[] = [], limit = 8): SkillMatch[] {
  const q = key(query);
  const qs = squash(query);
  if (!qs) return [];
  const rank = { exact: 0, prefix: 1, typo: 2, contains: 3 } as const;
  const results: Array<SkillMatch & { score: number }> = [];
  for (const skill of SKILLS) {
    if (has(picked, skill.name)) continue;
    let best: SkillMatch["kind"] | null = null;
    let score = Infinity;
    for (const form of [skill.name, ...(skill.aliases ?? [])]) {
      const f = key(form);
      const fs = squash(form);
      let kind: SkillMatch["kind"] | null = null;
      if (fs === qs) kind = "exact";
      else if (fs.startsWith(qs) || f.startsWith(q)) kind = "prefix";
      else if (qs.length >= 4 && distance(qs, fs, allowedTypos(fs.length)) <= allowedTypos(fs.length)) kind = "typo";
      // Typing the start of a longer name with a typo in it ("langgra" for "langgraph").
      else if (qs.length >= 5 && fs.length > qs.length && distance(qs, fs.slice(0, qs.length), 1) <= 1) kind = "typo";
      else if (qs.length >= 3 && (fs.includes(qs) || f.includes(q))) kind = "contains";
      if (!kind) continue;
      // Prefer matches on the real name, then shorter names.
      const s = rank[kind] * 1000 + (form === skill.name ? 0 : 100) + skill.name.length;
      if (s < score) [best, score] = [kind, s];
    }
    if (best) results.push({ name: skill.name, kind: best, score });
  }
  return results
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ name, kind }) => ({ name, kind }));
}

/**
 * The skill to save for what someone typed: the catalogue spelling when it's clearly the
 * same skill ("langraph" → "LangGraph", "reactjs" → "React"), else their text as typed.
 */
export function normalizeSkill(input: string): string {
  const typed = input.trim().replace(/\s+/g, " ");
  if (!typed) return "";
  const top = searchSkills(typed, [], 1)[0];
  return top && (top.kind === "exact" || top.kind === "typo") ? top.name : typed;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names that are also everyday words ("excel at", "next level"): in text, only as written. */
const EVERYDAY_WORDS = new Set([
  "Excel", "Swift", "Spark", "Rust", "Express", "Node", "Spring", "Rails", "Ruby", "Shell", "Torch", "Chroma",
  "Agents", "Bedrock", "Flutter", "Jest", "Statistics", "Transformers", "Embeddings", "Agile", "Accessibility",
  "Algorithms", "Data Structures", "Evals", "Prompting", "Android", "Angular", "Vite",
]);

/** Catalogue skills mentioned in a block of text — e.g. a resume — in catalogue order. */
export function skillsInText(text: string): string[] {
  const found: string[] = [];
  for (const skill of SKILLS) {
    const forms = [skill.name, ...(skill.aliases ?? [])].filter((f) => f.length > 1 || skill.exactCase);
    const hit = forms.some((form) => {
      // Short forms ("ML", "CV", "JS", "Go") are easy to hit by accident: whole word, exact case.
      const strict = skill.exactCase || form.length <= 3 || EVERYDAY_WORDS.has(form);
      const re = new RegExp(`(?<![A-Za-z0-9+#])${escapeRe(form)}(?![A-Za-z0-9+#])`, strict ? "" : "i");
      return re.test(text);
    });
    if (hit) found.push(skill.name);
  }
  // "Go" is also an everyday word; only trust it next to other backend skills.
  if (found.includes("Go") && !/\bGolang\b|\bGo\s*(?:lang|\(|,|\/|\|)/.test(text)) found.splice(found.indexOf("Go"), 1);
  // "R" alone is risky too — keep it only when written like a language ("R," "R/" "R programming").
  if (found.includes("R") && !/(?<![A-Za-z0-9])R(?:\s*(?:programming|language|studio)|\s*[,/|])/i.test(text)) {
    found.splice(found.indexOf("R"), 1);
  }
  return found;
}
