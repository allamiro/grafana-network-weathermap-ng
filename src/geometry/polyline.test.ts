import {
  clampProgress,
  getParallelOffsetPath,
  getPointAtProgress,
  getPolylineLength,
  getTangentAtProgress,
  sanitizePolyline,
  PolylinePoint,
} from './polyline';

const straight: PolylinePoint[] = [
  [0, 0],
  [100, 0],
];

const multiVia: PolylinePoint[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [200, 100],
];

describe('clampProgress', () => {
  it('clamps into [0, 1]', () => {
    expect(clampProgress(-1)).toEqual(0);
    expect(clampProgress(0)).toEqual(0);
    expect(clampProgress(0.5)).toEqual(0.5);
    expect(clampProgress(1)).toEqual(1);
    expect(clampProgress(2)).toEqual(1);
  });

  it('resolves any non-finite input to 0 (same convention as clampUtilization)', () => {
    expect(clampProgress(NaN)).toEqual(0);
    expect(clampProgress(Infinity)).toEqual(0);
    expect(clampProgress(-Infinity)).toEqual(0);
    expect(clampProgress(Number.NaN)).toEqual(0);
  });
});

describe('sanitizePolyline', () => {
  it('drops malformed and non-finite points', () => {
    expect(
      sanitizePolyline([[0, 0], [NaN, 5] as PolylinePoint, undefined, null, [1, Infinity] as PolylinePoint, [3, 4]])
    ).toEqual([
      [0, 0],
      [3, 4],
    ]);
  });

  it('returns [] for non-array input', () => {
    expect(sanitizePolyline(undefined as unknown as PolylinePoint[])).toEqual([]);
  });
});

describe('getPolylineLength', () => {
  it('measures straight and multi-VIA paths', () => {
    expect(getPolylineLength(straight)).toEqual(100);
    expect(getPolylineLength(multiVia)).toEqual(300);
  });

  it('is 0 for empty, single-point, and zero-length input', () => {
    expect(getPolylineLength([])).toEqual(0);
    expect(getPolylineLength([[5, 5]])).toEqual(0);
    expect(
      getPolylineLength([
        [5, 5],
        [5, 5],
      ])
    ).toEqual(0);
  });

  it('ignores non-finite points instead of returning NaN', () => {
    expect(getPolylineLength([[0, 0], [NaN, NaN] as PolylinePoint, [100, 0]])).toEqual(100);
  });
});

describe('getPointAtProgress', () => {
  it('places progress 0 / 0.5 / 1 on a straight path', () => {
    expect(getPointAtProgress(straight, 0)).toEqual([0, 0]);
    expect(getPointAtProgress(straight, 0.5)).toEqual([50, 0]);
    expect(getPointAtProgress(straight, 1)).toEqual([100, 0]);
  });

  it('follows the full multi-VIA geometry, not the endpoint chord', () => {
    // 300 total: 0.5 -> 150 along = 50 into the second (vertical) segment.
    expect(getPointAtProgress(multiVia, 0.5)).toEqual([100, 50]);
    // 0.25 -> 75 along = still on the first segment.
    expect(getPointAtProgress(multiVia, 0.25)).toEqual([75, 0]);
    // 0.75 -> 225 along = 25 into the last segment.
    expect(getPointAtProgress(multiVia, 0.75)).toEqual([125, 100]);
  });

  it('clamps out-of-range progress to the endpoints', () => {
    expect(getPointAtProgress(multiVia, -3)).toEqual([0, 0]);
    expect(getPointAtProgress(multiVia, 42)).toEqual([200, 100]);
    expect(getPointAtProgress(multiVia, NaN)).toEqual([0, 0]);
  });

  it('returns finite fallbacks for degenerate paths', () => {
    expect(getPointAtProgress([], 0.5)).toEqual([0, 0]);
    expect(getPointAtProgress([[7, 9]], 0.5)).toEqual([7, 9]);
    expect(
      getPointAtProgress(
        [
          [7, 9],
          [7, 9],
        ],
        0.5
      )
    ).toEqual([7, 9]);
  });

  it('skips zero-length segments (repeated points) without NaN', () => {
    const repeated: PolylinePoint[] = [
      [0, 0],
      [50, 0],
      [50, 0],
      [100, 0],
    ];
    const p = getPointAtProgress(repeated, 0.5);
    expect(p[0]).toEqual(50);
    expect(Number.isFinite(p[1])).toBe(true);
  });

  it('never returns NaN even for hostile input', () => {
    const hostile = [[NaN, NaN], [Infinity, 3], [0, 0], [10, 0]] as PolylinePoint[];
    const p = getPointAtProgress(hostile, 0.5);
    expect(Number.isFinite(p[0])).toBe(true);
    expect(Number.isFinite(p[1])).toBe(true);
  });
});

describe('getTangentAtProgress', () => {
  it('returns the segment direction as a unit vector', () => {
    expect(getTangentAtProgress(straight, 0.5)).toEqual([1, 0]);
    expect(getTangentAtProgress(multiVia, 0.5)).toEqual([0, 1]);
  });

  it('falls back to [1, 0] for degenerate paths', () => {
    expect(getTangentAtProgress([], 0.5)).toEqual([1, 0]);
    expect(getTangentAtProgress([[3, 3]], 0.5)).toEqual([1, 0]);
    expect(
      getTangentAtProgress(
        [
          [3, 3],
          [3, 3],
        ],
        0.5
      )
    ).toEqual([1, 0]);
  });

  it('skips zero-length segments', () => {
    const repeated: PolylinePoint[] = [
      [0, 0],
      [0, 0],
      [0, 100],
    ];
    expect(getTangentAtProgress(repeated, 0.1)).toEqual([0, 1]);
  });
});

describe('getParallelOffsetPath', () => {
  it('offsets a horizontal line by the normal', () => {
    expect(getParallelOffsetPath(straight, 10)).toEqual([
      [0, -10],
      [100, -10],
    ]);
    expect(getParallelOffsetPath(straight, -10)).toEqual([
      [0, 10],
      [100, 10],
    ]);
  });

  it('places the corner vertex at the true miter point on a right-angle bend', () => {
    const corner: PolylinePoint[] = [
      [0, 0],
      [100, 0],
      [100, 100],
    ];
    const off = getParallelOffsetPath(corner, 10);
    expect(off).toHaveLength(3);
    // Endpoints use their segment normal.
    expect(off[0]).toEqual([0, -10]);
    expect(off[2]).toEqual([110, 100]);
    // The corner must sit on the intersection of the two offset lines
    // (y = -10 and x = 110), NOT at the pinched averaged-normal point
    // (~[107.07, -7.07]) — otherwise parallel tracks converge at bends.
    expect(off[1][0]).toBeCloseTo(110, 10);
    expect(off[1][1]).toBeCloseTo(-10, 10);
  });

  it('caps the miter at sharp bends instead of shooting toward infinity', () => {
    const hairpin: PolylinePoint[] = [
      [0, 0],
      [100, 0],
      [0, 1], // ~179° turn
    ];
    const off = getParallelOffsetPath(hairpin, 10);
    // Miter limit 4: the corner may extend to at most 4x the offset distance.
    const dist = Math.hypot(off[1][0] - 100, off[1][1] - 0);
    expect(dist).toBeLessThanOrEqual(40 + 1e-9);
    for (const p of off) {
      expect(Number.isFinite(p[0])).toBe(true);
      expect(Number.isFinite(p[1])).toBe(true);
    }
  });

  it('is the identity for zero/non-finite offsets and degenerate paths', () => {
    expect(getParallelOffsetPath(straight, 0)).toEqual(straight);
    expect(getParallelOffsetPath(straight, NaN)).toEqual(straight);
    expect(getParallelOffsetPath([[1, 1]], 10)).toEqual([[1, 1]]);
    expect(
      getParallelOffsetPath(
        [
          [1, 1],
          [1, 1],
        ],
        10
      )
    ).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it('never produces NaN, including reversal joints', () => {
    const reversal: PolylinePoint[] = [
      [0, 0],
      [100, 0],
      [0, 0],
    ];
    for (const p of getParallelOffsetPath(reversal, 10)) {
      expect(Number.isFinite(p[0])).toBe(true);
      expect(Number.isFinite(p[1])).toBe(true);
    }
  });
});
