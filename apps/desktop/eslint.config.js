import config from "@lfc/config/eslint";

export default [
  ...config,
  {
    // `vite.config.ts` derleme anında package.json sürümüyle dolduruyor;
    // kaynakta tanımı yok, bu yüzden ESLint'e ayrıca bildiriliyor.
    languageOptions: {
      globals: { __APP_VERSION__: "readonly" }
    }
  }
];
