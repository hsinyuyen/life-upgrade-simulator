
import React, { useState, useRef, useEffect } from 'react';
import { X, ShoppingBag, Check, Coins, Sparkles, Upload, Loader2, Crown, Palette, Music, User, Dices, Star, Film, Play } from 'lucide-react';
import { UserStats, CharacterSkin } from '../types';

type ShopTab = 'decoration' | 'character' | 'music';

interface SkinShopProps {
  stats: UserStats;
  onClose: () => void;
  onUploadPhoto: (base64: string) => void;
  onRegenerateBase: () => void;
  onDrawSkin: () => void;
  onEquipCharacterSkin: (skinId: string | null) => void;
  onAnimateSkin: (skinId: string) => void;
  isGenerating: boolean;
  generatingProgress?: string;
  isAnimating: boolean;
  animatingProgress?: string;
  newlyDrawnSkin?: CharacterSkin | null;
  onClearNewSkin?: () => void;
  newlyAnimatedSkin?: CharacterSkin | null;
  onClearAnimatedSkin?: () => void;
}

const MediaPreview: React.FC<{ skin: CharacterSkin; state: 'normal' | 'buff' | 'debuff' | 'both'; className?: string }> = ({ skin, state, className = '' }) => {
  const videoKey = `${state}Video` as keyof CharacterSkin;
  const videoUrl = skin.animated ? (skin[videoKey] as string | undefined) : undefined;
  const imageUrl = skin[state] as string;

  if (videoUrl) {
    return <video src={videoUrl} autoPlay loop muted playsInline className={className} />;
  }
  return <img src={imageUrl} alt={state} className={className} loading="lazy" />;
};

