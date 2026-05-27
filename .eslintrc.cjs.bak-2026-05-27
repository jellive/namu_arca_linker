/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  env: {
    browser: true,
    es2022: true,
    webextensions: true,
    node: true,
  },
  ignorePatterns: [
    "dist/",
    "release/",
    "node_modules/",
    "content.js",
    "content.js.bak",
    "*.html",
    "vite.config.ts",
    "vitest.config.ts",
    "scripts/",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "off",
  },
  overrides: [
    {
      files: ["**/*.test.ts"],
      env: { node: true },
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
};
