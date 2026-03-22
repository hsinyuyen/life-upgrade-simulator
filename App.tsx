
import React, { useState, useEffect } from 'react';
import { UserStats, Activity, Category, QuestItem, DailyDebuff, EmergencyDebuff, DietData, NutritionBuff, WorkoutData, StoryState, StoryChapter, CharacterSkin, SkinDecoration } from './types';
import { AvatarSection } from './components/AvatarSection';
import { AdminPanel } from './components/AdminPanel';
import { DietPanel } from './components/DietPanel';
import { WorkoutPanel } from './components/WorkoutPanel';
import { SkinShop } from './components/SkinShop';
import { Auth, LogoutButton } from './components/Auth';
import { geminiService } from './services/geminiService';
import { db, auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot, getDoc, updateDoc, increment } from 'firebase/firestore';
import { 
  Plus, 
  ChevronRight, 
  MessageCircle,
  X,
  Send,
  Sparkles,
  CheckCircle2,
  Settings,
  Menu,
  AlertTriangle,
  Zap,
  ArrowUp,
  Heart,
  Dumbbell,
  Clock,
  Shield,
  ShieldAlert,
  Coins,
  ShoppingBag,
  Loader2,
  Volume2,
  VolumeX,
  BookOpen
} from 'lucide-react';
import { LiveCoach } from './components/LiveCoach';
import { QuestPanel } from './components/QuestPanel';
import { StoryPanel } from './components/StoryPanel';
import { storageService } from './services/storageService';
import { seedanceService } from './services/seedanceService';

const lifeLogo = './life_logo.png';

const XP_SEQUENCE = [1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000];

const INITIAL_STATS: UserStats = {
  level: 1,
  healthXP: 0,
  careerXP: 0,
  knowledgeXP: 0,
  familySocialXP: 0,
  xpToNextLevel: XP_SEQUENCE[0],
  totalPoints: 0,
  streak: 0,
  dailyDebuff: null as any,
  emergencyDebuffs: [],
  dailyActivityCounts: {},
  lastActivityDate: new Date().toISOString().split('T')[0],
  neurozoidsToday: 0,
  deductionsCountToday: 0,
  logPoints: 10,
};

// Helper: 確保沒有 undefined 值，Firebase 不接受 undefined
const cleanDataForFirebase = (obj: any) => {
  try {
    return JSON.parse(JSON.stringify(obj, (key, value) => 
      value === undefined ? null : value
    ));
  } catch (e) {
    console.error("Error cleaning data for Firebase:", e);
    return obj;
  }
};

// Helper: get today's date string
const getTodayStr = () => new Date().toISOString().split('T')[0];

// Helper: get end of today timestamp (23:59:59)
const getEndOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

const INITIAL_DIET_DATA: DietData = {
  profile: null,
  bodyLogs: [],
  currentPlan: null,
  planHistory: [],
  nutritionData: {
    savedFoods: [],
    dailyLogs: [],
    macroTargets: null,
  }
};

const INITIAL_WORKOUT_DATA: WorkoutData = {
  sessions: [],
  exercisePRs: {},
};

