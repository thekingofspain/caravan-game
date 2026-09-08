import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import stylistic from "@stylistic/eslint-plugin";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";

const regionEndsTight = {
    meta: {
        type: "layout",
        fixable: "whitespace",
        docs: { description: "forbid blank lines directly inside // #region markers" }
    },
    create(context) {
        const source = context.sourceCode;
        const removeLine = (line1) =>
            fixer =>
                fixer.removeRange([
                    source.getIndexFromLoc({ line: line1, column: 0 }),
                    source.getIndexFromLoc({ line: line1 + 1, column: 0 })
                ]);
        return {
            Program() {
                for (const comment of source.getAllComments()) {
                    if (comment.type !== "Line") continue;
                    const text = comment.value.trim();
                    if (/^#region\b/.test(text)) {
                        const next = source.lines[comment.loc.end.line];
                        if (next !== undefined && next.trim() === "")
                            context.report({
                                node: comment,
                                message: "Unexpected blank line after // #region.",
                                fix: removeLine(comment.loc.end.line + 1)
                            });
                    } else if (/^#endregion\b/.test(text)) {
                        const prev = source.lines[comment.loc.start.line - 2];
                        if (prev !== undefined && prev.trim() === "")
                            context.report({
                                node: comment,
                                message: "Unexpected blank line before // #endregion.",
                                fix: removeLine(comment.loc.start.line - 1)
                            });
                    }
                }
            }
        };
    }
};

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
            local: { rules: { "region-ends-tight": regionEndsTight } }
        },
        rules: {
            "local/region-ends-tight": "error"
        }
    },
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
                    allowClassEnd: true,
                    ignorePattern: "#(end)?region"
                }
            ]
        }
    },
    {
        plugins: {
            "simple-import-sort": simpleImportSort
        },
        rules: {
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error"
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