export const SkinShop: React.FC<SkinShopProps> = ({
  stats, onClose, onUploadPhoto, onRegenerateBase, onDrawSkin,
  onEquipCharacterSkin, onAnimateSkin,
  isGenerating, generatingProgress,
  isAnimating, animatingProgress,
  newlyDrawnSkin, onClearNewSkin,
  newlyAnimatedSkin, onClearAnimatedSkin
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<ShopTab>('character');
  const [previewSkin, setPreviewSkin] = useState<CharacterSkin | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const logPoints = stats.logPoints || 0;
  const characterSkins = stats.characterSkins || [];
  const equippedSkinId = stats.equippedCharacterSkin;
  const hasBaseCharacter = stats.baseCharacterGenerated === true;
  const isBusy = isGenerating || isAnimating;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 400);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (base64) onUploadPhoto(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const tabs: { id: ShopTab; label: string; icon: React.ReactNode }[] = [
    { id: 'decoration', label: 'DECOR', icon: <Crown size={16} /> },
    { id: 'character', label: 'SKIN', icon: <Palette size={16} /> },
    { id: 'music', label: 'MUSIC', icon: <Music size={16} /> },
  ];

  return (
    <div className={`fixed inset-0 bg-black/90 backdrop-blur-md z-[600] flex flex-col ${isClosing ? 'tv-screen-off' : 'tv-screen-on'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400">
            <ShoppingBag size={24} />
          </div>
          <div>
            <h2 className="font-game text-xl text-white">SKIN SHOP</h2>
            <div className="flex items-center gap-1 text-amber-400 font-bold text-sm">
              <Coins size={14} />
              <span>{logPoints} LOG POINTS</span>
            </div>
          </div>
        </div>
        <button onClick={handleClose} className="p-2 text-slate-500 hover:text-white transition-colors">
          <X size={28} />
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-white/10">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 font-game text-xs transition-all ${
              activeTab === tab.id
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'character' && (
          <CharacterSkinTab
            stats={stats}
            logPoints={logPoints}
            characterSkins={characterSkins}
            equippedSkinId={equippedSkinId}
            hasBaseCharacter={hasBaseCharacter}
            isBusy={isBusy}
            isGenerating={isGenerating}
            generatingProgress={generatingProgress}
            isAnimating={isAnimating}
            animatingProgress={animatingProgress}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            onRegenerateBase={onRegenerateBase}
            onDrawSkin={onDrawSkin}
            onAnimateSkin={onAnimateSkin}
            onEquip={onEquipCharacterSkin}
            onPreview={setPreviewSkin}
          />
        )}
        {activeTab === 'decoration' && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 py-20">
            <Crown size={48} className="opacity-30" />
            <p className="font-game text-sm">COMING SOON</p>
            <p className="text-xs text-slate-600">頭像裝飾即將推出</p>
          </div>
        )}
        {activeTab === 'music' && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 py-20">
            <Music size={48} className="opacity-30" />
            <p className="font-game text-sm">COMING SOON</p>
            <p className="text-xs text-slate-600">背景音樂即將推出</p>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* Skin Preview Modal */}
      {previewSkin && !newlyDrawnSkin && !newlyAnimatedSkin && (
        <SkinPreviewModal
          skin={previewSkin}
          equippedSkinId={equippedSkinId}
          logPoints={logPoints}
          isBusy={isBusy}
          onEquip={onEquipCharacterSkin}
          onAnimate={onAnimateSkin}
          onClose={() => setPreviewSkin(null)}
        />
      )}

      {/* Gacha Reveal — new skin drawn */}
      {newlyDrawnSkin && (
        <GachaReveal
          skin={newlyDrawnSkin}
          titleText="NEW SKIN UNLOCKED"
          onDone={() => onClearNewSkin?.()}
          onEquip={onEquipCharacterSkin}
          isAlreadyEquipped={equippedSkinId === newlyDrawnSkin.id}
        />
      )}

      {/* Gacha Reveal — skin animated */}
      {newlyAnimatedSkin && (
        <GachaReveal
          skin={newlyAnimatedSkin}
          titleText="SKIN ANIMATED"
          useVideo
          onDone={() => onClearAnimatedSkin?.()}
          onEquip={onEquipCharacterSkin}
          isAlreadyEquipped={equippedSkinId === newlyAnimatedSkin.id}
        />
      )}
    </div>
  );
};

// ======== Skin Preview Modal ========

const SkinPreviewModal: React.FC<{
  skin: CharacterSkin;
  equippedSkinId?: string | null;
  logPoints: number;
  isBusy: boolean;
  onEquip: (id: string | null) => void;
  onAnimate: (id: string) => void;
  onClose: () => void;
}> = ({ skin, equippedSkinId, logPoints, isBusy, onEquip, onAnimate, onClose }) => {
  const canAnimate = !skin.animated && logPoints >= 10 && !isBusy;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[650] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-game text-lg text-white">{skin.name}</h3>
            {skin.animated && (
              <span className="bg-cyan-500/20 text-cyan-400 text-[8px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                <Play size={8} /> ANIMATED
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20} /></button>
        </div>
        <p className="text-xs text-amber-400 mb-4 font-bold uppercase">{skin.theme}</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {(['normal', 'buff', 'debuff', 'both'] as const).map(state => (
            <div key={state} className="flex flex-col items-center gap-1">
              <div className="w-full aspect-square rounded-2xl overflow-hidden border border-white/10 bg-slate-950">
                <MediaPreview skin={skin} state={state} className="w-full h-full object-cover" />
              </div>
              <span className="text-[9px] font-bold uppercase text-slate-400">{state === 'both' ? 'BUFF+DEBUFF' : state}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <button
            onClick={() => { onEquip(equippedSkinId === skin.id ? null : skin.id); onClose(); }}
            className={`w-full py-3 rounded-2xl font-game text-sm transition-all ${
              equippedSkinId === skin.id
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                : 'bg-amber-500 text-amber-950 hover:bg-amber-400'
            }`}
          >
            {equippedSkinId === skin.id ? 'UNEQUIP' : 'EQUIP'}
          </button>

          {!skin.animated && (
            <button
              onClick={() => { onAnimate(skin.id); onClose(); }}
              disabled={!canAnimate}
              className={`w-full py-3 rounded-2xl font-game text-sm flex items-center justify-center gap-2 transition-all ${
                canAnimate
                  ? 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Film size={16} />
              <Coins size={12} /> 10 PT — ANIMATE SKIN
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ======== Gacha Reveal Animation ========

const PARTICLES_COUNT = 24;

const THEME_COLORS: Record<string, string> = {
  'Cyberpunk Neon': '#00f0ff',
  'Dark Fantasy': '#8b5cf6',
  'Steampunk Victorian': '#d97706',
  'Anime Shonen': '#f43f5e',
  'Celestial Cosmic': '#a78bfa',
  'Samurai Warrior': '#dc2626',
  'Arctic Frost': '#67e8f9',
  'Volcanic Inferno': '#f97316',
  'Ocean Depths': '#0ea5e9',
  'Ancient Egyptian': '#eab308',
  'Pixel Retro': '#4ade80',
  'Jade Dragon': '#34d399',
  'Sakura Blossom': '#f9a8d4',
  'Gothic Knight': '#6b7280',
  'Solar Punk': '#84cc16',
};

const GachaReveal: React.FC<{
  skin: CharacterSkin;
  titleText: string;
  useVideo?: boolean;
  onDone: () => void;
  onEquip: (id: string | null) => void;
  isAlreadyEquipped: boolean;
}> = ({ skin, titleText, useVideo, onDone, onEquip, isAlreadyEquipped }) => {
  const [phase, setPhase] = useState<'beam' | 'flash' | 'card' | 'states' | 'done'>('beam');
  const [particles] = useState(() =>
    Array.from({ length: PARTICLES_COUNT }, (_, i) => ({
      id: i,
      angle: (360 / PARTICLES_COUNT) * i + Math.random() * 15,
      distance: 120 + Math.random() * 100,
      size: 3 + Math.random() * 5,
      delay: Math.random() * 0.4,
      hue: Math.random() * 60 + 30,
    }))
  );

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('flash'), 800),
      setTimeout(() => setPhase('card'), 1400),
      setTimeout(() => setPhase('states'), 3200),
      setTimeout(() => setPhase('done'), 4000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const accentColor = THEME_COLORS[skin.theme] || '#f59e0b';

  const renderMainMedia = () => {
    if (useVideo && skin.normalVideo) {
      return <video src={skin.normalVideo} autoPlay loop muted playsInline className="w-full h-full object-cover" />;
    }
    return <img src={skin.normal} alt="Normal" className="w-full h-full object-cover" />;
  };

  const renderStateMedia = (state: 'normal' | 'buff' | 'debuff' | 'both') => {
    if (useVideo) {
      const videoKey = `${state}Video` as keyof CharacterSkin;
      const videoUrl = skin[videoKey] as string | undefined;
      if (videoUrl) {
        return <video src={videoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />;
      }
    }
    return <img src={skin[state] as string} alt={state} className="w-full h-full object-cover" />;
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-black" />

      <div
        className="absolute inset-0 animate-gacha-bg-pulse"
        style={{ background: `radial-gradient(circle at 50% 50%, ${accentColor}22 0%, transparent 60%)` }}
      />

      {(phase === 'beam' || phase === 'flash') && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-1 animate-gacha-beam"
            style={{
              height: '100vh',
              background: `linear-gradient(0deg, transparent, ${accentColor}, white, ${accentColor}, transparent)`,
              boxShadow: `0 0 40px 10px ${accentColor}88, 0 0 80px 20px ${accentColor}44`,
            }}
          />
        </div>
      )}

      {phase === 'flash' && (
        <div
          className="absolute inset-0 animate-gacha-flash pointer-events-none"
          style={{ background: `radial-gradient(circle, white, ${accentColor}88, transparent)` }}
        />
      )}

      {(phase === 'card' || phase === 'states' || phase === 'done') && (
        <>
          {[0, 0.3, 0.6].map((delay, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 w-40 h-40 rounded-full border-2 pointer-events-none"
              style={{
                borderColor: `${accentColor}66`,
                animation: `gacha-ring-expand 1.5s ease-out ${delay}s forwards`,
                transform: 'translate(-50%, -50%) scale(0)',
              }}
            />
          ))}
        </>
      )}

      {(phase === 'card' || phase === 'states' || phase === 'done') && (
        <div className="absolute inset-0 pointer-events-none">
          {particles.map(p => (
            <div
              key={p.id}
              className="absolute top-1/2 left-1/2 rounded-full"
              style={{
                width: p.size,
                height: p.size,
                background: `hsl(${p.hue}, 100%, 70%)`,
                boxShadow: `0 0 ${p.size * 2}px hsl(${p.hue}, 100%, 60%)`,
                transform: `translate(-50%, -50%)`,
              }}
              ref={el => {
                if (el) {
                  const tx = Math.cos(p.angle * Math.PI / 180) * p.distance;
                  const ty = Math.sin(p.angle * Math.PI / 180) * p.distance;
                  el.animate([
                    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                    { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 },
                  ], { duration: 1500, delay: p.delay * 1000, easing: 'ease-out', fill: 'forwards' });
                }
              }}
            />
          ))}
        </div>
      )}

      {(phase === 'card' || phase === 'states' || phase === 'done') && (
        <div className="relative z-10 flex flex-col items-center gap-4 px-6 w-full max-w-sm">
          <div className="animate-gacha-theme text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Star size={14} style={{ color: accentColor }} />
              <span className="font-game text-[10px] uppercase tracking-[0.2em] text-slate-400">{titleText}</span>
              <Star size={14} style={{ color: accentColor }} />
            </div>
            <h2
              className="font-game text-2xl"
              style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}88, 0 0 40px ${accentColor}44` }}
            >
              {skin.theme}
            </h2>
          </div>

          <div className="animate-gacha-card" style={{ perspective: '800px' }}>
            <div
              className="w-56 h-56 rounded-3xl overflow-hidden border-2 relative"
              style={{
                borderColor: accentColor,
                boxShadow: `0 0 30px ${accentColor}44, 0 0 60px ${accentColor}22, inset 0 0 30px ${accentColor}11`,
              }}
            >
              {renderMainMedia()}
              <div className="absolute inset-0 animate-gacha-shimmer pointer-events-none" />
              {useVideo && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-cyan-400 text-[8px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                  <Play size={8} /> LIVE
                </div>
              )}
            </div>
          </div>

          <p className="font-game text-base text-white animate-gacha-theme" style={{ animationDelay: '0.3s', opacity: 0 }}>
            {skin.name}
          </p>

          {(phase === 'states' || phase === 'done') && (
            <div className="grid grid-cols-4 gap-2 w-full">
              {(['normal', 'buff', 'debuff', 'both'] as const).map((state, i) => (
                <div
                  key={state}
                  className="flex flex-col items-center gap-1 animate-gacha-states"
                  style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}
                >
                  <div className="w-full aspect-square rounded-xl overflow-hidden border" style={{ borderColor: `${accentColor}44` }}>
                    {renderStateMedia(state)}
                  </div>
                  <span className="text-[8px] font-bold uppercase" style={{ color: `${accentColor}99` }}>
                    {state === 'both' ? 'B+D' : state}
                  </span>
                </div>
              ))}
            </div>
          )}

          {phase === 'done' && (
            <div className="w-full space-y-2 animate-gacha-states" style={{ animationDelay: '0.3s', opacity: 0 }}>
              {!isAlreadyEquipped && (
                <button
                  onClick={() => { onEquip(skin.id); onDone(); }}
                  className="w-full py-3 rounded-2xl font-game text-sm transition-all"
                  style={{ background: accentColor, color: '#000', boxShadow: `0 0 20px ${accentColor}66` }}
                >
                  EQUIP NOW
                </button>
              )}
              <button
                onClick={onDone}
                className="w-full py-3 rounded-2xl font-game text-sm bg-white/10 text-white hover:bg-white/20 transition-all"
              >
                {isAlreadyEquipped ? 'CLOSE' : 'KEEP IN COLLECTION'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ======== Character Skin Tab ========

interface CharacterSkinTabProps {
  stats: UserStats;
  logPoints: number;
  characterSkins: CharacterSkin[];
  equippedSkinId: string | null | undefined;
  hasBaseCharacter: boolean;
  isBusy: boolean;
  isGenerating: boolean;
  generatingProgress?: string;
  isAnimating: boolean;
  animatingProgress?: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRegenerateBase: () => void;
  onDrawSkin: () => void;
  onAnimateSkin: (skinId: string) => void;
  onEquip: (skinId: string | null) => void;
  onPreview: (skin: CharacterSkin | null) => void;
}

const CharacterSkinTab: React.FC<CharacterSkinTabProps> = ({
  logPoints, characterSkins, equippedSkinId, hasBaseCharacter,
  isBusy, isGenerating, generatingProgress, isAnimating, animatingProgress,
  fileInputRef, onDrawSkin, onEquip, onPreview
}) => {
  const canDrawSkin = logPoints >= 5 && hasBaseCharacter && !isBusy;
  const canRegenerate = hasBaseCharacter && logPoints >= 5 && !isBusy;

  return (
    <div className="space-y-6">
      {/* Generation Progress */}
      {isGenerating && (
        <div className="bg-gradient-to-br from-blue-500/10 to-violet-500/10 border border-blue-500/30 rounded-2xl p-8 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-blue-500/30 border-t-blue-400 animate-spin" />
            <Sparkles size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-400" />
          </div>
          <p className="font-game text-sm text-blue-300">GENERATING...</p>
          {generatingProgress && <p className="text-xs text-blue-400/80 text-center">{generatingProgress}</p>}
          <div className="w-full bg-blue-950/50 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}

      {/* Animation Progress */}
      {isAnimating && (
        <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-8 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-cyan-500/30 border-t-cyan-400 animate-spin" />
            <Film size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400" />
          </div>
          <p className="font-game text-sm text-cyan-300">ANIMATING SKIN...</p>
          {animatingProgress && <p className="text-xs text-cyan-400/80 text-center">{animatingProgress}</p>}
          <p className="text-[10px] text-cyan-600 text-center">動畫生成需要較長時間，請耐心等待</p>
          <div className="w-full bg-cyan-950/50 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full animate-pulse" style={{ width: '45%' }} />
          </div>
        </div>
      )}

      {/* Upload Photo */}
      {!hasBaseCharacter && !isBusy && (
        <div className="bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-violet-500/30 rounded-3xl p-6 text-center space-y-4">
          <div className="w-20 h-20 mx-auto bg-violet-500/20 rounded-full flex items-center justify-center">
            <Upload size={32} className="text-violet-400" />
          </div>
          <h3 className="font-game text-lg text-white">CREATE YOUR CHARACTER</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            上傳一張你的照片，AI 將生成 4 張角色狀態圖<br />
            <span className="text-emerald-400 font-bold">首次免費！</span>
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 bg-violet-600 text-white font-game rounded-2xl hover:bg-violet-500 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] flex items-center justify-center gap-2"
          >
            <Upload size={18} /> UPLOAD PHOTO
          </button>
        </div>
      )}

      {/* Regenerate Base */}
      {hasBaseCharacter && !isBusy && (
        <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <User size={20} className="text-slate-400" />
            <div>
              <p className="text-sm text-white font-bold">重新上傳照片</p>
              <p className="text-[10px] text-slate-500">重新生成基礎角色 (5 點)</p>
            </div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!canRegenerate}
            className={`px-4 py-2 rounded-xl font-game text-[10px] flex items-center gap-1 transition-all ${
              canRegenerate ? 'bg-violet-600/80 text-white hover:bg-violet-500' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Coins size={10} /> 5 PT
          </button>
        </div>
      )}

      {/* Draw New Skin */}
      {hasBaseCharacter && !isBusy && (
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-3xl p-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-amber-500/20 rounded-full flex items-center justify-center">
            <Dices size={28} className="text-amber-400" />
          </div>
          <h3 className="font-game text-base text-white">DRAW NEW SKIN</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            花費 5 點抽取一個隨機主題角色 Skin<br />
            包含 4 張狀態圖，永久保存！
          </p>
          <button
            onClick={onDrawSkin}
            disabled={!canDrawSkin}
            className={`w-full py-4 rounded-2xl font-game text-sm flex items-center justify-center gap-2 transition-all ${
              canDrawSkin
                ? 'bg-amber-500 text-amber-950 hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Dices size={18} />
            <Coins size={14} /> 5 POINTS — DRAW SKIN
          </button>
        </div>
      )}

      {/* Skin Collection */}
      {characterSkins.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-game text-sm text-slate-400 flex items-center gap-2">
            <Palette size={14} />
            YOUR COLLECTION ({characterSkins.length})
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {characterSkins.map(skin => {
              const isEquipped = equippedSkinId === skin.id;
              return (
                <button
                  key={skin.id}
                  onClick={() => onPreview(skin)}
                  className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 relative overflow-hidden ${
                    isEquipped
                      ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                      : 'border-white/5 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-950 relative">
                    <MediaPreview skin={skin} state="normal" className="w-full h-full object-cover" />
                    {skin.animated && (
                      <div className="absolute bottom-1 right-1 bg-black/60 text-cyan-400 text-[7px] px-1 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                        <Play size={6} />
                      </div>
                    )}
                  </div>
                  <div className="text-center w-full">
                    <div className="font-game text-[10px] text-white truncate">{skin.name}</div>
                    <div className="text-[9px] text-amber-400/70 uppercase font-bold truncate">{skin.theme}</div>
                  </div>
                  {isEquipped && (
                    <span className="absolute top-2 right-2 bg-amber-500 text-amber-950 text-[8px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                      <Check size={8} /> ON
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 border-t border-white/5">
        <p className="text-[10px] text-slate-600 text-center leading-relaxed">
          每天記錄活動可獲得 1 Log Point。<br />
          使用 Log Points 抽取新角色外觀！
        </p>
      </div>
    </div>
  );
};
