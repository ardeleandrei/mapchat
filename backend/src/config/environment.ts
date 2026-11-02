import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Preserve optional backend-local overrides; the root .env is the shared default.
// Deployment/shell variables always win. Paths work in both src/ and dist/.
config({
  path: [
    fileURLToPath(new URL("../../.env", import.meta.url)),
    fileURLToPath(new URL("../../../.env", import.meta.url)),
  ],
  quiet: true,
});
