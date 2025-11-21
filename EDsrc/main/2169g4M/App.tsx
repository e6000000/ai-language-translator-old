import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SUPPORTED_LANGUAGES } from './constants';
import { translateText } from './services/geminiService';
import { connectToLiveService, createAudioBlobForLive, LiveServiceHandlers } from './services/liveService';
import { decode, decodeAudioData } from './utils/audio';
import { GOOGLE_API_KEY, GOOGLE_CLIENT_ID } from './config';
import * as GoogleDriveService from './services/googleDriveService';

import LanguageSelector from './components/LanguageSelector';
import SwapIcon from './components/SwapIcon';
import MicrophoneIcon from './components/MicrophoneIcon';
import AudioInputSelector from './components/AudioInputSelector';
import LevelMeter from './components/LevelMeter';
import DownloadIcon from './components/DownloadIcon';
import GoogleDriveIcon from './components/GoogleDriveIcon';
import FolderUploadIcon from './components/FolderUploadIcon';
import ZipUploadIcon from './components/ZipUploadIcon';
import SettingsPanel from './components/SettingsPanel';
import HamburgerIcon from './components/HamburgerIcon';

declare const JSZip: any;

interface FavoritePair {
  source: string;
  target: string;
}

const App: React.FC = () => {
  // Text translation state
  const [sourceLang, setSourceLang] = useState<string>('de');
  const [targetLang, setTargetLang] = useState<string>('en');
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live translation state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [userInputHistory, setUserInputHistory] = useState<string>('');
  const [translationHistory, setTranslationHistory] = useState<string>('');
  const [startRecOnFavClick, setStartRecOnFavClick] = useState(false);
  
  // Settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [favoritePairs, setFavoritePairs] = useState<FavoritePair[]>([]);

  // Audio processing refs
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  
  // File upload refs
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  // Google Drive State
  const [isDriveReady, setIsDriveReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [driveUser, setDriveUser] = useState<any>(null);
  const [driveError, setDriveError] = useState<string | null>(null);

  const getLanguageName = (code: string) => SUPPORTED_LANGUAGES.find(l => l.code === code)?.name || 'Unknown';

  // --- FAVORITES MANAGEMENT ---
  useEffect(() => {
    try {
      const storedFavorites = localStorage.getItem('favoriteLanguagePairs');
      if (storedFavorites) {
        setFavoritePairs(JSON.parse(storedFavorites));
      } else {
        const defaultFavorites = [
          { source: 'de', target: 'en' },
          { source: 'en', target: 'th' },
          { source: 'en', target: 'de' },
          { source: 'de', target: 'th' },
        ];
        setFavoritePairs(defaultFavorites);
        localStorage.setItem('favoriteLanguagePairs', JSON.stringify(defaultFavorites));
      }
    } catch (err) {
      console.error("Failed to load or set favorite language pairs:", err);
    }
  }, []);

  const handleSaveFavorites = (newPairs: FavoritePair[]) => {
    setFavoritePairs(newPairs);
    localStorage.setItem('favoriteLanguagePairs', JSON.stringify(newPairs));
  };

  const handleFavoriteClick = async (pair: FavoritePair) => {
    if (isRecording) {
      await stopRecording();
    }
    setSourceLang(pair.source);
    setTargetLang(pair.target);
    setInputText('');
    setOutputText('');
    setStartRecOnFavClick(true);
  };

  // --- GOOGLE DRIVE INTEGRATION ---
  useEffect(() => {
    const initializeGapi = async () => {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
            console.warn("Google Drive credentials are not configured.");
            return;
        }
        try {
            await GoogleDriveService.initClient(
                (signedIn, user) => {
                    setIsSignedIn(signedIn);
                    setDriveUser(user);
                    setDriveError(null);
                }
            );
            setIsDriveReady(true);
        } catch (e) {
            console.error("Error initializing Google Drive service:", e);
            setDriveError("Could not connect to Google Drive.");
        }
    };
    initializeGapi();
  }, []);

  const handleSignIn = () => GoogleDriveService.signIn().catch(() => setDriveError("Failed to sign in."));
  const handleSignOut = () => GoogleDriveService.signOut();
  
  // --- TEXT TRANSLATION ---
  const triggerTranslation = useCallback(() => {
    if (!inputText.trim()) {
      setOutputText('');
      return;
    }
    setIsLoading(true);
    setError(null);
    translateText(inputText, getLanguageName(sourceLang), getLanguageName(targetLang))
      .then(setOutputText)
      .catch(err => {
        console.error(err);
        setError('Translation failed. Please try again.');
      })
      .finally(() => setIsLoading(false));
  }, [inputText, sourceLang, targetLang]);

  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => triggerTranslation(), 500);
    return () => { if (debounceTimeout.current) clearTimeout(debounceTimeout.current); };
  }, [inputText, sourceLang, targetLang, triggerTranslation]);

  // --- DEVICE MANAGEMENT ---
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter(d => d.kind === 'audioinput');
        setAudioDevices(audioInputDevices);
        if (audioInputDevices.length > 0) setSelectedDeviceId(audioInputDevices[0].deviceId);
      } catch (err) {
        console.error("Error getting audio devices:", err);
        setError("Microphone access denied.");
      }
    };
    getDevices();
  }, []);

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInputText(outputText);
    setOutputText(inputText);
  };
  
  // --- LIVE TRANSLATION CORE ---
  const cleanupAudio = useCallback(() => {
    mediaStreamSourceRef.current?.mediaStream.getTracks().forEach(track => track.stop());
    mediaStreamSourceRef.current?.disconnect();
    scriptProcessorRef.current?.disconnect();
    inputAudioContextRef.current?.close().catch(console.error);
    outputAudioContextRef.current?.close().catch(console.error);
    
    mediaStreamSourceRef.current = null;
    scriptProcessorRef.current = null;
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    analyserNodeRef.current = null;
  }, []);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    if (sessionPromiseRef.current) {
        try {
            const session = await sessionPromiseRef.current;
            session.close();
        } catch (e) { console.error("Error closing session:", e); } 
        finally { sessionPromiseRef.current = null; }
    }
    cleanupAudio();
  }, [cleanupAudio]);

  const startRecording = useCallback(async () => {
    if (!selectedDeviceId) {
      setError("No microphone selected.");
      return;
    }
    
    setIsRecording(true);
    setError(null);
    setUserInputHistory('');
    setTranslationHistory('');
    nextStartTimeRef.current = 0;
    
    inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: selectedDeviceId } } });
    
    mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(stream);
    
    // LATENCY FACTOR 1: Audio Buffer Size
    // The first parameter '1024' is the buffer size. This determines how much
    // audio data is collected before being sent to the AI. A smaller number
    // reduces latency but increases network traffic and CPU load. 1024 samples
    // at 16000Hz is about 64 milliseconds of audio, which is a very low-latency setting.
    scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(1024, 1, 1);
    analyserNodeRef.current = inputAudioContextRef.current.createAnalyser();

    const handlers: LiveServiceHandlers = {
      onMessage: async (message) => {
        const MAX_HISTORY_LENGTH = 1000; // Keep roughly the last 1000 chars
        
        // Handle user's speech transcription
        if (message.serverContent?.inputTranscription) {
          const textChunk = message.serverContent.inputTranscription.text;
          setUserInputHistory(prev => (prev + textChunk).slice(-MAX_HISTORY_LENGTH));
        }
        
        // Handle model's speech transcription
        if (message.serverContent?.outputTranscription) {
          const textChunk = message.serverContent.outputTranscription.text;
           setTranslationHistory(prev => (prev + textChunk).slice(-MAX_HISTORY_LENGTH));
        }
        
        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio) {
          const audioData = decode(base64Audio);
          const audioBuffer = await decodeAudioData(audioData, outputAudioContextRef.current!, 24000, 1);
          const sourceNode = outputAudioContextRef.current!.createBufferSource();
          sourceNode.buffer = audioBuffer;
          sourceNode.connect(outputAudioContextRef.current!.destination);
          
          // LATENCY FACTOR 3: Seamless Audio Playback Scheduling
          // This logic ensures that incoming audio chunks are played back-to-back
          // without any gaps or additional buffering, creating a smooth, continuous
          // stream of translated audio. It schedules the next chunk to start
          // exactly when the previous one ends.
          const currentTime = outputAudioContextRef.current!.currentTime;
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, currentTime);
          sourceNode.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
        }
      },
      onError: () => {
        setError("A live connection error occurred.");
        stopRecording();
      },
      onClose: () => {
        if (isRecording) stopRecording();
      },
    };

    sessionPromiseRef.current = connectToLiveService(getLanguageName(sourceLang), getLanguageName(targetLang), handlers);

    scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      const pcmBlob = createAudioBlobForLive(inputData);
      sessionPromiseRef.current?.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
    };

    mediaStreamSourceRef.current.connect(analyserNodeRef.current);
    analyserNodeRef.current.connect(scriptProcessorRef.current);
    scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

  }, [selectedDeviceId, sourceLang, targetLang, stopRecording, isRecording]);

  useEffect(() => {
    if (startRecOnFavClick) {
      setStartRecOnFavClick(false);
      startRecording();
    }
  }, [startRecOnFavClick, startRecording]);

  const handleMicClick = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };
  
  const downloadTranscription = () => {
    const content = `USER INPUT (in ${getLanguageName(sourceLang)}):\n-----------------\n${userInputHistory}\n\n\nTRANSLATION (to ${getLanguageName(targetLang)}):\n-----------------\n${translationHistory}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'translation-session.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
    const handleZipFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        setIsLoading(true);

        try {
            const jszip = new JSZip();
            const zip = await jszip.loadAsync(file);
            const textFilePromises: Promise<string>[] = [];
            
            zip.forEach((_, zipEntry) => {
                if (!zipEntry.dir && /\.(txt|md|json|html|css|js|ts|jsx|tsx|xml|csv)$/i.test(zipEntry.name)) {
                    textFilePromises.push(zipEntry.async('string'));
                }
            });

            const texts = await Promise.all(textFilePromises);
            setInputText(texts.join('\n\n').trim());
        } catch (err) {
            console.error("Error processing zip file:", err);
            setError("Failed to read the zip file. It may be corrupt or unsupported.");
        } finally {
            setIsLoading(false);
            if (e.target) e.target.value = '';
        }
    }, []);

    const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        setError(null);
        setIsLoading(true);

        try {
            const fileReadPromises: Promise<string>[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file.type.startsWith('text/') || /\.(md|json|html|css|js|ts|jsx|tsx|xml|csv)$/i.test(file.name)) {
                    fileReadPromises.push(file.text());
                }
            }
            
            const texts = await Promise.all(fileReadPromises);
            setInputText(texts.join('\n\n').trim());
        } catch (err) {
            console.error("Error processing folder:", err);
            setError("An error occurred while reading files from the folder.");
        } finally {
            setIsLoading(false);
            if (e.target) e.target.value = '';
        }
    }, []);

  return (
    <>
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveFavorites}
        currentFavorites={favoritePairs}
      />
      <div className="bg-slate-900 min-h-screen text-white font-sans flex flex-col items-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-4xl mx-auto flex flex-col h-full">
          <header className="text-center mb-8 flex items-center justify-center relative">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="absolute left-0 p-2 rounded-full hover:bg-slate-700 transition-colors"
              aria-label="Open settings"
            >
              <HamburgerIcon />
            </button>
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold text-blue-400">Audio Live Translate</h1>
              <p className="text-slate-400 mt-2">Real-time voice translation powered by Gemini.</p>
            </div>
          </header>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg relative mb-4" role="alert">
              <strong className="font-bold">Error: </strong><span className="block sm:inline">{error}</span>
            </div>
          )}
          
          {driveError && (
            <div className="bg-yellow-500/20 border border-yellow-500 text-yellow-300 px-4 py-3 rounded-lg relative mb-4" role="alert">
              <strong className="font-bold">Drive Error: </strong><span className="block sm:inline">{driveError}</span>
            </div>
          )}

          {isDriveReady && (
              <div className="flex items-center justify-center gap-4 p-4 mb-8 bg-slate-800 rounded-2xl shadow-lg">
                  <GoogleDriveIcon />
                  {isSignedIn ? (
                      <div className="flex items-center gap-4">
                          <span className="text-sm text-slate-300">Connected as {driveUser?.email}</span>
                          <button onClick={handleSignOut} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Disconnect</button>
                      </div>
                  ) : (
                      <button onClick={handleSignIn} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
                          Connect to Google Drive
                      </button>
                  )}
              </div>
          )}

          <div className="bg-slate-800 p-6 rounded-2xl shadow-2xl mb-8">
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
                <div className="flex items-center gap-2 pt-0 mr-0 sm:mr-4">
                    {favoritePairs.map((pair, index) => (
                        <button
                            key={index}
                            onClick={() => handleFavoriteClick(pair)}
                            className="w-[3.125rem] h-[3.125rem] flex flex-col items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors duration-200 text-[10px] font-bold leading-none"
                            title={`Set to ${getLanguageName(pair.source)} → ${getLanguageName(pair.target)} and start recording`}
                        >
                            <span className="block">{pair.source.toUpperCase()}</span>
                            <span className="block">{pair.target.toUpperCase()}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                    <label htmlFor="source-lang" className="text-sm font-medium text-slate-400">in</label>
                    <LanguageSelector id="source-lang" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} languages={SUPPORTED_LANGUAGES} />
                </div>
                <button onClick={handleSwapLanguages} className="p-3 bg-slate-700 rounded-full hover:bg-slate-600 transition-colors duration-200"><SwapIcon /></button>
                <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                    <label htmlFor="target-lang" className="text-sm font-medium text-slate-400">to</label>
                    <LanguageSelector id="target-lang" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} languages={SUPPORTED_LANGUAGES} />
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <textarea
                className="w-full h-48 p-4 bg-slate-700 border-2 border-slate-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Enter text in ${getLanguageName(sourceLang)} or upload files below...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <div className="relative w-full h-48 p-4 bg-slate-700/50 border-2 border-slate-600/50 rounded-lg">
                <p className="whitespace-pre-wrap">{outputText}</p>
                {isLoading && <div className="absolute inset-0 bg-slate-800/50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div></div>}
              </div>
            </div>
          </div>
          
          <div className="bg-slate-800 p-6 rounded-2xl shadow-2xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full mb-4 pt-4">
              {/* Left Group: Mic Selector */}
              <div className="flex items-center sm:justify-end gap-2 w-full sm:flex-1">
                <label htmlFor="audio-input" className="text-sm font-medium text-slate-400">mic</label>
                <AudioInputSelector devices={audioDevices} selectedDeviceId={selectedDeviceId} onChange={setSelectedDeviceId} disabled={isRecording}/>
              </div>

              {/* Center Group: Main Mic Button */}
              <div className="order-first sm:order-none">
                <button onClick={handleMicClick} className={`p-5 rounded-full transition-all duration-300 focus:outline-none focus:ring-4 ${ isRecording ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400 animate-pulse' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-400'}`}>
                  <MicrophoneIcon />
                </button>
              </div>

              {/* Right Group: Uploads & Level Meter */}
              <div className="flex items-center sm:justify-start gap-4 w-full sm:flex-1">
                <button onClick={() => folderInputRef.current?.click()} className="p-4 rounded-full bg-slate-700 hover:bg-slate-600 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-slate-500 disabled:opacity-50" title="Upload Folder for Text Translation" disabled={isRecording}>
                    <FolderUploadIcon />
                </button>
                <button onClick={() => zipInputRef.current?.click()} className="p-4 rounded-full bg-slate-700 hover:bg-slate-600 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-slate-500 disabled:opacity-50" title="Upload Zip File for Text Translation" disabled={isRecording}>
                    <ZipUploadIcon />
                </button>
                <div className="w-[150px] h-[20px] flex-shrink-0">
                  {isRecording && analyserNodeRef.current && <LevelMeter analyserNode={analyserNodeRef.current} />}
                </div>
              </div>
            </div>
            <div className="relative mt-4 bg-slate-900/50 rounded-lg p-4 flex flex-col gap-4">
              {/* Live Input Display */}
              <div className="flex flex-col bg-slate-700/50 rounded-lg p-3 h-[7.75rem]">
                <label className="font-medium text-slate-400 text-sm mb-2 flex-shrink-0">in:</label>
                <div className="flex-grow overflow-hidden flex flex-col justify-end">
                  <p className="text-slate-300 whitespace-pre-wrap">
                    {userInputHistory}
                  </p>
                </div>
              </div>
              
              {/* Translation Output History */}
              <div className="flex flex-col bg-slate-700/50 rounded-lg p-3 h-[7.75rem]">
                <label className="font-medium text-slate-400 text-sm mb-2 flex-shrink-0">to:</label>
                <div className="flex-grow overflow-hidden flex flex-col justify-end">
                  <p className="text-slate-100 whitespace-pre-wrap">
                    {translationHistory}
                  </p>
                </div>
              </div>
            </div>

            {(userInputHistory || translationHistory) && (
                <div className="flex justify-end mt-4">
                    <button onClick={downloadTranscription} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                        <DownloadIcon />
                        <span>Download Session</span>
                    </button>
                </div>
            )}
          </div>
        </div>
        <input type="file" ref={zipInputRef} onChange={handleZipFileSelect} style={{ display: 'none' }} accept=".zip" />
        <input type="file" ref={folderInputRef} onChange={handleFolderSelect} style={{ display: 'none' }} {...{ webkitdirectory: "", directory: "", multiple: true }} />
      </div>
    </>
  );
};

export default App;