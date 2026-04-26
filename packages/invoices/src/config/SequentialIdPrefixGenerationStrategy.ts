import { InjectableStrategy } from "@vendure/core";

// TODO rename to SequentialIfPrefix
export interface SequentialIdPrefixGenerationStrategy extends InjectableStrategy {
  /**
   * #TODO
   */
  generate(): Promise<string>;
}