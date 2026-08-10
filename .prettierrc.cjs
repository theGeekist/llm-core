module.exports = {
  printWidth: 100,
  trailingComma: "all",
  overrides: [
    {
      files: ["docs/**/*.md", "README.md", "packages/*/README.md", "packages/*/CHANGELOG.md"],
      options: {
        proseWrap: "never",
      },
    },
  ],
};
