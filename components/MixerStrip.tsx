
import React, { useEffect, useRef, useState } from 'react';
import { ICONS } from '../constants';
import { ChannelSettings, AudioMeterData } from '../types';
import { ChevronDown, Power, AlertCircle } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';

interface Props {
  settings: ChannelSettings;
  onChange: (settings: ChannelSettings) => void;
  inputDevices: MediaDeviceInfo[];
  onOptimize: () => void;
}

const Knob = ({ value, onChange, label, min, max, color = "blue", size = "w-10 h-10" }: any) => {
    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0);
    const startVal = useRef(0);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const deltaY = startY.current - e.clientY;
            const range = max - min;
            let newVal = startVal.current + deltaY * (range / 200);
            newVal = Math.max(min, Math.min(max, newVal));
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
    }, [isDragging, onChange, min, max]);

    const percentage = (value - min) / (max - min);
    const rotation = (percentage * 270) - 135;
    
    const indicatorColor = color === "green" ? "bg-green-400" : color === "red" ? "bg-red-400" : "bg-blue-400";

    return (
        <div className="flex flex-col items-center gap-1">
            <div 
                className={`${size} rounded-full skeuo-knob flex items-center justify-center relative cursor-ns-resize group transition-transform duration-75`}
                style={{ transform: `rotate(${rotation}deg)` }}
                onMouseDown={(e) => {
                    setIsDragging(true);
                    startY.current = e.clientY;
                    startVal.current = value;
                }}
            >
              {/* Physical Pointer */}
              <div className={`absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-2 ${indicatorColor} rounded-full shadow-[0_0_2px_rgba(255,255,255,0.5)]`} />
            </div>
            {label && <span className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter">{label}</span>}
        </div>
    );
};

