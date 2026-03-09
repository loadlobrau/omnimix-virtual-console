
import { audioEngine } from './audioEngine';
import { AudioErrorCode, HealthReport, HealthStatus, ChannelSettings } from '../types';

class AudioHealthMonitor {
  private intervalId: number | null = null;
  private lastContextTime: number = 0;
  private sameTimeCount: number = 0;
  private silenceCounters: Record<number, number> = {};
  
  // Configuration
  private readonly CHECK_INTERVAL_MS = 1000;
  private readonly SILENCE_THRESHOLD_MS = 10000; // Increased to 10s
  private readonly STALL_THRESHOLD_COUNT = 3;

  private currentChannels: ChannelSettings[] = [];
  
  public onHealthUpdate: ((report: HealthReport) => void) | null = null;

  start(channels: ChannelSettings[]) {
    if (this.intervalId) return;
    this.currentChannels = channels;
    this.lastContextTime = audioEngine.getContextTime();
    
    const scheduleCheck = () => {
        this.intervalId = window.setTimeout(async () => {
            await this.performHealthCheck();
            if (this.intervalId) scheduleCheck();
        }, this.CHECK_INTERVAL_MS);
    };
    
    scheduleCheck();
    console.log("[HealthMonitor] Watchdog started.");
  }

  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  updateChannels(channels: ChannelSettings[]) {
    this.currentChannels = channels;
  }

  private async performHealthCheck() {
    const state = audioEngine.getContextState();

    if (state === 'closed' || state === 'uninitialized') {
        this.reportError(AudioErrorCode.STREAM_STALL, "Audio Context is offline.");
        return;
    }

    const currentTime = audioEngine.getContextTime();
    if (Math.abs(currentTime - this.lastContextTime) < 0.001) {
        if (state === 'running') {
            this.sameTimeCount++;
            if (this.sameTimeCount >= this.STALL_THRESHOLD_COUNT) {
                await this.executeProtocolC("Audio stream stalled.");
                this.sameTimeCount = 0;
            }
        } else if (state === 'suspended') {
             await audioEngine.tryResumeContext();
        }
    } else {
        this.sameTimeCount = 0;
    }
    this.lastContextTime = currentTime;

    // 2. Check Device Integrity (Protocol A)
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputDeviceIds = new Set(devices.filter(d => d.kind === 'audioinput').map(d => d.deviceId));

    for (const ch of this.currentChannels) {
        // FIX: Ignore 'display-capture' as it is a virtual browser ID, not a physical device
        if (ch.type === 'PHYSICAL' && ch.deviceId && ch.deviceId !== 'display-capture' && !inputDeviceIds.has(ch.deviceId)) {
            await this.executeProtocolA(ch.id, `Physical device ${ch.deviceId} disconnected.`);
        }
    }

    // 3. Check for Signal Presence (Informational only)
    for (const ch of this.currentChannels) {
        if (ch.deviceId) { 
            if (!ch.mute && ch.gain > 0) {
                const meterVal = audioEngine.getMeter(ch.id);
                if (meterVal.peak === 0) {
                    this.silenceCounters[ch.id] = (this.silenceCounters[ch.id] || 0) + this.CHECK_INTERVAL_MS;
                } else {
                    this.silenceCounters[ch.id] = 0;
                }
            } else {
                this.silenceCounters[ch.id] = 0;
            }
        }
    }

    this.onHealthUpdate?.({
        status: HealthStatus.HEALTHY,
        timestamp: Date.now(),
        message: "System Nominal"
    });
  }

  private async executeProtocolA(channelId: number, reason: string) {
    this.reportError(AudioErrorCode.DEVICE_LOST, reason);
    console.warn(`[HealthMonitor] Protocol A: Reverting Ch ${channelId} to default.`);
    await audioEngine.switchChannelToDefault(channelId);
  }

  private async executeProtocolC(reason: string) {
    this.reportError(AudioErrorCode.STREAM_STALL, reason);
    await audioEngine.tryResumeContext();
  }

  private reportError(code: AudioErrorCode, msg: string) {
    // Only log actual errors, ignore informational silence
    if (code !== AudioErrorCode.SILENT_FAILURE) {
        console.warn(`[AudioHealthReport] ${code}: ${msg}`);
        this.onHealthUpdate?.({
            status: HealthStatus.WARNING,
            lastError: code,
            timestamp: Date.now(),
            message: msg
        });
    }
  }
}

export const audioHealthMonitor = new AudioHealthMonitor();
