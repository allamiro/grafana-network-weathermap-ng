// jest-dom's matcher types (toBeInTheDocument, toHaveTextContent, ...) only
// register when a TypeScript file references the package. Its runtime setup
// is imported from .config/jest-setup.js, which the type checker doesn't read,
// and since jest-dom 6 the types no longer arrive through @types.
/// <reference types="@testing-library/jest-dom" />
