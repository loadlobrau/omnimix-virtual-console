
import React from 'react';
import { ICONS } from '../constants';

const VbanPanel: React.FC = () => {
  return (
    <div className="bg-[#0a0a0a] border-t border-[#000] p-3 flex items-center gap-6 overflow-hidden skeuo-shadow">
      <div className="flex items-center gap-2 text-blue-500/80">
        {ICONS.Network}
        <span className="text-[9px] font-black tracking-widest">VBAN PROTOCOL</span>
      </div>
      
      <div className="flex items-center gap-4 border-l border-[#222] pl-4">
        <div className="flex flex-col">
          <span className="text-[7px] text-gray-600 font-bold">TX STREAM</span>
          <span className="text-[10px] font-mono text-green-500/70">192.168.1.15:6980 (Active)</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[7px] text-gray-600 font-bold">LATENCY</span>
          <span className="text-[10px] font-mono text-gray-400">2.4ms (ASIO Ultra-Fast)</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[7px] text-gray-600 font-bold">SAMPLE RATE</span>
          <span className="text-[10px] font-mono text-gray-400">48000 Hz / 24-bit</span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center gap-2 bg-[#050505] px-3 py-1 rounded-sm border border-[#222] skeuo-shadow">
          <div className="w-2 h-2 rounded-full bg-green-500 led-green animate-pulse" />
          <span className="text-[9px] font-black text-gray-500 tracking-widest">DRIVER STABLE</span>
        </div>
        <div className="flex items-center gap-2 bg-[#050505] px-3 py-1 rounded-sm border border-[#222] skeuo-shadow">
           <span className="text-[9px] text-gray-600 font-bold">CPU: 4.2%</span>
        </div>
      </div>
    </div>
  );
};

export default VbanPanel;
