
import { ChannelSettings, MasterSettings, AudioMeterData } from '../types';

// --- Multithreaded AudioWorklet Code (Injected as Blob) ---
const GATE_PROCESSOR_CODE = `
class OmniGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.envelope = 0;
    this.gateGain = 0;
    this.sampleRate = 48000; 
  }
  
  static get parameterDescriptors() {
    return [
        {name: 'threshold', defaultValue: -100, minValue: -100, maxValue: 0},
        {name: 'bypass', defaultValue: 1, minValue: 0, maxValue: 1}
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const thresholdDB = parameters.threshold[0];
    const bypass = parameters.bypass[0] > 0.5;
    
    if (bypass) {
        if (input && output) {
             for (let c = 0; c < input.length; ++c) {
                 if (output[c]) output[c].set(input[c]);
             }
        }
        return true;
    }

    if (!input || input.length === 0) return true;

    const thresholdLinear = Math.pow(10, thresholdDB / 20);
    const attack = 0.005; 
    const release = 0.05;

    for (let c = 0; c < input.length; ++c) {
        const inputData = input[c];
        const outputData = output[c];
        
        if (!inputData || !outputData) continue;

        for (let i = 0; i < inputData.length; ++i) {
            const lvl = Math.abs(inputData[i]);
            
            // Envelope Follower
            if (lvl > this.envelope) {
                this.envelope += (lvl - this.envelope) * attack;
            } else {
                this.envelope += (lvl - this.envelope) * release;
            }

            // Smoothed Gate Logic
            const targetGain = this.envelope > thresholdLinear ? 1.0 : 0.0;
            this.gateGain += (targetGain - this.gateGain) * 0.05; // 5% slew per sample
            
            outputData[i] = inputData[i] * this.gateGain;
        }
    }
    return true;
  }
}
registerProcessor('omni-gate', OmniGateProcessor);
`;

interface ChannelStripNodes {
  source: MediaStreamAudioSourceNode | null;
  monoSplitter: ChannelSplitterNode;
  monoMerger: ChannelMergerNode;
  gateNode: AudioWorkletNode | null;
  compressorNode: DynamicsCompressorNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  panNode: StereoPannerNode;
  gainNode: GainNode;
  meterNode: AnalyserNode;
  stream: MediaStream | null;
  isConnectedToMaster: boolean;
}

class AudioEngine {
  private context: AudioContext | null = null;
  private channels: Map<number, ChannelStripNodes> = new Map();
  private soloChannelIds: Set<number> = new Set();
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterMeter: AnalyserNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private workletInitialized = false;
  private currentOutputDeviceId: string = 'default';
  
  // Metering Smoothing State
  private meterStates: Map<number, AudioMeterData> = new Map();
  private masterMeterState: AudioMeterData = { rms: 0, peak: 0 };
  private readonly DECAY_FACTOR = 0.85;

  constructor() {
    this.channels = new Map();
  }

  // Allow configuring latency/sample rate for "Driver" simulation
  async initialize(latencyHint: AudioContextLatencyCategory | number = 'interactive', sampleRate: number = 48000) {
    if (this.context) {
        if (this.context.state !== 'closed') await this.context.close();
    }
    this.channels.clear();
    this.meterStates.clear();
    this.masterMeterState = { rms: 0, peak: 0 };
    this.soloChannelIds.clear();
    
    // @ts-ignore - Some browsers strictly enforce typed latencyHint
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
        throw new Error("Web Audio API is not supported in this browser.");
    }
    this.context = new AudioContextClass({ latencyHint, sampleRate });
    this.workletInitialized = false;

