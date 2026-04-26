import { SequentialIdPrefixGenerationStrategy } from "./SequentialIdPrefixGenerationStrategy";

/**
 * @default "" Empty string
 */
export class StaticSequentialIdPrefixGenerationStrategy implements SequentialIdPrefixGenerationStrategy {
  readonly prefix: string = "";

  constructor(prefix?: string) {
    if (prefix) this.prefix = prefix;
  }

  async generate(): Promise<string> {
    return this.prefix;
  }
}
