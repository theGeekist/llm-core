import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";

const sourceFiles = ["**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}"];
const typescriptFiles = ["**/*.{cts,mts,ts,tsx}"];
const testAndToolingFiles = [
  "**/tests/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
  "docs/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
  "examples/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
  "scripts/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
];

const rulesFrom = (configuration) => configuration.rules ?? {};
const warningRules = (rules) =>
  Object.fromEntries(
    Object.keys(rules).map((rule) => {
      const configured = rules[rule];
      if (Array.isArray(configured)) {
        if (configured[0] === "off" || configured[0] === 0) return [rule, "off"];
        return [rule, ["warn", ...configured.slice(1)]];
      }
      if (configured === "off" || configured === 0) return [rule, "off"];
      return [rule, "warn"];
    }),
  );

const typescriptRecommendedRules = {
  ...rulesFrom(tsPlugin.configs["flat/eslint-recommended"]),
  ...rulesFrom(tsPlugin.configs["flat/recommended"][2]),
};
const typedRecommendedRules = warningRules(
  rulesFrom(tsPlugin.configs["flat/recommended-type-checked-only"][2]),
);
const typedProduction = (name, files, project, ignores = []) => ({
  name,
  files,
  ignores,
  languageOptions: {
    parserOptions: {
      project: [project],
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    ...typedRecommendedRules,
    "@typescript-eslint/require-await": "off",
  },
});

export default [
  {
    name: "workspace/ignores",
    ignores: [
      "**/.turbo/**",
      "**/.vitepress/cache/**",
      "**/coverage/**",
      "**/dist/**",
      "**/generated/**",
      "**/node_modules/**",
      ".claude/**",
      ".codex/**",
      ".gitnexus/**",
      ".worktrees/**",
      "assistant-ui/**",
      "codex/**",
      "copilot-sdk/**",
      "context/**",
      "llm-core/**",
      "packages/aifsd/docs/**",
      "pipeline/**",
    ],
  },
  {
    name: "workspace/javascript-and-typescript",
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.es2025,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      sourceType: "module",
    },
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      sonarjs,
      unicorn,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...warningRules(sonarjs.configs.recommended.rules),
      "consistent-return": ["error", { treatUndefinedAsUnspecified: true }],
      "max-depth": ["warn", 3],
      "max-lines": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
      "max-nested-callbacks": ["warn", 3],
      "max-params": ["error", 3],
      "no-console": "off",
      "no-fallthrough": "error",
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn",
      "sonarjs/cognitive-complexity": ["warn", 10],
      "sonarjs/array-constructor": "off",
      "sonarjs/arrow-function-convention": "off",
      "sonarjs/cyclomatic-complexity": "off",
      "sonarjs/destructuring-assignment-syntax": "off",
      "sonarjs/elseif-without-else": "off",
      "sonarjs/expression-complexity": "off",
      "sonarjs/file-header": "off",
      "sonarjs/function-return-type": "off",
      "sonarjs/nested-control-flow": "off",
      "sonarjs/no-alphabetical-sort": "off",
      "sonarjs/no-collapsible-if": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-empty-test-file": "off",
      "sonarjs/no-implicit-dependencies": "off",
      "sonarjs/no-inconsistent-returns": "off",
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/no-nested-functions": "warn",
      "sonarjs/no-nested-incdec": "off",
      "sonarjs/no-reference-error": "off",
      "sonarjs/no-wildcard-import": "off",
      "sonarjs/prefer-regexp-exec": "off",
      "sonarjs/shorthand-property-grouping": "off",
      "sonarjs/strings-comparison": "off",
      "sonarjs/too-many-break-or-continue-in-loop": "off",
      "sonarjs/variable-name": "off",
      "sonarjs/void-use": "off",
      "require-await": "off",
      "unicorn/no-negated-condition": "warn",
      "unicorn/no-nested-ternary": "warn",
      "unicorn/prefer-switch": "warn",
    },
  },
  {
    name: "workspace/typescript",
    files: typescriptFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      ...typescriptRecommendedRules,
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { fixStyle: "inline-type-imports", prefer: "type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/require-await": "off",
    },
  },
  typedProduction(
    "workspace/typed-production/strict-json",
    ["packages/strict-json/index.ts", "packages/strict-json/src/**/*.{ts,tsx}"],
    "packages/strict-json/tsconfig.eslint.json",
  ),
  typedProduction(
    "workspace/typed-production/llm-core",
    ["packages/llm-core/index.ts", "packages/llm-core/src/**/*.{ts,tsx}"],
    "packages/llm-core/tsconfig.eslint.json",
  ),
  typedProduction(
    "workspace/typed-production/aifsd",
    ["packages/aifsd/src/**/*.{ts,tsx}"],
    "packages/aifsd/tsconfig.eslint.json",
  ),
  typedProduction(
    "workspace/typed-production/headless-workbench",
    ["apps/aifsd-headless-workbench/*.ts"],
    "apps/aifsd-headless-workbench/tsconfig.json",
    ["apps/aifsd-headless-workbench/*.test.ts"],
  ),
  typedProduction(
    "workspace/typed-production/characterization-host",
    ["apps/aifsd-project-semantics-characterization/run-neo4j-qualification.ts"],
    "apps/aifsd-project-semantics-characterization/tsconfig.host.json",
  ),
  typedProduction(
    "workspace/typed-production/characterization-mobile",
    ["apps/aifsd-project-semantics-characterization/mobile-consumer.ts"],
    "apps/aifsd-project-semantics-characterization/tsconfig.mobile.json",
  ),
  {
    name: "workspace/test-and-tooling",
    files: testAndToolingFiles,
    rules: {
      "consistent-return": "off",
      "sonarjs/assertions-in-tests": "off",
      "sonarjs/hardcoded-secret-signatures": "off",
      "sonarjs/no-os-command-from-path": "off",
      "sonarjs/prefer-specific-assertions": "off",
    },
  },
  {
    name: "workspace/configuration-tooling",
    files: ["eslint.config.js", "docs/.vitepress/**/*.{js,mjs,mts,ts}"],
    rules: { "max-params": "off" },
  },
  {
    name: "workspace/browser-applications",
    files: ["apps/**/*.{js,jsx,ts,tsx}", "docs/snippets/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    name: "workspace/browser-quality-tooling",
    files: ["scripts/check-docs-mermaid.mjs"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    name: "workspace/functional-compose",
    files: ["packages/llm-core/src/shared/fp.ts"],
    rules: {
      "max-params": "off",
    },
  },
  {
    name: "workspace/commonjs",
    files: ["**/*.{cjs,cts}"],
    languageOptions: {
      sourceType: "commonjs",
    },
  },
  {
    name: "workspace/aifsd-test-exceptions",
    files: ["packages/aifsd/tests/config/apply-sequencing.test.ts"],
    rules: { "sonarjs/no-nested-functions": "off" },
  },
  {
    name: "workspace/aifsd-password-fixtures",
    files: ["packages/aifsd/tests/config/manifest-adversarial.test.ts"],
    rules: { "sonarjs/no-hardcoded-passwords": "off" },
  },
  {
    name: "workspace/aifsd-path-fixtures",
    files: ["packages/aifsd/tests/config/plan-adversarial.test.ts"],
    rules: { "sonarjs/publicly-writable-directories": "off" },
  },
  {
    name: "workspace/aifsd-runtime-fixtures",
    files: ["packages/aifsd/tests/config/runtime-p1-adversarial.test.ts"],
    rules: { "max-params": "off" },
  },
  prettier,
];