    // Load AudioWorklet (Multithreading)
    try {
        const blob = new Blob([GATE_PROCESSOR_CODE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        try {
          await this.context.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        this.workletInitialized = true;
        console.log("OmniGate Processor Loaded on Audio Thread");
    } catch (e) {
        console.warn("Failed to load AudioWorklet, Gates will be bypassed", e);
    }

    // Master Bus Chain
    this.masterCompressor = this.context.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -24;
    this.masterCompressor.ratio.value = 12;

    this.masterGain = this.context.createGain();
    
    // Master Meter Setup
    this.masterMeter = this.context.createAnalyser();
    this.masterMeter.fftSize = 1024;
    this.masterMeter.smoothingTimeConstant = 0.8;

    this.destination = this.context.createMediaStreamDestination();

    // Chain: Comp -> Gain -> Meter -> Out
    this.masterCompressor.connect(this.masterGain);
    this.masterGain.connect(this.masterMeter);
    this.masterMeter.connect(this.context.destination); // Monitoring
    this.masterMeter.connect(this.destination); // Broadcast Stream
  }

  createChannelStrip(id: number) {
    if (!this.context) return;

    // Create Nodes
    let gateNode: AudioWorkletNode | null = null;
    
    if (this.workletInitialized) {
        gateNode = new AudioWorkletNode(this.context, 'omni-gate', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });
    }

    const monoSplitter = this.context.createChannelSplitter(2);
    const monoMerger = this.context.createChannelMerger(2);

    const compressorNode = this.context.createDynamicsCompressor();
    // Default Comp Settings (neutral)
    compressorNode.threshold.value = 0; 
    compressorNode.ratio.value = 1;

    const eqLow = this.context.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 320;

    const eqMid = this.context.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1.0;

    const eqHigh = this.context.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 3200;

    const panNode = this.context.createStereoPanner();
    const gainNode = this.context.createGain();
    const meterNode = this.context.createAnalyser();
    meterNode.fftSize = 1024;
    meterNode.smoothingTimeConstant = 0.8;

    // Chain: Source -> monoSplitter -> monoMerger -> Gate -> Comp -> EQ -> Pan -> Gain -> Meter -> Master
    // Source connects to monoSplitter in setInputDevice
    
    // Internal Chain Construction
    monoMerger.connect(gateNode || compressorNode);

    let inputHead: AudioNode = eqLow;
    
    if (gateNode) {
        gateNode.connect(compressorNode);
        compressorNode.connect(eqLow);
        inputHead = gateNode;
    } else {
        compressorNode.connect(eqLow);
        inputHead = compressorNode;
    }

    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(panNode);
    panNode.connect(gainNode);
    gainNode.connect(meterNode);

    // Initial Master Connection - NOT CONNECTED BY DEFAULT to respect 'monitor' flag
    // Connection will be managed in updateChannel

    this.channels.set(id, {
      source: null,
      monoSplitter,
      monoMerger,
      gateNode,
      compressorNode,
      eqLow,
      eqMid,
      eqHigh,
      panNode,
      gainNode,
      meterNode,
      stream: null,
      isConnectedToMaster: false
    });
  }

  async setInputDevice(id: number, deviceId: string) {
    if (!this.context) return;
    const ch = this.channels.get(id);
    if (!ch) return;

    // Cleanup old stream
    if (ch.stream) {
      ch.stream.getTracks().forEach(t => t.stop());
      if (ch.source) ch.source.disconnect();
      ch.stream = null;
      ch.source = null;
    }

    if (!deviceId) return;

    try {
      let stream: MediaStream;
      if (deviceId === 'display-capture') {
         try {
             // @ts-ignore
             const capturedStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
             // Keep only audio to reduce GPU/CPU overhead from shared video.
             const audioOnlyStream = new MediaStream(capturedStream.getAudioTracks());
             capturedStream.getVideoTracks().forEach(t => t.stop());
             stream = audioOnlyStream;
         } catch (e) {
             console.warn(`Display media cancelled or failed for Ch ${id}`, e);
             return;
         }
      } else {
         stream = await navigator.mediaDevices.getUserMedia({
            audio: { 
                deviceId: { exact: deviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 2
            }
         });
      }

      // Validate Audio Tracks
      if (stream.getAudioTracks().length === 0) {
          // Stop any video tracks if present (e.g. screen share without audio)
          stream.getTracks().forEach(t => t.stop());
          // THROW user-friendly error
          throw new Error("No audio tracks found. When capturing a window/tab, please ensure the 'Share Audio' checkbox is enabled in the selector.");
      }

      const source = this.context.createMediaStreamSource(stream);
      ch.stream = stream;
      ch.source = source;

      // Connect to the head of the chain (Mono Splitter)
      source.connect(ch.monoSplitter);
      
    } catch (err) {
      console.error(`[AudioEngine] Error on Ch ${id}:`, err);
      throw err; // Re-throw to UI
    }
  }

  async setOutputDevice(deviceId: string) {
    if (!this.context || this.context.state === 'closed') return;
    if (this.currentOutputDeviceId === deviceId) return;

    try {
        // @ts-ignore - setSinkId is not defined in standard TS lib for AudioContext yet
        if (typeof this.context.setSinkId === 'function') {
            // @ts-ignore
            await this.context.setSinkId(deviceId);
            this.currentOutputDeviceId = deviceId;
            console.log(`[AudioEngine] Master Output routed to ${deviceId}`);
        } else {
             console.warn("[AudioEngine] Output selection not supported (setSinkId missing).");
        }
    } catch (error) {
        console.error("[AudioEngine] Failed to set output device:", error);
    }
  }

  updateChannel(settings: ChannelSettings) {
    if (!this.context) return;
    const ch = this.channels.get(settings.id);
    if (!ch) return;

    // 0. Mono Logic (L -> L/R or L/R -> L/R)
    try {
        ch.monoSplitter.disconnect();
        if (settings.mono) {
            // Take Left channel (0) and put it in both L and R of the merger
            ch.monoSplitter.connect(ch.monoMerger, 0, 0);
            ch.monoSplitter.connect(ch.monoMerger, 0, 1);
        } else {
            // Map L to L and R to R (Normal Stereo)
            ch.monoSplitter.connect(ch.monoMerger, 0, 0);
            ch.monoSplitter.connect(ch.monoMerger, 1, 1);
        }
    } catch (e) { /* Node already disconnected or handled */ }

    // 1. Dynamics - Gate (AudioWorklet)
    if (ch.gateNode) {
        const bypass = settings.gate.active ? 0 : 1;
        // Params are k-rate (AudioParam)
        const thresholdParam = (ch.gateNode.parameters as any).get('threshold');
        const bypassParam = (ch.gateNode.parameters as any).get('bypass');
        
        if (thresholdParam) thresholdParam.setValueAtTime(settings.gate.threshold, this.context.currentTime);
        if (bypassParam) bypassParam.setValueAtTime(bypass, this.context.currentTime);
    }

    // 2. Dynamics - Compressor
    const comp = ch.compressorNode;
    if (settings.compressor.active) {
        comp.threshold.setTargetAtTime(settings.compressor.threshold, this.context.currentTime, 0.1);
        comp.ratio.setTargetAtTime(settings.compressor.ratio, this.context.currentTime, 0.1);
    } else {
        // Neutralize compressor
        comp.threshold.setTargetAtTime(0, this.context.currentTime, 0.1);
        comp.ratio.setTargetAtTime(1, this.context.currentTime, 0.1);
    }

    // 3. EQ
    ch.eqLow.gain.setTargetAtTime(settings.eq.low, this.context.currentTime, 0.1);
    ch.eqMid.gain.setTargetAtTime(settings.eq.mid, this.context.currentTime, 0.1);
    ch.eqHigh.gain.setTargetAtTime(settings.eq.high, this.context.currentTime, 0.1);

    // 4. Pan & Gain
    ch.panNode.pan.setTargetAtTime(settings.pan, this.context.currentTime, 0.1);
    
    // Mute/Solo Logic
    const isSoloSuppressed = this.soloChannelIds.size > 0 && !this.soloChannelIds.has(settings.id);
    const gainVal = (settings.mute || isSoloSuppressed) ? 0 : settings.gain;
    ch.gainNode.gain.setTargetAtTime(gainVal, this.context.currentTime, 0.05);

    // 5. Monitoring Logic (Playback)
    if (this.masterCompressor) {
        if (settings.monitor && !ch.isConnectedToMaster) {
            // Connect to master chain only if monitoring is requested
            ch.meterNode.connect(this.masterCompressor);
            ch.isConnectedToMaster = true;
            console.log(`[AudioEngine] Channel ${settings.id} monitoring ON`);
        } else if (!settings.monitor && ch.isConnectedToMaster) {
            // Disconnect from master chain to stop hearing input
            ch.meterNode.disconnect(this.masterCompressor);
            ch.isConnectedToMaster = false;
            console.log(`[AudioEngine] Channel ${settings.id} monitoring OFF`);
        }
    }
  }

  updateSoloState(channels: ChannelSettings[]) {
    const activeSoloIds = new Set(channels.filter(ch => ch.solo).map(ch => ch.id));
    this.soloChannelIds = activeSoloIds;
  }

  updateMaster(settings: MasterSettings) {
    if (!this.masterGain || !this.context) return;
    this.masterGain.gain.setTargetAtTime(settings.masterGain, this.context.currentTime, 0.1);
    
    // Check output routing
    if (settings.outputDeviceId && settings.outputDeviceId !== this.currentOutputDeviceId) {
        this.setOutputDevice(settings.outputDeviceId);
    }
  }

  private calculateRMSAndPeak(analyser: AnalyserNode, prevState: AudioMeterData): AudioMeterData {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(dataArray);

    let sum = 0;
    let peak = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i];
      sum += val * val;
      if (Math.abs(val) > peak) peak = Math.abs(val);
    }
    
    const rms = Math.sqrt(sum / bufferLength);
    
    // Apply Decay Smoothing
    const smoothedRMS = Math.max(rms, prevState.rms * this.DECAY_FACTOR);
    const smoothedPeak = Math.max(peak, prevState.peak * this.DECAY_FACTOR);
    
    return { rms: smoothedRMS, peak: smoothedPeak };
  }

