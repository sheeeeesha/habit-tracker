// eslint-config-next 16 ships native flat configs; `core-web-vitals` already
// bundles the TypeScript rules, so FlatCompat is not needed.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", "out/**", "node_modules/**", "public/sw.js"] },
  ...nextCoreWebVitals,
];

export default config;
