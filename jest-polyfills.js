// Polyfill TextEncoder/TextDecoder for jsdom (required by React 18 + @grafana/ui)
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Stub IntersectionObserver for jsdom (required by @grafana/ui ScrollContainer,
// rendered by Select menus)
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

// Polyfill structuredClone for jest-environment-jsdom (browsers have it since
// 2022; the jsdom environment does not inject Node's global). V8
// serialize/deserialize matches the real semantics (preserves undefined
// properties, Dates, Maps — unlike a JSON round-trip).
if (typeof global.structuredClone !== 'function') {
  const v8 = require('v8');
  global.structuredClone = (value) => v8.deserialize(v8.serialize(value));
}
