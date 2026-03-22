
import React, { useState, useEffect, useRef } from 'react';
import { StoryState, StoryChapter, Category } from '../types';
import { geminiService } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { auth } from '../firebase';
import {
  X, BookOpen, Sparkles, Loader2, ChevronRight, ChevronDown, ChevronUp,
  Scroll, Swords, Shield, Brain, Users, Check, Clock, MapPin, RefreshCw
} from 'lucide-react';

interface StoryPanelProps {
  storyState: StoryState;
  playerLevel: number;
  onStoryUpdate: (storyState: StoryState) => void;
  onMissionComplete: (chapter: StoryChapter, updatedStoryState: StoryState) => void;
  onClose: () => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  [Category.HEALTH]: <Swords size={14} />,
  [Category.CAREER]: <Shield size={14} />,
  [Category.KNOWLEDGE]: <Brain size={14} />,
  [Category.FAMILY_SOCIAL]: <Users size={14} />,
};

const categoryColors: Record<string, string> = {
  [Category.HEALTH]: 'text-red-400',
  [Category.CAREER]: 'text-blue-400',
  [Category.KNOWLEDGE]: 'text-purple-400',
  [Category.FAMILY_SOCIAL]: 'text-amber-400',
};

const categoryBg: Record<string, string> = {
  [Category.HEALTH]: 'bg-red-500/10 border-red-500/20',
  [Category.CAREER]: 'bg-blue-500/10 border-blue-500/20',
  [Category.KNOWLEDGE]: 'bg-purple-500/10 border-purple-500/20',
  [Category.FAMILY_SOCIAL]: 'bg-amber-500/10 border-amber-500/20',
};

