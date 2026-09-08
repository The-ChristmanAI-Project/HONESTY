import type { DatacenterModel as Model } from "./types";

export type { DatacenterModel } from "./types";

export function liveModels(models: Model[]): Model[] {
  return models.filter((model) => model.status === "in_use");
}

export function reasoningNow(models: Model[]): Model | null {
  const live = liveModels(models);
  return live.find((model) => model.role === "reasoning") ?? live[0] ?? null;
}

export function reasoningLine(models: Model[]): string | null {
  const current = reasoningNow(models);
  if (!current) return null;
  const where = current.where === "datacenter" ? current.provider : "this computer";
  const via = current.via ? ` via ${current.via}` : "";
  return `${current.name} @ ${where}${via}`;
}

export function probeBody(vault: {
  nvidia: string;
  ollama: string;
  openai: string;
  anthropic: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
}): Record<string, string> {
  return {
    nvidia: vault.nvidia,
    ollama: vault.ollama,
    openai: vault.openai,
    anthropic: vault.anthropic,
    awsAccessKeyId: vault.awsAccessKeyId,
    awsSecretAccessKey: vault.awsSecretAccessKey,
    awsRegion: vault.awsRegion || "us-east-1",
  };
}

export function statusLabel(model: Model): string {
  if (model.status === "in_use") {
    return model.where === "datacenter" ? "answering now" : "on this computer";
  }
  if (model.status === "configured") return "picked";
  return "available";
}

export function fromTheirComputers(models: Model[]): Model[] {
  return models.filter((model) => model.where === "datacenter");
}

export function onYourComputerModels(models: Model[]): Model[] {
  return models.filter((model) => model.where === "local");
}

export function companyComputers(provider: string): string {
  const name = provider.trim();
  if (/^aws$/i.test(name)) return "Amazon's computers";
  if (/^ollama$/i.test(name)) return "Ollama's cloud";
  if (/^gemini$/i.test(name)) return "Google's computers";
  if (!name) return "their computers";
  return `${name}'s computers`;
}

export function modelPlainLine(model: Model): string {
  const company = companyComputers(model.provider);
  if (model.via) return `${company} · through ${model.via}`;
  return company;
}
