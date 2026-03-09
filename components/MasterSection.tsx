
import React, { useEffect, useState, useRef } from 'react';
import { ICONS } from '../constants';
import { MasterSettings } from '../types';
import { ChevronDown, Speaker, MicOff, Waves } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';

interface Props {
  settings: MasterSettings;
  onChange: (settings: MasterSettings) => void;
  onOptimize: () => void;
  onOpenDriverSettings: () => void;
  outputDevices: MediaDeviceInfo[];
}

const MasterKnob = ({ value, onChange, label }: { value: number, onChange: (v: number) => void, label: string }) => {
    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0);
    const startVal = useRef(0);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const deltaY = startY.current - e.clientY;
            let newVal = startVal.current + deltaY * 0.01;
            newVal = Math.max(0, Math.min(1, newVal));
            onChange(newVal);
        };
        const handleMouseUp = () => setIsDragging(false);
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, onChange]);

    const rotation = (value * 270) - 135;

    return (
        <div className="flex flex-col items-center">
            <span className="text-[9px] opacity-60 mb-2 font-bold tracking-tighter">{label}</span>
            <div 
                className="w-12 h-12 rounded-full skeuo-knob flex items-center justify-center relative cursor-ns-resize group shadow-lg transition-transform duration-75"
                style={{ transform: `rotate(${rotation}deg)` }}
                onMouseDown={(e) => {
                    setIsDragging(true);
                    startY.current = e.clientY;
                    startVal.current = value;
                }}
            >
              <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1 h-3 bg-red-500 rounded-full shadow-[0_0_3px_rgba(239,68,68,0.5)]" />
            </div>
            <span className="text-[8px] mt-1 opacity-40 font-mono">{Math.round(value * 100)}%</span>
        </div>
    );
};

