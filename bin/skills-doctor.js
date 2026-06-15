#!/usr/bin/env node

import module from "node:module";

if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Compile cache is an optimization; startup must not depend on it.
  }
}

const { runCli } = await import("../dist/cli/index.js");
await runCli();
