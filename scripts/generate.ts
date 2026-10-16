// Engine-free generation for restricted/offline build environments.
// This invokes Prisma's pinned generator API without the CLI's unused Rust download.
import "dotenv/config";
import internals from "@prisma/internals";
const { getGenerators } = internals;
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const generators = await getGenerators({
  schemaPath: "prisma/schema.prisma",
  skipDownload: true,
  registry: {
    "prisma-client-js": {
      type: "rpc",
      generatorPath: require.resolve("@prisma/client/generator-build/index.js"),
      isNode: true,
    },
  },
});
try {
  for (const generator of generators) await generator.generate();
  console.log("Generated engine-free Prisma client.");
} finally {
  for (const generator of generators) generator.stop();
}
