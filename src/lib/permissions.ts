/**
 * Role-based gating for the estimate views (issue #5).
 *
 * Locked design table (project_bedrock_materials_calc_design.md):
 *
 *   View         Admin         Foreman/team        Client
 *   builder      cost+markup   sell only           no access
 *   materials    cost+markup   no access           no access
 *   schedule     full          full                no access
 *   preview      sell only     sell only           only this view
 *
 * In Bedrock terms:
 *   "admin"        → role === 'admin' || role === 'project_manager' || is_owner === true
 *   "foreman/team" → role === 'worker'
 *   "client"       → no auth (signed link to /preview)
 */

import type { User } from "@/types";

/**
 * True when the user is allowed to see internal cost-side data: labor rate,
 * material/equipment costs, markup percentages. Cost-side fields must be
 * hidden from foremen and workers to avoid leaking margin info.
 */
export function canSeeCosts(profile: Pick<User, "role" | "is_owner"> | null | undefined): boolean {
  if (!profile) return false;
  if (profile.is_owner) return true;
  return profile.role === "admin" || profile.role === "project_manager";
}

/**
 * True when the user can access the Materials Calc tab (`/estimates/[id]/materials`).
 * That tab is internal-only — same gate as cost visibility.
 */
export function canAccessMaterialsCalc(profile: Pick<User, "role" | "is_owner"> | null | undefined): boolean {
  return canSeeCosts(profile);
}
