import { InjectableStrategy, RequestContext } from "@vendure/core";

export type FileGenerationResult = { filename: string; buffer: Buffer };
export interface FileStrategy<Snapshot = unknown> extends InjectableStrategy {
  /**
   * #TODO: parameters are WIP, just exploring implementation details
   * @returns Raw bytes of the generated PDF file
   */
  generate(
    ctx: RequestContext,
    sequentialId: string,
    snapshot: Snapshot,
  ): Promise<FileGenerationResult>;
}

/**
 * Simply stringifies the snapshot into a JSON file, just for debugging purposes.
 */
export class DebugFileStrategy implements FileStrategy {
  async generate(
    ctx: RequestContext,
    sequentialId: string,
    snapshot: unknown
  ): Promise<FileGenerationResult> {
    const filename = `${sequentialId}.json`;
    const buffer = Buffer.from(JSON.stringify(snapshot, null, 2));
    return { filename, buffer };
  }
}
