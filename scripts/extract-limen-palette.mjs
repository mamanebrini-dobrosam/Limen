// Reproducible, non-generative crops: no red marks, AI redraw or symbol changes.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const source = "attached_assets/0_Limen_Logo-Farbpalette_im_Raster_(1)_1793015058984.png";
const out = "src/client/public/brand/palette";
const xs = [0, 209, 412, 614, 818, 1024], ys = [0, 165, 332, 499, 683];
const selected = [
  [1, 2, "smaragd"], [1, 3, "petrol"], [1, 5, "slonovaca"],
  [2, 2, "grafit"], [2, 3, "suma"], [3, 1, "ponoc"],
  [3, 2, "koralj"], [3, 4, "bakar"], [3, 5, "rubin"],
  [4, 1, "sunce"], [4, 4, "ametist"], [4, 5, "obsidijan"],
];
const { width, height } = await sharp(source).metadata();
if (width !== 1536 || height !== 1024) throw new Error("Unexpected original reference dimensions");
await mkdir(out, { recursive: true });
for (const [row, column, id] of selected) {
  const left = Math.round(xs[column - 1] * width / 1024) + 5;
  const top = Math.round(ys[row - 1] * height / 683) + 5;
  const right = Math.round(xs[column] * width / 1024) - 5;
  const bottom = Math.round(ys[row] * height / 683) - 5;
  await sharp(source).extract({ left, top, width: right - left, height: bottom - top })
    .png({ compressionLevel: 9 }).toFile(`${out}/${id}.png`);
}
console.log(`Extracted ${selected.length} unaltered logo variants from the unmarked original.`);