const INITIAL_STORY_STATE: StoryState = {
  initialized: false,
  genre: '',
  storyBible: '',
  storySummary: '',
  chapters: [],
  currentArc: 1,
  choicesMade: [],
  pendingMission: null,
  lastMilestones: {
    [Category.HEALTH]: 0,
    [Category.CAREER]: 0,
    [Category.KNOWLEDGE]: 0,
    [Category.FAMILY_SOCIAL]: 0,
  },
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showMainScreen, setShowMainScreen] = useState(false);
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // 新增：搜尋功能
  const [showCoach, setShowCoach] = useState(false);
  const [activeTab, setActiveTab] = useState<'quests' | 'logs'>('quests');
  const [showLog, setShowLog] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isActionsExpanded, setIsActionsExpanded] = useState(false); // 新增：控制按鈕展開狀態
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyInput, setEmergencyInput] = useState('');
  const [emergencyStatus, setEmergencyStatus] = useState<'idle' | 'checking' | 'approved' | 'denied'>('idle');
  const [emergencyMessage, setEmergencyMessage] = useState('');
  const [floatingPoints, setFloatingPoints] = useState<{ id: string; points: number; x: number; y: number; type: 'add' | 'sub' }[]>([]);
  const [prevAvatar, setPrevAvatar] = useState<string | undefined>(undefined);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [questItems, setQuestItems] = useState<QuestItem[]>([]);
  const [showBuffDebuffInfo, setShowBuffDebuffInfo] = useState(false);
  const [showDiet, setShowDiet] = useState(false);
  const [showWorkout, setShowWorkout] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [workoutData, setWorkoutData] = useState<WorkoutData>(INITIAL_WORKOUT_DATA);
  const [dietData, setDietData] = useState<DietData>(INITIAL_DIET_DATA);
  const [showStory, setShowStory] = useState(false);
  const [storyState, setStoryState] = useState<StoryState>(INITIAL_STORY_STATE);
  const [storyNotification, setStoryNotification] = useState<string | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isMusicInitialized, setIsMusicInitialized] = useState(false);
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
  const [characterGenProgress, setCharacterGenProgress] = useState<string | undefined>();
  const [characterState, setCharacterState] = useState<'normal' | 'buffed' | 'debuffed' | 'both'>('normal');
  const [newlyDrawnSkin, setNewlyDrawnSkin] = useState<CharacterSkin | null>(null);
  const [isAnimatingSkin, setIsAnimatingSkin] = useState(false);
  const [animatingProgress, setAnimatingProgress] = useState<string | undefined>();
  const [newlyAnimatedSkin, setNewlyAnimatedSkin] = useState<CharacterSkin | null>(null);

  // One-time gift for existing users
  useEffect(() => {
    if (!user || isInitialLoad) return;
    
    const giftKey = `gift_v1_${user.uid}`;
    if (localStorage.getItem(giftKey)) return;

    const grantGift = async () => {
      try {
        const userDoc = doc(db, "users", user.uid);
        await updateDoc(userDoc, {
          "stats.logPoints": increment(10)
        });
        localStorage.setItem(giftKey, 'true');
        console.log("10 Log Points gift granted to existing user!");
      } catch (e) {
        console.error("Failed to grant gift:", e);
      }
    };
    grantGift();
  }, [user, isInitialLoad]);

  // Background music management
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const audioElementRef = React.useRef<HTMLAudioElement | null>(null);
  const sourceNodeRef = React.useRef<MediaElementAudioSourceNode | null>(null);
  const compressorRef = React.useRef<DynamicsCompressorNode | null>(null);
  const lowPassFilterRef = React.useRef<BiquadFilterNode | null>(null);
  const highPassFilterRef = React.useRef<BiquadFilterNode | null>(null);
  const gainNodeRef = React.useRef<GainNode | null>(null);

  // Initialize background music
  useEffect(() => {
    if (isMusicInitialized) return;

    try {
      // Use a more standard relative path
      const audioPath = 'hyper cyber.mp3';
      const audio = new Audio(audioPath);
      audio.loop = true;
      audio.volume = 0.3;
      audio.preload = 'auto'; // Force preload
      audioElementRef.current = audio;

      audio.onerror = (e) => {
        console.warn('Background music failed to load at:', audioPath, e);
      };

      audio.oncanplaythrough = () => {
        console.log('Audio file ready to play');
      };

      // ... rest of audio context setup ...

      // Create Web Audio API context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      // Create audio nodes
      const source = audioContext.createMediaElementSource(audio);
      sourceNodeRef.current = source;

      // Create compressor (for effect when not on main screen)
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;
      compressorRef.current = compressor;

      // Create gain node
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1;
      gainNodeRef.current = gainNode;

      // Create filters for effects
      const lpFilter = audioContext.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.value = 20000;
      lowPassFilterRef.current = lpFilter;

      const hpFilter = audioContext.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.value = 0;
      highPassFilterRef.current = hpFilter;

      // Initially connect directly (no effects)
      source.connect(audioContext.destination);

      setIsMusicInitialized(true);
      console.log('Music system initialized');

    } catch (err) {
      console.error('Failed to initialize music:', err);
    }

    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch (e) {}
      }
    };
  }, [isMusicInitialized]);

  // Function to start/stop music
  const toggleMusic = async () => {
    if (!audioElementRef.current || !audioContextRef.current) {
      alert("Audio system not ready. Please ensure 'hyper cyber.mp3' is in your public folder.");
      return;
    }

    try {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      if (isMusicPlaying) {
        audioElementRef.current.pause();
        setIsMusicPlaying(false);
      } else {
        // Force a re-load if it failed before
        if (audioElementRef.current.error || audioElementRef.current.networkState === 3) {
          console.log("Attempting to re-load audio...");
          audioElementRef.current.load();
        }
        
        await audioElementRef.current.play();
        setIsMusicPlaying(true);
      }
    } catch (err) {
      console.error('Music toggle failed:', err);
      // Detailed error message
      let msg = "Could not play music.";
      if (err instanceof Error && err.name === 'NotAllowedError') {
        msg += " Browser blocked autoplay. Please click anywhere on the page first.";
      } else {
        msg += " Please check if 'hyper cyber.mp3' exists in the 'public' folder and is a valid MP3 file.";
      }
      alert(msg);
    }
  };

  // Apply audio effects based on current panel state
  useEffect(() => {
    if (!audioContextRef.current || !sourceNodeRef.current || !audioElementRef.current) return;

    try {
      // Disconnect all nodes first
      sourceNodeRef.current.disconnect();
      if (compressorRef.current) compressorRef.current.disconnect();
      if (lowPassFilterRef.current) lowPassFilterRef.current.disconnect();
      if (highPassFilterRef.current) highPassFilterRef.current.disconnect();
      if (gainNodeRef.current) gainNodeRef.current.disconnect();

      let playbackRate = 1.0;
      let lpFreq = 20000;
      let hpFreq = 0;
      let useCompressor = false;

      if (showSidebar) {
        // Menu: Land phone filter (Bandpass 300Hz - 3400Hz) + Compression
        lpFreq = 3400;
        hpFreq = 300;
        useCompressor = true;
      } else if (showAdmin) {
        playbackRate = Math.pow(2, 3/12); // +3 semitones
      } else if (showQuests) {
        playbackRate = Math.pow(2, 2/12); // +2 semitones
      } else if (showDiet) {
        playbackRate = Math.pow(2, 1/12); // +1 semitone
      } else if (showWorkout) {
        playbackRate = Math.pow(2, -1/12); // -1 semitone
      } else if (showStory) {
        playbackRate = Math.pow(2, -2/12); // -2 semitones
      } else if (showShop) {
        playbackRate = Math.pow(2, -3/12); // -3 semitones
      }

      // Set node values
      if (lowPassFilterRef.current) lowPassFilterRef.current.frequency.value = lpFreq;
      if (highPassFilterRef.current) highPassFilterRef.current.frequency.value = hpFreq;
      audioElementRef.current.playbackRate = playbackRate;

      // Routing
      let lastNode: AudioNode = sourceNodeRef.current;

      if (useCompressor && compressorRef.current) {
        lastNode.connect(compressorRef.current);
        lastNode = compressorRef.current;
      }

      if (lpFreq < 20000 && lowPassFilterRef.current) {
        lastNode.connect(lowPassFilterRef.current);
        lastNode = lowPassFilterRef.current;
      }

      if (hpFreq > 0 && highPassFilterRef.current) {
        lastNode.connect(highPassFilterRef.current);
        lastNode = highPassFilterRef.current;
      }

      lastNode.connect(audioContextRef.current.destination);

    } catch (err) {
      console.log('Audio routing error:', err);
    }
  }, [user, isAuthLoading, showAdmin, showDiet, showWorkout, showShop, showCoach, showSidebar, showEmergencyModal, showBuffDebuffInfo, showQuests, showStory]);

  // Trigger TV screen-on animation when user is loaded
  useEffect(() => {
    if (!isAuthLoading && user) {
      // Small delay to ensure the element is mounted before animation starts
      const timer = setTimeout(() => {
        setShowMainScreen(true);
      }, 10);
      return () => clearTimeout(timer);
    } else {
      setShowMainScreen(false);
    }
  }, [isAuthLoading, user]);

  // Reset state on logout
  useEffect(() => {
    if (!user && !isAuthLoading) {
      setStats(INITIAL_STATS);
      setActivities([]);
      setQuestItems([]);
      setDietData(INITIAL_DIET_DATA);
      setWorkoutData(INITIAL_WORKOUT_DATA);
      setIsInitialLoad(true);
      setShowAdmin(false);
      setShowDiet(false);
      setShowWorkout(false);
      setShowShop(false);
      setShowCoach(false);
      setShowQuests(false);
      setShowStory(false);
      setStoryState(INITIAL_STORY_STATE);
    }
  }, [user, isAuthLoading]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firebase init - with dataLoadedRef to prevent race conditions
  const dataLoadedRef = React.useRef(false);

  useEffect(() => {
    if (!user) {
      dataLoadedRef.current = false;
      return;
    }
    console.log("Current Auth User ID:", user.uid);

    const userDoc = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log("Firebase data loaded:", data);
        console.log("  - activities count:", data.activities?.length ?? 0);
        console.log("  - stats level:", data.stats?.level ?? "N/A");
        console.log("  - stats healthXP:", data.stats?.healthXP ?? "N/A");
        
        if (data.stats) {
          setStats({ ...INITIAL_STATS, ...data.stats });
        } else {
          setStats(INITIAL_STATS);
        }
        
        if (data.activities) {
          setActivities(data.activities);
        } else {
          setActivities([]);
        }

        if (data.questItems) {
          setQuestItems(data.questItems);
        } else {
          setQuestItems([]);
        }

        if (data.dietData) {
          setDietData(data.dietData);
        } else {
          setDietData(INITIAL_DIET_DATA);
        }

        if (data.workoutData) {
          setWorkoutData(data.workoutData);
        } else {
          setWorkoutData(INITIAL_WORKOUT_DATA);
        }

        if (data.storyState) {
          setStoryState({ ...INITIAL_STORY_STATE, ...data.storyState });
        } else {
          setStoryState(INITIAL_STORY_STATE);
        }
        
        dataLoadedRef.current = true;
        setIsInitialLoad(false);
      } else {
        // CRITICAL: Only initialize a new profile if we are CERTAIN this is a brand new user
        // Check if the user was JUST created (within last 60 seconds)
        const userCreationTime = user.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : 0;
        const isNewUser = (Date.now() - userCreationTime) < 60000; // 60 seconds

        if (isNewUser) {
          console.log("Brand new user detected, initializing profile:", user.uid);
          const initialPayload = cleanDataForFirebase({
            stats: INITIAL_STATS,
            activities: [],
            questItems: [],
            dietData: INITIAL_DIET_DATA,
            workoutData: INITIAL_WORKOUT_DATA,
            storyState: INITIAL_STORY_STATE
          });
          
          setDoc(userDoc, initialPayload)
            .then(() => {
              console.log("New profile initialized successfully");
              dataLoadedRef.current = true;
              setIsInitialLoad(false);
            })
            .catch(err => {
              console.error("Failed to initialize new profile:", err);
            });
        } else {
          console.warn("No Firebase data found but user is NOT new. Account created:", user.metadata?.creationTime);
          console.warn("NOT overwriting - this might be a temporary read failure. Retrying...");
          // Retry reading after a short delay instead of creating blank data
          setTimeout(async () => {
            try {
              const retrySnap = await getDoc(userDoc);
              if (retrySnap.exists()) {
                console.log("Retry successful - data found!");
                // Let onSnapshot handle it on next fire
              } else {
                console.warn("Retry also found no data. Setting initial load false to allow app to function.");
                dataLoadedRef.current = true;
                setIsInitialLoad(false);
              }
            } catch (err) {
              console.error("Retry read failed:", err);
              dataLoadedRef.current = true;
              setIsInitialLoad(false);
            }
          }, 3000);
        }
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Expire debuffs check
  useEffect(() => {
    const now = Date.now();
    let needsUpdate = false;
    const newStats = { ...stats };

    // Check daily debuff expiry
    if (newStats.dailyDebuff?.active && now > newStats.dailyDebuff.expiresAt) {
      newStats.dailyDebuff = { ...newStats.dailyDebuff, active: false };
      needsUpdate = true;
    }

    // Reset daily activity counts and neurozoids if new day
    const today = getTodayStr();
    if (newStats.lastActivityDate !== today) {
      // ⚠️ NEVER RESET XP BARS - They persist across the 10-year journey
      // Only reset daily-specific data:
      newStats.dailyActivityCounts = {};
      newStats.lastActivityDate = today;
      newStats.neurozoidsToday = 0; // Daily currency resets
      newStats.deductionsCountToday = 0; // Deduction counter resets
      
      // Force-expire daily debuff at midnight
      if (newStats.dailyDebuff?.active) {
        newStats.dailyDebuff = { ...newStats.dailyDebuff, active: false };
      }
      
      // Force-expire nutrition buff at midnight (even if 12h timer not done)
      if (newStats.nutritionBuff?.active) {
        newStats.nutritionBuff = { ...newStats.nutritionBuff, active: false };
      }
      
      needsUpdate = true;
    }

    if (needsUpdate && !isInitialLoad && dataLoadedRef.current) {
      console.log("Daily reset/update needed (data confirmed loaded)");
      setStats(newStats);
      syncToFirebase(newStats, activities);
    }
  }, [stats.dailyDebuff, stats.lastActivityDate, isInitialLoad]);

  // On data load, auto-detect missed story milestones
  useEffect(() => {
    if (isInitialLoad || !dataLoadedRef.current) return;
    if (!storyState.initialized) return;
    if (storyState.pendingMission && !storyState.pendingMission.completed) return;

    const timer = setTimeout(() => {
      checkMissedMilestones(storyState, stats);
    }, 3000);
    return () => clearTimeout(timer);
  }, [isInitialLoad, storyState.initialized, storyState.pendingMission]);

  const syncToFirebase = async (newStats: UserStats, newActivities: Activity[], newQuests?: QuestItem[], newDietData?: DietData, newWorkoutData?: WorkoutData, newStoryState?: StoryState) => {
    if (isInitialLoad || !user) {
      console.log("Sync skipped: initial load in progress or no user");
      return;
    }

    // CRITICAL: Don't sync until Firebase data has been loaded at least once
    if (!dataLoadedRef.current) {
      console.warn("Sync blocked: Firebase data has not been loaded yet. Refusing to overwrite.");
      return;
    }

    // Safety check: Don't sync if stats XP are ALL zero (likely initial state accidentally leaking)
    if (newStats.healthXP === 0 && newStats.careerXP === 0 && newStats.knowledgeXP === 0 && (newStats.familySocialXP ?? 0) === 0 && newStats.level === 1) {
      // Only allow this if the user truly has no activities (brand new user)
      if (newActivities.length === 0) {
        console.log("Syncing brand new user profile (all zeros, no activities).");
      } else {
        console.warn("Sync blocked: Stats are all zeros but activities exist. This looks like a state reset bug.");
        return;
      }
    }

    let payload: any = null;
    try {
      const userDoc = doc(db, "users", user.uid);
      
      payload = cleanDataForFirebase({
        stats: newStats,
        activities: newActivities,
        questItems: newQuests || questItems,
        dietData: newDietData || dietData,
        workoutData: newWorkoutData || workoutData,
        storyState: newStoryState || storyState,
      });

      console.log("Syncing to Firebase, payload size approx:", JSON.stringify(payload).length, "bytes");
      await setDoc(userDoc, payload, { merge: true });
    } catch (e: any) {
      console.error("Firebase sync failed:", e);
      if (e.message?.includes('BLOCKED_BY_CLIENT') || e.code === 'unavailable') {
        alert("Firebase connection blocked by client (possibly an AdBlocker). Please disable AdBlocker for this site to save progress.");
      } else if (e.message?.includes('invalid nested entity')) {
        console.error("Invalid entity details:", payload);
      } else if (e.message?.includes('400') || e.code === 'failed-precondition') {
        console.warn("Detected Firestore connection issue (400). This may be a temporary network glitch.");
      }
    }
  };

  // Level up check
  useEffect(() => {
    if (isInitialLoad) return;
    if (stats.healthXP >= stats.xpToNextLevel && 
        stats.careerXP >= stats.xpToNextLevel && 
        stats.knowledgeXP >= stats.xpToNextLevel &&
        (stats.familySocialXP ?? 0) >= stats.xpToNextLevel) {
      // Level up!
      const newLevel = stats.level + 1;
      const newStats = {
        ...stats,
        level: newLevel,
        healthXP: stats.healthXP - stats.xpToNextLevel,
        careerXP: stats.careerXP - stats.xpToNextLevel,
        knowledgeXP: stats.knowledgeXP - stats.xpToNextLevel,
        familySocialXP: (stats.familySocialXP ?? 0) - stats.xpToNextLevel,
        xpToNextLevel: XP_SEQUENCE[Math.min(newLevel - 1, XP_SEQUENCE.length - 1)],
      };
      setStats(newStats);
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 3500);
      syncToFirebase(newStats, activities);
    }
  }, [stats.healthXP, stats.careerXP, stats.knowledgeXP, stats.familySocialXP]);

  // Compute character state from buff/debuff status
  useEffect(() => {
    const isBuffed = stats.nutritionBuff?.active && Date.now() < (stats.nutritionBuff.expiresAt || 0);
    const isDebuffed = getDebuffMultiplier() < 1;
    
    let state: 'normal' | 'buffed' | 'debuffed' | 'both' = 'normal';
    if (isBuffed && isDebuffed) state = 'both';
    else if (isBuffed) state = 'buffed';
    else if (isDebuffed) state = 'debuffed';

    setCharacterState(state);
  }, [stats.nutritionBuff, stats.dailyDebuff, stats.emergencyDebuffs, stats.deductionsCountToday]);

  // Avatar based on level and state (fallback when no AI character skin equipped)
  useEffect(() => {
    if (stats.equippedCharacterSkin && stats.characterSkins?.length) return;

    const level = stats.level;
    const levelAvatars: Record<number, { normal: string; buffed: string; debuffed: string; both: string }> = {
      1: {
        normal: './avatars/level1/lv1.gif',
        buffed: './avatars/level1/lv1_buff.gif',
        debuffed: './avatars/level1/lv1_debuff.gif',
        both: './avatars/level1/lv1_buff_debuff.gif',
      },
      2: {
        normal: './avatars/level2/Gemini_Generated_Image_yk0x3vyk0x3vyk0x.png',
        buffed: './avatars/level2/lv2_buff.png',
        debuffed: './avatars/level2/lv2_debuff.png',
        both: './avatars/level2/lv2_debuff_buff.png',
      },
      3: {
        normal: './avatars/level3/Gemini_Generated_Image_eay8mjeay8mjeay8.png',
        buffed: './avatars/level3/lv3_buff.png',
        debuffed: './avatars/level3/lv3_debuff.png',
        both: './avatars/level3/lv3_debuff_buff.png',
      },
    };
    const levelNormalsOnly: Record<number, string> = {
      4: './avatars/level4/Gemini_Generated_Image_zcw38szcw38szcw3.png',
      5: './avatars/level5/Gemini_Generated_Image_hvfgqmhvfgqmhvfg.png',
    };

    let avatarPath: string;
    if (levelAvatars[level]) {
      avatarPath = levelAvatars[level][characterState];
    } else {
      avatarPath = levelNormalsOnly[level] ?? levelNormalsOnly[5];
    }

    if (stats.currentLevelAvatar !== avatarPath) {
      if (stats.currentLevelAvatar) {
        setPrevAvatar(stats.currentLevelAvatar);
      }
      setStats(prev => {
        const updated = { ...prev, currentLevelAvatar: avatarPath };
        if (!isInitialLoad) syncToFirebase(updated, activities);
        return updated;
      });
    }
  }, [stats.level, characterState, stats.equippedCharacterSkin]);

  // Calculate total debuff/buff multiplier — each active debuff = 20% reduction
  const getDebuffMultiplier = (): number => {
    let debuffCount = 0;
    // Count deduction activities (each one is a 20% debuff)
    debuffCount += (stats.deductionsCountToday ?? 0);
    // Count non-deduction daily debuff (nutrition exceed)
    if (stats.dailyDebuff?.active && stats.dailyDebuff.reason !== 'deduction' && Date.now() < stats.dailyDebuff.expiresAt) {
      debuffCount++;
    }
    // Count emergency debuffs
    if (stats.emergencyDebuffs) {
      debuffCount += stats.emergencyDebuffs.filter(d => d.active).length;
    }
    
    // Calculate final multiplier: (1 - 0.2 * count) * (buff if active)
    const debuffMult = Math.max(0, 1 - 0.2 * debuffCount);
    let finalMultiplier = debuffMult;
    
    // Apply nutrition buff
    if (stats.nutritionBuff?.active && Date.now() < stats.nutritionBuff.expiresAt) {
      finalMultiplier *= stats.nutritionBuff.multiplier;
    }
    return finalMultiplier;
  };

  // Expire nutrition buff
  useEffect(() => {
    if (isInitialLoad) return;
    if (stats.nutritionBuff?.active && Date.now() > stats.nutritionBuff.expiresAt) {
      const newStats = { ...stats, nutritionBuff: { ...stats.nutritionBuff, active: false } };
      setStats(newStats);
      syncToFirebase(newStats, activities);
    }
  }, [stats.nutritionBuff]);

  // Helper: Award daily log point if not already awarded today
  const checkAndAwardLogPoint = (currentStats: UserStats): UserStats => {
    const today = getTodayStr();
    if (currentStats.lastLogDate !== today) {
      return {
        ...currentStats,
        logPoints: (currentStats.logPoints ?? 0) + 1,
        lastLogDate: today,
      };
    }
    return currentStats;
  };

  // Handle Skin Purchase
  const handlePurchaseSkin = (skin: SkinDecoration) => {
    setStats(prev => {
      const newStats = {
        ...prev,
        logPoints: (prev.logPoints || 0) - skin.price,
        unlockedSkins: [...(prev.unlockedSkins || []), skin.id],
        equippedSkin: skin.id, // Auto-equip on purchase
      };
      syncToFirebase(newStats, activities);
      return newStats;
    });
  };

  // Handle Skin Equip (legacy)
  const handleEquipSkin = (skinId: string | null | undefined) => {
    setStats(prev => {
      const newStats = {
        ...prev,
        equippedSkin: skinId === undefined ? null : skinId,
      };
      syncToFirebase(newStats, activities);
      return newStats;
    });
  };

  // Character Skin: themes for random draws
  const SKIN_THEMES = [
    'Cyberpunk Neon', 'Dark Fantasy', 'Steampunk Victorian', 'Anime Shonen',
    'Celestial Cosmic', 'Samurai Warrior', 'Arctic Frost', 'Volcanic Inferno',
    'Ocean Depths', 'Ancient Egyptian', 'Pixel Retro', 'Jade Dragon',
    'Sakura Blossom', 'Gothic Knight', 'Solar Punk',
  ];

  // Upload photo & generate base character (first free, then 5 pts)
  const handleUploadPhoto = async (base64: string) => {
    const isFree = !stats.baseCharacterGenerated;
    if (!isFree && (stats.logPoints ?? 0) < 5) return;

    setIsGeneratingCharacter(true);
    setCharacterGenProgress('準備生成角色...');

    try {
      if (!isFree) {
        setStats(prev => ({ ...prev, logPoints: (prev.logPoints ?? 0) - 5 }));
      }

      setStats(prev => ({ ...prev, basePhoto: base64 }));

      const usedThemes = (stats.characterSkins || []).map(s => s.theme);
      const availableThemes = SKIN_THEMES.filter(t => !usedThemes.includes(t));
      const baseTheme = availableThemes.length > 0
        ? availableThemes[Math.floor(Math.random() * availableThemes.length)]
        : SKIN_THEMES[Math.floor(Math.random() * SKIN_THEMES.length)];

      setCharacterGenProgress(`隨機風格：${baseTheme}！生成中...`);

      const stateLabels: Record<string, string> = { normal: '普通', buff: '增益', debuff: '減益', both: '增益+減益' };
      const results = await geminiService.generateCharacterStates(base64, stats.level, baseTheme, (state, idx) => {
        setCharacterGenProgress(`[${baseTheme}] 生成 Lv.${stats.level} ${stateLabels[state] || state}狀態圖 (${idx + 1}/4)...`);
      });

      if (!results) {
        setCharacterGenProgress('生成失敗，請重試');
        setTimeout(() => setIsGeneratingCharacter(false), 2000);
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      setCharacterGenProgress('上傳圖片到雲端...');
      const skinId = `base_${Date.now()}`;
      const uploaded: Record<string, string> = {};
      for (const state of ['normal', 'buff', 'debuff', 'both'] as const) {
        const url = await storageService.uploadBase64Image(
          results[state],
          `users/${uid}/characters/${skinId}_${state}.png`
        );
        if (url) uploaded[state] = url;
      }

      if (Object.keys(uploaded).length < 4) {
        setCharacterGenProgress('上傳失敗，請重試');
        setTimeout(() => setIsGeneratingCharacter(false), 2000);
        return;
      }

      const themeShort = baseTheme.split(' ')[0];
      const newSkin: CharacterSkin = {
        id: skinId,
        name: `${themeShort} Character`,
        theme: baseTheme,
        normal: uploaded.normal,
        buff: uploaded.buff,
        debuff: uploaded.debuff,
        both: uploaded.both,
        createdAt: Date.now(),
      };

      setStats(prev => {
        const existingSkins = prev.characterSkins || [];
        const filteredSkins = isFree ? existingSkins : existingSkins;
        const newStats = {
          ...prev,
          characterSkins: [newSkin, ...filteredSkins],
          equippedCharacterSkin: skinId,
          baseCharacterGenerated: true,
        };
        syncToFirebase(newStats, activities);
        return newStats;
      });

      setCharacterGenProgress('角色生成完成！');
      setTimeout(() => setIsGeneratingCharacter(false), 1500);
    } catch (e) {
      console.error('Character generation failed:', e);
      setCharacterGenProgress('生成失敗，請重試');
      setTimeout(() => setIsGeneratingCharacter(false), 2000);
    }
  };

  // Regenerate base character (costs 5 pts)
  const handleRegenerateBase = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        if (base64) handleUploadPhoto(base64);
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  };

  // Draw a new themed character skin (5 pts)
  const handleDrawSkin = async () => {
    if ((stats.logPoints ?? 0) < 5 || !stats.basePhoto) return;

    const usedThemes = (stats.characterSkins || []).map(s => s.theme);
    const availableThemes = SKIN_THEMES.filter(t => !usedThemes.includes(t));
    if (availableThemes.length === 0) return;

    const theme = availableThemes[Math.floor(Math.random() * availableThemes.length)];

    setIsGeneratingCharacter(true);
    setCharacterGenProgress(`抽到主題：${theme}！生成中...`);

    setStats(prev => ({ ...prev, logPoints: (prev.logPoints ?? 0) - 5 }));

    try {
      const stateLabels: Record<string, string> = { normal: '普通', buff: '增益', debuff: '減益', both: '增益+減益' };
      const results = await geminiService.generateCharacterStates(stats.basePhoto, stats.level, theme, (state, idx) => {
        setCharacterGenProgress(`[${theme}] 生成 Lv.${stats.level} ${stateLabels[state] || state}狀態圖 (${idx + 1}/4)...`);
      });

      if (!results) {
        setCharacterGenProgress('生成失敗，點數已退還');
        setStats(prev => {
          const refunded = { ...prev, logPoints: (prev.logPoints ?? 0) + 5 };
          syncToFirebase(refunded, activities);
          return refunded;
        });
        setTimeout(() => setIsGeneratingCharacter(false), 2000);
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      setCharacterGenProgress('上傳圖片到雲端...');
      const skinId = `skin_${Date.now()}`;
      const uploaded: Record<string, string> = {};
      for (const state of ['normal', 'buff', 'debuff', 'both'] as const) {
        const url = await storageService.uploadBase64Image(
          results[state],
          `users/${uid}/characters/${skinId}_${state}.png`
        );
        if (url) uploaded[state] = url;
      }

      if (Object.keys(uploaded).length < 4) {
        setCharacterGenProgress('上傳失敗，點數已退還');
        setStats(prev => {
          const refunded = { ...prev, logPoints: (prev.logPoints ?? 0) + 5 };
          syncToFirebase(refunded, activities);
          return refunded;
        });
        setTimeout(() => setIsGeneratingCharacter(false), 2000);
        return;
      }

      const themeShort = theme.split(' ')[0];
      const newSkin: CharacterSkin = {
        id: skinId,
        name: `${themeShort} Skin`,
        theme: theme,
        normal: uploaded.normal,
        buff: uploaded.buff,
        debuff: uploaded.debuff,
        both: uploaded.both,
        createdAt: Date.now(),
      };

      setStats(prev => {
        const newStats = {
          ...prev,
          characterSkins: [...(prev.characterSkins || []), newSkin],
          equippedCharacterSkin: skinId,
        };
        syncToFirebase(newStats, activities);
        return newStats;
      });

      setIsGeneratingCharacter(false);
      setCharacterGenProgress(undefined);
      setNewlyDrawnSkin(newSkin);
    } catch (e) {
      console.error('Skin draw failed:', e);
      setCharacterGenProgress('生成失敗，點數已退還');
      setStats(prev => {
        const refunded = { ...prev, logPoints: (prev.logPoints ?? 0) + 5 };
        syncToFirebase(refunded, activities);
        return refunded;
      });
      setTimeout(() => setIsGeneratingCharacter(false), 2000);
    }
  };

  // Equip a character skin
  const handleEquipCharacterSkin = (skinId: string | null) => {
    setStats(prev => {
      const newStats = { ...prev, equippedCharacterSkin: skinId };
      syncToFirebase(newStats, activities);
      return newStats;
    });
  };

  // Animate a character skin (Seedance API — 10 log points)
  const handleAnimateSkin = async (skinId: string) => {
    if ((stats.logPoints ?? 0) < 10) return;
    const skin = (stats.characterSkins || []).find(s => s.id === skinId);
    if (!skin || skin.animated) return;

    setIsAnimatingSkin(true);
    setAnimatingProgress('準備動態化...');
    setStats(prev => ({ ...prev, logPoints: (prev.logPoints ?? 0) - 10 }));

    const stateLabels: Record<string, string> = { normal: '普通', buff: '增益', debuff: '減益', both: '增益+減益' };

    try {
      const videoResults = await seedanceService.generateAllAnimatedStates(
        { normal: skin.normal, buff: skin.buff, debuff: skin.debuff, both: skin.both },
        (state, idx, phase) => {
          const label = stateLabels[state] || state;
          if (phase === 'submit') {
            setAnimatingProgress(`提交${label}動畫生成 (${idx + 1}/4)...`);
          } else {
            setAnimatingProgress(`等待${label}動畫完成 (${idx + 1}/4)...`);
          }
        }
      );

      if (!videoResults) {
        setAnimatingProgress('動畫生成失敗，點數已退還');
        setStats(prev => {
          const refunded = { ...prev, logPoints: (prev.logPoints ?? 0) + 10 };
          syncToFirebase(refunded, activities);
          return refunded;
        });
        setTimeout(() => setIsAnimatingSkin(false), 2000);
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      setAnimatingProgress('上傳影片到雲端...');
      const uploaded: Record<string, string> = {};
      for (const state of ['normal', 'buff', 'debuff', 'both'] as const) {
        const url = await storageService.uploadVideoFromUrl(
          videoResults[state],
          `users/${uid}/characters/${skinId}_${state}.mp4`
        );
        if (url) uploaded[state] = url;
      }

      if (Object.keys(uploaded).length < 4) {
        setAnimatingProgress('上傳失敗，點數已退還');
        setStats(prev => {
          const refunded = { ...prev, logPoints: (prev.logPoints ?? 0) + 10 };
          syncToFirebase(refunded, activities);
          return refunded;
        });
        setTimeout(() => setIsAnimatingSkin(false), 2000);
        return;
      }

      const updatedSkin: CharacterSkin = {
        ...skin,
        animated: true,
        normalVideo: uploaded.normal,
        buffVideo: uploaded.buff,
        debuffVideo: uploaded.debuff,
        bothVideo: uploaded.both,
      };

      setStats(prev => {
        const newSkins = (prev.characterSkins || []).map(s =>
          s.id === skinId ? updatedSkin : s
        );
        const newStats = { ...prev, characterSkins: newSkins };
        syncToFirebase(newStats, activities);
        return newStats;
      });

      setIsAnimatingSkin(false);
      setAnimatingProgress(undefined);
      setNewlyAnimatedSkin(updatedSkin);
    } catch (e) {
      console.error('Skin animation failed:', e);
      setAnimatingProgress('動畫生成失敗，點數已退還');
      setStats(prev => {
        const refunded = { ...prev, logPoints: (prev.logPoints ?? 0) + 10 };
        syncToFirebase(refunded, activities);
        return refunded;
      });
      setTimeout(() => setIsAnimatingSkin(false), 2000);
    }
  };

  // Handle workout XP (called from WorkoutPanel)
  const handleWorkoutXP = (xp: number, newWorkoutData?: WorkoutData) => {
    if (newWorkoutData) setWorkoutData(newWorkoutData);
    setStats(prev => {
      const statsWithLogPoint = checkAndAwardLogPoint(prev);
      const oldHealthXP = statsWithLogPoint.healthXP;
      const newStats: UserStats = {
        ...statsWithLogPoint,
        healthXP: statsWithLogPoint.healthXP + xp,
        totalPoints: statsWithLogPoint.totalPoints + xp,
        neurozoidsToday: (statsWithLogPoint.neurozoidsToday ?? 0) + xp,
      };
      const newActivities = [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        description: `Workout completed (+${xp} Health XP)`,
        points: xp,
        category: Category.HEALTH,
        analysis: "Gains! 💪",
      }, ...activities];
      setActivities(newActivities);
      syncToFirebase(newStats, newActivities, undefined, undefined, newWorkoutData);

      // Check story milestone for Health
      checkStoryMilestone(Category.HEALTH, oldHealthXP, newStats.healthXP, storyState, newStats.level);

      // Auto-adjust diet plan if training phase changed or significant fatigue shift
      if (newWorkoutData && dietData.currentPlan && dietData.profile) {
        const tp = newWorkoutData.trainingProgram;
        const oldTp = workoutData.trainingProgram;
        const phaseChanged = tp && oldTp && tp.phase !== oldTp.phase;
        const fatigueHigh = newWorkoutData.currentCycle && newWorkoutData.currentCycle.accumulatedFatigue >= 7;
        const oldFatigueHigh = workoutData.currentCycle && workoutData.currentCycle.accumulatedFatigue >= 7;
        const fatigueShifted = fatigueHigh !== oldFatigueHigh;

        if (phaseChanged || fatigueShifted) {
          geminiService.generateDietPlan(dietData.profile, newWorkoutData).then(newPlan => {
            if (newPlan) {
              const updatedDiet = {
                ...dietData,
                currentPlan: newPlan,
                planHistory: dietData.currentPlan
                  ? [...dietData.planHistory, dietData.currentPlan]
                  : dietData.planHistory,
              };
              setDietData(updatedDiet);
              syncToFirebase(newStats, newActivities, undefined, updatedDiet, newWorkoutData);
            }
          }).catch(err => console.error('Auto diet adjustment failed:', err));
        }
      }

      return newStats;
    });
  };

  // ===== STORY QUEST MILESTONE DETECTION =====
  const STORY_MILESTONE_STEP = 250;

  const storyTriggerLockRef = React.useRef(false);

  const checkStoryMilestone = async (
    category: Category,
    oldXP: number,
    newXP: number,
    currentStoryState: StoryState,
    playerLevel: number
  ) => {
    if (category === Category.LEISURE) return;
    if (!currentStoryState.initialized) return;
    if (currentStoryState.pendingMission && !currentStoryState.pendingMission.completed) return;
    if (storyTriggerLockRef.current) return;

    const lastMilestone = currentStoryState.lastMilestones[category as keyof typeof currentStoryState.lastMilestones] || 0;
    const nextMilestone = lastMilestone + STORY_MILESTONE_STEP;

    if (newXP >= nextMilestone) {
      storyTriggerLockRef.current = true;
      // Milestone reached! Generate story event
      try {
        const result = await geminiService.generateStoryEvent(
          currentStoryState,
          category,
          nextMilestone,
          playerLevel
        );
        if (result) {
          // Generate image for the story event
          const base64Image = await geminiService.generateStoryImage(result.narrative, currentStoryState.genre);
          let imageUrl = null;

          if (base64Image && user) {
            const storagePath = `stories/${user.uid}/chapter_${Date.now()}.png`;
            imageUrl = await storageService.uploadBase64Image(base64Image, storagePath);
          }

          const newChapter: StoryChapter = {
            id: `ch-${Date.now()}`,
            milestone: nextMilestone,
            category: category,
            narrative: result.narrative,
            missionDescription: result.missionDescription,
            choiceOptions: result.choiceOptions,
            imageUrl: imageUrl,
            completed: false,
            createdAt: Date.now(),
          };

          const updatedLastMilestones = {
            ...currentStoryState.lastMilestones,
            [category]: nextMilestone,
          };

          const newState: StoryState = {
            ...currentStoryState,
            chapters: [...currentStoryState.chapters, newChapter],
            pendingMission: newChapter,
            currentArc: playerLevel,
            lastMilestones: updatedLastMilestones,
          };

          setStoryState(newState);
          syncToFirebase(stats, activities, undefined, undefined, undefined, newState);
          
          // Show notification
          setStoryNotification(result.narrative.substring(0, 80) + '...');
          setTimeout(() => setStoryNotification(null), 8000);
        } else {
          storyTriggerLockRef.current = false;
        }
      } catch (err) {
        console.error("Story milestone trigger failed:", err);
        storyTriggerLockRef.current = false;
      }
    }
  };

  // After a mission is completed, check all categories for missed milestones
  const checkMissedMilestones = (completedStoryState: StoryState, currentStats: UserStats) => {
    const categories = [Category.HEALTH, Category.CAREER, Category.KNOWLEDGE, Category.FAMILY_SOCIAL];
    for (const cat of categories) {
      const lastMilestone = completedStoryState.lastMilestones[cat as keyof typeof completedStoryState.lastMilestones] || 0;
      const nextMilestone = lastMilestone + STORY_MILESTONE_STEP;
      const currentXP = cat === Category.HEALTH ? currentStats.healthXP
        : cat === Category.CAREER ? currentStats.careerXP
        : cat === Category.KNOWLEDGE ? currentStats.knowledgeXP
        : (currentStats.familySocialXP ?? 0);

      if (currentXP >= nextMilestone) {
        checkStoryMilestone(cat, nextMilestone - 1, currentXP, completedStoryState, currentStats.level);
        return; // Only trigger one at a time; the next missed one will be caught after this mission completes
      }
    }
  };

  // Handle story state update (from StoryPanel)
  const handleStoryUpdate = (newState: StoryState) => {
    setStoryState(newState);
    syncToFirebase(stats, activities, undefined, undefined, undefined, newState);
  };

  // Handle story mission completion
  const handleStoryMissionComplete = (chapter: StoryChapter, updatedStoryState: StoryState) => {
    // Award bonus XP for story quest completion
    const storyXP = 50;
    setStats(prev => {
      const cat = chapter.category;
      const newStats: UserStats = {
        ...prev,
        healthXP: cat === Category.HEALTH ? prev.healthXP + storyXP : prev.healthXP,
        careerXP: cat === Category.CAREER ? prev.careerXP + storyXP : prev.careerXP,
        knowledgeXP: cat === Category.KNOWLEDGE ? prev.knowledgeXP + storyXP : prev.knowledgeXP,
        familySocialXP: cat === Category.FAMILY_SOCIAL ? (prev.familySocialXP ?? 0) + storyXP : (prev.familySocialXP ?? 0),
        totalPoints: prev.totalPoints + storyXP,
      };

      const newActivities = [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        description: `[STORY QUEST] ${chapter.missionDescription.substring(0, 50)}...`,
        points: storyXP,
        category: cat,
        analysis: "Story quest completed! 📖",
        isEmergency: false,
      }, ...activities];

      setActivities(newActivities);
      setStoryState(updatedStoryState);
      storyTriggerLockRef.current = false;
      
      // Sync everything in one go to avoid race conditions
      syncToFirebase(newStats, newActivities, undefined, undefined, undefined, updatedStoryState);
      
      // Visual feedback
      setStoryNotification("Mission Complete! +50 XP awarded.");
      setTimeout(() => setStoryNotification(null), 3000);

      // Check for missed milestones in other categories (delayed to allow state to settle)
      setTimeout(() => {
        checkMissedMilestones(updatedStoryState, newStats);
      }, 2000);
      
      return newStats;
    });
  };

  // Handle nutrition buff activation (called from DietPanel)
  const handleNutritionBuff = () => {
    const newStats: UserStats = {
      ...stats,
      nutritionBuff: {
        active: true,
        multiplier: 1.25, // +25% XP
        expiresAt: Date.now() + (12 * 60 * 60 * 1000), // 12 hours
        reason: 'Daily macro targets hit!',
      }
    };
    setStats(newStats);
    syncToFirebase(newStats, activities);
  };

  // Handle nutrition debuff (macros exceeded after being hit)
  const handleNutritionDebuff = () => {
    const newStats: UserStats = {
      ...stats,
      // Cancel the buff
      nutritionBuff: {
        active: false,
        multiplier: 1,
        expiresAt: 0,
        reason: 'Cancelled: macros exceeded',
      },
      // Apply a daily debuff for overeating
      dailyDebuff: {
        active: true,
        reason: 'nutrition_exceed',
        multiplier: 0.8, // 20% debuff
        expiresAt: getEndOfToday(),
      }
    };
    setStats(newStats);
    syncToFirebase(newStats, activities);
  };

  // Calculate diminishing returns for a quest
  const getEffectivePoints = (quest: QuestItem): number => {
    const counts = stats.dailyActivityCounts || {};
    const timesPerformed = counts[quest.item] || 0;
    const decay = quest.decayPerRepeat || 0;
    const minPts = quest.minPoints ?? 0;
    
    const effectivePoints = Math.max(minPts, quest.base_points - (timesPerformed * decay));
    return effectivePoints;
  };

  // Handle positive activity
  const applyPositiveActivity = (quest: QuestItem, x: number, y: number) => {
    const rawPoints = getEffectivePoints(quest);
    const debuffMult = getDebuffMultiplier();
    const finalPoints = Math.round(rawPoints * debuffMult);
    
    const id = Math.random().toString();
    setFloatingPoints(prev => [...prev, { id, points: finalPoints, x, y, type: finalPoints >= 0 ? 'add' : 'sub' }]);
    setTimeout(() => setFloatingPoints(prev => prev.filter(p => p.id !== id)), 2000);

    const cat = quest.category as Category;
    // We'll use the current stats for milestone check
    const oldXP = cat === Category.HEALTH ? stats.healthXP : cat === Category.CAREER ? stats.careerXP : cat === Category.KNOWLEDGE ? stats.knowledgeXP : (stats.familySocialXP ?? 0);
    const newXP = oldXP + finalPoints;

    setStats(prev => {
      const statsWithLogPoint = checkAndAwardLogPoint(prev);
      const today = getTodayStr();
      const counts = { ...(statsWithLogPoint.dailyActivityCounts || {}) };
      counts[quest.item] = (counts[quest.item] || 0) + 1;

      let hXP = statsWithLogPoint.healthXP;
      let cXP = statsWithLogPoint.careerXP;
      let kXP = statsWithLogPoint.knowledgeXP;
      let fXP = statsWithLogPoint.familySocialXP ?? 0;

      // Add XP to the relevant bar
      if (cat === Category.HEALTH) hXP = Math.max(0, hXP + finalPoints);
      else if (cat === Category.CAREER) cXP = Math.max(0, cXP + finalPoints);
      else if (cat === Category.KNOWLEDGE) kXP = Math.max(0, kXP + finalPoints);
      else if (cat === Category.FAMILY_SOCIAL) fXP = Math.max(0, fXP + finalPoints);

      const newStats: UserStats = {
        ...statsWithLogPoint,
        healthXP: hXP,
        careerXP: cXP,
        knowledgeXP: kXP,
        familySocialXP: fXP,
        totalPoints: statsWithLogPoint.totalPoints + finalPoints,
        dailyActivityCounts: counts,
        lastActivityDate: today,
        neurozoidsToday: (statsWithLogPoint.neurozoidsToday ?? 0) + finalPoints,
      };

      const newActivities = [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        description: quest.item,
        points: finalPoints,
        category: cat,
        analysis: getDebuffMultiplier() < 1 ? `Debuffed! (${Math.round(getDebuffMultiplier() * 100)}% effective)` : "Quest Complete!"
      }, ...activities];

      setActivities(newActivities);
      syncToFirebase(newStats, newActivities);
      return newStats;
    });

    // Check story milestone (async, fire-and-forget)
    if (finalPoints > 0) {
      checkStoryMilestone(cat, oldXP, newXP, storyState, stats.level);
    }
  };

  // Handle deduction activity (costs neurozoids; blocked if insufficient)
  const applyDeductionActivity = (quest: QuestItem, x: number, y: number) => {
    const deductAmount = Math.abs(quest.base_points);
    const neurozoids = stats.neurozoidsToday ?? 0;
    if (neurozoids < deductAmount) return; // un-actionable

    const id = Math.random().toString();
    setFloatingPoints(prev => [...prev, { id, points: deductAmount, x, y, type: 'sub' }]);
    setTimeout(() => setFloatingPoints(prev => prev.filter(p => p.id !== id)), 2000);

    setStats(prev => {
      const statsWithLogPoint = checkAndAwardLogPoint(prev);
      const newStats: UserStats = {
        ...statsWithLogPoint,
        healthXP: Math.max(0, statsWithLogPoint.healthXP - deductAmount),
        careerXP: Math.max(0, statsWithLogPoint.careerXP - deductAmount),
        knowledgeXP: Math.max(0, statsWithLogPoint.knowledgeXP - deductAmount),
        familySocialXP: Math.max(0, (statsWithLogPoint.familySocialXP ?? 0) - deductAmount),
        totalPoints: statsWithLogPoint.totalPoints - deductAmount * 3,
        neurozoidsToday: Math.max(0, (statsWithLogPoint.neurozoidsToday ?? 0) - deductAmount),
        deductionsCountToday: (statsWithLogPoint.deductionsCountToday ?? 0) + 1,
      };

      const newActivities = [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        description: quest.item,
        points: -deductAmount,
        category: quest.category as Category,
        analysis: `Deduction debuff added! Now at -${((statsWithLogPoint.deductionsCountToday ?? 0) + 1) * 20}% total. Cost ${deductAmount} neurozoids.`,
        isDeduction: true,
      }, ...activities];

      setActivities(newActivities);
      syncToFirebase(newStats, newActivities);
      return newStats;
    });
  };

  // Handle emergency mission completion
  const completeEmergencyMission = (quest: QuestItem, x: number, y: number) => {
    const emergencyXP = 100;
    const daysDelayed = quest.emergencyCreatedAt 
      ? Math.floor((Date.now() - quest.emergencyCreatedAt) / (1000 * 60 * 60 * 24))
      : 0;
    const debuffPct = Math.min(90, daysDelayed * 10); // cap at 90%
    
    const id = Math.random().toString();
    setFloatingPoints(prev => [...prev, { id, points: emergencyXP, x, y, type: 'add' }]);
    setTimeout(() => setFloatingPoints(prev => prev.filter(p => p.id !== id)), 2000);

    setStats(prev => {
      const statsWithLogPoint = checkAndAwardLogPoint(prev);
      const newEmergencyDebuffs: EmergencyDebuff[] = [
        ...(statsWithLogPoint.emergencyDebuffs || []),
      ];

      // If delayed, add a debuff (each debuff = 20% in getDebuffMultiplier)
      if (daysDelayed > 0) {
        newEmergencyDebuffs.push({
          active: true,
          missionName: quest.item,
          daysDelayed,
          multiplier: 0.8,
          createdAt: Date.now(),
        });
      }

      const newStats: UserStats = {
        ...statsWithLogPoint,
        healthXP: statsWithLogPoint.healthXP + emergencyXP,
        careerXP: statsWithLogPoint.careerXP + emergencyXP,
        knowledgeXP: statsWithLogPoint.knowledgeXP + emergencyXP,
        familySocialXP: (statsWithLogPoint.familySocialXP ?? 0) + emergencyXP,
        totalPoints: statsWithLogPoint.totalPoints + emergencyXP * 3,
        emergencyDebuffs: newEmergencyDebuffs,
      };

      // Remove completed emergency from quest list
      const newQuests = questItems.filter(q => q.item !== quest.item);
      setQuestItems(newQuests);

      const newActivities = [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        description: `[EMERGENCY] ${quest.item}`,
        points: emergencyXP * 3,
        category: quest.category as Category,
        analysis: daysDelayed > 0 
          ? `Emergency complete! But delayed by ${daysDelayed} day(s). -${debuffPct}% debuff applied.`
          : "Emergency resolved immediately! No penalty.",
        isEmergency: true,
      }, ...activities];

      setActivities(newActivities);
      syncToFirebase(newStats, newActivities, newQuests);
      return newStats;
    });
  };

  // Handle quest click
  const handleQuestClick = (e: React.MouseEvent, quest: QuestItem) => {
    const x = e.clientX;
    const y = e.clientY;

    if (quest.isEmergency) {
      completeEmergencyMission(quest, x, y);
    } else if (quest.isDeduction) {
      applyDeductionActivity(quest, x, y);
    } else {
      applyPositiveActivity(quest, x, y);
    }
  };

  // Handle free-form activity input (AI analyzed)
  const handleLogActivity = async (e?: React.MouseEvent) => {
    if (!input.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    const x = e?.clientX || window.innerWidth / 2;
    const y = e?.clientY || window.innerHeight / 2;

    try {
      const result = await geminiService.analyzeActivity(input);
      const isDeduction = result.category === Category.LEISURE;
      
      if (isDeduction) {
        const cost = Math.abs(result.points);
        if ((stats.neurozoidsToday ?? 0) < cost) {
          alert(`Not enough neurozoids. Need ◇${cost}, have ◇${stats.neurozoidsToday ?? 0}. Earn XP today to get neurozoids.`);
          return;
        }
        applyDeductionActivity({
          item: input,
          category: result.category,
          base_points: result.points,
          isDeduction: true
        }, x, y);
      } else {
        applyPositiveActivity({
          item: input,
          category: result.category,
          base_points: result.points,
        }, x, y);
      }
    } catch (err) {
      console.error("AI analysis failed:", err);
      applyPositiveActivity({
        item: input,
        category: Category.KNOWLEDGE,
        base_points: 30,
      }, x, y);
    } finally {
      setIsAnalyzing(false);
      setInput('');
      setShowLog(false);
    }
  };

  // Emergency mission submission
  const handleEmergencySubmit = async () => {
    if (!emergencyInput.trim()) return;
    setEmergencyStatus('checking');

    try {
      const result = await geminiService.approveEmergency(emergencyInput);
      if (result.approved) {
        setEmergencyStatus('approved');
        setEmergencyMessage(result.reason);
        
        // Add to quest list as emergency
        const newQuest: QuestItem = {
          item: emergencyInput,
          category: Category.CAREER,
          base_points: 100,
          isEmergency: true,
          emergencyCreatedAt: Date.now(),
          emergencyApproved: true,
        };
        const newQuests = [...questItems, newQuest];
        setQuestItems(newQuests);
        syncToFirebase(stats, activities, newQuests);
        
        setTimeout(() => {
          setShowEmergencyModal(false);
          setEmergencyInput('');
          setEmergencyStatus('idle');
          setEmergencyMessage('');
        }, 2000);
      } else {
        setEmergencyStatus('denied');
        setEmergencyMessage(result.reason);
      }
    } catch (err) {
      setEmergencyStatus('denied');
      setEmergencyMessage("AI evaluation failed. Please try again.");
    }
  };

    const filteredQuests = questItems.filter(q => 
      q.item.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const positiveQuests = filteredQuests.filter(q => !q.isDeduction && !q.isEmergency);
    const deductionQuests = filteredQuests.filter(q => q.isDeduction);
    const emergencyQuests = filteredQuests.filter(q => q.isEmergency);

    const debuffMultiplier = getDebuffMultiplier();

    if (isAuthLoading) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
           {/* Black screen while checking auth */}
        </div>
      );
    }

    if (!user) {
      return <Auth />;
    }

    return (
      <div 
        className={`h-screen flex flex-col max-w-md mx-auto relative overflow-hidden bg-slate-950/40 backdrop-blur-xl border-x border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)] ${showMainScreen ? 'tv-screen-on' : ''}`}
        style={!showMainScreen ? { transform: 'scale(1, 0.002)', opacity: 0, filter: 'brightness(3)' } : {}}
      >
        {/* CRT Monitor Effects */}
        <div className="crt-overlay" />
        <div className="crt-rgb" />
        <div className="crt-scanline" />
        <div className="crt-scanline-slow" />
        <div className="crt-noise" />
        <div className="fisheye-vignette" />
        <div className="crt-edge-warp" />

        {/* Cyberpunk Grid Background */}
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" 
             style={{ 
               backgroundImage: 'linear-gradient(rgba(59, 130, 246, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.2) 1px, transparent 1px)',
               backgroundSize: '20px 20px' 
             }}>
        </div>
        
        {/* Sidebar Overlay */}
        {showSidebar && (
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[550] animate-fade-in"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Collapsable Sidebar */}
        <div className={`fixed top-0 left-0 h-full w-64 bg-slate-900 z-[560] shadow-2xl transition-transform duration-300 ease-in-out transform ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-6 flex flex-col h-full" style={{ paddingTop: 'max(env(safe-area-inset-top), 36px)' }}>
            <div className="flex justify-between items-center mb-10">
              <h2 className="font-game text-xl text-white">MENU</h2>
              <button onClick={() => setShowSidebar(false)} className="text-white/60 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <nav className="flex-1 space-y-2">
              <button 
                onClick={() => { setShowAdmin(true); setShowSidebar(false); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-colors group"
              >
                <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                  <Settings size={20} />
                </div>
                <span className="font-bold">Admin Panel</span>
              </button>
              <button 
                onClick={() => { setShowQuests(true); setShowSidebar(false); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-colors group"
              >
                <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                  <Zap size={20} />
                </div>
                <span className="font-bold">Quests & History</span>
              </button>
              <button 
                onClick={() => { setShowDiet(true); setShowSidebar(false); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-colors group"
              >
                <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <Heart size={20} />
                </div>
                <span className="font-bold">Diet Panel</span>
              </button>
              <button 
                onClick={() => { setShowWorkout(true); setShowSidebar(false); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-colors group"
              >
                <div className="p-2 bg-rose-500/20 rounded-xl text-rose-400 group-hover:bg-rose-500 group-hover:text-white transition-all">
                  <Dumbbell size={20} />
                </div>
                <span className="font-bold">Workout Log</span>
              </button>
              <button 
                onClick={() => { setShowStory(true); setShowSidebar(false); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-colors group"
              >
                <div className="p-2 bg-violet-500/20 rounded-xl text-violet-400 group-hover:bg-violet-500 group-hover:text-white transition-all">
                  <BookOpen size={20} />
                </div>
                <span className="font-bold">Story Quest</span>
                {storyState.pendingMission && !storyState.pendingMission.completed && (
                  <span className="ml-auto bg-violet-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">!</span>
                )}
              </button>
              <button 
                onClick={() => { setShowShop(true); setShowSidebar(false); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-colors group"
              >
                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <ShoppingBag size={20} />
                </div>
                <span className="font-bold">Skin Shop</span>
              </button>
              <div className="pt-4 mt-4 border-t border-white/10">
                <LogoutButton className="w-full px-4 py-4 bg-white/5 rounded-2xl hover:bg-red-500/10 transition-all" />
              </div>
            </nav>
            <div className="mt-auto pt-6 border-t border-white/10">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold text-center">Life Upgrade v4.0</p>
            </div>
          </div>
        </div>

        {/* Top Bar */}
        <div className="flex justify-between items-center p-4 fixed top-0 left-0 right-0 max-w-md mx-auto z-50" style={{ paddingTop: 'max(env(safe-area-inset-top), 36px)' }}>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSidebar(true)}
              className="w-10 h-10 bg-slate-900/60 backdrop-blur border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-slate-800 transition-colors"
            >
              <Menu size={20} />
            </button>
            <button 
              onClick={toggleMusic}
              className="w-10 h-10 bg-slate-900/60 backdrop-blur border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-slate-800 transition-colors"
              title={isMusicPlaying ? "Pause Music" : "Play Music"}
            >
              {isMusicPlaying ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-full px-2 py-1 flex items-center gap-1" title="Log Points: Earned 1 per day for logging.">
              <Coins size={12} className="text-amber-400" />
              <span className="text-[10px] text-amber-400 font-bold">{stats.logPoints ?? 0}</span>
            </div>
            <div className="bg-violet-500/20 border border-violet-500/30 rounded-full px-2 py-1 flex items-center gap-1" title="Neurozoids (XP earned today). Spend on deduction activities.">
              <span className="text-[10px] text-violet-400 font-bold">◇{(stats.neurozoidsToday ?? 0)}</span>
            </div>
            {stats.nutritionBuff?.active && Date.now() < (stats.nutritionBuff.expiresAt || 0) && (
              <button 
                onClick={() => setShowBuffDebuffInfo(true)}
                className="bg-emerald-500/20 border border-emerald-500/30 rounded-full px-2 py-1 flex items-center gap-1 hover:bg-emerald-500/30 transition-colors"
              >
                <Zap size={12} className="text-emerald-400" />
                <span className="text-[10px] text-emerald-400 font-bold">+25%</span>
              </button>
            )}
            {(() => {
              const debuffCount = (stats.deductionsCountToday ?? 0) + 
                                (stats.dailyDebuff?.active && stats.dailyDebuff.reason !== 'deduction' && Date.now() < stats.dailyDebuff.expiresAt ? 1 : 0) + 
                                (stats.emergencyDebuffs?.filter(d => d.active).length ?? 0);
              
              if (debuffCount === 0) return null;
              
              const debuffPct = Math.round((1 - Math.max(0, 1 - 0.2 * debuffCount)) * 100);
              
              return (
                <button 
                  onClick={() => setShowBuffDebuffInfo(true)}
                  className="bg-red-500/20 border border-red-500/30 rounded-full px-2 py-1 flex items-center gap-1 hover:bg-red-500/30 transition-colors"
                >
                  <AlertTriangle size={12} className="text-red-400" />
                  <span className="text-[10px] text-red-400 font-bold">-{debuffPct}%</span>
                </button>
              );
            })()}
            <div className="bg-slate-900/60 backdrop-blur border border-white/10 rounded-full px-3 py-1 flex items-center gap-2 text-blue-100 font-bold text-sm">
              <span className="text-blue-400 font-game">LV.{stats.level}</span>
            </div>
          </div>
        </div>

        {/* Main Title */}
        <div className="text-center px-4 flex flex-col items-center chromatic-aberration" style={{ paddingTop: 'max(env(safe-area-inset-top), 36px)' }}>
          <img src={lifeLogo} alt="Life Upgrade Simulator" className="h-40 w-auto drop-shadow-md" />
          <div className="-mt-4 inline-block bg-white/20 backdrop-blur-sm border border-white/30 px-4 py-1 rounded-full relative z-10">
            <span className="font-game text-sm text-white tracking-widest">
              LEVEL {stats.level}
            </span>
          </div>
        </div>

        {/* Hero Section with XP Bars */}
        <AvatarSection stats={stats} isGenerating={isGeneratingAvatar || isGeneratingCharacter} characterState={characterState} />

        {/* Quests & History Button */}
        <div className="px-8 mb-4">
          <button 
            onClick={() => setShowQuests(true)}
            className="w-full bg-blue-600/20 border border-blue-500/40 rounded-2xl py-4 flex items-center justify-center gap-3 text-blue-400 font-game hover:bg-blue-600/30 transition-all shadow-[0_0_15px_rgba(37,99,235,0.1)] group"
          >
            <Zap size={20} className="group-hover:scale-110 transition-transform" />
            VIEW QUESTS & HISTORY
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Bottom Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40 items-center">
        {/* Expanded Buttons */}
        <div className={`flex flex-col gap-3 transition-all duration-300 ${isActionsExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
          <button 
            onClick={() => { setShowEmergencyModal(true); setIsActionsExpanded(false); }}
            className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.4)] text-white hover:scale-110 transition-transform"
            title="Emergency Mission"
          >
            <Zap size={24} />
          </button>
          <button 
            onClick={() => { setShowLog(true); setIsActionsExpanded(false); }}
            className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] text-white hover:scale-110 transition-transform"
            title="Log Activity"
          >
            <Plus size={28} />
          </button>
          <button 
            onClick={() => { setShowCoach(true); setIsActionsExpanded(false); }}
            className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(147,51,234,0.4)] text-white hover:scale-110 transition-transform"
            title="Talk to Guide"
          >
            <MessageCircle size={24} />
          </button>
        </div>

        {/* Main Toggle Button */}
        <button 
          onClick={() => setIsActionsExpanded(!isActionsExpanded)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${isActionsExpanded ? 'bg-slate-800 text-slate-400 rotate-45' : 'bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]'}`}
        >
          <Plus size={32} />
        </button>
      </div>

      {/* Log Modal */}
      {showLog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-end p-4 tv-screen-on">
          <div className="w-full max-w-md mx-auto bg-slate-900 border-t border-x border-blue-500/30 rounded-t-[3rem] p-8 animate-slide-up shadow-[0_-10px_40px_rgba(37,99,235,0.2)]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-game text-2xl text-blue-100">LOG ACTIVITY</h2>
              <button onClick={() => setShowLog(false)}><X className="text-slate-500 hover:text-white" /></button>
            </div>
            <div className="space-y-4">
              <textarea 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What did you do? AI will categorize and score it..."
                className="w-full bg-slate-950 border border-white/10 rounded-3xl p-6 text-blue-50 placeholder:text-slate-600 focus:outline-none focus:ring-2 ring-blue-500/50 resize-none h-32"
              />
              {debuffMultiplier < 1 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span className="text-xs text-red-400">Active debuff: XP will be reduced to {Math.round(debuffMultiplier * 100)}%</span>
                </div>
              )}
              <button 
                onClick={(e) => handleLogActivity(e)}
                disabled={isAnalyzing || !input.trim()}
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-500 transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] disabled:opacity-50"
              >
                {isAnalyzing ? "ANALYZING..." : <><Send size={18} /> ANALYZE & LOG</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Mission Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center p-4 tv-screen-on">
          <div className="w-full max-w-md mx-auto bg-slate-900 border border-orange-500/30 rounded-3xl p-8 animate-slide-up shadow-[0_0_40px_rgba(249,115,22,0.2)]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-game text-xl text-orange-100 flex items-center gap-2"><Zap className="text-orange-400" /> EMERGENCY MISSION</h2>
              <button onClick={() => { setShowEmergencyModal(false); setEmergencyStatus('idle'); setEmergencyInput(''); }}>
                <X className="text-slate-500 hover:text-white" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
                <p className="text-[11px] text-orange-300/80">
                  Emergency missions give <span className="font-bold text-orange-400">+100 XP to ALL bars</span>, 
                  but if delayed, a <span className="font-bold text-red-400">-10% debuff per day</span> will be applied.
                  AI must approve the mission as genuinely urgent.
                </p>
              </div>

              <textarea 
                value={emergencyInput}
                onChange={(e) => setEmergencyInput(e.target.value)}
                placeholder="Describe the emergency task..."
                className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-orange-50 placeholder:text-slate-600 focus:outline-none focus:ring-2 ring-orange-500/50 resize-none h-24"
                disabled={emergencyStatus === 'checking' || emergencyStatus === 'approved'}
              />

              {emergencyStatus === 'approved' && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span className="text-sm text-emerald-300">Approved! {emergencyMessage}</span>
                </div>
              )}

              {emergencyStatus === 'denied' && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2">
                  <X size={16} className="text-red-400" />
                  <span className="text-sm text-red-300">Denied: {emergencyMessage}</span>
                </div>
              )}

              {emergencyStatus !== 'approved' && (
                <button 
                  onClick={handleEmergencySubmit}
                  disabled={!emergencyInput.trim() || emergencyStatus === 'checking'}
                  className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-orange-400 transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] disabled:opacity-50"
                >
                  {emergencyStatus === 'checking' ? "AI IS EVALUATING..." : <><Zap size={18} /> SUBMIT FOR APPROVAL</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showCoach && <LiveCoach onClose={() => setShowCoach(false)} stats={stats} workoutData={workoutData} dietData={dietData} />}
      
      {showAdmin && user && (
        <AdminPanel 
          key={`admin-${user.uid}`}
          questItems={questItems} 
          onSave={(items) => {
            setQuestItems(items);
            syncToFirebase(stats, activities, items);
            setShowAdmin(false);
          }}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {showDiet && user && (
        <DietPanel
          key={`diet-${user.uid}`}
          dietData={dietData}
          workoutData={workoutData}
          onSave={(data) => {
            setDietData(data);
            syncToFirebase(stats, activities, undefined, data);
          }}
          onClose={() => setShowDiet(false)}
          onNutritionBuff={handleNutritionBuff}
          onNutritionDebuff={handleNutritionDebuff}
        />
      )}

      {showWorkout && user && (
        <WorkoutPanel
          key={`workout-${user.uid}`}
          workoutData={workoutData}
          dietData={dietData}
          onSave={(data) => {
            setWorkoutData(data);
            syncToFirebase(stats, activities, undefined, undefined, data);
          }}
          onWorkoutXP={handleWorkoutXP}
          onClose={() => setShowWorkout(false)}
        />
      )}

      {showShop && user && (
        <SkinShop
          key={`shop-${user.uid}`}
          stats={stats}
          onClose={() => setShowShop(false)}
          onUploadPhoto={handleUploadPhoto}
          onRegenerateBase={handleRegenerateBase}
          onDrawSkin={handleDrawSkin}
          onEquipCharacterSkin={handleEquipCharacterSkin}
          onAnimateSkin={handleAnimateSkin}
          isGenerating={isGeneratingCharacter}
          generatingProgress={characterGenProgress}
          isAnimating={isAnimatingSkin}
          animatingProgress={animatingProgress}
          newlyDrawnSkin={newlyDrawnSkin}
          onClearNewSkin={() => setNewlyDrawnSkin(null)}
          newlyAnimatedSkin={newlyAnimatedSkin}
          onClearAnimatedSkin={() => setNewlyAnimatedSkin(null)}
        />
      )}

      {showQuests && (
        <QuestPanel
          questItems={questItems}
          activities={activities}
          stats={stats}
          onQuestClick={handleQuestClick}
          onClose={() => setShowQuests(false)}
        />
      )}

      {showStory && (
        <StoryPanel
          storyState={storyState}
          playerLevel={stats.level}
          onStoryUpdate={handleStoryUpdate}
          onMissionComplete={handleStoryMissionComplete}
          onClose={() => setShowStory(false)}
        />
      )}

      {/* Story Event Notification */}
      {storyNotification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[700] w-[90%] max-w-sm animate-slide-up">
          <button
            onClick={() => { setStoryNotification(null); setShowStory(true); }}
            className="w-full bg-violet-900/90 backdrop-blur-md border border-violet-500/40 rounded-2xl p-4 shadow-[0_0_30px_rgba(139,92,246,0.3)] text-left group hover:bg-violet-800/90 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={16} className="text-violet-400" />
              <span className="font-game text-xs text-violet-300">NEW STORY EVENT</span>
              <Sparkles size={12} className="text-violet-400 animate-pulse" />
            </div>
            <p className="text-sm text-violet-100 leading-relaxed">{storyNotification}</p>
            <p className="text-xs text-violet-400 mt-2 group-hover:text-violet-300 flex items-center gap-1">
              Tap to read full story <ChevronRight size={12} />
            </p>
          </button>
        </div>
      )}

      {/* Buff/Debuff Info Popup */}
      {showBuffDebuffInfo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowBuffDebuffInfo(false)}>
          <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-game text-lg text-white">ACTIVE EFFECTS</h2>
              <button onClick={() => setShowBuffDebuffInfo(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>

            {/* Buffs Section */}
            <div className="space-y-2">
              <h3 className="font-game text-xs text-emerald-400 flex items-center gap-1"><Shield size={14} /> BUFFS</h3>
              {stats.nutritionBuff?.active && Date.now() < (stats.nutritionBuff.expiresAt || 0) ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                      <Zap size={16} className="text-emerald-400" /> Nutrition Buff
                    </span>
                    <span className="text-lg font-black text-emerald-400">+{Math.round((stats.nutritionBuff.multiplier - 1) * 100)}%</span>
                  </div>
                  <p className="text-xs text-slate-400">{stats.nutritionBuff.reason}</p>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400/80">
                    <Clock size={12} />
                    <span>
                      {(() => {
                        const remaining = (stats.nutritionBuff.expiresAt || 0) - Date.now();
                        const hours = Math.floor(remaining / (1000 * 60 * 60));
                        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                        return `${hours}h ${minutes}m remaining`;
                      })()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 px-2 py-3">No active buffs</div>
              )}
            </div>

            {/* Debuffs Section */}
            <div className="space-y-2">
              <h3 className="font-game text-xs text-red-400 flex items-center gap-1"><ShieldAlert size={14} /> DEBUFFS</h3>
              
              {/* Deduction Debuffs */}
              {(stats.deductionsCountToday ?? 0) > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-red-300 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-red-400" /> Deduction Activities
                    </span>
                    <span className="text-lg font-black text-red-400">-{(stats.deductionsCountToday ?? 0) * 20}%</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    You performed {stats.deductionsCountToday} deduction activit{stats.deductionsCountToday === 1 ? 'y' : 'ies'} today. Each adds 20% debuff (stacks).
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-red-400/80">
                    <Clock size={12} />
                    <span>Resets at midnight</span>
                  </div>
                </div>
              )}

              {/* Non-deduction Daily Debuff (nutrition exceed) */}
              {stats.dailyDebuff?.active && stats.dailyDebuff.reason !== 'deduction' && Date.now() < stats.dailyDebuff.expiresAt ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-red-300 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-red-400" />
                      {stats.dailyDebuff.reason === 'nutrition_exceed' ? 'Macros Exceeded' : 'Daily Debuff'}
                    </span>
                    <span className="text-lg font-black text-red-400">-20%</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {stats.dailyDebuff.reason === 'nutrition_exceed' ? 'You went over your macro targets' : 'Active penalty'}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-red-400/80">
                    <Clock size={12} />
                    <span>
                      {(() => {
                        const remaining = stats.dailyDebuff.expiresAt - Date.now();
                        const hours = Math.floor(remaining / (1000 * 60 * 60));
                        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                        return `${hours}h ${minutes}m remaining`;
                      })()}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Emergency Debuffs */}
              {stats.emergencyDebuffs?.filter(d => d.active).map((debuff, i) => (
                <div key={i} className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-orange-300 flex items-center gap-2">
                      <Zap size={16} className="text-orange-400" /> Emergency Delay
                    </span>
                    <span className="text-lg font-black text-orange-400">-{Math.round((1 - debuff.multiplier) * 100)}%</span>
                  </div>
                  <p className="text-xs text-slate-400">"{debuff.missionName}" — delayed {debuff.daysDelayed} day(s)</p>
                  <div className="flex items-center gap-1.5 text-xs text-orange-400/80">
                    <Clock size={12} />
                    <span>Permanent until removed</span>
                  </div>
                </div>
              ))}

              {/* No debuffs message */}
              {!(stats.deductionsCountToday ?? 0) &&
               !(stats.dailyDebuff?.active && Date.now() < stats.dailyDebuff.expiresAt) && 
               !(stats.emergencyDebuffs?.some(d => d.active)) && (
                <div className="text-xs text-slate-500 px-2 py-3">No active debuffs</div>
              )}
            </div>

            {/* Total Multiplier */}
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between">
                <span className="font-game text-sm text-slate-300">TOTAL XP MULTIPLIER</span>
                <span className={`text-2xl font-black ${getDebuffMultiplier() >= 1 ? 'text-emerald-400' : getDebuffMultiplier() >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {Math.round(getDebuffMultiplier() * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Points Animation */}
      {floatingPoints.map(fp => (
        <div 
          key={fp.id}
          className={`fixed z-[1000] pointer-events-none font-game text-2xl drop-shadow-md animate-float-up ${fp.type === 'sub' ? 'text-red-500' : 'text-emerald-500'}`}
          style={{ left: fp.x, top: fp.y }}
        >
          {fp.type === 'sub' ? '-' : '+'}{fp.points}
        </div>
      ))}
      
      {/* Level Up Animation Overlay */}
      {showLevelUp && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center">
          <div className="absolute inset-0 bg-blue-600/40 backdrop-blur-md animate-fade-in" />
          <div className="relative flex flex-col items-center w-full max-w-sm">
            <div className="absolute -inset-20 bg-yellow-400/20 rounded-full blur-3xl animate-pulse" />
            <div className="font-game text-4xl text-white mb-8 animate-bounce-in drop-shadow-lg text-center">
              LEVEL UP!
            </div>
            <div className="font-game text-6xl text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.5)] animate-bounce-in">
              {stats.level}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <ArrowUp className="text-emerald-400" />
              <span className="font-game text-xl text-emerald-400">ALL BARS RESET</span>
            </div>
            <div className="mt-8 font-game text-lg text-yellow-300 animate-slide-up-fade drop-shadow-md">
              NEW CHALLENGES AWAIT
            </div>
            <div className="mt-4 flex gap-2 animate-fade-in-delayed">
              <Sparkles className="text-yellow-400 animate-spin-slow" />
              <Sparkles className="text-yellow-400 animate-spin-slow" />
              <Sparkles className="text-yellow-400 animate-spin-slow" />
            </div>
          </div>
        </div>
      )}

      {/* Background Skyline Silhouette */}
      <div className="fixed bottom-0 left-0 right-0 pointer-events-none opacity-30 h-48 z-0">
        <svg viewBox="0 0 400 100" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="skyline-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 0.4 }} />
                <stop offset="100%" style={{ stopColor: '#9333ea', stopOpacity: 0.1 }} />
              </linearGradient>
            </defs>
            <path d="M0,100 L0,80 L20,80 L20,60 L40,60 L40,90 L60,90 L60,40 L80,40 L80,70 L100,70 L100,30 L120,30 L120,80 L140,80 L140,50 L160,50 L160,90 L180,90 L180,20 L200,20 L200,60 L220,60 L220,80 L240,80 L240,40 L260,40 L260,70 L280,70 L280,30 L300,30 L300,90 L320,90 L320,50 L340,50 L340,80 L360,80 L360,60 L380,60 L380,90 L400,90 L400,100 Z" fill="url(#skyline-grad)" />
        </svg>
      </div>
    </div>
  );
};

export default App;