const MasterSection: React.FC<Props> = ({ settings, onChange, onOptimize, onOpenDriverSettings, outputDevices }) => {
  const meterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
        const data = audioEngine.getMasterMeter();
        if (meterRef.current) {
            const height = Math.min(100, data.rms * 150);
            meterRef.current.style.height = `${height}%`;
            // LED Colors for Master (Hard Clipping warning)
            if (data.peak > 0.98) meterRef.current.style.background = 'linear-gradient(to top, #ef4444, #b91c1c)';
            else if (data.peak > 0.85) meterRef.current.style.background = 'linear-gradient(to top, #eab308, #f59e0b)';
            else meterRef.current.style.background = 'linear-gradient(to top, #22c55e, #16a34a)';
        }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-64 flex flex-col bg-[#1a1a1a] border-l border-[#000] skeuo-panel h-full shrink-0">
      <div className="p-4 border-b border-[#000] bg-[#0a0a0a] flex justify-between items-center skeuo-shadow">
        <h2 className="text-sm font-black tracking-widest text-white italic">MASTER BUS</h2>
        <div className="flex gap-2 text-gray-600">
          <button onClick={onOpenDriverSettings} className="hover:text-blue-500 transition-colors">
            {ICONS.Settings}
          </button>
          {ICONS.Activity}
        </div>
      </div>

      <div className="p-4 flex-grow flex flex-col space-y-6 overflow-y-auto relative">
        
        {/* AI Optimizer - Moved to Top to prevent overlap */}
        <button 
            onClick={onOptimize}
            className="w-full py-2 bg-gradient-to-r from-blue-800 to-blue-700 hover:from-blue-700 hover:to-blue-600 text-white rounded-sm font-black text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 skeuo-button active:scale-95"
        >
            {ICONS.Zap} AUTO-LEVEL MASTER
        </button>

        {/* Output Destination Selection */}
        <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-600 flex items-center gap-1 tracking-widest">
                <Speaker size={10} /> SELECT DESTINATION
            </label>
            <div className="relative group/output">
                <button className="flex items-center justify-between w-full text-[10px] bg-[#050505] p-2 rounded-sm border border-[#222] hover:border-blue-500/50 truncate text-gray-400 transition-colors">
                    <span className="truncate flex-1 text-left">
                        {outputDevices.find(d => d.deviceId === settings.outputDeviceId)?.label || "Default Output"}
                    </span>
                    <ChevronDown size={10} />
                </button>
                <div className="absolute top-full left-0 w-full bg-[#121212] border border-[#333] z-50 hidden group-hover/output:block max-h-48 overflow-y-auto shadow-2xl rounded-b">
                    {outputDevices.map(device => (
                        <div 
                            key={device.deviceId} 
                            onClick={() => onChange({ ...settings, outputDeviceId: device.deviceId })}
                            className={`p-2 text-[10px] hover:bg-blue-900/40 cursor-pointer truncate ${device.deviceId === settings.outputDeviceId ? 'text-blue-400 font-bold bg-white/5' : 'text-gray-400'}`}
                        >
                            {device.label || `Device ${device.deviceId.substring(0,8)}...`}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* FX Sends / DSP */}
        <div className="grid grid-cols-2 gap-4 bg-[#0a0a0a] p-3 rounded-lg border border-[#222] skeuo-shadow">
          <MasterKnob 
            label="REVERB" 
            value={settings.reverb} 
            onChange={(v) => onChange({ ...settings, reverb: v })} 
          />
          <MasterKnob 
            label="DELAY" 
            value={settings.delay} 
            onChange={(v) => onChange({ ...settings, delay: v })} 
          />
        </div>

        {/* Noise & Echo Control */}
        <div className="space-y-4 bg-[#0a0a0a] p-3 rounded-lg border border-[#222] skeuo-shadow">
            <div className="flex items-center justify-between">
                <MasterKnob 
                    label="NOISE REMOVER" 
                    value={settings.noiseReduction} 
                    onChange={(v) => onChange({ ...settings, noiseReduction: v })} 
                />
                <div className="flex flex-col items-center gap-2">
                    <span className="text-[9px] font-black text-gray-600 tracking-tighter">ECHO CANCEL</span>
                    <button 
                        onClick={() => onChange({ ...settings, aec: !settings.aec })}
                        className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${settings.aec ? 'bg-blue-900/30 border-blue-400 text-blue-400 led-blue' : 'bg-[#1a1a1a] border-[#333] text-gray-700'}`}
                    >
                        <Waves size={18} />
                    </button>
                </div>
            </div>
        </div>

        {/* Master Meter & Fader - Fixed Layout */}
        <div className="flex-grow flex justify-center gap-4 min-h-[250px] relative items-end pb-4">
          
          {/* Fader Track */}
          <div className="w-12 bg-[#050505] h-full rounded-sm border border-[#1a1a1a] relative flex justify-center skeuo-fader-track">
            <div className="absolute top-[5%] bottom-[5%] w-0.5 bg-[#111]" />
            {/* Visual Handle - Vertical orientation logic */}
            <div 
                className="absolute w-full h-10 skeuo-fader-handle z-10 pointer-events-none flex items-center justify-center rounded-sm"
                style={{ bottom: `${(settings.masterGain / 1.5) * 80}%`, transition: 'bottom 0.1s' }}
            >
                <div className="w-full h-px bg-black/40" />
            </div>
             {/* Actual Input - Rotated but hidden opacity for interaction */}
            <input 
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={settings.masterGain}
                onChange={(e) => onChange({ ...settings, masterGain: parseFloat(e.target.value) })}
                className="absolute w-[250px] h-12 -rotate-90 top-[100px] opacity-0 cursor-pointer z-20"
                style={{ transformOrigin: 'center' }}
            />
          </div>

          {/* Meter */}
          <div className="h-full w-8 bg-[#050505] self-center rounded-sm border border-[#1a1a1a] relative overflow-hidden flex flex-col-reverse skeuo-meter-track">
             <div ref={meterRef} className="w-full bg-green-500 transition-all duration-75 ease-out opacity-90" style={{ height: '0%' }} />
             <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none">
               {[...Array(20)].map((_, i) => <div key={i} className="h-px bg-white/5 w-full" />)}
             </div>
          </div>
        </div>

        <div className="text-[8px] text-center opacity-30 uppercase pb-2 font-bold tracking-widest">
            Windows WDM Bridge Active
        </div>
      </div>
    </div>
  );
};

export default MasterSection;
