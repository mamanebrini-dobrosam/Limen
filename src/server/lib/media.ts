import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import { config } from "../config.js";
import { db, schema } from "../db/client.js";
import { bad, randomToken } from "./core.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const OBJECT_PREFIX = "media/";
let objectStorageClient: ObjectStorageClient | undefined;

function localStoragePath(key: string) {
  const root = path.resolve(config.storageDir);
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Invalid media storage key");
  return resolved;
}

export function objectStorageName(key: string) {
  return `${OBJECT_PREFIX}${key}`;
}

function getObjectStorageClient() {
  objectStorageClient ??= new ObjectStorageClient();
  return objectStorageClient;
}

async function writeAsset(storageKey: string, bytes: Buffer) {
  if (config.mediaStorageBackend === "object") {
    const result = await getObjectStorageClient().uploadFromBytes(objectStorageName(storageKey), bytes, { compress: false });
    if (!result.ok) throw new Error(`App Storage upload failed: ${result.error.message}`);
    return;
  }
  await fs.mkdir(path.resolve(config.storageDir), { recursive: true });
  await fs.writeFile(localStoragePath(storageKey), bytes);
}

export async function readAsset(storageKey: string) {
  if (config.mediaStorageBackend === "object") {
    const result = await getObjectStorageClient().downloadAsBytes(objectStorageName(storageKey));
    if (!result.ok) throw new Error(`App Storage download failed: ${result.error.message}`);
    return result.value[0];
  }
  return fs.readFile(localStoragePath(storageKey));
}

/**
 * Prima samo stvarne fotografije (provjera po sadržaju, ne po imenu datoteke).
 * Slika se ponovo kodira: time se uklanjaju EXIF, GPS i ostali metapodaci.
 */
export async function storeImage(buf: Buffer, ownerId: string, purpose: "chat" | "gallery") {
  if (buf.length > config.maxImageBytes) throw bad("too_large", "Fotografija je prevelika (najviše 10 MB).");
  const ft = await fileTypeFromBuffer(buf);
  if (!ft || !ALLOWED.has(ft.mime)) throw bad("bad_type", "Dozvoljene su samo fotografije (JPEG, PNG, WebP). Video nije dozvoljen.");
  let out: Buffer; let info: { width: number; height: number };
  try {
    ({ data: out, info } = await sharp(buf, { limitInputPixels: 40_000_000 })
      .rotate() // primijeni orijentaciju prije uklanjanja metapodataka
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true }) // bez .withMetadata() → metapodaci se ne prenose
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw bad("bad_image", "Fotografiju nije moguće obraditi.");
  }
  const key = `${randomToken(18)}.jpg`;
  await writeAsset(key, out);
  try {
    const [asset] = await db.insert(schema.mediaAssets).values({
      ownerId, purpose, storageKey: key, mime: "image/jpeg", bytes: out.length, width: info.width, height: info.height,
    }).returning();
    return asset;
  } catch (error) {
    await deleteAssetFile(key);
    throw error;
  }
}

export async function copyAsset(assetId: string, newOwnerId: string, purpose: "gallery") {
  const [a] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, assetId));
  if (!a) throw bad("not_found", "Fotografija ne postoji.");
  const key = `${randomToken(18)}.jpg`;
  await writeAsset(key, await readAsset(a.storageKey));
  try {
    const [copy] = await db.insert(schema.mediaAssets).values({
      ownerId: newOwnerId, purpose, storageKey: key, mime: a.mime, bytes: a.bytes, width: a.width, height: a.height,
    }).returning();
    return copy;
  } catch (error) {
    await deleteAssetFile(key);
    throw error;
  }
}

export async function deleteAssetFile(storageKey: string) {
  if (config.mediaStorageBackend === "object") {
    const result = await getObjectStorageClient().delete(objectStorageName(storageKey), { ignoreNotFound: true });
    if (!result.ok) throw new Error(`App Storage delete failed: ${result.error.message}`);
    return;
  }
  await fs.rm(localStoragePath(storageKey), { force: true });
}
