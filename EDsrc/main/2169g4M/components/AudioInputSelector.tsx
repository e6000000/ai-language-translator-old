import React from 'react';

interface AudioInputSelectorProps {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onChange: (deviceId: string) => void;
  disabled: boolean;
}

const AudioInputSelector: React.FC<AudioInputSelectorProps> = ({
  devices,
  selectedDeviceId,
  onChange,
  disabled,
}) => {
  return (
    <div className="w-full">
      <select
        id="audio-input"
        value={selectedDeviceId}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || devices.length === 0}
        className="w-full p-2 bg-slate-700 border-2 border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 disabled:opacity-50"
      >
        {devices.length === 0 && <option>No microphones found</option>}
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Microphone ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
};

export default AudioInputSelector;