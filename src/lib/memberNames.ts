export function deriveSlugBase(displayName: string): string {
  const normalized = displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric with -
    .replace(/^-+|-+$/g, ""); // trim hyphens

  return normalized || "lid";
}

export function deriveInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "L";
  const firstChar = Array.from(trimmed)[0] ?? "L";
  return firstChar.toUpperCase();
}
