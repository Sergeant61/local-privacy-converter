import eslint from "@eslint/js";
import eslintPluginSvelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/build/**", "**/.svelte-kit/**", "**/dist-electron/**"]
  },
  {
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ["**/*.ts", "**/*.svelte"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  ...eslintPluginSvelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".svelte"]
      }
    }
  }
);