export const StoryPanel: React.FC<StoryPanelProps> = ({
  storyState,
  playerLevel,
  onStoryUpdate,
  onMissionComplete,
  onClose,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [activeView, setActiveView] = useState<'current' | 'chronicle' | 'mission'>('current');
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isSubmittingChoice, setIsSubmittingChoice] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 400);
  };

  // Initialize story if not yet started
  const handleInitStory = async () => {
    setIsInitializing(true);
    try {
      const result = await geminiService.initializeStory(playerLevel);
      if (result) {
        // Generate image for the first chapter
        const base64Image = await geminiService.generateStoryImage(result.firstNarrative, result.genre);
        let imageUrl = null;

        if (base64Image && auth.currentUser) {
          const storagePath = `stories/${auth.currentUser.uid}/chapter_init_${Date.now()}.png`;
          imageUrl = await storageService.uploadBase64Image(base64Image, storagePath);
        }

        const firstChapter: StoryChapter = {
          id: `ch-${Date.now()}`,
          milestone: 0,
          category: Category.KNOWLEDGE,
          narrative: result.firstNarrative,
          missionDescription: '',
          imageUrl: imageUrl,
          completed: true,
          createdAt: Date.now(),
        };

        const newState: StoryState = {
          initialized: true,
          genre: result.genre,
          storyBible: result.storyBible,
          storySummary: '',
          chapters: [firstChapter],
          currentArc: playerLevel,
          choicesMade: [],
          pendingMission: null,
          lastMilestones: {
            [Category.HEALTH]: 0,
            [Category.CAREER]: 0,
            [Category.KNOWLEDGE]: 0,
            [Category.FAMILY_SOCIAL]: 0,
          },
        };
        onStoryUpdate(newState);
      }
    } catch (err) {
      console.error("Story init failed:", err);
    } finally {
      setIsInitializing(false);
    }
  };

  // Handle making a story choice
  const handleMakeChoice = async (choice: string) => {
    if (!storyState.pendingMission || isSubmittingChoice) return;
    setSelectedChoice(choice);
    setIsSubmittingChoice(true);

    const chapter = storyState.pendingMission;
    const updatedChapter: StoryChapter = {
      ...chapter,
      choiceMade: choice,
    };

    const newChoicesMade = [...storyState.choicesMade, {
      chapterId: chapter.id,
      choiceText: choice,
      summary: `Made choice "${choice}" in event starting with "${chapter.narrative.substring(0, 30)}..."`,
      timestamp: Date.now(),
    }];

    const newChapters = storyState.chapters.map(c => c.id === chapter.id ? updatedChapter : c);

    // Summarize if chapters are getting long (every 10 chapters)
    let newSummary = storyState.storySummary;
    if (newChapters.length % 10 === 0) {
      newSummary = await geminiService.summarizeStoryProgress({
        ...storyState,
        chapters: newChapters,
        choicesMade: newChoicesMade,
      });
    }

    const newState: StoryState = {
      ...storyState,
      chapters: newChapters,
      choicesMade: newChoicesMade,
      pendingMission: updatedChapter,
      storySummary: newSummary,
    };
    onStoryUpdate(newState);
    setIsSubmittingChoice(false);
  };

  // Handle completing mission
  const handleCompleteMission = () => {
    if (!storyState.pendingMission) return;
    const chapter = { ...storyState.pendingMission, completed: true, completedAt: Date.now() };
    const newChapters = storyState.chapters.map(c => c.id === chapter.id ? chapter : c);
    
    const newState: StoryState = {
      ...storyState,
      chapters: newChapters,
      pendingMission: null,
    };
    
    // Call onMissionComplete which now handles both story state and XP updates
    onMissionComplete(chapter, newState);
    
    // Auto-close panel after a short delay to show the "NO ACTIVE MISSION" state briefly
    setTimeout(() => {
      handleClose();
    }, 800);
  };

  const pending = storyState.pendingMission;
  const completedChapters = storyState.chapters.filter(c => c.completed && c.id !== pending?.id);
  const genreEmoji = storyState.genre?.toLowerCase().includes('fantasy') ? '🐉' :
                     storyState.genre?.toLowerCase().includes('cyberpunk') ? '🤖' :
                     storyState.genre?.toLowerCase().includes('space') ? '🚀' :
                     storyState.genre?.toLowerCase().includes('myth') ? '⚡' :
                     storyState.genre?.toLowerCase().includes('supernatural') ? '👁️' : '📖';

  return (
    <div className={`fixed inset-0 bg-black/90 backdrop-blur-md z-[600] flex flex-col ${isClosing ? 'tv-screen-off' : 'tv-screen-on'}`} style={{ filter: 'brightness(1.15)', paddingTop: 'max(env(safe-area-inset-top), 48px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BookOpen size={22} className="text-violet-400" />
          <h2 className="font-game text-xl text-white">STORY QUEST</h2>
          {storyState.initialized && (
            <span className="text-xs bg-violet-500/20 border border-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full ml-2">
              {genreEmoji} {storyState.genre}
            </span>
          )}
        </div>
        <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Not initialized - show intro */}
      {!storyState.initialized ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="relative mb-8">
            <div className="absolute -inset-8 bg-violet-500/10 rounded-full blur-2xl animate-pulse" />
            <BookOpen size={64} className="text-violet-400/60 relative" />
          </div>
          <h3 className="font-game text-2xl text-white mb-3">BEGIN YOUR STORY</h3>
          <p className="text-slate-400 text-sm mb-2 max-w-xs leading-relaxed">
            AI will create a unique epic narrative that spans your 10-year self-improvement journey.
          </p>
          <p className="text-slate-500 text-xs mb-8 max-w-xs">
            New story events trigger as you reach XP milestones. Your choices shape the world—just like a real D&D adventure.
          </p>
          <button
            onClick={handleInitStory}
            disabled={isInitializing}
            className="bg-violet-600 text-white font-bold py-4 px-8 rounded-2xl flex items-center gap-2 hover:bg-violet-500 transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)] disabled:opacity-50"
          >
            {isInitializing ? (
              <><Loader2 size={20} className="animate-spin" /> CREATING YOUR DESTINY...</>
            ) : (
              <><Sparkles size={20} /> START THE STORY</>
            )}
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            {([
              { key: 'current' as const, label: 'CURRENT', icon: <Scroll size={14} /> },
              { key: 'mission' as const, label: 'MISSION', icon: <MapPin size={14} />, badge: pending && !pending.completed ? 1 : 0 },
              { key: 'chronicle' as const, label: 'CHRONICLE', icon: <BookOpen size={14} />, badge: completedChapters.length },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                className={`flex-1 py-3 flex items-center justify-center gap-1.5 text-xs font-game tracking-wider transition-all ${
                  activeView === tab.key 
                    ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-500/5' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.badge ? (
                  <span className="bg-violet-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">{tab.badge}</span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
            
            {/* CURRENT TAB - Latest story + pending mission */}
            {activeView === 'current' && (
              <div className="space-y-4">
                {/* Story Progress */}
                <div className="bg-slate-900/60 border border-violet-500/20 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-game text-sm text-violet-400">STORY PROGRESS</h3>
                    <span className="text-xs text-slate-400">Chapter {storyState.currentArc}/10</span>
                  </div>
                  <div className="flex gap-1 mb-3">
                    {Array.from({ length: 10 }, (_, i) => (
                      <div 
                        key={i} 
                        className={`flex-1 h-2 rounded-full transition-all ${
                          i < storyState.currentArc ? 'bg-violet-500' : 
                          i === storyState.currentArc ? 'bg-violet-500/50 animate-pulse' : 
                          'bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{storyState.chapters.length} Events Occurred</span>
                    <span className="text-slate-500">{storyState.choicesMade.length} Choices Made</span>
                  </div>
                </div>

                {/* Latest Story Event */}
                {storyState.chapters.length > 0 && (
                  <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
                    <h3 className="font-game text-sm text-violet-400 mb-3 flex items-center gap-2">
                      <Scroll size={14} /> LATEST EVENT
                    </h3>
                    {(() => {
                      const latest = pending || storyState.chapters[storyState.chapters.length - 1];
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`${categoryColors[latest.category] || 'text-slate-400'}`}>
                              {categoryIcons[latest.category] || <Scroll size={14} />}
                            </span>
                            <span className="text-xs text-slate-500">
                              {latest.category} · {latest.milestone}XP milestone
                            </span>
                          </div>

                          {latest.imageUrl && (
                            <div className="w-full aspect-video rounded-xl overflow-hidden border border-violet-500/20 shadow-lg shadow-violet-500/10 mb-4">
                              <img src={latest.imageUrl} alt="Story Event" className="w-full h-full object-cover" />
                            </div>
                          )}

                          <div className="bg-slate-950/60 rounded-xl p-4 border border-violet-500/10">
                            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                              {latest.narrative}
                            </p>
                          </div>

                          {/* Choice Options */}
                          {latest.choiceOptions && latest.choiceOptions.length > 0 && !latest.choiceMade && (
                            <div className="space-y-2">
                              <h4 className="text-xs text-amber-400 font-game flex items-center gap-1">
                                <ChevronRight size={12} /> YOUR CHOICE
                              </h4>
                              {latest.choiceOptions.map((option, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleMakeChoice(option)}
                                  disabled={isSubmittingChoice}
                                  className={`w-full text-left p-3 rounded-xl border transition-all text-sm ${
                                    selectedChoice === option
                                      ? 'bg-violet-500/20 border-violet-500 text-violet-200'
                                      : 'bg-slate-950 border-white/10 text-slate-300 hover:border-violet-500/50 hover:bg-violet-500/5'
                                  } disabled:opacity-50`}
                                >
                                  <span className="text-violet-400 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                                  {option}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Choice already made */}
                          {latest.choiceMade && (
                            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3">
                              <span className="text-xs text-violet-400 font-game">YOUR CHOICE:</span>
                              <p className="text-sm text-violet-200 mt-1">{latest.choiceMade}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* No events yet hint */}
                {storyState.chapters.length <= 1 && !pending && (
                  <div className="bg-slate-900/40 border border-dashed border-violet-500/20 rounded-2xl p-6 text-center">
                    <Sparkles size={24} className="mx-auto text-violet-400/40 mb-2" />
                    <p className="text-sm text-slate-400">Story started! New events will trigger as you reach 250 XP milestones.</p>
                    <p className="text-xs text-slate-500 mt-2">Keep completing quests to progress the story!</p>
                  </div>
                )}
              </div>
            )}

            {/* MISSION TAB - Active story mission */}
            {activeView === 'mission' && (
              <div className="space-y-4">
                {pending && !pending.completed ? (
                  <>
                    {/* Mission Card */}
                    <div className="bg-gradient-to-b from-violet-900/40 to-slate-900/60 border border-violet-500/30 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-game text-base text-violet-300 flex items-center gap-2">
                          <MapPin size={16} className="text-violet-400" /> ACTIVE MISSION
                        </h3>
                        <span className={`text-xs px-2 py-1 rounded-full border ${categoryBg[pending.category] || 'bg-slate-800 border-white/10'} ${categoryColors[pending.category] || 'text-slate-400'}`}>
                          {pending.category}
                        </span>
                      </div>

                      {/* Story Context */}
                      <div className="bg-black/30 rounded-xl p-3 border border-violet-500/10">
                        <p className="text-xs text-slate-400 mb-1 font-game">STORY CONTEXT</p>
                        <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">{pending.narrative}</p>
                      </div>

                      {/* Mission Description */}
                      <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                        <p className="text-xs text-violet-400 mb-2 font-game flex items-center gap-1">
                          <Swords size={12} /> QUEST OBJECTIVE
                        </p>
                        <p className="text-base text-white font-bold leading-relaxed">{pending.missionDescription}</p>
                      </div>

                      {/* Choice made indicator */}
                      {pending.choiceMade && (
                        <div className="flex items-center gap-2 text-xs text-violet-300 bg-violet-500/5 rounded-lg px-3 py-2">
                          <Check size={14} className="text-violet-400" />
                          <span>Choice: {pending.choiceMade}</span>
                        </div>
                      )}

                      {/* Time since assigned */}
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock size={12} />
                        <span>
                          Assigned on {new Date(pending.createdAt).toLocaleDateString()}
                          {' '}({Math.floor((Date.now() - pending.createdAt) / (1000 * 60 * 60 * 24))} days ago)
                        </span>
                      </div>

                      {/* Complete Button */}
                      <button
                        onClick={handleCompleteMission}
                        disabled={!pending.choiceMade}
                        className="w-full bg-violet-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-violet-500 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] disabled:opacity-50 text-sm"
                      >
                        <Check size={18} /> COMPLETE MISSION
                      </button>
                      {!pending.choiceMade && (
                        <p className="text-xs text-center text-slate-500">Make a story choice in the CURRENT tab first to complete the mission.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-16 text-slate-500 space-y-4">
                    <MapPin size={48} className="mx-auto opacity-30" />
                    <p className="font-game text-xl">NO ACTIVE MISSION</p>
                    <p className="text-sm">New missions appear when story events trigger.<br/>Reach the next 250 XP milestone to continue!</p>
                  </div>
                )}
              </div>
            )}

            {/* CHRONICLE TAB - All past chapters */}
            {activeView === 'chronicle' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-game text-sm text-slate-300">STORY CHRONICLE</h3>
                  <span className="text-xs text-slate-500">{completedChapters.length} Chapters</span>
                </div>

                {/* Story Collage */}
                {storyState.chapters.some(c => c.imageUrl) && (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {storyState.chapters.filter(c => c.imageUrl).slice(-4).map((chapter, i) => (
                      <div key={chapter.id} className={`relative aspect-square rounded-xl overflow-hidden border border-white/10 group ${i === 0 ? 'col-span-2 aspect-video' : ''}`}>
                        <img src={chapter.imageUrl} alt="Story Moment" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                          <span className="text-[10px] text-white font-bold truncate">{chapter.narrative.substring(0, 30)}...</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Opening */}
                {storyState.chapters.length > 0 && (
                  <div className="bg-violet-500/5 border border-violet-500/10 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-violet-400" />
                      <span className="text-xs text-violet-400 font-game">OPENING</span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{storyState.chapters[0].narrative}</p>
                  </div>
                )}

                {/* Chapters */}
                {[...completedChapters].reverse().filter((_, i) => i > 0 || completedChapters.length === storyState.chapters.length).map(chapter => {
                  const isExpanded = expandedChapter === chapter.id;
                  return (
                    <div key={chapter.id} className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setExpandedChapter(isExpanded ? null : chapter.id)}
                        className="w-full p-3 flex items-center gap-3 hover:bg-slate-800/40 transition-all"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${categoryBg[chapter.category] || 'bg-slate-800 border-white/10'} shrink-0`}>
                          {categoryIcons[chapter.category] || <Scroll size={14} />}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm text-white font-bold truncate">
                            {chapter.narrative.substring(0, 40)}...
                          </div>
                          <div className="text-xs text-slate-500">
                            {chapter.category} · {chapter.milestone}XP · {new Date(chapter.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        {chapter.completed && <Check size={14} className="text-emerald-400 shrink-0" />}
                        {isExpanded ? <ChevronUp size={14} className="text-slate-500 shrink-0" /> : <ChevronDown size={14} className="text-slate-500 shrink-0" />}
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                          {chapter.imageUrl && (
                            <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/10 mb-3">
                              <img src={chapter.imageUrl} alt="Chapter" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{chapter.narrative}</p>
                          
                          {chapter.missionDescription && (
                            <div className="bg-violet-500/5 rounded-lg p-3 border border-violet-500/10">
                              <span className="text-xs text-violet-400 font-game">MISSION:</span>
                              <p className="text-sm text-slate-300 mt-1">{chapter.missionDescription}</p>
                            </div>
                          )}
                          
                          {chapter.choiceMade && (
                            <div className="bg-amber-500/5 rounded-lg p-3 border border-amber-500/10">
                              <span className="text-xs text-amber-400 font-game">CHOICE MADE:</span>
                              <p className="text-sm text-amber-200 mt-1">{chapter.choiceMade}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {completedChapters.length === 0 && storyState.chapters.length <= 1 && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    The story has just begun. Completed chapters will appear here.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
