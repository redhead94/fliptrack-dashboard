// Local thumbnails keyed by model number (files live in /public/watches).
const known = new Set(["49125", "49850", "69165", "69169", "70408", "70410"]);

export function watchImage(model: string | undefined) {
  const key = (model || "").trim();
  return known.has(key) ? `/watches/${key}.webp` : undefined;
}
