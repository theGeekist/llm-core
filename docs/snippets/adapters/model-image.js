// #region docs
import { Adapter } from "#adapters";

/** @type {import("@geekist/llm-core/adapters").Blob} */
const emptyImage = { bytes: new Uint8Array(), contentType: "image/png" };

/** @param {import("@geekist/llm-core/adapters").ImageCall} _call */
const generateImage = (_call) => ({
  images: [emptyImage],
});

/** @type {import("@geekist/llm-core/adapters").ImageModel} */
const imageModel = {
  generate: generateImage,
};

const imageAdapter = Adapter.image("custom.image", imageModel);
// #endregion docs

void imageAdapter;