  getMeter(id: number): AudioMeterData {
    const ch = this.channels.get(id);
    if (!ch) return { rms: 0, peak: 0 };
    
    const prevState = this.meterStates.get(id) || { rms: 0, peak: 0 };
    const newState = this.calculateRMSAndPeak(ch.meterNode, prevState);
    this.meterStates.set(id, newState);
    return newState;
  }
  
  getMasterMeter(): AudioMeterData {
    if (!this.masterMeter) return { rms: 0, peak: 0 };
    const newState = this.calculateRMSAndPeak(this.masterMeter, this.masterMeterState);
    this.masterMeterState = newState;
    return newState;
  }
  
  calculateOptimalMasterGain(): number {
      // Analyze current channel peaks to determine safe master gain
      let totalPeak = 0;
      this.channels.forEach((ch, id) => {
          const prevState = this.meterStates.get(id) || { rms: 0, peak: 0 };
          const { peak } = this.calculateRMSAndPeak(ch.meterNode, prevState);
          totalPeak += peak;
      });
      
      // If total possible amplitude > 1, we attenuate.
      // Target -1.0 dB (approx 0.89 linear) headroom
      if (totalPeak > 0.89) {
          return 0.89 / totalPeak;
      }
      return 1.0; // Default to unity if clean
  }

  getContextTime() {
    return this.context?.currentTime || 0;
  }

  getContextState() {
    return this.context?.state || 'uninitialized';
  }

  async tryResumeContext() {
    if (this.context && this.context.state === 'suspended') {
        await this.context.resume();
    }
  }

  async switchChannelToDefault(id: number) {
      const ch = this.channels.get(id);
      if(ch && ch.stream) {
          ch.stream.getTracks().forEach(t => t.stop());
      }
      // Only attempt switch if context is actually alive
      if (this.context && this.context.state !== 'closed') {
          try {
              await this.setInputDevice(id, 'default');
          } catch(e) {
              console.error("Protocol A failed: No default device available.");
          }
      }
  }
}

export const audioEngine = new AudioEngine();
