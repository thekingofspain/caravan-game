import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";

export default tseslint.config(
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            "e2e/**",
            "public/**",
            ".playwright*/**",
            "test/**",
            "scripts/**",
            "vite.config.*",
            "eslint.config.*",
            "svgo.config.*"
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        plugins: {
            "@stylistic": stylistic
        },
        rules: {
            "@stylistic/no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0, maxBOF: 0 }],
            "@stylistic/padded-blocks": ["error", "never"],
            "@stylistic/padding-line-between-statements": [
                "error",
                { blankLine: "always", prev: "*", next: "return" },
                { blankLine: "always", prev: "*", next: "throw" },
                { blankLine: "always", prev: "directive", next: "*" },
                { blankLine: "any", prev: "directive", next: "directive" },
                { blankLine: "always", prev: "import", next: "*" },
                { blankLine: "any", prev: "import", next: "import" },
                { blankLine: "always", prev: "cjs-import", next: "*" },
                { blankLine: "any", prev: "cjs-import", next: "cjs-import" },
                { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
                { blankLine: "any", prev: ["const", "let", "var"], next: ["const", "let", "var"] },
                { blankLine: "always", prev: "if", next: "*" }
            ],
            "@stylistic/lines-between-class-members": ["error", "always"],
            "@stylistic/lines-around-comment": [
                "error",
                {
                    beforeBlockComment: true,
                    afterBlockComment: true,
                    beforeLineComment: true,
                    afterLineComment: true,
                    allowBlockStart: true,
                    allowBlockEnd: true,
                    allowObjectStart: true,
                    allowObjectEnd: true,
                    allowArrayStart: true,
                    allowArrayEnd: true,
                    allowClassStart: true,
                    allowClassEnd: true
                }
            ]
        }
    },
    {
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        "*.js",
                        "*.mjs",
                        "*.cjs",
                        "vite.config.ts",
                        "eslint.config.js"
                    ]
                },
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            "prefer-const": "error"
        }
    }
);
