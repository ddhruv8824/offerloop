// Server only. Which company career boards Job Finder checks.
//
// Every entry in SOURCES was probed and returned open roles in India (see
// /api/jobs/verify-sources for re-checking). To add a company: find its board id in its
// careers-page URL — jobs.ashbyhq.com/<id>, jobs.smartrecruiters.com/<id>,
// job-boards.greenhouse.io/<id>, jobs.lever.co/<id> — and add a line.

export type Provider = "ashby" | "smartrecruiters" | "greenhouse" | "lever";

export interface CompanySource {
  provider: Provider;
  id: string;
  name: string;
}

const list = (provider: Provider, entries: Record<string, string>): CompanySource[] =>
  Object.entries(entries).map(([id, name]) => ({ provider, id, name }));

export const SOURCES: CompanySource[] = [
  ...list("ashby", {
    tekion: "Tekion",
    sarvam: "Sarvam AI",
    atlan: "Atlan",
    spotdraft: "SpotDraft",
    composio: "Composio",
    kong: "Kong",
    snowflake: "Snowflake",
    clickhouse: "ClickHouse",
    uipath: "UiPath",
    elevenlabs: "ElevenLabs",
    cursor: "Cursor",
    temporal: "Temporal",
    openai: "OpenAI",
    harvey: "Harvey",
    cerebras: "Cerebras",
    anyscale: "Anyscale",
    notion: "Notion",
    confluent: "Confluent",
  }),
  ...list("smartrecruiters", {
    Swiggy: "Swiggy",
    Freshworks: "Freshworks",
    ServiceNow: "ServiceNow",
    Nagarro1: "Nagarro",
    LinkedIn3: "LinkedIn",
    Experian: "Experian",
    Wise: "Wise",
    NielsenIQ: "NielsenIQ",
    Grab: "Grab",
    Mindtickle: "MindTickle",
    Canva: "Canva",
    BoschGroup: "Bosch",
    Continental: "Continental",
    Ubisoft2: "Ubisoft",
  }),
];

/**
 * Board ids not yet confirmed (Greenhouse and Lever couldn't be reached from the machine
 * the list was built on). /api/jobs/verify-sources reports which of these really respond;
 * move the ones that do into SOURCES.
 */
export const CANDIDATES: CompanySource[] = [
  ...list("greenhouse", {
    postman: "Postman",
    phonepe: "PhonePe",
    razorpaysoftwareprivatelimited: "Razorpay",
    groww: "Groww",
    stripe: "Stripe",
    databricks: "Databricks",
    anthropic: "Anthropic",
    gitlab: "GitLab",
    mongodb: "MongoDB",
    cloudflare: "Cloudflare",
    figma: "Figma",
    coinbase: "Coinbase",
    twilio: "Twilio",
    okta: "Okta",
    datadog: "Datadog",
    rubrik: "Rubrik",
    gleanwork: "Glean",
    airbnb: "Airbnb",
    elastic: "Elastic",
    thoughtspot: "ThoughtSpot",
    cohesity: "Cohesity",
    nutanix: "Nutanix",
    browserstack: "BrowserStack",
    chargebee: "Chargebee",
    druva: "Druva",
    zeta: "Zeta",
    clevertap: "CleverTap",
    moengage: "MoEngage",
    innovaccer: "Innovaccer",
    sprinklr: "Sprinklr",
    hasura: "Hasura",
    dream11: "Dream11",
    upstox: "Upstox",
  }),
  ...list("lever", {
    paytm: "Paytm",
    cred: "CRED",
    meesho: "Meesho",
    zepto: "Zepto",
    jupiter: "Jupiter",
    coindcx: "CoinDCX",
    gojek: "Gojek",
    zomato: "Zomato",
    sharechat: "ShareChat",
    khatabook: "Khatabook",
    porter: "Porter",
    rapido: "Rapido",
    whatfix: "Whatfix",
    hevodata: "Hevo Data",
    licious: "Licious",
    navi: "Navi",
  }),
];
