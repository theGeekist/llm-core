// #region docs
import { Adapter } from "#adapters";
import type { Blob, SpeechCall, SpeechModel, SpeechResult } from "#adapters";

const emptyAudio: Blob = { bytes: new Uint8Array(), contentType: "audio/wav" };

const generateSpeech = (_call: SpeechCall): SpeechResult => ({
  audio: emptyAudio,
});

const speechModel: SpeechModel = {
  generate: generateSpeech,
};

const speech = Adapter.speech("custom.speech", speechModel);
// #endregion docs

void speech;
