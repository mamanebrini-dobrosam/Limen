import fs from "node:fs/promises";
import path from "node:path";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import { config } from "../config.js";
import { db, pool, schema } from "../db/client.js";
import { objectStorageName } from "../lib/media.js";

async function migrate() {
  const client = new ObjectStorageClient();
  const assets = await db.select({ storageKey: schema.mediaAssets.storageKey }).from(schema.mediaAssets);
  const root = path.resolve(config.storageDir);
  let uploadedCount = 0;
  let alreadyPresentCount = 0;

  for (const asset of assets) {
    const name = objectStorageName(asset.storageKey);
    const existing = await client.exists(name);
    if (!existing.ok) throw new Error(`Could not check App Storage object ${name}: ${existing.error.message}`);
    if (existing.value) {
      alreadyPresentCount++;
      continue;
    }

    const localFile = path.resolve(root, asset.storageKey);
    if (!localFile.startsWith(`${root}${path.sep}`)) throw new Error(`Invalid media storage key: ${asset.storageKey}`);
    const bytes = await fs.readFile(localFile);
    const result = await client.uploadFromBytes(name, bytes, { compress: false });
    if (!result.ok) throw new Error(`Could not upload App Storage object ${name}: ${result.error.message}`);
    uploadedCount++;
    console.log(`Copied ${asset.storageKey}`);
  }

  console.log(`Migration finished: ${uploadedCount} uploaded, ${alreadyPresentCount} already present.`);
}

try {
  await migrate();
} catch (error) {
  console.error("Media migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
