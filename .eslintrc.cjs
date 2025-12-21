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
    "plugin:sonarjs/recommended",
    "prettier",
  ],
  rules: {
    complexity: ["error", 10],
    "max-depth": ["error", 4],
    "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
    "no-console": "off",
  },
};
