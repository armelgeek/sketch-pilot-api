// Utility to ensure only valid Date or null is passed to Drizzle ORM
export function validDateOrNull(val: any): Date | null {
  return val instanceof Date && !Number.isNaN(val.getTime()) ? val : null
}
