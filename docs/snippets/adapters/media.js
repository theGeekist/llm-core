// #region docs
import { Adapter } from "#adapters";

/** @type {import("@geekist/llm-core/adapters").Blob} */
const emptyAudio = { bytes: new Uint8Array(), contentType: "audio/wav" };

/** @param {import("@geekist/llm-core/adapters").SpeechCall} _call */
const generateSpeech = (_call) => ({
  audio: emptyAudio,
});

/** @type {import("@geekist/llm-core/adapters").SpeechModel} */
const speechModel = {
  generate: generateSpeech,
};

const speech = Adapter.speech("custom.speech", speechModel);
// #endregion docs

void speech;
