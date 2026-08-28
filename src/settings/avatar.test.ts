import { describe, expect, it } from "vitest";

import { AvatarInputError, avatarDataUrlFromUpload, MAX_AVATAR_BYTES } from "./avatar";

describe("avatarDataUrlFromUpload", () => {
  it("accepts a PNG matching its declared content type", async () => {
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
      "avatar.png",
      { type: "image/png" },
    );

    await expect(avatarDataUrlFromUpload(file)).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it("rejects content that does not match the declared image type", async () => {
    const file = new File(["not an image"], "avatar.png", { type: "image/png" });
    await expect(avatarDataUrlFromUpload(file)).rejects.toBeInstanceOf(AvatarInputError);
  });

  it("rejects files larger than one megabyte", async () => {
    const file = new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "avatar.jpg", {
      type: "image/jpeg",
    });
    await expect(avatarDataUrlFromUpload(file)).rejects.toThrow("maksymalnie 1 MB");
  });
});
