const rules = {
  "complexity": "off",
  "no-new-func": "off",
  "no-sync": "off",
  "no-undefined": "error",
  "no-underscore-dangle": "off",
  "no-void": "off",
  "unicorn/no-array-callback-reference": "off",
  "unicorn/no-array-for-each": "off",
  "unicorn/no-array-reduce": "off",
  "unicorn/prefer-module": "off",
  "unicorn/prefer-switch": "off",
};
const extensions = [".js", ".jsx", ".jx", ".ts", ".tsx", ".tx"];

// http://eslint.org/docs/user-guide/configuring
module.exports = {
  root: true,
  parser: "@babel/eslint-parser",
  parserOptions: {
    ecmaVersion: 6,
    ecmaFeatures: {
      modules: true,
      jsx: true,
      legacyDecorators: true,
      experimentalObjectRestSpread: true,
    },
    sourceType: "module",
  },
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  extends: [],
  plugins: [
    "import",
    "unicorn",
    "unused-imports",
  ],
  settings: {
    "import/resolver": {
      node: {
        extensions: extensions,
      },
    },
  },
  noInlineConfig: true,
  rules,
  overrides: [
    {
      files: ["*.ts", "*.tsx", "*.tx"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        ecmaVersion: 6,
        ecmaFeatures: {
          modules: true,
          jsx: true,
          legacyDecorators: true,
          experimentalObjectRestSpread: true,
        },
        sourceType: "module",
        project: "./tsconfig.json",
      },
      extends: [
        "lvmcn/typescript",
      ],
      rules,
    },
    {
      "files": [
        "src/handler.ts",
      ],
      "rules": {
        "global-require": "off",
        "import/no-dynamic-require": "off",
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-var-requires": "off",
      }
    },
    {
      files: ["*.d.ts"],
      rules: {
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
    {
      files: ["*.test.ts"],
      globals: {
          "describe": "readonly",
          "test": "readonly",
          "expect": "readonly",
      }
    },
  ],
};
