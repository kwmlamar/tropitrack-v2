import type { AnyToolDescriptor } from "./types";
import { getWorkerUnpaidTool } from "./worker-unpaid";
import { updateWorkerNotesTool } from "./update-worker-notes";
import { deletePayrollEntryTool } from "./delete-payroll-entry";
import { listWorkersTool } from "./list-workers";
import { getWorkerTool } from "./get-worker";
import { listProjectsTool } from "./list-projects";
import { getProjectTool } from "./get-project";
import { listPayrollEntriesTool } from "./list-payroll-entries";
import { listTimeEntriesTool } from "./list-time-entries";
import { listUnpaidWorkersTool } from "./list-unpaid-workers";
import { crewBalancesTool } from "./crew-balances";
import { projectLaborCostTool } from "./project-labor-cost";
import { listUnattributedReceiptsTool, attributeReceiptTool } from "./attribute-receipt";
import { recordPaymentTool } from "./record-payment";
import { createTimeEntryTool, bulkCreateTimeEntriesTool } from "./create-time-entry";
import { createPayrollEntryTool } from "./create-payroll-entry";
import { voidPayrollEntryTool } from "./void-payroll-entry";
import { deletePayPeriodTool } from "./delete-pay-period";

// Single source of truth for which tools exist. Skill scoping is applied at the
// chat-route layer based on each tool's `skills` and `scope` fields.
export const TOOL_REGISTRY: AnyToolDescriptor[] = [
  // ── The answer engine ──
  // crew_balances and project_labor_cost are thin wrappers over Postgres
  // functions that also back UI surfaces. Same input, same function, same
  // number, whether the question was asked in chat or rendered on a page.
  // Neither handler does any arithmetic, and neither should ever start.
  crewBalancesTool as unknown as AnyToolDescriptor,
  projectLaborCostTool as unknown as AnyToolDescriptor,

  // Core reads (always loaded across all skills)
  listWorkersTool as unknown as AnyToolDescriptor,
  getWorkerTool as unknown as AnyToolDescriptor,
  listProjectsTool as unknown as AnyToolDescriptor,
  getProjectTool as unknown as AnyToolDescriptor,
  listPayrollEntriesTool as unknown as AnyToolDescriptor,
  listTimeEntriesTool as unknown as AnyToolDescriptor,
  // Both of these now delegate to crew_balances rather than keeping their own
  // copy of the maths.
  listUnpaidWorkersTool as unknown as AnyToolDescriptor,
  getWorkerUnpaidTool as unknown as AnyToolDescriptor,
  listUnattributedReceiptsTool as unknown as AnyToolDescriptor,

  // Cross-skill writes (low-stakes notes update — payroll + general)
  updateWorkerNotesTool as unknown as AnyToolDescriptor,

  // Payroll writes
  recordPaymentTool as unknown as AnyToolDescriptor,
  createPayrollEntryTool as unknown as AnyToolDescriptor,
  voidPayrollEntryTool as unknown as AnyToolDescriptor,
  deletePayrollEntryTool as unknown as AnyToolDescriptor,
  deletePayPeriodTool as unknown as AnyToolDescriptor,

  // Timesheet writes — new rows only. Nothing here edits or deletes an existing
  // time entry, and both refuse a date inside a settled pay period.
  createTimeEntryTool as unknown as AnyToolDescriptor,
  bulkCreateTimeEntriesTool as unknown as AnyToolDescriptor,

  // Receipt writes — sets receipts.project_id and nothing else.
  attributeReceiptTool as unknown as AnyToolDescriptor,
];

const byName = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

export function getTool(name: string): AnyToolDescriptor | undefined {
  return byName.get(name);
}
