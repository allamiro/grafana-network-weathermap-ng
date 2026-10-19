// Shared by every editor and panel test harness that hands options to the code
// under test. Freezing the whole tree makes any in-place write into the
// options throw (our modules are compiled as strict mode), so a handler that
// mutates props.value instead of delivering new state fails the test at the
// offending line (#225, #233, #238).
//
// Returns the same object, frozen, so harnesses can write
// `value: deepFreeze(wm)`. Already-frozen subtrees are skipped, which keeps
// re-freezing a harness's state on every render cheap.
export const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};
