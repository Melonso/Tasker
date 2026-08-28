export const MAX_AVATAR_BYTES = 1_048_576;
export const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type AvatarMimeType = (typeof ACCEPTED_AVATAR_TYPES)[number];

export class AvatarInputError extends Error {}

function matchesSignature(bytes: Uint8Array, mimeType: AvatarMimeType) {
  if (mimeType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    );
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export async function avatarDataUrlFromUpload(file: File) {
  if (!file.size) return null;
  if (file.size > MAX_AVATAR_BYTES) {
    throw new AvatarInputError("Avatar może mieć maksymalnie 1 MB.");
  }
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type as AvatarMimeType)) {
    throw new AvatarInputError("Wybierz obraz PNG, JPG lub WebP.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type as AvatarMimeType;
  if (!matchesSignature(bytes, mimeType)) {
    throw new AvatarInputError("Plik nie jest prawidłowym obrazem.");
  }

  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}
