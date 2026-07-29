// #region docs
import { Adapter } from "#adapters";
import type { Blob, ImageCall, ImageModel, ImageResult } from "#adapters";

const emptyImage: Blob = { bytes: new Uint8Array(), contentType: "image/png" };

const generateImage = (_call: ImageCall): ImageResult => ({
  images: [emptyImage],
});

const imageModel: ImageModel = {
  generate: generateImage,
};

const imageAdapter = Adapter.image({ key: "custom.image", value: imageModel });
// #endregion docs

void imageAdapter;
