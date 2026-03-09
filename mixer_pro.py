
import customtkinter as ctk
import sounddevice as sd
import numpy as np
import psutil
import os
import math
import sys
import threading
import queue

# --- Configuration & Constants ---
SAMPLE_RATE = 48000
BLOCK_SIZE = 256  # Low latency (approx 5.3ms)
CHANNELS = 2
DTYPE = 'float32'
MIN_DB = -60.0
MAX_DB = 0.0
METER_DECAY = 0.8  # Visual smoothing factor

# --- System Optimization ---
def set_high_priority():
    """Sets the Python process priority to High to prevent audio dropouts."""
    try:
        p = psutil.Process(os.getpid())
        if sys.platform == 'win32':
            p.nice(psutil.HIGH_PRIORITY_CLASS)
        else:
            p.nice(-10) 
        print(f"System Priority set to High for Process {p.pid}")
    except Exception as e:
        print(f"Could not set priority: {e}")

# --- Audio Engine ---
class AudioEngine:
    def __init__(self):
        self.stream = None
        self.is_running = False
        self.master_gain = 1.0
        # Use a Queue to safely pass metering data from Audio Thread to GUI Thread
        self.meter_queue = queue.Queue(maxsize=1) 

    def set_gain_db(self, db_value):
        """Converts dB to Linear gain for DSP multiplication."""
        if db_value <= MIN_DB:
            self.master_gain = 0.0
        else:
            self.master_gain = 10 ** (db_value / 20.0)

    def audio_callback(self, indata, outdata, frames, time, status):
        """
        Real-time DSP Callback. 
        """
        if status:
            pass # Production app would log this

        # 1. Vectorized DSP (Gain Application)
        # Apply Master Gain to Input -> Output
        np.multiply(indata, self.master_gain, out=outdata)

        # 2. Metering Calculation (Post-Gain)
        # Calculate RMS of the processed (outgoing) block
        rms_linear = np.sqrt(np.mean(outdata**2))
        
        # 3. Send to GUI Thread
        # We only care about the latest frame. If queue is full, skip (drop frame).
        try:
            self.meter_queue.put_nowait(rms_linear)
        except queue.Full:
            pass

    def start(self, in_id, out_id):
        if self.is_running: return
        
        try:
            self.stream = sd.Stream(
                device=(in_id, out_id),
                samplerate=SAMPLE_RATE,
                blocksize=BLOCK_SIZE,
                dtype=DTYPE,
                channels=CHANNELS,
                callback=self.audio_callback,
                latency='low' 
            )
            self.stream.start()
            self.is_running = True
            return True
        except Exception as e:
            print(f"Engine Start Failed: {e}")
            return False

    def stop(self):
        if self.stream:
            self.stream.stop()
            self.stream.close()
        self.is_running = False