const MixerStrip: React.FC<Props> = ({ settings, onChange, inputDevices, onOptimize }) => {
  const [meter, setMeter] = useState<AudioMeterData>({ rms: 0, peak: 0 });
  const [hasError, setHasError] = useState(false);
  const meterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
        const data = audioEngine.getMeter(settings.id);
        setMeter(data);
        if (meterRef.current) {
            const height = Math.min(100, data.rms * 150); // Scale RMS for better visibility
            meterRef.current.style.height = `${height}%`;
            if (data.peak > 0.9) meterRef.current.style.backgroundColor = '#f87171';
            else if (data.peak > 0.7) meterRef.current.style.backgroundColor = '#eab308';
            else meterRef.current.style.backgroundColor = '#4ade80';
        }
    }, 50);
    return () => clearInterval(interval);
  }, [settings.id]);

  const handleDeviceSelect = async (deviceId: string) => {
    setHasError(false);
    try {
        await audioEngine.setInputDevice(settings.id, deviceId);
        onChange({ ...settings, deviceId });
    } catch (e: any) {
        setHasError(true);
        alert(e.message || "Failed to initialize audio device.");
    }
  };

  return (
    <div className="w-32 bg-[#1a1a1a] border-r border-[#000] flex flex-col items-center py-2 shrink-0 skeuo-panel relative">
      
      {/* Header & Optimize */}
      <div className="w-full px-2 mb-2 flex flex-col gap-1">
        <div className="flex justify-between items-center bg-[#0a0a0a] p-1 rounded border border-[#333] skeuo-shadow">
            <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-gray-500">CH.{settings.id}</span>
                {hasError && <AlertCircle size={10} className="text-red-500 animate-pulse" />}
            </div>
            <button onClick={onOptimize} className="text-yellow-600 hover:text-yellow-400 transition-colors" title="AI Optimize">
                {ICONS.Zap}
            </button>
        </div>
        
        {/* Input Selector */}
        <div className="relative group w-full">
            <button className={`flex items-center justify-between w-full text-[9px] bg-[#050505] p-1.5 rounded border ${hasError ? 'border-red-900 shadow-[inset_0_0_5px_rgba(255,0,0,0.5)]' : 'border-[#222]'} hover:border-blue-500/50 truncate text-gray-400 transition-colors`}>
                <span className="truncate w-16 text-left">
                    {inputDevices.find(d => d.deviceId === settings.deviceId)?.label || "Select Input"}
                </span>
                <ChevronDown size={8} />
            </button>
            <div className="absolute top-full left-0 w-48 bg-[#121212] border border-[#333] z-50 hidden group-hover:block max-h-48 overflow-y-auto shadow-2xl rounded-b">
                {inputDevices.map(device => (
                    <div 
                        key={device.deviceId} 
                        onClick={() => handleDeviceSelect(device.deviceId)}
                        className={`p-2 text-[10px] hover:bg-blue-900/40 cursor-pointer truncate ${device.deviceId === settings.deviceId ? 'text-blue-400 font-bold bg-white/5' : 'text-gray-400'}`}
                        title={device.label}
                    >
                        {device.label || `Device ${device.deviceId.substring(0,8)}...`}
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* Dynamics Section */}
      <div className="w-[90%] bg-[#0a0a0a] rounded border border-[#222] p-1 mb-2 flex flex-col gap-1 skeuo-shadow">
         <span className="text-[7px] text-center text-gray-600 font-black border-b border-[#222] pb-0.5 tracking-widest">DYNAMICS</span>
         <div className="flex justify-between px-1">
            <div className="flex flex-col items-center">
                 <button 
                    onClick={() => onChange({...settings, gate: {...settings.gate, active: !settings.gate.active}})}
                    className={`text-[8px] mb-1 px-1.5 rounded-sm font-bold transition-all ${settings.gate.active ? 'bg-green-900/40 text-green-400 border border-green-500/30 led-green' : 'bg-[#1a1a1a] text-gray-600 border border-[#333]'}`}
                 >GATE</button>
                 <Knob 
                    value={settings.gate.threshold} 
                    min={-80} max={0} 
                    onChange={(v: number) => onChange({...settings, gate: {...settings.gate, threshold: v}})}
                    size="w-6 h-6"
                    color="green"
                 />
            </div>
            <div className="flex flex-col items-center">
                 <button 
                    onClick={() => onChange({...settings, compressor: {...settings.compressor, active: !settings.compressor.active}})}
                    className={`text-[8px] mb-1 px-1.5 rounded-sm font-bold transition-all ${settings.compressor.active ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-500/30 led-yellow' : 'bg-[#1a1a1a] text-gray-600 border border-[#333]'}`}
                 >COMP</button>
                 <Knob 
                    value={settings.compressor.ratio} 
                    min={1} max={20} 
                    onChange={(v: number) => onChange({...settings, compressor: {...settings.compressor, ratio: v}})}
                    size="w-6 h-6"
                    color="yellow"
                 />
            </div>
         </div>
      </div>

      {/* EQ Section */}
      <div className="flex flex-col gap-2 bg-[#1a1a1a] p-2 rounded-lg border border-[#2a2a2a] mb-2 skeuo-shadow">
        <Knob label="HIGH" value={settings.eq.high} min={-12} max={12} onChange={(v:number) => onChange({ ...settings, eq: { ...settings.eq, high: v }})} />
        <Knob label="MID" value={settings.eq.mid} min={-12} max={12} onChange={(v:number) => onChange({ ...settings, eq: { ...settings.eq, mid: v }})} />
        <Knob label="LOW" value={settings.eq.low} min={-12} max={12} onChange={(v:number) => onChange({ ...settings, eq: { ...settings.eq, low: v }})} />
      </div>

      {/* Pan */}
      <div className="mb-2">
         <Knob label="PAN" value={settings.pan} min={-1} max={1} onChange={(v:number) => onChange({ ...settings, pan: v })} color="red" size="w-8 h-8" />
      </div>

      {/* Mute/Solo/Monitor/Mono */}
      <div className="flex flex-col gap-1 w-full px-2 mb-2">
         <div className="flex gap-1">
            <button 
                onClick={() => onChange({ ...settings, mute: !settings.mute })}
                className={`flex-1 py-1 text-[9px] font-black border rounded-sm transition-all ${settings.mute ? 'bg-red-700 border-red-400 text-white led-red' : 'bg-[#222] border-[#333] text-gray-500'}`}
            >MUTE</button>
            <button 
                onClick={() => onChange({ ...settings, solo: !settings.solo })}
                className={`flex-1 py-1 text-[9px] font-black border rounded-sm transition-all ${settings.solo ? 'bg-yellow-600 border-yellow-300 text-black led-yellow' : 'bg-[#222] border-[#333] text-gray-500'}`}
            >SOLO</button>
         </div>
         <div className="flex gap-1">
             <button 
                onClick={() => onChange({ ...settings, monitor: !settings.monitor })}
                className={`flex-1 py-1 text-[9px] font-black border rounded-sm flex justify-center items-center gap-1 transition-all ${settings.monitor ? 'bg-blue-700 border-blue-400 text-white led-blue' : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-600'}`}
             >
                 <Power size={10} /> {settings.monitor ? 'MON-ON' : 'MON-OFF'}
             </button>
             <button 
                onClick={() => onChange({ ...settings, mono: !settings.mono })}
                className={`flex-1 py-1 text-[9px] font-black border rounded-sm transition-all ${settings.mono ? 'bg-orange-700 border-orange-400 text-white led-orange' : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-600'}`}
             >
                 {settings.mono ? 'MONO' : 'STEREO'}
             </button>
         </div>
      </div>

      {/* Fader & Meter */}
      <div className="flex-grow flex justify-center gap-2 h-48 w-full px-2 relative">
        <div className="w-2 bg-[#050505] h-full rounded-sm border border-[#1a1a1a] overflow-hidden relative flex flex-col-reverse skeuo-meter-track">
            <div ref={meterRef} className="w-full bg-green-500 transition-all duration-75 ease-out opacity-80" style={{height: '0%'}} />
            <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none">
                {[...Array(10)].map((_, i) => <div key={i} className="w-full h-px bg-white/5" />)}
            </div>
        </div>

        <div className="w-8 bg-[#050505] h-full rounded-sm border border-[#1a1a1a] relative skeuo-fader-track">
            <div className="absolute top-[10%] bottom-[10%] left-1/2 -translate-x-1/2 w-0.5 bg-[#111]" />
            <input 
                type="range"
                min="0" max="1.2" step="0.01"
                value={settings.gain}
                onChange={(e) => onChange({ ...settings, gain: parseFloat(e.target.value) })}
                className="absolute -rotate-90 w-40 h-8 -left-16 top-20 opacity-0 cursor-pointer z-20"
            />
            <div 
                className="absolute left-0 w-full h-8 skeuo-fader-handle z-10 pointer-events-none flex items-center justify-center rounded-sm"
                style={{ bottom: `${(settings.gain / 1.2) * 80}%`, transition: 'bottom 0.1s' }}
            >
                <div className="w-full h-px bg-black/40" />
            </div>
        </div>
      </div>

      <div className="mt-2 bg-[#0a0a0a] px-2 py-0.5 rounded border border-[#222] text-[9px] font-mono text-green-500/80 skeuo-shadow">
        {settings.gain === 0 ? '-inf' : `${(20 * Math.log10(settings.gain)).toFixed(1)}`} dB
      </div>

    </div>
  );
};

export default MixerStrip;
