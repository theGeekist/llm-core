module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "sonarjs"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:sonarjs/recommended-legacy",
    "prettier",
  ],
  rules: {
    "consistent-return": ["error", { treatUndefinedAsUnspecified: true }],
    "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
    "max-params": ["error", 3],
    "no-console": "off",
    "sonarjs/no-nested-conditional": "off",
    "sonarjs/void-use": "off",
    "sonarjs/no-empty-test-file": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }
    ],
  },
  overrides: [
    {
      files: ["docs/**/*.ts", "docs/**/*.js", "tests/**/*.ts", "tests/**/*.js"],
      rules: {
        "consistent-return": "off",
      },
    },
  ],
};
