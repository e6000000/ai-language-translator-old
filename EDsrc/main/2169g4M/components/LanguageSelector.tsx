import React from 'react';
import { Language } from '../types';

interface LanguageSelectorProps {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  languages: Language[];
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ id, value, onChange, languages }) => {
  return (
    <div className="w-full">
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="w-full p-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSelector;