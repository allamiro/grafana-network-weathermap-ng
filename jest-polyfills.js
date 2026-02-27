// Polyfill TextEncoder/TextDecoder for jsdom (required by React 18 + @grafana/ui)
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
