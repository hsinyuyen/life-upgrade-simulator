
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, X } from 'lucide-react';
import { WorkoutData, DietData, UserStats } from '../types';

function buildSystemPrompt(stats?: UserStats, workoutData?: WorkoutData, dietData?: DietData): string {
  let prompt = `You are the 'Life Guide', a friendly, knowledgeable fitness and nutrition coach in a life simulation game. You help the user with:
1. **Strength Training** — program design, form cues, progressive overload, periodization
2. **Cardio Planning** — HIIT, LISS, conditioning, endurance programming based on their goals
3. **Diet & Nutrition** — meal planning, macro targets, calorie management, supplement advice
4. **Recovery** — sleep, deload weeks, fatigue management
Use positive, gamified language. Be concise and actionable. Speak in the user's language (if they speak Chinese, reply in Chinese).`;

  if (stats) {
    prompt += `\n\nUser Profile: Level ${stats.level}, ${stats.xp} XP.`;
  }

  if (dietData?.profile) {
    const p = dietData.profile;
    prompt += `\nDiet Profile: ${p.heightCm}cm, ${p.weightKg}kg, Goal: ${p.goal}, Activity: ${p.activityLevel}.`;
    if (p.tdee) prompt += ` TDEE: ${p.tdee}kcal, Target: ${p.targetCalories}kcal.`;
  }

  if (workoutData) {
    const recentSessions = workoutData.sessions.slice(-5);
    if (recentSessions.length > 0) {
      prompt += `\nRecent ${recentSessions.length} workouts: ${recentSessions.map(s =>
        `${s.date}: ${s.bodyParts.join('+')} (${s.exercises.length} exercises, ${s.totalSets} sets)`
      ).join('; ')}.`;
    }
    if (workoutData.trainingProgram) {
      const tp = workoutData.trainingProgram;
      prompt += `\nCurrent Program: "${tp.name}", Phase: ${tp.phase}, Week ${tp.currentWeek}/${tp.totalWeeks}, ${tp.daysPerWeek}x/week.`;
    }
    if (workoutData.currentCycle) {
      prompt += `\nTraining Cycle: Phase ${workoutData.currentCycle.phase}, Fatigue ${workoutData.currentCycle.accumulatedFatigue}/10.`;
    }
  }

  return prompt;
}

// Decoding/Encoding Helpers
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

interface LiveCoachProps {
  onClose: () => void;
  stats?: UserStats;
  workoutData?: WorkoutData;
  dietData?: DietData;
}

export const LiveCoach: React.FC<LiveCoachProps> = ({ onClose, stats, workoutData, dietData }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 400);
  };

  const [transcription, setTranscription] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const startSession = async () => {
    setIsConnecting(true);
    try {
      // Create a new instance right before connecting as per guidelines.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              // Ensure sendRealtimeInput is called after the promise resolves to avoid race conditions.
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
            setIsActive(true);
            setIsConnecting(false);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) {
              setTranscription(msg.serverContent.outputTranscription.text);
            }

            const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const ctx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onerror: (e) => console.error('Coach Error', e),
          onclose: () => setIsActive(false),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          systemInstruction: buildSystemPrompt(stats, workoutData, dietData),
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
      setIsConnecting(false);
    }
  };

  const stopSession = () => {
    if (sessionRef.current) sessionRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    setIsActive(false);
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 bg-blue-400/20 backdrop-blur-md ${isClosing ? 'tv-screen-off' : 'tv-screen-on'}`}>
      <div className="w-full max-w-md bg-white rounded-[3rem] overflow-hidden relative shadow-2xl p-8 text-center space-y-6">
        <button onClick={handleClose} className="absolute top-6 right-6 p-2 text-slate-300 hover:text-slate-500">
          <X size={24} />
        </button>

        <div className="flex justify-center">
          <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${isActive ? 'border-blue-400 shadow-[0_0_30px_rgba(96,165,250,0.5)]' : 'border-slate-100'}`}>
            <img 
              src="https://api.dicebear.com/7.x/bottts/svg?seed=Guide" 
              alt="Guide" 
              className={`w-24 h-24 ${isActive ? 'animate-pulse' : 'grayscale'}`} 
            />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-game text-slate-800">LIFE GUIDE</h2>
          <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Oracle Session</p>
        </div>

        <div className="min-h-[100px] text-lg font-medium text-slate-600 px-4 py-4 bg-slate-50 rounded-3xl border border-slate-100 italic">
          {transcription || (isActive ? "I'm listening..." : "Ready to strategize your upgrades?")}
        </div>

        <div className="flex justify-center gap-4">
          {!isActive ? (
            <button 
              onClick={startSession}
              disabled={isConnecting}
              className="flex items-center gap-2 px-10 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-bold text-lg transition-all shadow-xl disabled:opacity-50"
            >
              {isConnecting ? 'CONNECTING...' : <><Mic size={24} /> TALK TO GUIDE</>}
            </button>
          ) : (
            <button 
              onClick={stopSession}
              className="flex items-center gap-2 px-10 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-full font-bold text-lg transition-all shadow-xl"
            >
              <MicOff size={24} /> FINISH TALKING
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
