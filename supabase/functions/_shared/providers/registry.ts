import type { AppConfig } from "../config.ts";
import { AppError } from "../errors.ts";
import type { JobOperation } from "../types.ts";
import { MockAIProvider } from "./mock/index.ts";
import { FalAIProvider } from "./fal/index.ts";
import type { AIProvider } from "./provider.ts";

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();
  register(provider: AIProvider): this {
    this.providers.set(provider.name, provider);
    return this;
  }
  get(name: string): AIProvider {
    const provider = this.providers.get(name);
    if (!provider)
      throw new AppError("PROVIDER_NOT_CONFIGURED", {
        details: { provider: name },
      });
    return provider;
  }
}

export class ProviderResolver {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly defaultName: string,
  ) {}
  resolve(operation: JobOperation): AIProvider {
    const provider = this.registry.get(this.defaultName);
    if (!provider.getCapabilities().operations.includes(operation))
      throw new AppError("OPERATION_NOT_SUPPORTED");
    return provider;
  }
}

export function createProviderResolver(config: AppConfig): ProviderResolver {
  const registry = new ProviderRegistry().register(new MockAIProvider(config));
  if (config.provider === "fal") registry.register(new FalAIProvider(config));
  return new ProviderResolver(registry, config.provider);
}
