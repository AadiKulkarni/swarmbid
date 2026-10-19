/**
 * @swarmbid/baseline — centralized MILP optimal assignment.
 *
 * Given the same WorldState as the decentralized auction, returns the
 * optimal robot–task matching and objective value for "% of MILP optimal"
 * comparisons in the UI and metrics.
 */

export { scoreAssignment, solveAssignment } from "./assign.js";
export type { AssignmentResult, SolveOptions } from "./assign.js";
