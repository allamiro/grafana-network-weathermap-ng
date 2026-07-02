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
