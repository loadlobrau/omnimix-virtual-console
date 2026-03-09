
import React from 'react';
import { Settings, Activity, Network, Mic, Speaker, Layers, Zap } from 'lucide-react';

export const TOTAL_INPUTS = 8;
export const PHYSICAL_INPUTS = 5;
export const VIRTUAL_INPUTS = 3;
export const OUTPUT_BUSSES = 8;

export const CHANNEL_COLORS = [
  '#4ade80', '#4ade80', '#4ade80', '#4ade80', '#4ade80',
  '#60a5fa', '#60a5fa', '#60a5fa'
];

export const ICONS = {
  Settings: <Settings size={16} />,
  Activity: <Activity size={16} />,
  Network: <Network size={16} />,
  Mic: <Mic size={16} />,
  Speaker: <Speaker size={16} />,
  Layers: <Layers size={16} />,
  Zap: <Zap size={16} />
};
