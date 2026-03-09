
import React, { useState } from 'react';
import { X, Cpu, Activity, Zap } from 'lucide-react';

interface DriverSettings {
  driverMode: string;
  bufferSize: number;
  sampleRate: number;
  exclusiveMode: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: DriverSettings) => void;
  currentSettings?: Partial<DriverSettings>;
}

const DriverModal: React.FC<Props> = ({ isOpen, onClose, onSave, currentSettings }) => {
  const [settings, setSettings] = useState<DriverSettings>({
    driverMode: 'WASAPI_EXCLUSIVE',
    bufferSize: 256,
    sampleRate: 48000,
    exclusiveMode: true,
    ...currentSettings
  });

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center">
      <div className="bg-[#1a1a1a] border border-[#000] w-96 rounded-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 skeuo-panel">
        
        {/* Header */}
        <div className="bg-[#0a0a0a] p-3 border-b border-[#000] flex justify-between items-center skeuo-shadow">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-blue-500" />
            <h2 className="text-[10px] font-black text-gray-400 tracking-widest uppercase">OMNI-KERNEL DRIVER CONFIG</h2>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          
          {/* Driver Mode */}
          <div className="space-y-2">
            <label className="text-[9px] uppercase font-black text-gray-600 tracking-widest">Audio System Interface</label>
            <select 
              value={settings.driverMode}
              onChange={(e) => setSettings({...settings, driverMode: e.target.value})}
              className="w-full bg-[#050505] border border-[#222] text-[10px] text-blue-500/80 font-mono p-2 rounded-sm focus:border-blue-500/50 outline-none skeuo-shadow"
            >
              <option value="ASIO_OMNI">OMNI-ASIO (Kernel Streaming)</option>
              <option value="WASAPI_EXCLUSIVE">Windows WASAPI (Exclusive)</option>
              <option value="WASAPI_SHARED">Windows WASAPI (Shared)</option>
              <option value="WDM">WDM / MME (Legacy)</option>
              <option value="CORE_AUDIO">CoreAudio (macOS/iOS)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
             {/* Buffer Size */}
            <div className="space-y-2">
                <label className="text-[9px] uppercase font-black text-gray-600 tracking-widest">Buffer / Latency</label>
                <select 
                value={settings.bufferSize}
                onChange={(e) => setSettings({...settings, bufferSize: Number(e.target.value)})}
                className="w-full bg-[#050505] border border-[#222] text-[10px] text-green-500/80 font-mono p-2 rounded-sm focus:border-green-500/50 outline-none skeuo-shadow"
                >
                <option value={64}>64 spls (1.3ms)</option>
                <option value={128}>128 spls (2.6ms)</option>
                <option value={256}>256 spls (5.3ms)</option>
                <option value={512}>512 spls (10.6ms)</option>
                <option value={1024}>1024 spls (21.3ms)</option>
                </select>
            </div>

            {/* Sample Rate */}
            <div className="space-y-2">
                <label className="text-[9px] uppercase font-black text-gray-600 tracking-widest">Sample Rate</label>
                <select 
                value={settings.sampleRate}
                onChange={(e) => setSettings({...settings, sampleRate: Number(e.target.value)})}
                className="w-full bg-[#050505] border border-[#222] text-[10px] text-yellow-500/80 font-mono p-2 rounded-sm focus:border-yellow-500/50 outline-none skeuo-shadow"
                >
                <option value={44100}>44.1 kHz</option>
                <option value={48000}>48.0 kHz</option>
                <option value={88200}>88.2 kHz</option>
                <option value={96000}>96.0 kHz</option>
                </select>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-[#0a0a0a] border border-blue-900/20 p-3 rounded-sm flex gap-3 items-start skeuo-shadow">
            <Activity size={16} className="text-blue-500/50 mt-0.5 shrink-0" />
            <div className="space-y-1">
                <p className="text-[9px] text-gray-500 font-black tracking-widest">MULTITHREADED ENGINE ACTIVE</p>
                <p className="text-[9px] text-gray-600 leading-tight font-medium">
                    DSP tasks are offloaded to high-priority AudioWorklet threads. 
                    Changing buffer size requires a full engine restart.
                </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-[#0a0a0a] p-3 border-t border-[#000] flex justify-end gap-2 skeuo-shadow">
            <button 
                onClick={onClose}
                className="px-4 py-2 text-[10px] font-black text-gray-600 hover:text-white transition-colors tracking-widest"
            >
                CANCEL
            </button>
            <button 
                onClick={handleSave}
                className="px-4 py-2 bg-blue-800 hover:bg-blue-700 text-white text-[10px] font-black rounded-sm flex items-center gap-2 transition-all skeuo-button tracking-widest"
            >
                <Zap size={12} fill="currentColor" />
                RESTART ENGINE
            </button>
        </div>
      </div>
    </div>
  );
};

export default DriverModal;
