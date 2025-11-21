/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality, LiveServerMessage, Blob } from '@google/genai';

// --- DOM ELEMENTS ---
const startStopButton = document.getElementById('start-stop-button') as HTMLButtonElement;
const audioSelect = document.getElementById('audio-input-select') as HTMLSelectElement;
const inputLangSelect = document.getElementById('input-lang-select') as HTMLSelectElement;
const outputLangSelect = document.getElementById('output-lang-select') as HTMLSelectElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const userTranscriptDiv = document.getElementById('user-transcript') as HTMLDivElement;
const modelTranscriptDiv = document.getElementById('model-transcript') as HTMLDivElement;
const userTranscriptTitle = document.getElementById('user-transcript-title') as HTMLHeadingElement;
const modelTranscriptTitle = document.getElementById('model-transcript-title') as HTMLHeadingElement;


// --- STATE MANAGEMENT ---
let session: { close: () => void; } | null = null;
let mediaStream: MediaStream | null = null;
let inputAudioContext: AudioContext | null = null;
let outputAudioContext: AudioContext | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let mediaStreamSource: MediaStreamAudioSourceNode | null = null;
let nextStartTime = 0;
const outputSources = new Set<AudioBufferSourceNode>();
let currentInputTranscription = '';
let currentOutputTranscription = '';
let fullUserTranscript = '';
let fullModelTranscript = '';
const MAX_TRANSCRIPT_LINES = 6;


// --- GEMINI API SETUP ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- AUDIO PROCESSING HELPERS ---

/** Encodes raw audio Uint8Array into a base64 string. */
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decodes a base64 string into a Uint8Array. */
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Decodes raw PCM audio data into an AudioBuffer for playback. */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/** Creates a Blob object for sending to the Gemini API. */
function createBlob(data: Float32Array): Blob {
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

// --- UI & SESSION LOGIC ---

/** Updates the titles of the transcript boxes based on selected languages. */
function updateTranscriptTitles() {
    const inputLang = inputLangSelect.value;
    const outputLang = outputLangSelect.value;
    userTranscriptTitle.textContent = `You (${inputLang})`;
    modelTranscriptTitle.textContent = `Translation (${outputLang})`;
}

/** Populates the audio input device selector. */
async function populateAudioDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission early
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputDevices = devices.filter(device => device.kind === 'audioinput');

    audioSelect.innerHTML = '';
    if (audioInputDevices.length === 0) {
      audioSelect.innerHTML = '<option>No microphones found</option>';
      startStopButton.disabled = true;
      return;
    }
    
    audioInputDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${audioSelect.length + 1}`;
      audioSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Error enumerating audio devices:', err);
    statusDiv.textContent = 'Error: Could not list microphones. Check permissions.';
  }
}

/** Starts the live session with Gemini. */
async function startSession() {
  startStopButton.disabled = true;
  statusDiv.textContent = 'Status: Connecting...';

  try {
    // Get microphone access
    const selectedDeviceId = audioSelect.value;
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
      // Ideal settings for voice transcription
      sampleRate: 16000,
      channelCount: 1,
     }
    });

    // Create AudioContexts
    inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const inputLang = inputLangSelect.value;
    const outputLang = outputLangSelect.value;
    const systemInstruction = `You are a simultaneous interpreter. Your ONLY task is to listen to the user speaking ${inputLang} and immediately translate it into spoken ${outputLang}. DO NOT wait for the user to pause. Translate word-for-word or phrase-by-phrase as you hear it. Your output must be continuous and overlap with the user's speech. Latency is the highest priority; begin translating instantly.`;

    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 0 },
      },
      callbacks: {
        onopen: () => {
          statusDiv.textContent = `Status: Connected. Start speaking ${inputLang}.`;
          startStopButton.textContent = 'Stop Session';
          startStopButton.classList.add('stop');
          startStopButton.disabled = false;

          // Start streaming audio from microphone
          mediaStreamSource = inputAudioContext.createMediaStreamSource(mediaStream);
          scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
          
          scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            sessionPromise.then((session) => {
              session.sendRealtimeInput({ media: pcmBlob });
            });
          };
          
          mediaStreamSource.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContext.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          handleServerMessage(message);
        },
        onerror: (err: ErrorEvent) => {
          console.error('Session error:', err);
          statusDiv.textContent = `Error: ${err.message}. Please try again.`;
          stopSession();
        },
        onclose: () => {
          console.log('Session closed.');
          stopSession(true); // Stop without trying to close the session again
        },
      },
    });

    session = await sessionPromise;
  } catch (err) {
    console.error('Failed to start session:', err);
    statusDiv.textContent = 'Error: Could not start session. Check permissions.';
    stopSession();
  }
}

