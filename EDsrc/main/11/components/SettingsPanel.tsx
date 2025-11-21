
import React, { useState, useEffect } from 'react';
import { Language } from '../types';
import { SUPPORTED_LANGUAGES } from '../constants';

interface FavoritePair {
  source: string;
  target: string;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pairs: FavoritePair[]) => void;
  currentFavorites: FavoritePair[];
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, onSave, currentFavorites }) => {
  const [favorites, setFavorites] = useState<FavoritePair[]>(currentFavorites);

  useEffect(() => {
    setFavorites(currentFavorites);
  }, [currentFavorites, isOpen]);

  const handlePairChange = (index: number, part: 'source' | 'target', value: string) => {
    const newFavorites = [...favorites];
    newFavorites[index] = { ...newFavorites[index], [part]: value };
    setFavorites(newFavorites);
  };

  const handleSave = () => {
    onSave(favorites);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose} aria-modal="true" role="dialog">
      <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md m-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-100">Favorite Language Pairs</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700" aria-label="Close settings">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {favorites.map((pair, index) => (
            <div key={index}>
              <h3 className="text-lg font-semibold text-slate-300 mb-2">Favorite {index + 1}</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label htmlFor={`fav-source-${index}`} className="block text-sm font-medium text-slate-400 mb-1">From</label>
                  <select
                    id={`fav-source-${index}`}
                    value={pair.source}
                    onChange={(e) => handlePairChange(index, 'source', e.target.value)}
                    className="w-full p-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>
                <div className="pt-6 text-slate-400">&rarr;</div>
                <div className="flex-1">
                  <label htmlFor={`fav-target-${index}`} className="block text-sm font-medium text-slate-400 mb-1">To</label>
                  <select
                    id={`fav-target-${index}`}
                    value={pair.target}
                    onChange={(e) => handlePairChange(index, 'target', e.target.value)}
                    className="w-full p-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-white font-semibold">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold">Save</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
