import { defaultNodes, getData, theme } from 'testData';
import { DrawnNode, Weathermap } from 'types';
import {
  calculateRectangleAutoHeight,
  calculateRectangleAutoWidth,
  CURRENT_VERSION,
  getSolidFromAlphaColor,
  handleVersionedStateUpdates,
  isSafeUrl,
  measureText,
  nearestMultiple,
  sanitizeUrl,
} from 'utils';

test('getSolidFromAlphaColor', () => {
  expect(getSolidFromAlphaColor('rgba(0, 0, 0, 0.5)', '#ffffff')).toBe('rgb(127.5,127.5,127.5)');
  expect(getSolidFromAlphaColor('#ffffff', '#ffffff')).toBe('#ffffff');
  expect(getSolidFromAlphaColor('rgba(255, 255, 255, 0.5)', '#000000')).toBe('rgb(127.5,127.5,127.5)');
});

// Doesn't work as expected in test env
test('measureText', () => {
  expect(measureText('test', 12)).toHaveProperty('width', 4);
});

test('nearestMultiple', () => {
  expect(nearestMultiple(5, 10)).toBe(10);
  expect(nearestMultiple(43, 10)).toBe(50);
});

test('node calculations', () => {
  let d: DrawnNode = defaultNodes[0] as unknown as DrawnNode;
  let wm: Weathermap = getData(theme);
  d.labelWidth = measureText(d.label!, 12).width;
  expect(calculateRectangleAutoHeight(d, wm)).toBe(18);
  expect(calculateRectangleAutoWidth(d, wm)).toBe(26);

  d.nodeIcon!.size = { width: 40, height: 40 };
  d.nodeIcon!.drawInside = true;

  expect(calculateRectangleAutoHeight(d, wm)).not.toBe(18);
  expect(calculateRectangleAutoWidth(d, wm)).not.toBe(26);
});

test('versioned state updates', () => {
  let wm: Weathermap = getData(theme);
  expect(handleVersionedStateUpdates(wm, theme)).toHaveProperty('version', CURRENT_VERSION);
});

describe('isSafeUrl', () => {
  test('allows safe relative Grafana paths', () => {
    expect(isSafeUrl('/d/abc123/my-dashboard')).toBe(true);
    expect(isSafeUrl('/d/abc123/my-dashboard?var-foo=bar')).toBe(true);
    expect(isSafeUrl('public/plugins/tamirsuliman-weathermap-panel/icons/router.svg')).toBe(true);
    expect(isSafeUrl('./relative/icon.png')).toBe(true);
  });

  test('allows http and https absolute URLs', () => {
    expect(isSafeUrl('http://example.com/dashboard')).toBe(true);
    expect(isSafeUrl('https://example.com/icon.svg')).toBe(true);
    expect(isSafeUrl('HTTPS://EXAMPLE.COM/icon.svg')).toBe(true);
  });

  test('rejects javascript URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    // Obfuscated with embedded control characters / whitespace
    expect(isSafeUrl('java\nscript:alert(1)')).toBe(false);
    expect(isSafeUrl('  javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JavaScript:alert(1)')).toBe(false);
  });

  test('rejects data URLs', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
  });

  test('rejects file URLs', () => {
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  test('rejects other unsafe schemes', () => {
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('blob:https://example.com/uuid')).toBe(false);
    expect(isSafeUrl('ftp://example.com/file')).toBe(false);
  });

  test('rejects protocol-relative URLs', () => {
    expect(isSafeUrl('//evil.com/payload')).toBe(false);
  });

  test('rejects empty and nullish values', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
  });
});

describe('sanitizeUrl', () => {
  test('returns the value when safe', () => {
    expect(sanitizeUrl('https://example.com/icon.svg')).toBe('https://example.com/icon.svg');
    expect(sanitizeUrl('/d/abc123/my-dashboard')).toBe('/d/abc123/my-dashboard');
    expect(sanitizeUrl('  https://example.com/icon.svg  ')).toBe('https://example.com/icon.svg');
  });

  test('returns empty string when unsafe', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeUrl('file:///etc/passwd')).toBe('');
    expect(sanitizeUrl('//evil.com')).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
    expect(sanitizeUrl(null)).toBe('');
  });
});