/** Handles incoming messages from the server. */
async function handleServerMessage(message: LiveServerMessage) {
    // Determine if user has scrolled up, to prevent auto-scrolling
    const userScrolledUp = userTranscriptDiv.scrollHeight - userTranscriptDiv.scrollTop > userTranscriptDiv.clientHeight + 20;
    const modelScrolledUp = modelTranscriptDiv.scrollHeight - modelTranscriptDiv.scrollTop > modelTranscriptDiv.clientHeight + 20;

    // Handle transcriptions
    if (message.serverContent?.inputTranscription) {
        currentInputTranscription += message.serverContent.inputTranscription.text;
        userTranscriptDiv.innerHTML = fullUserTranscript + `<span class="live-text">${currentInputTranscription}</span>`;
    }
    if (message.serverContent?.outputTranscription) {
        currentOutputTranscription += message.serverContent.outputTranscription.text;
        modelTranscriptDiv.innerHTML = fullModelTranscript + `<span class="live-text">${currentOutputTranscription}</span>`;
    }
    if (message.serverContent?.turnComplete) {
        // Add the completed line to history
        fullUserTranscript += currentInputTranscription + '<br>';
        fullModelTranscript += currentOutputTranscription + '<br>';

        // Trim history to MAX_LINES
        let userLines = fullUserTranscript.split('<br>').filter(line => line.trim() !== '');
        if (userLines.length > MAX_TRANSCRIPT_LINES) {
            fullUserTranscript = userLines.slice(-MAX_TRANSCRIPT_LINES).join('<br>') + '<br>';
        }
        let modelLines = fullModelTranscript.split('<br>').filter(line => line.trim() !== '');
        if (modelLines.length > MAX_TRANSCRIPT_LINES) {
            fullModelTranscript = modelLines.slice(-MAX_TRANSCRIPT_LINES).join('<br>') + '<br>';
        }

        // Reset current transcription and update display
        currentInputTranscription = '';
        currentOutputTranscription = '';
        userTranscriptDiv.innerHTML = fullUserTranscript;
        modelTranscriptDiv.innerHTML = fullModelTranscript;
    }
    
    // Auto-scroll logic
    if (!userScrolledUp) {
       userTranscriptDiv.scrollTop = userTranscriptDiv.scrollHeight;
    }
    if (!modelScrolledUp) {
       modelTranscriptDiv.scrollTop = modelTranscriptDiv.scrollHeight;
    }

    // Handle audio output
    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio && outputAudioContext) {
        nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
        const audioBuffer = await decodeAudioData(
            decode(base64Audio),
            outputAudioContext,
            24000,
            1,
        );

        const source = outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = 1.15; // Increase speech speed to 115%
        source.connect(outputAudioContext.destination);
        source.addEventListener('ended', () => {
            outputSources.delete(source);
        });

        source.start(nextStartTime);
        nextStartTime += audioBuffer.duration / source.playbackRate.value;
        outputSources.add(source);
    }
    
    // Handle interruption
    if (message.serverContent?.interrupted) {
        for (const source of outputSources.values()) {
            source.stop();
            outputSources.delete(source);
        }
        nextStartTime = 0;
    }
}


/** Stops the live session and cleans up resources. */
function stopSession(sessionAlreadyClosed = false) {
  if (session && !sessionAlreadyClosed) {
    session.close();
  }
  session = null;

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (mediaStreamSource) {
    mediaStreamSource.disconnect();
    mediaStreamSource = null;
  }
  if (inputAudioContext && inputAudioContext.state !== 'closed') {
    inputAudioContext.close();
    inputAudioContext = null;
  }
  if (outputAudioContext && outputAudioContext.state !== 'closed') {
    outputAudioContext.close();
    outputAudioContext = null;
  }
  
  // Reset transcripts
  fullUserTranscript = '';
  fullModelTranscript = '';
  currentInputTranscription = '';
  currentOutputTranscription = '';
  userTranscriptDiv.innerHTML = '';
  modelTranscriptDiv.innerHTML = '';


  startStopButton.textContent = 'Start Session';
  startStopButton.classList.remove('stop');
  startStopButton.disabled = false;
  statusDiv.textContent = 'Status: Disconnected';
}

/** Toggles between starting and stopping the session. */
function toggleSession() {
  if (session) {
    stopSession();
  } else {
    startSession();
  }
}

// --- INITIALIZATION ---
window.addEventListener('load', async () => {
  await populateAudioDevices();
  startStopButton.addEventListener('click', toggleSession);
  inputLangSelect.addEventListener('change', updateTranscriptTitles);
  outputLangSelect.addEventListener('change', updateTranscriptTitles);
  navigator.mediaDevices.ondevicechange = populateAudioDevices;
  updateTranscriptTitles(); // Set initial titles
});
