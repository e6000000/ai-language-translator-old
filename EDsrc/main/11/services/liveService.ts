
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { encode } from '../utils/audio';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface LiveServiceHandlers {
  onOpen?: () => void;
  onMessage?: (message: LiveServerMessage) => void;
  onError?: (error: ErrorEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onTurnComplete?: (inputText: string, outputText: string) => void;
}

export const connectToLiveService = (
  sourceLangName: string,
  targetLangName: string,
  handlers: LiveServiceHandlers,
): Promise<any> => {
  const systemInstruction = `You are a real-time translator. The user is speaking ${sourceLangName}. 
  Translate their speech to ${targetLangName} and respond with the audio of the translation.
  Also provide the transcription of the user's original speech in ${sourceLangName}.
  Do not add any extra conversation or remarks, just provide the translation.`;

  let currentInputText = '';

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: () => {
        console.log('Live session opened');
        handlers.onOpen?.();
      },
      onmessage: (message: LiveServerMessage) => {
        handlers.onMessage?.(message);

        if (message.serverContent?.inputTranscription) {
            currentInputText = message.serverContent.inputTranscription.text;
        }

        if (message.serverContent?.turnComplete) {
            const outputPlaceholder = `[Audio translation to ${targetLangName}]`;
            handlers.onTurnComplete?.(currentInputText, outputPlaceholder);
            currentInputText = ''; // Reset for the next turn
        }
      },
      onerror: (e: ErrorEvent) => {
        console.error('Live session error:', e);
        handlers.onError?.(e);
      },
      onclose: (e: CloseEvent) => {
        console.log('Live session closed');
        handlers.onClose?.(e);
      },
    },
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: systemInstruction,
    },
  });

  return sessionPromise;
};

export function createAudioBlobForLive(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}
