
import React from 'react';
import { UserStats, CharacterSkin } from '../types';
import { Sparkles, Heart, Briefcase, Brain, Users } from 'lucide-react';

interface AvatarSectionProps {
  stats: UserStats;
  isGenerating?: boolean;
  characterState?: 'normal' | 'buffed' | 'debuffed' | 'both';
}

const XPBar: React.FC<{ current: number; max: number; label: string; color: string; icon: React.ReactNode }> = ({ current, max, label, color, icon }) => {
  const pct = Math.min(100, Math.max(0, (current / max) * 100));
  const isFull = current >= max;

  return (
    <div className="flex items-center gap-3 w-full">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${isFull ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]' : 'bg-white/5 border-white/10'}`} style={{ color: isFull ? undefined : color }}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
          <span className="text-[10px] font-bold" style={{ color: isFull ? '#facc15' : color }}>{Math.floor(current)}/{max}</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
          <div 
            className={`h-full rounded-full transition-all duration-700 ease-out ${isFull ? 'animate-pulse' : ''}`}
            style={{ 
              width: `${pct}%`, 
              background: isFull ? 'linear-gradient(90deg, #facc15, #f59e0b)' : `linear-gradient(90deg, ${color}88, ${color})`,
              boxShadow: isFull ? '0 0 10px rgba(250, 204, 21, 0.5)' : `0 0 8px ${color}44`
            }}
          />
        </div>
      </div>
    </div>
  );
};

const getAvatarMedia = (stats: UserStats, characterState: string): { url: string | undefined; isVideo: boolean } => {
  const skins = stats.characterSkins || [];
  const equippedId = stats.equippedCharacterSkin;

  if (equippedId && skins.length > 0) {
    const skin = skins.find(s => s.id === equippedId);
    if (skin) {
      const videoMap: Record<string, keyof CharacterSkin> = {
        normal: 'normalVideo',
        buffed: 'buffVideo',
        debuffed: 'debuffVideo',
        both: 'bothVideo',
      };
      const imageMap: Record<string, keyof CharacterSkin> = {
        normal: 'normal',
        buffed: 'buff',
        debuffed: 'debuff',
        both: 'both',
      };

      if (skin.animated) {
        const videoKey = videoMap[characterState] || 'normalVideo';
        const videoUrl = skin[videoKey] as string | undefined;
        if (videoUrl) return { url: videoUrl, isVideo: true };
      }

      const imageKey = imageMap[characterState] || 'normal';
      return { url: skin[imageKey] as string, isVideo: false };
    }
  }

  return { url: stats.currentLevelAvatar || stats.avatarUrl, isVideo: false };
};

export const AvatarSection: React.FC<AvatarSectionProps> = ({ stats, isGenerating, characterState = 'normal' }) => {
  const allMaxed = stats.healthXP >= stats.xpToNextLevel && 
                   stats.careerXP >= stats.xpToNextLevel && 
                   stats.knowledgeXP >= stats.xpToNextLevel &&
                   (stats.familySocialXP ?? 0) >= stats.xpToNextLevel;

  const { url: avatarUrl, isVideo } = getAvatarMedia(stats, characterState);

  return (
    <div className="relative flex flex-col items-center pt-4 pb-8 w-full overflow-hidden">
      {/* Avatar */}
      <div className="relative mb-6">
        <div className={`w-60 h-60 rounded-full border-4 ${allMaxed ? 'border-yellow-400 shadow-[0_0_50px_rgba(250,204,21,0.4)]' : 'border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.3)]'} overflow-hidden flex items-center justify-center relative bg-slate-900 ${isGenerating ? 'animate-pulse' : ''}`}>
            {avatarUrl ? (
              isVideo ? (
                <video
                  src={avatarUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className={`w-[105%] h-[105%] object-contain transition-opacity duration-500 ${isGenerating ? 'opacity-50' : 'opacity-100'}`}
                />
              ) : (
                <img 
                  src={avatarUrl} 
                  alt={`Level ${stats.level} Avatar`} 
                  className={`w-[105%] h-[105%] object-contain transition-opacity duration-500 ${isGenerating ? 'opacity-50' : 'opacity-100'}`}
                />
              )
            ) : (
              <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-600">
                <Sparkles size={48} className="animate-pulse" />
              </div>
            )}
            {isGenerating && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20">
                <Sparkles className="text-white animate-spin" size={32} />
              </div>
            )}
        </div>
        {allMaxed && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 font-game text-[10px] px-3 py-0.5 rounded-full shadow-[0_0_15px_rgba(250,204,21,0.5)] animate-pulse">
            READY TO LEVEL UP!
          </div>
        )}
      </div>

      {/* XP Bars */}
      <div className="w-full px-8 space-y-3">
        <XPBar 
          current={stats.healthXP} 
          max={stats.xpToNextLevel} 
          label="Health" 
          color="#3B82F6" 
          icon={<Heart size={16} />} 
        />
        <XPBar 
          current={stats.careerXP} 
          max={stats.xpToNextLevel} 
          label="Career" 
          color="#FACC15" 
          icon={<Briefcase size={16} />} 
        />
        <XPBar 
          current={stats.knowledgeXP} 
          max={stats.xpToNextLevel} 
          label="Knowledge" 
          color="#8B5CF6" 
          icon={<Brain size={16} />} 
        />
        <XPBar 
          current={stats.familySocialXP ?? 0} 
          max={stats.xpToNextLevel} 
          label="Family & Social" 
          color="#10B981" 
          icon={<Users size={16} />} 
        />
      </div>

      {/* Debuff indicator */}
      {stats.dailyDebuff?.active && (
        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 mx-8 flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[11px] text-red-400 font-bold">DEBUFF ACTIVE: {Math.round((1 - stats.dailyDebuff.multiplier) * 100)}% XP reduction until midnight</span>
        </div>
      )}

      {stats.emergencyDebuffs && stats.emergencyDebuffs.filter(d => d.active).length > 0 && (
        <div className="mt-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-2 mx-8 flex items-center gap-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          <span className="text-[11px] text-orange-400 font-bold">
            {stats.emergencyDebuffs.filter(d => d.active).length} EMERGENCY DEBUFF(S) ACTIVE
          </span>
        </div>
      )}
    </div>
  );
};
