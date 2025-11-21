import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { encode } from '../utils/audio';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface LiveServiceHandlers {
  onOpen?: () => void;
  onMessage?: (message: LiveServerMessage) => void;
  onError?: (error: ErrorEvent) => void;
  onClose?: (event: CloseEvent) => void;
}

export const connectToLiveService = (
  sourceLangName: string,
  targetLangName: string,
  handlers: LiveServiceHandlers,
): Promise<any> => {
  // LATENCY FACTOR 2: AI System Instruction
  // This is the MOST CRITICAL factor for controlling the AI's response speed.
  // By explicitly commanding the model to act as a "hyper-efficient, low-latency"
  // interpreter and to NEVER wait for a full sentence, we force it to begin
  // translating and speaking the very instant it understands a word or phrase.
  // This prompt engineering is key to the "simultaneous" feeling of the translation.
  const systemInstruction = `You are a UN-style simultaneous interpreter. Your ONLY job is to translate from ${sourceLangName} to ${targetLangName} with the lowest possible latency.

**CRITICAL, NON-NEGOTIABLE RULES:**
1.  **INTERRUPT AND OVERLAP:** You MUST start speaking your translation the moment you understand a phrase. Your voice MUST overlap with the user's voice. This is not a conversation; it is a simultaneous broadcast.
2.  **NEVER, EVER WAIT:** Do NOT wait for the user to pause. Do NOT wait for a complete sentence. Waiting is a CRITICAL FAILURE. Your goal is ZERO conversational delay.
3.  **CONTINUOUS STREAM:** Output a continuous, non-stop stream of translated words. It is better to be slightly grammatically imperfect but instant, than perfect but delayed.
4.  **TRANSLATION ONLY:** Output ONLY the translated audio and text. No commentary, no explanations, no conversational filler.
5.  **ALWAYS PROVIDE TRANSCRIPTS:** You must always provide text transcripts for both the original speech (input) and your translation (output).`;

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: () => {
        console.log('Live session opened');
        handlers.onOpen?.();
      },
      onmessage: (message: LiveServerMessage) => {
        handlers.onMessage?.(message);
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
      outputAudioTranscription: {},
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
