
export interface Language {
  code: string;
  name: string;
}

export interface TranscriptionEntry {
  speaker: 'user' | 'model';
  text: string;
}