# --- GUI Class ---
class ProMixerUI(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        self.title("PyMix Pro | Master Console")
        self.geometry("450x750")
        
        set_high_priority()
        
        self.engine = AudioEngine()
        self.displayed_db = MIN_DB
        
        # Device Maps (Name -> ID)
        self.map_in = {}
        self.map_out = {}
        
        self._setup_ui()
        self.refresh_devices()
        
        # Start GUI Update Loop (30 FPS approx)
        self.after(30, self.update_loop)

    def _setup_ui(self):
        # Configure Main Grid
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # Master Section Frame
        self.frame_master = ctk.CTkFrame(self, corner_radius=10)
        self.frame_master.grid(row=0, column=0, padx=20, pady=20, sticky="nsew")
        
        # Grid layout for Master Frame
        self.frame_master.grid_columnconfigure(0, weight=1)
        self.frame_master.grid_columnconfigure(1, weight=1)
        
        # --- Row 0: Routing & Refresh ---
        ctk.CTkLabel(self.frame_master, text="AUDIO I/O ROUTING", font=("Arial", 11, "bold"), text_color="gray").grid(row=0, column=0, columnspan=2, pady=(20, 5))
        
        self.combo_in = ctk.CTkComboBox(self.frame_master, width=280)
        self.combo_in.grid(row=1, column=0, columnspan=2, pady=5)
        
        self.combo_out = ctk.CTkComboBox(self.frame_master, width=240)
        self.combo_out.grid(row=2, column=0, columnspan=2, pady=5, sticky="w", padx=(30,0))
        
        self.btn_refresh = ctk.CTkButton(self.frame_master, text="🔄", width=40, command=self.refresh_devices, fg_color="#444")
        self.btn_refresh.grid(row=2, column=1, sticky="e", padx=(0, 30))

        # --- Row 1-2: FX Knobs (Visuals) ---
        ctk.CTkLabel(self.frame_master, text="DYNAMICS PROCESSOR", font=("Arial", 10, "bold"), text_color="#3498db").grid(row=3, column=0, columnspan=2, pady=(20, 10))
        
        # Fake Knobs (Using small sliders)
        self.fx1 = ctk.CTkSlider(self.frame_master, width=120, height=16, progress_color="#e67e22")
        self.fx1.set(0.6)
        self.fx1.grid(row=4, column=0, pady=5)
        ctk.CTkLabel(self.frame_master, text="THRESHOLD").grid(row=5, column=0)

        self.fx2 = ctk.CTkSlider(self.frame_master, width=120, height=16, progress_color="#e67e22")
        self.fx2.set(0.2)
        self.fx2.grid(row=4, column=1, pady=5)
        ctk.CTkLabel(self.frame_master, text="RATIO").grid(row=5, column=1)

        # --- Row 3: Master Fader & Meter ---
        ctk.CTkLabel(self.frame_master, text="MASTER GAIN", font=("Arial", 12, "bold")).grid(row=6, column=0, columnspan=2, pady=(20, 5))

        # Fader (Column 0) - Vertical, 280px Length
        self.slider = ctk.CTkSlider(
            self.frame_master,
            from_=MIN_DB, to=12,
            orientation="vertical",
            height=280, 
            width=24,
            command=self.on_gain_change
        )
        self.slider.set(0)
        self.slider.grid(row=7, column=0, pady=10)

        # Meter (Column 1) - Vertical, 280px Length, Color Coded via logic
        self.meter_bar = ctk.CTkProgressBar(
            self.frame_master,
            orientation="vertical",
            height=280,
            width=24,
            progress_color="#2ecc71"
        )
        self.meter_bar.set(0)
        self.meter_bar.grid(row=7, column=1, pady=10)
        
        # dB Readout
        self.lbl_db = ctk.CTkLabel(self.frame_master, text="-INF dB", font=("Courier", 16, "bold"))
        self.lbl_db.grid(row=8, column=0, columnspan=2, pady=5)

        # --- Row 4: Power / Optimizer ---
        self.btn_power = ctk.CTkButton(
            self.frame_master, 
            text="ACTIVATE ENGINE", 
            fg_color="#27ae60", hover_color="#2ecc71",
            height=50,
            font=("Arial", 14, "bold"),
            command=self.toggle_engine
        )
        self.btn_power.grid(row=9, column=0, columnspan=2, pady=30, padx=20, sticky="ew")

    def refresh_devices(self):
        """Scans for WASAPI devices and maps names to IDs safely."""
        self.map_in.clear()
        self.map_out.clear()
        try:
            devices = sd.query_devices()
            hostapis = sd.query_hostapis()
            
            # Find WASAPI Host API Index
            wasapi_index = -1
            for api in hostapis:
                if 'WASAPI' in api['name']:
                    wasapi_index = api['index']
                    break
            
            target_api = wasapi_index if wasapi_index != -1 else 0 # Fallback to MME/Default if no WASAPI
            
            in_names = []
            out_names = []

            for i, dev in enumerate(devices):
                if dev['hostapi'] == target_api:
                    name = f"{dev['name']}"
                    # Input
                    if dev['max_input_channels'] > 0:
                        self.map_in[name] = i
                        in_names.append(name)
                    # Output
                    if dev['max_output_channels'] > 0:
                        self.map_out[name] = i
                        out_names.append(name)
            
            self.combo_in.configure(values=in_names)
            self.combo_out.configure(values=out_names)
            
            if in_names: self.combo_in.set(in_names[0])
            if out_names: self.combo_out.set(out_names[0])
            
        except Exception as e:
            print(f"Device Refresh Error: {e}")

    def on_gain_change(self, val):
        self.engine.set_gain_db(val)

    def toggle_engine(self):
        if not self.engine.is_running:
            # Get IDs safely
            in_name = self.combo_in.get()
            out_name = self.combo_out.get()
            
            in_id = self.map_in.get(in_name)
            out_id = self.map_out.get(out_name)
            
            if in_id is not None and out_id is not None:
                if self.engine.start(in_id, out_id):
                    self.btn_power.configure(text="STOP ENGINE", fg_color="#c0392b", hover_color="#e74c3c")
            else:
                print("Invalid Device Selection")
        else:
            self.engine.stop()
            self.btn_power.configure(text="ACTIVATE ENGINE", fg_color="#27ae60", hover_color="#2ecc71")

    def update_loop(self):
        """GUI Thread: Polls metering queue and updates UI."""
        try:
            # Drain queue to get the absolute latest value
            rms_val = None
            while not self.engine.meter_queue.empty():
                rms_val = self.engine.meter_queue.get_nowait()
            
            if rms_val is not None:
                # Convert to dB
                if rms_val > 0.00000001:
                    db = 20 * math.log10(rms_val)
                else:
                    db = MIN_DB
                
                # Decay Smoothing
                if db > self.displayed_db:
                    self.displayed_db = db # Instant Attack
                else:
                    self.displayed_db = self.displayed_db * METER_DECAY + db * (1 - METER_DECAY)
                
                # Clamp for UI
                ui_db = max(MIN_DB, self.displayed_db)
                
                # Update Text
                self.lbl_db.configure(text=f"{ui_db:.1f} dB")
                
                # Update Bar (0.0 to 1.0)
                progress = (ui_db - MIN_DB) / (MAX_DB - MIN_DB)
                self.meter_bar.set(max(0.0, min(1.0, progress)))
                
                # Color Coding
                if ui_db > -3:
                    self.meter_bar.configure(progress_color="#e74c3c") # Red
                elif ui_db > -12:
                    self.meter_bar.configure(progress_color="#f1c40f") # Yellow
                else:
                    self.meter_bar.configure(progress_color="#2ecc71") # Green

        except Exception:
            pass
        
        # Re-schedule
        self.after(30, self.update_loop)

if __name__ == "__main__":
    app = ProMixerUI()
    app.mainloop()
