import type { AnyToolDescriptor } from "./types";
import { getWorkerUnpaidTool } from "./worker-unpaid";
import { updateWorkerNotesTool } from "./update-worker-notes";

// Single source of truth for which tools exist. Skill-scoped filtering happens
// in the chat route (#21).
export const TOOL_REGISTRY: AnyToolDescriptor[] = [
  getWorkerUnpaidTool as unknown as AnyToolDescriptor,
  updateWorkerNotesTool as unknown as AnyToolDescriptor,
];

const byName = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

export function getTool(name: string): AnyToolDescriptor | undefined {
  return byName.get(name);
}
