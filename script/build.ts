import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// These packages need to be bundled so that all path aliases (@shared/*)
// and TypeScript imports are fully resolved into a single file.
// This avoids ESM resolution issues on Vercel serverless.
const alwaysBundle = [
  "@google/genai",
  "@google/generative-ai",
  "@libsql/client",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-session",
  "cookie-parser",
  "jsonwebtoken",
  "passport",
  "passport-local",
  "ws",
  "zod",
  "zod-validation-error",
  "memorystore",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server (production entry)...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  // Externalize everything except our always-bundle list
  const externals = allDeps.filter((dep) => !alwaysBundle.includes(dep));

  // Build the main server entry (for 'npm start' / non-Vercel)
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Build the Vercel serverless entry — fully bundled, no external path aliases
  console.log("building server (Vercel serverless entry)...");
  await esbuild({
    entryPoints: ["server/vercel.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",   // CommonJS avoids all ESM resolution issues on Vercel
    outfile: "dist/api/index.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: false,   // Keep readable for debugging
    // Bundle everything — this resolves @shared/*, relative imports, all aliases
    external: ["bufferutil", "utf-8-validate"],  // Only native optionals
    logLevel: "info",
  });

  console.log("Build complete!");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
