
import React, { useState, useRef, useEffect } from 'react';
import { DietData, DietProfile, BodyLog, DietPlan, Recipe, GroceryItem, FoodEntry, SavedFood, DailyNutritionLog, NutritionData, MacroTargets, WorkoutData } from '../types';
import { geminiService } from '../services/geminiService';
import { nutritionService, SearchFoodResult } from '../services/nutritionService';
import { Html5Qrcode } from 'html5-qrcode';
import {
  X, ChevronDown, ChevronUp, Minus, Plus, ShoppingCart, 
  TrendingUp, Utensils, Sparkles, Loader2, Check,
  Scale, Ruler, Target, Heart, BarChart3, RefreshCw,
  ClipboardList, ChevronRight, Search, ScanBarcode, Star,
  Trash2, Flame, Zap, Camera
} from 'lucide-react';

interface DietPanelProps {
  dietData: DietData;
  onSave: (data: DietData) => void;
  onClose: () => void;
  onNutritionBuff?: () => void; // callback when macro target is hit
  onNutritionDebuff?: () => void; // callback when macro target is exceeded
  workoutData?: WorkoutData;
}

type Tab = 'profile' | 'plan' | 'grocery' | 'logs' | 'nutrition';

export const DietPanel: React.FC<DietPanelProps> = ({ dietData, onSave, onClose, onNutritionBuff, onNutritionDebuff, workoutData }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(dietData.profile ? 'plan' : 'profile');

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 400);
  };

  const [profile, setProfile] = useState<DietProfile>(dietData.profile || {
    height: 170,
    weight: 70,
    muscleMass: undefined,
    bodyFat: undefined,
    goal: 'recomp',
    preferences: '',
  });
  const [bodyLogs, setBodyLogs] = useState<BodyLog[]>(dietData.bodyLogs || []);
  const [currentPlan, setCurrentPlan] = useState<DietPlan | null>(dietData.currentPlan || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dayMode, setDayMode] = useState<'training' | 'rest'>('training');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ analysis: string; suggestedChanges: string[] } | null>(null);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  
  // Body log form
  const [logWeight, setLogWeight] = useState('');
  const [logBodyFat, setLogBodyFat] = useState('');
  const [logMuscleMass, setLogMuscleMass] = useState('');
  const [logNotes, setLogNotes] = useState('');

  // Nutrition tracker state
  const [nutritionData, setNutritionData] = useState<NutritionData>(dietData.nutritionData || {
    savedFoods: [],
    dailyLogs: [],
    macroTargets: null,
  });
  const [barcodeInput, setBarcodeInput] = useState('');
  const [existingFoodSearchQuery, setExistingFoodSearchQuery] = useState('');
  const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchFoodResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [adjustGramsItem, setAdjustGramsItem] = useState<SearchFoodResult | null>(null);
  const [adjustGramsInput, setAdjustGramsInput] = useState('100');
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  const [showCameraScan, setShowCameraScan] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const qrCodeScannerRef = useRef<Html5Qrcode | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [showSavedFoods, setShowSavedFoods] = useState(false);
  const [showMacroSettings, setShowMacroSettings] = useState(false);
  const [showNutritionHistory, setShowNutritionHistory] = useState(false);
  const [showAIPhotoAdd, setShowAIPhotoAdd] = useState(false);
  const [aiPhotoData, setAIPhotoData] = useState<{ image: string | null; name: string; source: 'restaurant' | 'homemade' }>({ image: null, name: '', source: 'homemade' });
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
  const aiPhotoInputRef = useRef<HTMLInputElement>(null);
  const [manualFood, setManualFood] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '', servingSize: '1 serving' });
  const defaultMacroForm = (): MacroTargets => {
    if (nutritionData.macroTargets) return nutritionData.macroTargets;
    if (currentPlan) return {
      calories: { min: Math.round(currentPlan.totalCalories * 0.95), max: Math.round(currentPlan.totalCalories * 1.05) },
      protein: { min: Math.round(currentPlan.totalProtein * 0.9), max: Math.round(currentPlan.totalProtein * 1.1) },
      carbs: { min: Math.round(currentPlan.totalCarbs * 0.85), max: Math.round(currentPlan.totalCarbs * 1.15) },
      fat: { min: Math.round(currentPlan.totalFat * 0.85), max: Math.round(currentPlan.totalFat * 1.15) },
    };
    return { calories: { min: 1800, max: 2200 }, protein: { min: 120, max: 180 }, carbs: { min: 150, max: 300 }, fat: { min: 50, max: 80 } };
  };
  const [macroForm, setMacroForm] = useState<MacroTargets>(defaultMacroForm());

  const getTodayStr = () => new Date().toISOString().split('T')[0];
  
  const getTodayLog = (): DailyNutritionLog => {
    const today = getTodayStr();
    const existing = nutritionData.dailyLogs.find(l => l.date === today);
    if (existing) return existing;
    return { date: today, entries: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, macroHit: false };
  };

  const saveAll = (p?: DietProfile | null, logs?: BodyLog[], plan?: DietPlan | null, nutData?: NutritionData) => {
    onSave({
      profile: p !== undefined ? p : profile,
      bodyLogs: logs || bodyLogs,
      currentPlan: plan !== undefined ? plan : currentPlan,
      planHistory: dietData.planHistory || [],
      nutritionData: nutData || nutritionData,
    });
  };

  // Check if today's macros are within target range
  const checkMacroHit = (log: DailyNutritionLog, targets: MacroTargets | null): boolean => {
    if (!targets) return false;
    return (
      log.totalCalories >= targets.calories.min && log.totalCalories <= targets.calories.max &&
      log.totalProtein >= targets.protein.min && log.totalProtein <= targets.protein.max &&
      log.totalCarbs >= targets.carbs.min && log.totalCarbs <= targets.carbs.max &&
      log.totalFat >= targets.fat.min && log.totalFat <= targets.fat.max
    );
  };

  // Check if any macro exceeds the max range
  const checkMacroExceeded = (log: DailyNutritionLog, targets: MacroTargets | null): boolean => {
    if (!targets) return false;
    return (
      log.totalCalories > targets.calories.max ||
      log.totalProtein > targets.protein.max ||
      log.totalCarbs > targets.carbs.max ||
      log.totalFat > targets.fat.max
    );
  };

  // Add food entry to today's log
  const addFoodEntry = (entry: Omit<FoodEntry, 'id' | 'timestamp'>, saveToSaved: boolean = false) => {
    const fullEntry: FoodEntry = {
      ...entry,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
    };

    const today = getTodayStr();
    const newLogs = [...nutritionData.dailyLogs];
    let todayIdx = newLogs.findIndex(l => l.date === today);
    
    if (todayIdx === -1) {
      newLogs.unshift({ date: today, entries: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, macroHit: false });
      todayIdx = 0;
    }

    const todayLog = { ...newLogs[todayIdx] };
    todayLog.entries = [...todayLog.entries, fullEntry];
    todayLog.totalCalories = todayLog.entries.reduce((s, e) => s + Math.round(e.calories * e.servings), 0);
    todayLog.totalProtein = todayLog.entries.reduce((s, e) => s + Math.round(e.protein * e.servings), 0);
    todayLog.totalCarbs = todayLog.entries.reduce((s, e) => s + Math.round(e.carbs * e.servings), 0);
    todayLog.totalFat = todayLog.entries.reduce((s, e) => s + Math.round(e.fat * e.servings), 0);
    
    const wasHit = todayLog.macroHit;
    const effectiveTargets = nutritionData.macroTargets || (currentPlan ? {
      calories: { min: Math.round(currentPlan.totalCalories * 0.95), max: Math.round(currentPlan.totalCalories * 1.05) },
      protein: { min: Math.round(currentPlan.totalProtein * 0.9), max: Math.round(currentPlan.totalProtein * 1.1) },
      carbs: { min: Math.round(currentPlan.totalCarbs * 0.85), max: Math.round(currentPlan.totalCarbs * 1.15) },
      fat: { min: Math.round(currentPlan.totalFat * 0.85), max: Math.round(currentPlan.totalFat * 1.15) },
    } : null);
    todayLog.macroHit = checkMacroHit(todayLog, effectiveTargets);
    newLogs[todayIdx] = todayLog;

    let newSaved = [...nutritionData.savedFoods];
    if (saveToSaved) {
      const existingIdx = newSaved.findIndex(f => f.name.toLowerCase() === entry.name.toLowerCase());
      if (existingIdx === -1) {
        newSaved.push({
          id: Math.random().toString(36).substr(2, 9),
          name: entry.name,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          servingSize: entry.servingSize || '1 serving',
          barcode: entry.barcode,
          timesUsed: 1,
          createdAt: Date.now(),
        });
      } else {
        newSaved[existingIdx] = { ...newSaved[existingIdx], timesUsed: newSaved[existingIdx].timesUsed + 1 };
      }
    }

    const newNutData: NutritionData = { ...nutritionData, dailyLogs: newLogs, savedFoods: newSaved };
    setNutritionData(newNutData);
    saveAll(undefined, undefined, undefined, newNutData);

    // If macros just hit, trigger buff callback
    if (!wasHit && todayLog.macroHit && onNutritionBuff) {
      onNutritionBuff();
    }

    // If macros were hit but now exceeded, cancel buff and add debuff
    if (wasHit && !todayLog.macroHit && checkMacroExceeded(todayLog, effectiveTargets) && onNutritionDebuff) {
      onNutritionDebuff();
    }
  };

  // Remove food entry from today
  const removeFoodEntry = (entryId: string) => {
    const today = getTodayStr();
    const newLogs = [...nutritionData.dailyLogs];
    const todayIdx = newLogs.findIndex(l => l.date === today);
    if (todayIdx === -1) return;

    const todayLog = { ...newLogs[todayIdx] };
    const wasHit = todayLog.macroHit;
    todayLog.entries = todayLog.entries.filter(e => e.id !== entryId);
    todayLog.totalCalories = todayLog.entries.reduce((s, e) => s + Math.round(e.calories * e.servings), 0);
    todayLog.totalProtein = todayLog.entries.reduce((s, e) => s + Math.round(e.protein * e.servings), 0);
    todayLog.totalCarbs = todayLog.entries.reduce((s, e) => s + Math.round(e.carbs * e.servings), 0);
    todayLog.totalFat = todayLog.entries.reduce((s, e) => s + Math.round(e.fat * e.servings), 0);
    const effectiveTargets2 = nutritionData.macroTargets || (currentPlan ? {
      calories: { min: Math.round(currentPlan.totalCalories * 0.95), max: Math.round(currentPlan.totalCalories * 1.05) },
      protein: { min: Math.round(currentPlan.totalProtein * 0.9), max: Math.round(currentPlan.totalProtein * 1.1) },
      carbs: { min: Math.round(currentPlan.totalCarbs * 0.85), max: Math.round(currentPlan.totalCarbs * 1.15) },
      fat: { min: Math.round(currentPlan.totalFat * 0.85), max: Math.round(currentPlan.totalFat * 1.15) },
    } : null);
    todayLog.macroHit = checkMacroHit(todayLog, effectiveTargets2);
    newLogs[todayIdx] = todayLog;

    const newNutData = { ...nutritionData, dailyLogs: newLogs };
    setNutritionData(newNutData);
    saveAll(undefined, undefined, undefined, newNutData);

    // If removing food brought macros back into range after exceed, re-trigger buff
    if (!wasHit && todayLog.macroHit && onNutritionBuff) {
      onNutritionBuff();
    }
  };

  // Barcode lookup
  const handleBarcodeLookup = async () => {
    if (!barcodeInput.trim()) return;
    setIsScanningBarcode(true);
    try {
      const result = await nutritionService.lookupBarcode(barcodeInput.trim());
      if (result.found) {
        addFoodEntry({
          name: result.name,
          calories: result.calories,
          protein: result.protein,
          carbs: result.carbs,
          fat: result.fat,
          servings: 1,
          servingSize: result.servingSize,
          source: 'barcode',
          barcode: result.barcode,
        }, true);
        setBarcodeInput('');
      } else {
        alert('Product not found. Try searching by name instead.');
      }
    } finally {
      setIsScanningBarcode(false);
    }
  };

  // Look up barcode by code string (used after camera scan)
  const lookupBarcodeByCode = async (code: string) => {
    setIsScanningBarcode(true);
    try {
      const result = await nutritionService.lookupBarcode(code);
      if (result.found) {
        addFoodEntry({
          name: result.name,
          calories: result.calories,
          protein: result.protein,
          carbs: result.carbs,
          fat: result.fat,
          servings: 1,
          servingSize: result.servingSize,
          source: 'barcode',
          barcode: result.barcode,
        }, true);
      } else {
        alert('Product not found. Try searching by name instead.');
      }
    } finally {
      setIsScanningBarcode(false);
    }
  };

  // Start/stop camera barcode scanner
  const startCameraScan = () => {
    setCameraError(null);
    setShowCameraScan(true);
  };
  const stopCameraScan = async () => {
    const scanner = qrCodeScannerRef.current;
    qrCodeScannerRef.current = null;
    if (scanner) {
      try {
        if (typeof scanner.isScanning === 'function' && scanner.isScanning()) {
          await scanner.stop();
        }
      } catch (_) {}
      try {
        scanner.clear?.();
      } catch (_) {}
    }
    setShowCameraScan(false);
    setCameraError(null);
  };

  useEffect(() => {
    if (!showCameraScan) return;
    const el = document.getElementById('barcode-scanner-root');
    if (!el) return;
    const scanner = new Html5Qrcode('barcode-scanner-root');
    qrCodeScannerRef.current = scanner;
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 150 },
      aspectRatio: 1.0,
    };
    scanner.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        scanner.stop().then(() => {
          qrCodeScannerRef.current = null;
          setShowCameraScan(false);
          setCameraError(null);
          lookupBarcodeByCode(decodedText);
        }).catch(() => {});
      },
      () => {}
    ).catch((err: Error) => {
      const msg = !navigator.mediaDevices?.getUserMedia
        ? 'Camera not supported in this browser.'
        : location.protocol !== 'https:' && !/localhost|127\.0\.0\.1/.test(location.hostname)
          ? 'Camera requires HTTPS (or use localhost).'
          : err.name === 'NotAllowedError'
            ? 'Camera permission denied.'
            : err.name === 'NotFoundError'
              ? 'No camera found.'
              : 'Could not start camera.';
      setCameraError(msg);
    });
    return () => {
      if (qrCodeScannerRef.current?.isScanning()) {
        qrCodeScannerRef.current.stop().catch(() => {});
        qrCodeScannerRef.current.clear();
      }
      qrCodeScannerRef.current = null;
    };
  }, [showCameraScan]);

  // Food search via AI
  const handleFoodSearch = async () => {
    if (!foodSearchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await nutritionService.searchFood(foodSearchQuery);
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  // Open adjust-grams popup for an API search result
  const openAdjustGrams = (item: SearchFoodResult) => {
    setAdjustGramsItem(item);
    setAdjustGramsInput(String(item.referenceGrams ?? 100));
  };
  const closeAdjustGrams = () => {
    setAdjustGramsItem(null);
    setAdjustGramsInput('100');
  };
  // Add from search with scaled grams (called from adjust-grams popup)
  const addFromSearchWithGrams = () => {
    if (!adjustGramsItem) return;
    const baseG = adjustGramsItem.referenceGrams ?? 100;
    const enteredG = Math.max(1, Math.round(parseFloat(adjustGramsInput) || baseG));
    const mult = enteredG / baseG;
    addFoodEntry({
      name: adjustGramsItem.name,
      calories: Math.round(adjustGramsItem.calories * mult * 10) / 10,
      protein: Math.round(adjustGramsItem.protein * mult * 10) / 10,
      carbs: Math.round(adjustGramsItem.carbs * mult * 10) / 10,
      fat: Math.round(adjustGramsItem.fat * mult * 10) / 10,
      servings: 1,
      servingSize: `${enteredG}g`,
      source: 'search',
      barcode: (adjustGramsItem as any).barcode,
    }, true);
    setSearchResults([]);
    setFoodSearchQuery('');
    setExistingFoodSearchQuery('');
    closeAdjustGrams();
  };

  // Add manual food
  const handleManualAdd = () => {
    if (!manualFood.name || !manualFood.calories) return;
    addFoodEntry({
      name: manualFood.name,
      calories: parseFloat(manualFood.calories),
      protein: parseFloat(manualFood.protein) || 0,
      carbs: parseFloat(manualFood.carbs) || 0,
      fat: parseFloat(manualFood.fat) || 0,
      servings: 1,
      servingSize: manualFood.servingSize,
      source: 'manual',
    }, true);
    setManualFood({ name: '', calories: '', protein: '', carbs: '', fat: '', servingSize: '1 serving' });
    setShowManualAdd(false);
  };

  // Add from saved foods
  const addFromSaved = (saved: SavedFood) => {
    openAdjustGrams({
      name: saved.name,
      calories: saved.calories,
      protein: saved.protein,
      carbs: saved.carbs,
      fat: saved.fat,
      servingSize: saved.servingSize,
      referenceGrams: 100, // Assume saved foods are stored per 100g or just use 100 as base
    });
  };

  // Add a copy of a today's entry (re-log same food)
  const addCopyOfEntry = (entry: FoodEntry) => {
    addFoodEntry({
      name: entry.name,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      servings: entry.servings,
      servingSize: entry.servingSize || '1 serving',
      source: 'saved',
    }, false);
  };

  // AI Photo Analysis
  const handleAIPhotoAnalysis = async () => {
    if (!aiPhotoData.image) return;
    setIsAIAnalyzing(true);
    try {
      const result = await nutritionService.analyzeFoodImage(aiPhotoData.image, aiPhotoData.name, aiPhotoData.source);
      if (result) {
        addFoodEntry({
          name: result.name,
          calories: result.calories,
          protein: result.protein,
          carbs: result.carbs,
          fat: result.fat,
          servings: 1,
          servingSize: result.servingSize,
          source: 'search',
        }, true);
        setShowAIPhotoAdd(false);
        setAIPhotoData({ image: null, name: '', source: 'homemade' });
      } else {
        alert('AI analysis failed. Please try again or add manually.');
      }
    } catch (err) {
      console.error("AI Photo analysis error:", err);
      alert('Error analyzing image.');
    } finally {
      setIsAIAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAIPhotoData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Filter saved foods and today's entries for "existing food" search
  const existingSearchFiltered = (() => {
    const q = existingFoodSearchQuery.trim().toLowerCase();
    if (!q) return { saved: [], today: [] };
    const todayLog = getTodayLog();
    return {
      saved: nutritionData.savedFoods.filter(f => f.name.toLowerCase().includes(q)),
      today: todayLog.entries.filter(e => e.name.toLowerCase().includes(q)),
    };
  })();

  // Delete saved food
  const deleteSavedFood = (id: string) => {
    const newSaved = nutritionData.savedFoods.filter(f => f.id !== id);
    const newNutData = { ...nutritionData, savedFoods: newSaved };
    setNutritionData(newNutData);
    saveAll(undefined, undefined, undefined, newNutData);
  };

  // Save macro targets
  const handleSaveMacros = () => {
    const newNutData = { ...nutritionData, macroTargets: macroForm };
    setNutritionData(newNutData);
    saveAll(undefined, undefined, undefined, newNutData);
    setShowMacroSettings(false);
  };

  // Generate diet plan
  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    try {
      const plan = await geminiService.generateDietPlan(profile, workoutData);
      if (plan) {
        setCurrentPlan(plan);
        setActiveTab('plan');
        const newHistory = currentPlan 
          ? [...(dietData.planHistory || []), currentPlan]
          : (dietData.planHistory || []);
        onSave({
          profile,
          bodyLogs,
          currentPlan: plan,
          planHistory: newHistory,
        });
      }
    } catch (err) {
      console.error("Plan generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Analyze progress
  const handleAnalyze = async () => {
    if (!profile) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await geminiService.analyzeDietProgress(profile, bodyLogs, currentPlan);
      setAnalysisResult({ analysis: result.analysis, suggestedChanges: result.suggestedChanges });
      if (result.newPlan) {
        const newHistory = currentPlan 
          ? [...(dietData.planHistory || []), currentPlan]
          : (dietData.planHistory || []);
        setCurrentPlan(result.newPlan);
        onSave({
          profile,
          bodyLogs,
          currentPlan: result.newPlan,
          planHistory: newHistory,
        });
      }
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Add body log
  const handleAddLog = () => {
    if (!logWeight) return;
    const newLog: BodyLog = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString().split('T')[0],
      weight: parseFloat(logWeight),
      bodyFat: logBodyFat ? parseFloat(logBodyFat) : undefined,
      muscleMass: logMuscleMass ? parseFloat(logMuscleMass) : undefined,
      notes: logNotes || undefined,
    };
    const newLogs = [newLog, ...bodyLogs];
    setBodyLogs(newLogs);
    setLogWeight('');
    setLogBodyFat('');
    setLogMuscleMass('');
    setLogNotes('');
    saveAll(undefined, newLogs, undefined);
  };

  // Adjust recipe servings
  const adjustServings = (recipeId: string, delta: number) => {
    if (!currentPlan) return;
    const newRecipes = currentPlan.recipes.map(r => {
      if (r.id === recipeId) {
        const current = r.adjustedServings || r.servings;
        const newServings = Math.max(0.5, current + delta);
        return { ...r, adjustedServings: newServings };
      }
      return r;
    });
    const newPlan = { ...currentPlan, recipes: newRecipes };
    setCurrentPlan(newPlan);
    saveAll(undefined, undefined, newPlan);
  };

  // Toggle grocery checked
  const toggleGrocery = (idx: number) => {
    if (!currentPlan) return;
    const newList = currentPlan.groceryList.map((item, i) => 
      i === idx ? { ...item, checked: !item.checked } : item
    );
    const newPlan = { ...currentPlan, groceryList: newList };
    setCurrentPlan(newPlan);
    saveAll(undefined, undefined, newPlan);
  };

  const goalLabels = { bulk: 'BULK', cut: 'CUT', recomp: 'RECOMP' };
  const goalColors = { bulk: 'text-blue-400', cut: 'text-red-400', recomp: 'text-purple-400' };
  const goalBg = { bulk: 'bg-blue-500/20 border-blue-500/30', cut: 'bg-red-500/20 border-red-500/30', recomp: 'bg-purple-500/20 border-purple-500/30' };

  const todayLog = getTodayLog();

  // Auto-derive macro targets from the current plan, allow manual override
  const autoTargetsFromPlan: MacroTargets | null = currentPlan ? {
    calories: { min: Math.round(currentPlan.totalCalories * 0.95), max: Math.round(currentPlan.totalCalories * 1.05) },
    protein: { min: Math.round(currentPlan.totalProtein * 0.9), max: Math.round(currentPlan.totalProtein * 1.1) },
    carbs: { min: Math.round(currentPlan.totalCarbs * 0.85), max: Math.round(currentPlan.totalCarbs * 1.15) },
    fat: { min: Math.round(currentPlan.totalFat * 0.85), max: Math.round(currentPlan.totalFat * 1.15) },
  } : null;
  const targets = nutritionData.macroTargets || autoTargetsFromPlan;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: 'PROFILE', icon: <Target size={14} /> },
    { key: 'plan', label: 'PLAN', icon: <Utensils size={14} /> },
    { key: 'grocery', label: 'GROCERY', icon: <ShoppingCart size={14} /> },
    { key: 'nutrition', label: 'MACROS', icon: <Flame size={14} /> },
    { key: 'logs', label: 'BODY LOG', icon: <BarChart3 size={14} /> },
  ];

  return (
    <div className={`fixed inset-0 bg-black/90 backdrop-blur-md z-[600] flex flex-col ${isClosing ? 'tv-screen-off' : 'tv-screen-on'}`} style={{ filter: 'brightness(1.15)', paddingTop: 'max(env(safe-area-inset-top), 48px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Heart size={22} className="text-emerald-400" />
          <h2 className="font-game text-xl text-white">DIET PANEL</h2>
        </div>
        <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 text-xs font-game tracking-wider transition-all ${
              activeTab === tab.key 
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* ===== PROFILE TAB ===== */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-4">
              <h3 className="font-game text-base text-emerald-400">BODY STATS</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Height (cm)</label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-white/10 rounded-xl px-3 py-2">
                    <Ruler size={14} className="text-slate-500" />
                    <input
                      type="number"
                      value={profile.height}
                      onChange={(e) => setProfile({ ...profile, height: parseFloat(e.target.value) || 0 })}
                      className="flex-1 bg-transparent text-white text-sm focus:outline-none w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Weight (kg)</label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-white/10 rounded-xl px-3 py-2">
                    <Scale size={14} className="text-slate-500" />
                    <input
                      type="number"
                      value={profile.weight}
                      onChange={(e) => setProfile({ ...profile, weight: parseFloat(e.target.value) || 0 })}
                      className="flex-1 bg-transparent text-white text-sm focus:outline-none w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Muscle Mass (kg)</label>
                  <input
                    type="number"
                    value={profile.muscleMass || ''}
                    onChange={(e) => setProfile({ ...profile, muscleMass: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="Optional"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Body Fat (%)</label>
                  <input
                    type="number"
                    value={profile.bodyFat || ''}
                    onChange={(e) => setProfile({ ...profile, bodyFat: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="Optional"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>

            {/* Goal Selection */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
              <h3 className="font-game text-base text-emerald-400">GOAL</h3>
              <div className="flex gap-2">
                {(['bulk', 'cut', 'recomp'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setProfile({ ...profile, goal: g })}
                    className={`flex-1 py-3 rounded-xl font-game text-sm border transition-all ${
                      profile.goal === g 
                        ? `${goalBg[g]} ${goalColors[g]} shadow-lg` 
                        : 'bg-slate-950 border-white/10 text-slate-500 hover:text-white'
                    }`}
                  >
                    {goalLabels[g]}
                  </button>
                ))}
              </div>
            </div>

            {/* Diet Preferences */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
              <h3 className="font-game text-base text-emerald-400">DIET PREFERENCES</h3>
              <textarea
                value={profile.preferences}
                onChange={(e) => setProfile({ ...profile, preferences: e.target.value })}
                placeholder="e.g. vegetarian, no dairy, high protein, low carb, keto, halal..."
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 resize-none h-20 placeholder:text-slate-500"
              />
            </div>

            {/* Target Calories Override */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
              <h3 className="font-game text-base text-emerald-400">TARGET CALORIES (OPTIONAL)</h3>
              <input
                type="number"
                value={profile.targetCalories || ''}
                onChange={(e) => setProfile({ ...profile, targetCalories: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="Leave empty for AI calculation"
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500"
              />
            </div>

            {/* Save & Generate */}
            <div className="space-y-3">
              <button
                onClick={() => {
                  saveAll(profile, undefined, undefined);
                }}
                className="w-full bg-slate-800 text-emerald-400 font-bold py-3 rounded-xl border border-emerald-500/30 hover:bg-slate-700 transition-all text-sm"
              >
                SAVE PROFILE
              </button>
              <button
                onClick={handleGeneratePlan}
                disabled={isGenerating}
                className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50"
              >
                {isGenerating ? (
                  <><Loader2 size={18} className="animate-spin" /> GENERATING PLAN...</>
                ) : (
                  <><Sparkles size={18} /> GENERATE DIET PLAN</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ===== PLAN TAB ===== */}
        {activeTab === 'plan' && (
          <div className="space-y-4">
            {currentPlan ? (() => {
              const isRestMode = dayMode === 'rest' && currentPlan.restDayPlan;
              const activePlan = isRestMode ? currentPlan.restDayPlan! : currentPlan;
              return (
              <>
                {/* Training Day / Rest Day Toggle */}
                {currentPlan.restDayPlan && (
                  <div className="flex bg-slate-900/60 border border-white/10 rounded-xl p-1 gap-1">
                    <button
                      onClick={() => setDayMode('training')}
                      className={`flex-1 py-2 rounded-lg text-xs font-game tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        dayMode === 'training'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Flame size={12} /> TRAINING DAY
                    </button>
                    <button
                      onClick={() => setDayMode('rest')}
                      className={`flex-1 py-2 rounded-lg text-xs font-game tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        dayMode === 'rest'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Heart size={12} /> REST DAY
                    </button>
                  </div>
                )}

                {/* Macro Summary */}
                <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-game text-base text-emerald-400">
                      {isRestMode ? 'REST DAY MACROS' : 'TRAINING DAY MACROS'}
                    </h3>
                    <span className="text-xs text-slate-400">
                      {new Date(currentPlan.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-slate-950 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-orange-400">{activePlan.totalCalories}</div>
                      <div className="text-xs text-slate-500 font-game">KCAL</div>
                    </div>
                    <div className="bg-slate-950 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-red-400">{activePlan.totalProtein}g</div>
                      <div className="text-xs text-slate-500 font-game">PROTEIN</div>
                    </div>
                    <div className="bg-slate-950 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-blue-400">{activePlan.totalCarbs}g</div>
                      <div className="text-xs text-slate-500 font-game">CARBS</div>
                    </div>
                    <div className="bg-slate-950 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-yellow-400">{activePlan.totalFat}g</div>
                      <div className="text-xs text-slate-500 font-game">FAT</div>
                    </div>
                  </div>
                  {currentPlan.aiNotes && (
                    <div className="mt-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                      <p className="text-xs text-emerald-200">{currentPlan.aiNotes}</p>
                    </div>
                  )}
                </div>

                {/* Recipes */}
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mealType => {
                  const meals = activePlan.recipes.filter(r => r.mealType === mealType);
                  if (meals.length === 0) return null;
                  return (
                    <div key={mealType} className="space-y-2">
                      <h3 className="font-game text-sm text-slate-300 uppercase px-1">{mealType}</h3>
                      {meals.map(recipe => {
                        const isExpanded = expandedRecipe === recipe.id;
                        const servingMult = (recipe.adjustedServings || recipe.servings) / recipe.servings;
                        return (
                          <div key={recipe.id} className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden">
                            <button
                              onClick={() => setExpandedRecipe(isExpanded ? null : recipe.id)}
                              className="w-full p-4 flex items-center gap-3 hover:bg-slate-800/40 transition-all"
                            >
                              <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400">
                                <Utensils size={18} />
                              </div>
                              <div className="flex-1 text-left">
                                <div className="font-bold text-white text-base">{recipe.name}</div>
                                <div className="text-xs text-slate-400">
                                  {Math.round(recipe.calories * servingMult)} kcal | P:{Math.round(recipe.protein * servingMult)}g C:{Math.round(recipe.carbs * servingMult)}g F:{Math.round(recipe.fat * servingMult)}g
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                            </button>
                            
                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                                {/* Serving Adjuster */}
                                <div className="flex items-center justify-between bg-slate-950 rounded-xl px-4 py-2">
                                  <span className="text-xs text-slate-300 font-bold">SERVINGS</span>
                                  <div className="flex items-center gap-3">
                                    <button 
                                      onClick={() => adjustServings(recipe.id, -0.5)}
                                      className="w-7 h-7 bg-slate-800 rounded-full flex items-center justify-center text-white hover:bg-slate-700"
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <span className="text-white font-bold text-sm w-8 text-center">
                                      {recipe.adjustedServings || recipe.servings}
                                    </span>
                                    <button 
                                      onClick={() => adjustServings(recipe.id, 0.5)}
                                      className="w-7 h-7 bg-slate-800 rounded-full flex items-center justify-center text-white hover:bg-slate-700"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                </div>

                                {/* Ingredients */}
                                <div>
                                  <h4 className="text-xs text-emerald-400 font-game mb-2">INGREDIENTS</h4>
                                  <ul className="space-y-1">
                                    {recipe.ingredients.map((ing, i) => (
                                      <li key={i} className="text-sm text-slate-200 flex items-start gap-2">
                                        <span className="text-emerald-500 mt-0.5">•</span>
                                        {ing}
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                {/* Instructions */}
                                <div>
                                  <h4 className="text-xs text-emerald-400 font-game mb-2">INSTRUCTIONS</h4>
                                  <p className="text-sm text-slate-300 leading-relaxed">{recipe.instructions}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Regenerate Button */}
                <button
                  onClick={handleGeneratePlan}
                  disabled={isGenerating}
                  className="w-full bg-slate-800 text-emerald-400 font-bold py-3 rounded-xl border border-emerald-500/30 flex items-center justify-center gap-2 hover:bg-slate-700 transition-all disabled:opacity-50 text-sm"
                >
                  {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  REGENERATE PLAN
                </button>
              </>
              );
            })() : (
              <div className="text-center py-16 text-slate-500 space-y-4">
                <Utensils size={48} className="mx-auto opacity-30" />
                <p className="font-game text-xl">NO DIET PLAN YET</p>
                <p className="text-sm">Set up your profile first, then generate a plan</p>
                <button
                  onClick={() => setActiveTab('profile')}
                  className="bg-emerald-600 text-white font-bold py-3 px-6 rounded-xl inline-flex items-center gap-2 hover:bg-emerald-500 transition-all"
                >
                  <Target size={16} /> SET UP PROFILE
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== GROCERY TAB ===== */}
        {activeTab === 'grocery' && (
          <div className="space-y-4">
            {currentPlan && currentPlan.groceryList.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-game text-base text-emerald-400">DAILY GROCERY LIST</h3>
                  <span className="text-xs text-slate-400">
                    {currentPlan.groceryList.filter(g => g.checked).length}/{currentPlan.groceryList.length} items
                  </span>
                </div>

                {/* Group by category */}
                {Object.entries(
                  currentPlan.groceryList.reduce((groups: Record<string, (GroceryItem & { idx: number })[]>, item, idx) => {
                    const cat = item.category || 'Other';
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push({ ...item, idx });
                    return groups;
                  }, {})
                ).map(([category, items]) => (
                  <div key={category} className="space-y-2">
                    <h4 className="text-xs text-slate-400 font-game uppercase px-1">{category}</h4>
                    {items.map((item) => (
                      <button
                        key={item.idx}
                        onClick={() => toggleGrocery(item.idx)}
                        className={`w-full bg-slate-900/60 border rounded-xl p-3 flex items-center gap-3 transition-all ${
                          item.checked 
                            ? 'border-emerald-500/30 bg-emerald-500/5' 
                            : 'border-white/10 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          item.checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
                        }`}>
                          {item.checked && <Check size={14} className="text-white" />}
                        </div>
                        <span className={`flex-1 text-left text-sm ${item.checked ? 'text-slate-500 line-through' : 'text-white'}`}>
                          {item.name}
                        </span>
                        <span className="text-xs text-slate-500">{item.amount}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <div className="text-center py-16 text-slate-500 space-y-4">
                <ShoppingCart size={48} className="mx-auto opacity-30" />
                <p className="font-game text-xl">NO GROCERY LIST</p>
                <p className="text-sm">Generate a diet plan to see your grocery list</p>
              </div>
            )}
          </div>
        )}

        {/* ===== NUTRITION TRACKER TAB ===== */}
        {activeTab === 'nutrition' && (
          <div className="space-y-4">
            {/* Macro Targets Banner */}
            {targets ? (
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-game text-base text-amber-400 flex items-center gap-1.5"><Flame size={16} /> TODAY'S MACROS</h3>
                  <button onClick={() => { setMacroForm(targets); setShowMacroSettings(true); }} className="text-xs text-slate-400 hover:text-white font-game">EDIT</button>
                </div>
                {!nutritionData.macroTargets && currentPlan && (
                  <div className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                    <Utensils size={12} /> Auto-synced from diet plan ({currentPlan.totalCalories} kcal target, ±5%)
                  </div>
                )}
                {nutritionData.macroTargets && (
                  <div className="text-xs text-slate-400 mb-3">Custom targets (manually set)</div>
                )}

                {/* Macro Cards */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {([
                    { label: 'KCAL', current: todayLog.totalCalories, target: Math.round((targets.calories.min + targets.calories.max) / 2), color: 'text-orange-400', bg: 'bg-orange-500/10' },
                    { label: 'PROTEIN', current: todayLog.totalProtein, target: Math.round((targets.protein.min + targets.protein.max) / 2), color: 'text-red-400', bg: 'bg-red-500/10', unit: 'g' },
                    { label: 'CARBS', current: todayLog.totalCarbs, target: Math.round((targets.carbs.min + targets.carbs.max) / 2), color: 'text-blue-400', bg: 'bg-blue-500/10', unit: 'g' },
                    { label: 'FAT', current: todayLog.totalFat, target: Math.round((targets.fat.min + targets.fat.max) / 2), color: 'text-yellow-400', bg: 'bg-yellow-500/10', unit: 'g' },
                  ] as const).map(m => {
                    const hitPct = m.target > 0 ? Math.round((m.current / m.target) * 100) : 0;
                    return (
                      <div key={m.label} className={`${m.bg} rounded-xl p-2.5 text-center border border-white/5`}>
                        <div className={`text-lg font-bold ${m.color}`}>{hitPct}%</div>
                        <div className="text-xs text-slate-300 font-bold">{m.current}{m.unit || ''}</div>
                        <div className="text-[10px] text-slate-500">/ {m.target}{m.unit || ''}</div>
                        <div className={`text-[10px] font-game ${m.color}`}>{m.label}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Progress bars */}
                <div className="space-y-3">
                  {([
                    { label: 'CALORIES', current: todayLog.totalCalories, min: targets.calories.min, max: targets.calories.max, color: 'bg-orange-500', text: 'text-orange-400' },
                    { label: 'PROTEIN', current: todayLog.totalProtein, min: targets.protein.min, max: targets.protein.max, color: 'bg-red-500', text: 'text-red-400', unit: 'g' },
                    { label: 'CARBS', current: todayLog.totalCarbs, min: targets.carbs.min, max: targets.carbs.max, color: 'bg-blue-500', text: 'text-blue-400', unit: 'g' },
                    { label: 'FAT', current: todayLog.totalFat, min: targets.fat.min, max: targets.fat.max, color: 'bg-yellow-500', text: 'text-yellow-400', unit: 'g' },
                  ] as const).map(macro => {
                    const pct = Math.min(100, (macro.current / macro.max) * 100);
                    const inRange = macro.current >= macro.min && macro.current <= macro.max;
                    const over = macro.current > macro.max;
                    return (
                      <div key={macro.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-game ${macro.text}`}>{macro.label}</span>
                          <span className={`text-xs font-bold ${inRange ? 'text-emerald-400' : over ? 'text-red-400' : 'text-slate-300'}`}>
                            {macro.current}{macro.unit || ''} / {macro.min}–{macro.max}{macro.unit || ''}
                            {inRange && ' ✓'}
                          </span>
                        </div>
                        <div className="h-3 bg-slate-800 rounded-full overflow-hidden relative">
                          {/* Min marker */}
                          <div className="absolute top-0 bottom-0 w-0.5 bg-emerald-500/60 z-10" style={{ left: `${(macro.min / macro.max) * 100}%` }} />
                          <div className={`h-full rounded-full transition-all ${inRange ? 'bg-emerald-500' : over ? 'bg-red-500' : macro.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {todayLog.macroHit && (
                  <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2">
                    <Zap size={18} className="text-emerald-400" />
                    <span className="text-sm text-emerald-300 font-bold">ALL MACROS HIT! +25% XP buff for 12 hours!</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 text-center space-y-2">
                  <Flame size={32} className="mx-auto text-amber-400/40" />
                  <p className="font-game text-base text-slate-300">NO MACRO TARGETS</p>
                  <p className="text-sm text-slate-400">Generate a diet plan first, and targets will auto-sync. Or set them manually.</p>
                </div>
                <button
                  onClick={() => setShowMacroSettings(true)}
                  className="w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 hover:bg-amber-500/20 transition-all"
                >
                  <Flame size={20} className="text-amber-400" />
                  <div className="text-left">
                    <div className="text-sm font-bold text-amber-100">SET MANUAL TARGETS</div>
                    <div className="text-xs text-amber-400/60">Or generate a plan to auto-fill</div>
                  </div>
                </button>
              </div>
            )}

            {/* Food Input Methods */}
            <div className="space-y-2">
              {/* Barcode Scanner */}
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <ScanBarcode size={18} className="text-cyan-400 shrink-0" />
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Enter barcode or scan with camera..."
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder:text-slate-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleBarcodeLookup()}
                  />
                  <button
                    onClick={startCameraScan}
                    disabled={isScanningBarcode}
                    className="p-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 disabled:opacity-50"
                    title="Scan with camera"
                  >
                    <Camera size={18} />
                  </button>
                  <button
                    onClick={handleBarcodeLookup}
                    disabled={isScanningBarcode || !barcodeInput.trim()}
                    className="px-3 py-1 bg-cyan-600 text-white text-xs font-bold rounded-lg hover:bg-cyan-500 disabled:opacity-50"
                  >
                    {isScanningBarcode ? '...' : 'LOOK UP'}
                  </button>
                </div>
              </div>

              {/* Camera scan overlay - aligned to top */}
              {showCameraScan && (
                <div className="fixed inset-0 z-[300] bg-black/90 flex flex-col items-center pt-6 pb-6 px-4 overflow-auto">
                  <div className="w-full max-w-md flex-shrink-0">
                    <div id="barcode-scanner-root" className="rounded-2xl overflow-hidden bg-slate-900" />
                    {cameraError && (
                      <p className="mt-2 text-sm text-red-400 text-center">{cameraError}</p>
                    )}
                    <p className="mt-2 text-xs text-slate-400 text-center">Point your camera at a barcode</p>
                  </div>
                  <div className="mt-4 flex-shrink-0 relative z-10">
                    <button
                      type="button"
                      onClick={() => void stopCameraScan()}
                      className="px-4 py-2 bg-slate-600 text-white text-sm font-bold rounded-xl hover:bg-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Search existing food (saved + today) */}
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <Star size={18} className="text-amber-400 shrink-0" />
                  <input
                    type="text"
                    value={existingFoodSearchQuery}
                    onChange={(e) => setExistingFoodSearchQuery(e.target.value)}
                    placeholder="Search saved / today's food..."
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder:text-slate-500"
                  />
                </div>
                {existingFoodSearchQuery.trim() && (existingSearchFiltered.saved.length > 0 || existingSearchFiltered.today.length > 0) && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/5 divide-y divide-white/5">
                    {existingSearchFiltered.saved.map((saved) => (
                      <button
                        key={saved.id}
                        onClick={() => addFromSaved(saved)}
                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-800/40 text-left"
                      >
                        <Star size={14} className="text-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-bold truncate">{saved.name}</div>
                          <div className="text-xs text-slate-400">{saved.servingSize} | P:{saved.protein}g C:{saved.carbs}g F:{saved.fat}g</div>
                        </div>
                        <Plus size={14} className="text-emerald-400 shrink-0" />
                      </button>
                    ))}
                    {existingSearchFiltered.today.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => addCopyOfEntry(entry)}
                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-800/40 text-left"
                      >
                        <Utensils size={14} className="text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-bold truncate">{entry.name}</div>
                          <div className="text-xs text-slate-400">{entry.servingSize || '1 serving'} | {Math.round(entry.calories * entry.servings)} kcal</div>
                        </div>
                        <Plus size={14} className="text-emerald-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Food Search (API) */}
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <Search size={18} className="text-blue-400 shrink-0" />
                  <input
                    type="text"
                    value={foodSearchQuery}
                    onChange={(e) => setFoodSearchQuery(e.target.value)}
                    placeholder="Search food (database)..."
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder:text-slate-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleFoodSearch()}
                  />
                  <button
                    onClick={handleFoodSearch}
                    disabled={isSearching || !foodSearchQuery.trim()}
                    className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 disabled:opacity-50"
                  >
                    {isSearching ? <Loader2 size={14} className="animate-spin" /> : 'SEARCH'}
                  </button>
                </div>
              </div>

              {/* Search Results (API) - click opens adjust-grams popup */}
              {searchResults.length > 0 && (
                <div className="bg-slate-900/60 border border-blue-500/20 rounded-2xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs text-blue-400 font-game">SEARCH RESULTS</span>
                    <button onClick={() => setSearchResults([])} className="text-slate-500 hover:text-white"><X size={14} /></button>
                  </div>
                  {searchResults.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => openAdjustGrams(item)}
                      className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-slate-800/40 transition-all border-b border-white/5 last:border-0"
                    >
                      <div className="flex-1 text-left">
                        <div className="text-sm text-white font-bold">{item.name}</div>
                        <div className="text-xs text-slate-400">{item.servingSize} | {item.calories} kcal | P:{item.protein}g C:{item.carbs}g F:{item.fat}g</div>
                      </div>
                      <Plus size={16} className="text-emerald-400" />
                    </button>
                  ))}
                </div>
              )}

              {/* Adjust grams popup (when adding from API search) - aligned to top */}
              {adjustGramsItem && (
                <div className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-6 p-4 overflow-auto" onClick={closeAdjustGrams}>
                  <div className="bg-slate-900 border border-white/20 rounded-2xl p-4 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-game text-sm text-blue-400">ADJUST AMOUNT</span>
                      <button onClick={closeAdjustGrams} className="text-slate-500 hover:text-white"><X size={18} /></button>
                    </div>
                    <p className="text-white font-bold mb-2 truncate">{adjustGramsItem.name}</p>
                    <p className="text-xs text-slate-400 mb-3">Per {adjustGramsItem.referenceGrams ?? 100}g: {adjustGramsItem.calories} kcal | P:{adjustGramsItem.protein}g C:{adjustGramsItem.carbs}g F:{adjustGramsItem.fat}g</p>
                    <label className="block text-xs text-slate-400 mb-1">Amount (grams)</label>
                    <input
                      type="number"
                      min={1}
                      value={adjustGramsInput}
                      onChange={(e) => setAdjustGramsInput(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-blue-500/50 mb-3"
                    />
                    {(() => {
                      const baseG = adjustGramsItem.referenceGrams ?? 100;
                      const enteredG = Math.max(1, parseFloat(adjustGramsInput) || baseG);
                      const mult = enteredG / baseG;
                      const cal = Math.round(adjustGramsItem.calories * mult * 10) / 10;
                      const p = Math.round(adjustGramsItem.protein * mult * 10) / 10;
                      const c = Math.round(adjustGramsItem.carbs * mult * 10) / 10;
                      const f = Math.round(adjustGramsItem.fat * mult * 10) / 10;
                      return (
                        <p className="text-xs text-emerald-400 mb-4">Preview: {enteredG}g → {cal} kcal | P:{p}g C:{c}g F:{f}g</p>
                      );
                    })()}
                    <div className="flex gap-2">
                      <button onClick={closeAdjustGrams} className="flex-1 py-2 rounded-xl text-sm font-bold border border-white/20 text-slate-400 hover:text-white">Cancel</button>
                      <button onClick={addFromSearchWithGrams} className="flex-1 py-2 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-500">Add to log</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons Row */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAIPhotoAdd(!showAIPhotoAdd)}
                  className={`flex-1 py-2 rounded-xl text-xs font-game border transition-all flex items-center justify-center gap-1.5 ${showAIPhotoAdd ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-900/60 text-slate-400 border-white/10 hover:text-white'}`}
                >
                  <Camera size={14} /> AI PHOTO
                </button>
                <button
                  onClick={() => setShowManualAdd(!showManualAdd)}
                  className={`flex-1 py-2 rounded-xl text-xs font-game border transition-all flex items-center justify-center gap-1.5 ${showManualAdd ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-900/60 text-slate-400 border-white/10 hover:text-white'}`}
                >
                  <Plus size={14} /> MANUAL
                </button>
                <button
                  onClick={() => setShowSavedFoods(!showSavedFoods)}
                  className={`flex-1 py-2 rounded-xl text-xs font-game border transition-all flex items-center justify-center gap-1.5 ${showSavedFoods ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900/60 text-slate-400 border-white/10 hover:text-white'}`}
                >
                  <Star size={14} /> SAVED ({nutritionData.savedFoods.length})
                </button>
                <button
                  onClick={() => setShowNutritionHistory(!showNutritionHistory)}
                  className={`flex-1 py-2 rounded-xl text-xs font-game border transition-all flex items-center justify-center gap-1.5 ${showNutritionHistory ? 'bg-purple-600 text-white border-purple-500' : 'bg-slate-900/60 text-slate-400 border-white/10 hover:text-white'}`}
                >
                  <BarChart3 size={14} /> HISTORY
                </button>
              </div>
            </div>

            {/* AI Photo Add Form */}
            {showAIPhotoAdd && (
              <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-game text-sm text-emerald-400 flex items-center gap-2"><Camera size={16} /> AI PHOTO ANALYSIS</h3>
                  <button onClick={() => setShowAIPhotoAdd(false)} className="text-slate-500 hover:text-white"><X size={16} /></button>
                </div>
                
                <div 
                  onClick={() => aiPhotoInputRef.current?.click()}
                  className="w-full h-40 bg-slate-950 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/50 transition-all overflow-hidden relative"
                >
                  {aiPhotoData.image ? (
                    <>
                      <img src={aiPhotoData.image} alt="Food" className="w-full h-full object-cover opacity-60" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                        <RefreshCw size={24} className="text-white mb-1" />
                        <span className="text-xs text-white font-bold">CHANGE PHOTO</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Camera size={32} className="text-slate-600 mb-2" />
                      <span className="text-xs text-slate-500 font-bold">TAKE PICTURE OR UPLOAD</span>
                    </>
                  )}
                  <input 
                    type="file" 
                    ref={aiPhotoInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase font-bold block">Food Name (Optional)</label>
                  <input
                    type="text"
                    value={aiPhotoData.name}
                    onChange={(e) => setAIPhotoData({ ...aiPhotoData, name: e.target.value })}
                    placeholder="e.g. Beef Noodle Soup"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase font-bold block">Source</label>
                  <div className="flex gap-2">
                    {(['homemade', 'restaurant'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setAIPhotoData({ ...aiPhotoData, source: s })}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                          aiPhotoData.source === s 
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                            : 'bg-slate-950 border-white/10 text-slate-500'
                        }`}
                      >
                        {s.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleAIPhotoAnalysis} 
                  disabled={isAIAnalyzing || !aiPhotoData.image} 
                  className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-500 disabled:opacity-50 text-sm shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                >
                  {isAIAnalyzing ? (
                    <><Loader2 size={16} className="animate-spin" /> ANALYZING...</>
                  ) : (
                    <><Sparkles size={16} /> CALCULATE NUTRITION</>
                  )}
                </button>
              </div>
            )}

            {/* Manual Add Form */}
            {showManualAdd && (
              <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl p-4 space-y-3">
                <h3 className="font-game text-sm text-emerald-400">MANUAL ENTRY</h3>
                <input
                  type="text"
                  value={manualFood.name}
                  onChange={(e) => setManualFood({ ...manualFood, name: e.target.value })}
                  placeholder="Food name *"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={manualFood.calories} onChange={(e) => setManualFood({ ...manualFood, calories: e.target.value })} placeholder="Calories *" className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500" />
                  <input type="number" value={manualFood.protein} onChange={(e) => setManualFood({ ...manualFood, protein: e.target.value })} placeholder="Protein (g)" className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500" />
                  <input type="number" value={manualFood.carbs} onChange={(e) => setManualFood({ ...manualFood, carbs: e.target.value })} placeholder="Carbs (g)" className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500" />
                  <input type="number" value={manualFood.fat} onChange={(e) => setManualFood({ ...manualFood, fat: e.target.value })} placeholder="Fat (g)" className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500" />
                </div>
                <input type="text" value={manualFood.servingSize} onChange={(e) => setManualFood({ ...manualFood, servingSize: e.target.value })} placeholder="Serving size (e.g. 100g)" className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500" />
                <button onClick={handleManualAdd} disabled={!manualFood.name || !manualFood.calories} className="w-full bg-emerald-600 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-500 disabled:opacity-50 text-sm">
                  <Plus size={16} /> ADD FOOD
                </button>
              </div>
            )}

            {/* Saved Foods List */}
            {showSavedFoods && (
              <div className="bg-slate-900/60 border border-amber-500/20 rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5">
                  <h3 className="font-game text-sm text-amber-400">SAVED FOODS</h3>
                </div>
                {nutritionData.savedFoods.length > 0 ? (
                  [...nutritionData.savedFoods].sort((a, b) => b.timesUsed - a.timesUsed).map(food => (
                    <div key={food.id} className="px-3 py-2.5 flex items-center gap-3 border-b border-white/5 last:border-0">
                      <button onClick={() => addFromSaved(food)} className="flex-1 text-left hover:bg-slate-800/40 -mx-1 px-1 rounded transition-all">
                        <div className="text-sm text-white font-bold">{food.name}</div>
                        <div className="text-xs text-slate-400">{food.servingSize} | {food.calories} kcal | P:{food.protein}g C:{food.carbs}g F:{food.fat}g | used {food.timesUsed}x</div>
                      </button>
                      <button onClick={() => deleteSavedFood(food.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-slate-400 text-sm">No saved foods yet. Foods you add will appear here.</div>
                )}
              </div>
            )}

            {/* Nutrition History */}
            {showNutritionHistory && (
              <div className="bg-slate-900/60 border border-purple-500/20 rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5">
                  <h3 className="font-game text-sm text-purple-400">DAILY HISTORY</h3>
                </div>
                {nutritionData.dailyLogs.length > 0 ? (
                  nutritionData.dailyLogs.slice(0, 14).map(log => (
                    <div key={log.date} className="px-4 py-3 border-b border-white/5 last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-white">{log.date === getTodayStr() ? 'TODAY' : log.date}</span>
                        {log.macroHit && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-game">HIT!</span>}
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="text-orange-400">{log.totalCalories} kcal</span>
                        <span className="text-red-400">P:{log.totalProtein}g</span>
                        <span className="text-blue-400">C:{log.totalCarbs}g</span>
                        <span className="text-yellow-400">F:{log.totalFat}g</span>
                        <span className="text-slate-500">{log.entries.length} items</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-slate-400 text-sm">No nutrition data logged yet</div>
                )}
              </div>
            )}

            {/* Today's Food Log */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-game text-xs text-slate-400">TODAY'S LOG ({todayLog.entries.length} items)</h3>
                <span className="text-xs text-orange-400 font-bold">{todayLog.totalCalories} kcal</span>
              </div>
              {todayLog.entries.length > 0 ? todayLog.entries.map(entry => (
                <div key={entry.id} className="bg-slate-900/60 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    entry.source === 'barcode' ? 'bg-cyan-500/20 text-cyan-400' :
                    entry.source === 'search' ? 'bg-blue-500/20 text-blue-400' :
                    entry.source === 'saved' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {entry.source === 'barcode' ? <ScanBarcode size={14} /> : entry.source === 'search' ? <Search size={14} /> : entry.source === 'saved' ? <Star size={14} /> : <Plus size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{entry.name}</div>
                    <div className="text-xs text-slate-400">
                      {entry.servingSize} x{entry.servings} | P:{Math.round(entry.protein * entry.servings)}g C:{Math.round(entry.carbs * entry.servings)}g F:{Math.round(entry.fat * entry.servings)}g
                    </div>
                  </div>
                  <span className="text-sm font-bold text-orange-400 shrink-0">{Math.round(entry.calories * entry.servings)}</span>
                  <button onClick={() => removeFoodEntry(entry.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No food logged today. Scan, search, or manually add food above.
                </div>
              )}
            </div>

            {/* Macro Target Settings Modal */}
            {showMacroSettings && (
              <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                <h3 className="font-game text-base text-amber-400">MACRO TARGETS (DAILY RANGE)</h3>
                <p className="text-xs text-slate-400">Set min-max ranges. Hit all 4 within range to earn +25% XP buff for 12 hours.</p>
                {([
                  { key: 'calories' as const, label: 'Calories (kcal)', color: 'ring-orange-500/50' },
                  { key: 'protein' as const, label: 'Protein (g)', color: 'ring-red-500/50' },
                  { key: 'carbs' as const, label: 'Carbs (g)', color: 'ring-blue-500/50' },
                  { key: 'fat' as const, label: 'Fat (g)', color: 'ring-yellow-500/50' },
                ]).map(({ key, label, color }) => (
                  <div key={key}>
                    <label className="text-xs text-slate-400 uppercase font-bold block mb-1">{label}</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        value={macroForm[key].min}
                        onChange={(e) => setMacroForm({ ...macroForm, [key]: { ...macroForm[key], min: parseInt(e.target.value) || 0 } })}
                        className={`flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ${color}`}
                        placeholder="Min"
                      />
                      <span className="text-slate-500 text-xs">to</span>
                      <input
                        type="number"
                        value={macroForm[key].max}
                        onChange={(e) => setMacroForm({ ...macroForm, [key]: { ...macroForm[key], max: parseInt(e.target.value) || 0 } })}
                        className={`flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ${color}`}
                        placeholder="Max"
                      />
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button onClick={() => setShowMacroSettings(false)} className="flex-1 bg-slate-800 text-slate-400 font-bold py-2.5 rounded-xl text-sm hover:bg-slate-700">CANCEL</button>
                  <button onClick={handleSaveMacros} className="flex-1 bg-amber-600 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-amber-500">SAVE TARGETS</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== BODY LOG TAB ===== */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            {/* Add New Log */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
              <h3 className="font-game text-base text-emerald-400">LOG TODAY'S DATA</h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold block mb-1">Weight (kg) *</label>
                  <input
                    type="number"
                    value={logWeight}
                    onChange={(e) => setLogWeight(e.target.value)}
                    placeholder="70"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold block mb-1">Body Fat (%)</label>
                  <input
                    type="number"
                    value={logBodyFat}
                    onChange={(e) => setLogBodyFat(e.target.value)}
                    placeholder="15"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold block mb-1">Muscle (kg)</label>
                  <input
                    type="number"
                    value={logMuscleMass}
                    onChange={(e) => setLogMuscleMass(e.target.value)}
                    placeholder="55"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-700"
                  />
                </div>
              </div>
              <input
                type="text"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-emerald-500/50 placeholder:text-slate-500"
              />
              <button
                onClick={handleAddLog}
                disabled={!logWeight}
                className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-500 transition-all disabled:opacity-50 text-sm"
              >
                <Plus size={16} /> LOG DATA
              </button>
            </div>

            {/* Body Data Mini Chart */}
            {bodyLogs.length >= 2 && (
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
                <h3 className="font-game text-base text-emerald-400 mb-3">WEIGHT TREND</h3>
                <div className="h-24 flex items-end gap-1">
                  {[...bodyLogs].reverse().slice(-14).map((log, i, arr) => {
                    const weights = arr.map(l => l.weight);
                    const min = Math.min(...weights) - 1;
                    const max = Math.max(...weights) + 1;
                    const range = max - min || 1;
                    const height = ((log.weight - min) / range) * 100;
                    return (
                      <div key={log.id} className="flex-1 flex flex-col items-center gap-1">
                        <div 
                          className="w-full bg-emerald-500/40 rounded-t-sm min-h-[2px] transition-all hover:bg-emerald-400/60"
                          style={{ height: `${Math.max(4, height)}%` }}
                          title={`${log.date}: ${log.weight}kg`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-400">
                    {[...bodyLogs].reverse().slice(-14)[0]?.date.slice(5)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {bodyLogs[0]?.date.slice(5)}
                  </span>
                </div>
              </div>
            )}

            {/* Analyze Button */}
            {bodyLogs.length >= 2 && (
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full bg-purple-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-purple-500 transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <><Loader2 size={18} className="animate-spin" /> AI ANALYZING...</>
                ) : (
                  <><TrendingUp size={18} /> ANALYZE PROGRESS & ADJUST PLAN</>
                )}
              </button>
            )}

            {/* Analysis Result */}
            {analysisResult && (
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 space-y-3">
                <h3 className="font-game text-base text-purple-400 flex items-center gap-2">
                  <Sparkles size={14} /> AI ANALYSIS
                </h3>
                <p className="text-sm text-purple-200 leading-relaxed">{analysisResult.analysis}</p>
                {analysisResult.suggestedChanges.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-xs text-purple-400 font-game">SUGGESTED CHANGES:</h4>
                    {analysisResult.suggestedChanges.map((change, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-purple-200">
                        <ChevronRight size={12} className="mt-0.5 text-purple-500 shrink-0" />
                        {change}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* History */}
            <div className="space-y-2">
              <h3 className="font-game text-sm text-slate-300 px-1">HISTORY</h3>
              {bodyLogs.length > 0 ? bodyLogs.map(log => (
                <div key={log.id} className="bg-slate-900/60 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center">
                    <Scale size={14} className="text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{log.weight} kg</span>
                      {log.bodyFat && <span className="text-xs text-yellow-400">{log.bodyFat}% BF</span>}
                      {log.muscleMass && <span className="text-xs text-blue-400">{log.muscleMass}kg muscle</span>}
                    </div>
                    <div className="text-xs text-slate-400">{log.date}{log.notes ? ` — ${log.notes}` : ''}</div>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No body data logged yet
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
