/**
 * Ambient typings for javascript-lp-solver (no official @types package).
 */
declare module "javascript-lp-solver" {
  export interface LpModel {
    optimize: string;
    opType: "max" | "min";
    constraints: Record<string, { max?: number; min?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, number>;
  }

  export interface LpResult {
    feasible: boolean;
    result: number;
    [variable: string]: number | boolean | string | undefined;
  }

  const solver: {
    Solve: (model: LpModel) => LpResult;
  };

  export default solver;
}
