
import React, { useEffect, useState } from 'react';
import { TOTAL_INPUTS, CHANNEL_COLORS } from './constants';
import { ChannelSettings, MasterSettings, StripType } from './types';
import { X } from 'lucide-react';
import MixerStrip from './components/MixerStrip';
import MasterSection from './components/MasterSection';
import VbanPanel from './components/VbanPanel';
import DriverModal from './components/DriverModal';
import { audioEngine } from './services/audioEngine';
import { audioHealthMonitor } from './services/AudioHealthMonitor';
import { getGeminiOptimization } from './services/geminiService';

const INITIAL_CHANNELS: ChannelSettings[] = Array.from({ length: TOTAL_INPUTS }, (_, i) => ({
  id: i + 1,
  name: `CH ${i + 1}`,
  type: i < 5 ? StripType.PHYSICAL : StripType.VIRTUAL,
  gain: 1,
  mute: false,
  solo: false,
  monitor: false,
  mono: false,
  pan: 0,
  eq: { low: 0, mid: 0, high: 0 },
  gate: { threshold: -60, active: false },
  compressor: { threshold: -20, ratio: 1, active: false },
  routing: [],
}));

const INITIAL_MASTER: MasterSettings = {
    reverb: 0, delay: 0, noiseReduction: 0, aec: false, masterGain: 0.8
};

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelSettings[]>(() => {
      const saved = localStorage.getItem('omni_channels');
      return saved ? JSON.parse(saved) : INITIAL_CHANNELS;
  });
  
  const [masterSettings, setMasterSettings] = useState<MasterSettings>(() => {
      const saved = localStorage.getItem('omni_master');
      return saved ? JSON.parse(saved) : INITIAL_MASTER;
  });

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [isDriverModalOpen, setDriverModalOpen] = useState(false);
  const [notification, setNotification] = useState<{title: string, message: string} | null>(null);

  // Profile Persistence
  useEffect(() => {
      localStorage.setItem('omni_channels', JSON.stringify(channels));
  }, [channels]);

  useEffect(() => {
      localStorage.setItem('omni_master', JSON.stringify(masterSettings));
  }, [masterSettings]);

  const refreshDevices = async () => {
      try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        
        // If device labels are empty, we need to request permission
        if (!devices.some(d => d.label) && devices.length > 0) {
             console.log("Labels missing. Requesting permissions...");
             try {
                 const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                 stream.getTracks().forEach(t => t.stop());
                 // Enumerate again after permission granted
                 devices = await navigator.mediaDevices.enumerateDevices();
             } catch (e) {
                 console.warn("Permission denied for audio devices.");
             }
        }

        const inputs = devices.filter(d => d.kind === 'audioinput');
        const outputs = devices.filter(d => d.kind === 'audiooutput');

        // Inject Virtual Capture Option for Application Audio
        // This allows the user to select a specific App Window or Tab via the browser's native picker
        const appCapture = {
            deviceId: 'display-capture',
            kind: 'audioinput',
            label: '🖥️ App / Window Capture',
            groupId: 'virtual',
            toJSON: () => {}
        } as unknown as MediaDeviceInfo;

        setInputDevices([appCapture, ...inputs]);
        setOutputDevices(outputs);
      } catch (e) {
        console.error("Failed to enumerate devices:", e);
      }
  };

  useEffect(() => {
    const init = async () => {
      await audioEngine.initialize();
      await refreshDevices();
      
      // Initialize channels in engine
      channels.forEach(ch => {
          audioEngine.createChannelStrip(ch.id);
          // Re-connect device if it was saved
          if (ch.deviceId) audioEngine.setInputDevice(ch.id, ch.deviceId);
          // Apply initial settings (mute, gain, monitor, etc.)
          audioEngine.updateChannel(ch);
      });

      audioHealthMonitor.start(channels);
      audioHealthMonitor.onHealthUpdate = (report) => {
          if (report.status !== 'HEALTHY') console.warn(report);
      };
    };
    init();

    // Hot-Plug Listener
    const handleDeviceChange = () => {
        console.log("Hardware change detected. Refreshing devices...");
        refreshDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
        audioHealthMonitor.stop();
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  useEffect(() => {
      audioHealthMonitor.updateChannels(channels);
      channels.forEach(ch => audioEngine.updateChannel(ch));
  }, [channels]);

  useEffect(() => {
      audioEngine.updateMaster(masterSettings);
  }, [masterSettings]);

  const handleChannelChange = React.useCallback((updated: ChannelSettings) => {
    setChannels(prev => prev.map(ch => ch.id === updated.id ? updated : ch));
  }, []);

  const handleOptimization = async (channelId: number) => {
     const ch = channels.find(c => c.id === channelId);
     if(!ch) return;
     const suggestion = await getGeminiOptimization(ch.name, ch.type);
     setNotification({ title: `AI Optimization: ${ch.name}`, message: suggestion || "No suggestion available." });
  };

  const handleMasterOptimization = () => {
      // Calculate safe gain
      const safeGain = audioEngine.calculateOptimalMasterGain();
      setMasterSettings(prev => ({ ...prev, masterGain: safeGain }));
  };

  const handleDriverRestart = async (settings: any) => {
      console.log("Rebooting Kernel with settings:", settings);
      // Simulate driver mode change
      setNotification({ title: "Driver Restart", message: `Switched to ${settings.driverMode} with ${settings.bufferSize} spls buffer.` });
      
      await audioEngine.initialize(settings.bufferSize / 48000, settings.sampleRate);
      // Re-initialize strips
      channels.forEach(ch => {
          audioEngine.createChannelStrip(ch.id);
          audioEngine.setInputDevice(ch.id, ch.deviceId || '');
          audioEngine.updateChannel(ch);
      });
  };

  return (
    <div className="flex flex-col h-screen bg-[#121212] text-white overflow-hidden">
      
      <div className="flex-grow flex overflow-hidden">
        {/* Channel Strips Area */}
        <div className="flex-grow overflow-x-auto">
          <div className="flex h-full min-w-max">
            {channels.map((ch) => (
              <MixerStrip 
                key={ch.id} 
                settings={ch} 
                onChange={handleChannelChange} 
                inputDevices={inputDevices}
                onOptimize={() => handleOptimization(ch.id)}
              />
            ))}
          </div>
        </div>

        {/* Master Section */}
        <MasterSection 
          settings={masterSettings} 
          onChange={setMasterSettings} 
          outputDevices={outputDevices}
          onOptimize={handleMasterOptimization} 
          onOpenDriverSettings={() => setDriverModalOpen(true)}
        />
      </div>

      {/* Footer / VBAN / Driver Status */}
      <div onClick={() => setDriverModalOpen(true)} className="cursor-pointer hover:bg-white/5 transition-colors">
        <VbanPanel />
      </div>

      <DriverModal 
        isOpen={isDriverModalOpen}
        onClose={() => setDriverModalOpen(false)}
        onSave={handleDriverRestart}
      />

      {/* Custom Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-[100] w-80 bg-[#1a1a1a] border border-blue-500 rounded-lg shadow-2xl p-4 animate-in slide-in-from-right duration-300">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">{notification.title}</h3>
            <button onClick={() => setNotification(null)} className="text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="text-[10px] text-gray-300 leading-relaxed whitespace-pre-wrap">
            {notification.message}
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="mt-4 w-full py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded"
          >
            DISMISS
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
