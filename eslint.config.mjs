import nextConfig from "eslint-config-next";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "drizzle/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "out/**",
      "worker-configuration.d.ts"
    ],
  },
  ...nextConfig,
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next/*", "drizzle-orm*", "process"],
              message: "src/domain must remain 100% pure without external frameworks or process access.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name=process][property.name=env]",
          message: "process.env is forbidden in src/domain.",
        },
        {
          selector: "CallExpression[callee.object.name=Date][callee.property.name=now]",
          message: "Date.now() is forbidden in src/domain. Pass timestamps as parameters.",
        },
        {
          selector: "CallExpression[callee.object.name=Math][callee.property.name=random]",
          message: "Math.random() is forbidden in src/domain.",
        },
      ],
    },
  },
];

export default eslintConfig;
