
export enum StripType {
  PHYSICAL = 'PHYSICAL',
  VIRTUAL = 'VIRTUAL'
}

export interface ChannelSettings {
  id: number;
  name: string;
  type: StripType;
  deviceId?: string; // Hardware Device ID
  gain: number; // 0 to 2 (where 1 is 0dB)
  mute: boolean;
  solo: boolean;
  monitor: boolean; // Input Monitoring (Playback Response)
  mono: boolean; // Mono to Stereo conversion toggle
  pan: number; // -1 to 1
  eq: {
    low: number; // dB
    mid: number; // dB
    high: number; // dB
  };
  gate: {
    threshold: number;
    active: boolean;
  };
  compressor: {
    threshold: number;
    ratio: number;
    active: boolean;
  };
  routing: boolean[]; // 8 output busses
}

export interface MasterSettings {
  reverb: number; // 0 to 1
  delay: number; // 0 to 1
  noiseReduction: number; // 0 to 1 (Frequency cutoff factor)
  aec: boolean; // Echo Cancellation
  masterGain: number;
  outputDeviceId?: string;
}

export interface AudioMeterData {
  rms: number;
  peak: number;
}

// Health Monitor Types
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  REPAIRING = 'REPAIRING'
}

export enum AudioErrorCode {
  DEVICE_LOST = 'DEVICE_LOST',
  STREAM_STALL = 'STREAM_STALL',
  SILENT_FAILURE = 'SILENT_FAILURE',
  SAMPLE_RATE_MISMATCH = 'SAMPLE_RATE_MISMATCH'
}

export interface HealthReport {
  status: HealthStatus;
  lastError?: AudioErrorCode;
  timestamp: number;
  message: string;
}
