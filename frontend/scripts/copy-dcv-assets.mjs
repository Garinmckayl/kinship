import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(
  root,
  "node_modules/bedrock-agentcore/dist/src/tools/browser/live-view/nice-dcv-web-client-sdk",
);
const destination = resolve(root, "public/nice-dcv-web-client-sdk");

await mkdir(destination, { recursive: true });
await Promise.all([
  cp(resolve(source, "dcvjs-esm"), resolve(destination, "dcvjs-esm"), { recursive: true, force: true }),
  cp(resolve(source, "dcv-ui"), resolve(destination, "dcv-ui"), { recursive: true, force: true }),
]);
