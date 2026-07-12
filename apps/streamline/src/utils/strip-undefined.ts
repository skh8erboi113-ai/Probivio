/**
 * Removes `undefined` from a type's property value unions, splitting keys
 * into "always present" (unchanged) and "may be undefined" (rewritten as
 * optional with `undefined` excluded from the value type). This matches
 * what `stripUndefined` does at runtime and satisfies domains compiled with
 * `exactOptionalPropertyTypes: true`, where `{ a?: string }` (absent or
 * present-with-string) and `{ a?: string | undefined }` (absent or
 * present-with-string-or-undefined) are distinct, incompatible shapes.
 */
type WithoutUndefinedProps<T> = T extends readonly (infer U)[]
  ? WithoutUndefinedProps<U>[]
  : T extends object
    ? { [K in keyof T as undefined extends T[K] ? never : K]: WithoutUndefinedProps<T[K]> } & {
        [K in keyof T as undefined extends T[K] ? K : never]?: WithoutUndefinedProps<Exclude<T[K], undefined>>;
      }
    : T;

/**
 * Recursively removes keys whose value is `undefined` from an object graph
 * (plain objects only — arrays are recursed into, other values are returned
 * as-is).
 *
 * Needed at API boundaries where a Zod schema's inferred type marks a field
 * `T | undefined` (via `.optional()`) but the domain type (compiled with
 * `exactOptionalPropertyTypes: true`) expects the key to be entirely absent
 * rather than present-with-`undefined`.
 */
export function stripUndefined<T>(value: T): WithoutUndefinedProps<T> {
  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- generic recursion over `unknown`; the public signature above is what's type-checked at call sites
    return value.map((item) => stripUndefined(item)) as WithoutUndefinedProps<T>;
  }

  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- generic recursion over `unknown`; the public signature above is what's type-checked at call sites
        result[key] = stripUndefined(val);
      }
    }
    return result as WithoutUndefinedProps<T>;
  }

  return value as WithoutUndefinedProps<T>;
}
