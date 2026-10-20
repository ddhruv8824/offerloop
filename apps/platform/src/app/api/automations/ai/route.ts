import { NextResponse } from "next/server";
import { listModels, PROVIDERS, resolveConfig } from "@offerloop/resume-studio/server";
import { automationLlm, isProvider, maskKey } from "@/lib/server/ai-key";
import { memberRoute } from "@/lib/server/auth/session";
import { open, seal } from "@/lib/server/secret-box";
import { readStore, updateStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const providers = Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, models: p.models, defaultModel: p.defaultModel, keyUrl: p.keyUrl }));

/** Whether automations have an AI key (never the key itself), and the providers to pick from. */
export const GET = memberRoute(async (_req, _ctx, user) => {
  const data = await readStore(user.id);
  const key = data.ai ? open(data.ai.keyBox) : null;
  const usable = automationLlm(data);
  return NextResponse.json({
    configured: Boolean(data.ai && key),
    provider: data.ai?.provider ?? null,
    model: data.ai?.model || (data.ai && isProvider(data.ai.provider) ? PROVIDERS[data.ai.provider].defaultModel : null),
    key: key ? maskKey(key) : null,
    serverKey: !data.ai && usable?.keySource === "server",
    savedAt: data.ai?.savedAt ?? null,
    providers,
  });
});

/** { provider, model?, apiKey } checks the key and saves it · { remove: true } deletes it. */
export const POST = memberRoute(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as { provider?: unknown; model?: unknown; apiKey?: unknown; remove?: unknown };
  if (body.remove === true) {
    await updateStore(user.id, (d) => void delete d.ai);
    return NextResponse.json({ ok: true, configured: false });
  }

  const provider = String(body.provider ?? "").trim().toLowerCase();
  const model = String(body.model ?? "").trim();
  const apiKey = String(body.apiKey ?? "").trim();
  if (!isProvider(provider)) return NextResponse.json({ error: "Pick an AI provider." }, { status: 400 });
  if (apiKey.length < 10 || apiKey.length > 300 || /\s/.test(apiKey)) return NextResponse.json({ error: "Paste your API key." }, { status: 400 });

  // Check the key before saving it: a bad key would otherwise only show up at 9 AM tomorrow.
  let cfg;
  try {
    cfg = resolveConfig(provider, model || null, apiKey);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "That key can't be used." }, { status: 400 });
  }
  try {
    const models = await listModels(cfg);
    // "…-latest" names are aliases that model lists don't always include.
    if (models.length && !models.includes(cfg.model) && !cfg.model.endsWith("-latest")) {
      return NextResponse.json({ error: `This key can't use the model '${cfg.model}'. Pick another model.` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : `${PROVIDERS[provider].label} didn't accept that key.` }, { status: 400 });
  }

  try {
    await updateStore(user.id, (d) => {
      d.ai = { provider, model: cfg.model, keyBox: seal(apiKey), savedAt: new Date().toISOString() };
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save the key." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, configured: true, provider, model: cfg.model, key: maskKey(apiKey) });
});
