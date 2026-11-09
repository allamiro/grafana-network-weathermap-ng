// The vendored deepmerge (vendor/deepmerge, local 4.3.2) closes
// GHSA-gcqx-w48m-w2h4 / CVE-2026-93753, for which no upstream release exists.
// These tests fail if the override stops pointing at the patched copy or the
// guard is lost when the copy is updated.
import path from 'path';
import deepmerge from 'deepmerge';

// JSON.parse is how the attack arrives: it creates an own "__proto__" key,
// which an object literal would not.
const poisoned = () => JSON.parse('{"__proto__": {"isAdmin": true}}');

describe('vendored deepmerge (GHSA-gcqx-w48m-w2h4)', () => {
  test('every copy resolves to the patched vendor/deepmerge', () => {
    // Both real consumers must get the patched copy, not a nested 4.3.1.
    const resolvedFrom = (consumer?: string) =>
      (consumer
        ? require.resolve('deepmerge', { paths: [path.dirname(require.resolve(consumer))] })
        : require.resolve('deepmerge')
      )
        .split(path.sep)
        .join('/');
    expect(resolvedFrom()).toContain('vendor/deepmerge');
    expect(resolvedFrom('jest-config')).toContain('vendor/deepmerge');
    expect(resolvedFrom('fork-ts-checker-webpack-plugin')).toContain('vendor/deepmerge');
  });

  test('a null-prototype target does not let a __proto__ key set the result prototype', () => {
    const merged = deepmerge(Object.create(null), poisoned());
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect((merged as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });

  test('a target carrying its own __proto__ key does not poison the result', () => {
    const merged = deepmerge(poisoned(), {});
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect((merged as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });

  test('a nested null placeholder does not let a __proto__ key through', () => {
    const merged = deepmerge<{ session: { isAdmin?: boolean } | null }>(
      { session: null },
      JSON.parse('{"session": {"__proto__": {"isAdmin": true}}}')
    );
    expect(Object.getPrototypeOf(merged.session)).toBe(Object.prototype);
    expect(merged.session!.isAdmin).toBeUndefined();
  });

  test('ordinary deep merges are unchanged', () => {
    expect(deepmerge({ a: 1, b: { c: 1 }, list: [1] }, { b: { d: 2 }, list: [2] })).toEqual({
      a: 1,
      b: { c: 1, d: 2 },
      list: [1, 2],
    });
  });
});
