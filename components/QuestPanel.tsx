
import React, { useState } from 'react';
import { QuestItem, Activity, Category, UserStats } from '../types';
import { 
  X, CheckCircle2, Zap, AlertTriangle, History, 
  Search, Plus, ChevronRight, Clock, Star,
  TrendingUp, BarChart3
} from 'lucide-react';

interface QuestPanelProps {
  questItems: QuestItem[];
  activities: Activity[];
  stats: UserStats;
  onQuestClick: (e: React.MouseEvent, quest: QuestItem) => void;
  onClose: () => void;
}

type Tab = 'quests' | 'history';

export const QuestPanel: React.FC<QuestPanelProps> = ({ 
  questItems, 
  activities, 
  stats, 
  onQuestClick, 
  onClose 
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('quests');
  const [searchQuery, setSearchQuery] = useState('');

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 400);
  };

  const getTodayStr = () => new Date().toISOString().split('T')[0];

  const getEffectivePoints = (quest: QuestItem): number => {
    const counts = stats.dailyActivityCounts || {};
    const timesPerformed = counts[quest.item] || 0;
    const decay = quest.decayPerRepeat || 0;
    const minPts = quest.minPoints ?? 0;
    
    const effectivePoints = Math.max(minPts, quest.base_points - (timesPerformed * decay));
    return effectivePoints;
  };

  const getDebuffMultiplier = (): number => {
    let debuffCount = 0;
    debuffCount += (stats.deductionsCountToday ?? 0);
    if (stats.dailyDebuff?.active && stats.dailyDebuff.reason !== 'deduction' && Date.now() < stats.dailyDebuff.expiresAt) {
      debuffCount++;
    }
    if (stats.emergencyDebuffs) {
      debuffCount += stats.emergencyDebuffs.filter(d => d.active).length;
    }
    const debuffMult = Math.max(0, 1 - 0.2 * debuffCount);
    let finalMultiplier = debuffMult;
    if (stats.nutritionBuff?.active && Date.now() < stats.nutritionBuff.expiresAt) {
      finalMultiplier *= stats.nutritionBuff.multiplier;
    }
    return finalMultiplier;
  };

  const filteredQuests = questItems.filter(q => 
    q.item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const positiveQuests = filteredQuests.filter(q => !q.isDeduction && !q.isEmergency);
  const deductionQuests = filteredQuests.filter(q => q.isDeduction);
  const emergencyQuests = filteredQuests.filter(q => q.isEmergency);

  const debuffMultiplier = getDebuffMultiplier();

  return (
    <div className={`fixed inset-0 bg-black/90 backdrop-blur-md z-[600] flex flex-col ${isClosing ? 'tv-screen-off' : 'tv-screen-on'}`} style={{ filter: 'brightness(1.15)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Star size={22} className="text-blue-400" />
          <h2 className="font-game text-xl text-white">QUEST LOG</h2>
        </div>
        <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab('quests')}
          className={`flex-1 py-3 flex items-center justify-center gap-1.5 text-xs font-game tracking-wider transition-all ${
            activeTab === 'quests'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap size={14} />
          QUESTS
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 flex items-center justify-center gap-1.5 text-xs font-game tracking-wider transition-all ${
            activeTab === 'history'
              ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History size={14} />
          HISTORY
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'quests' ? (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-400 transition-colors">
                <Search size={18} />
              </div>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="SEARCH QUESTS..."
                className="w-full bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl py-2.5 pl-11 pr-4 text-sm text-blue-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 ring-blue-500/50 transition-all font-game tracking-wider"
              />
            </div>

            {/* Emergency Missions */}
            {emergencyQuests.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-game text-xs text-orange-400 px-1 flex items-center gap-1"><Zap size={14} /> EMERGENCY MISSIONS</h3>
                {emergencyQuests.map((quest, idx) => {
                  const daysDelayed = quest.emergencyCreatedAt 
                    ? Math.floor((Date.now() - quest.emergencyCreatedAt) / (1000 * 60 * 60 * 24))
                    : 0;
                  return (
                    <button 
                      key={`em-${idx}`}
                      onClick={(e) => onQuestClick(e, quest)}
                      className="w-full bg-orange-500/10 backdrop-blur-md border border-orange-500/30 rounded-2xl p-4 flex items-center gap-4 shadow-[0_0_15px_rgba(249,115,22,0.1)] hover:bg-orange-500/20 transition-all group active:scale-95"
                    >
                      <div className="w-10 h-10 bg-orange-500/20 border border-orange-500/30 rounded-full flex items-center justify-center text-orange-400">
                        <Zap size={20} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-bold text-orange-100 text-sm">{quest.item}</div>
                        <div className="text-[10px] text-orange-400">
                          +100 ALL BARS {daysDelayed > 0 && `| ${daysDelayed}d delayed (-${daysDelayed * 10}% debuff)`}
                        </div>
                      </div>
                      <div className="text-orange-400 font-black text-sm">
                        <CheckCircle2 size={20} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Positive Quests */}
            {positiveQuests.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-game text-xs text-blue-400 px-1">DAILY QUESTS</h3>
                {positiveQuests.map((quest, idx) => {
                  const effectivePts = getEffectivePoints(quest);
                  const timesPerformed = (stats.dailyActivityCounts || {})[quest.item] || 0;
                  const finalPts = Math.round(effectivePts * debuffMultiplier);
                  return (
                    <button 
                      key={`pos-${idx}`}
                      onClick={(e) => onQuestClick(e, quest)}
                      className="w-full bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-slate-800/80 transition-all group active:scale-95"
                    >
                      <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center text-blue-400">
                        <CheckCircle2 size={20} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-bold text-blue-50 text-sm">{quest.item}</div>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">{quest.category}</span>
                          {quest.unitLabel && (
                            <span className="text-[10px] text-slate-500">per {quest.unitBase} {quest.unitLabel}</span>
                          )}
                          {timesPerformed > 0 && (
                            <span className="text-[10px] text-yellow-500">x{timesPerformed} today</span>
                          )}
                        </div>
                      </div>
                      <div className={`font-black text-sm ${finalPts >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {finalPts >= 0 ? '+' : ''}{finalPts}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Deduction Activities */}
            {deductionQuests.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-game text-xs text-red-400 px-1 flex items-center gap-1"><AlertTriangle size={14} /> DEDUCTIONS</h3>
                {deductionQuests.map((quest, idx) => {
                  const cost = Math.abs(quest.base_points);
                  const neurozoids = stats.neurozoidsToday ?? 0;
                  const canAfford = neurozoids >= cost;
                  return (
                    <button 
                      key={`ded-${idx}`}
                      onClick={(e) => canAfford && onQuestClick(e, quest)}
                      disabled={!canAfford}
                      className={`w-full backdrop-blur-md border rounded-2xl p-4 flex items-center gap-4 transition-all group active:scale-95 ${
                        canAfford 
                          ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10' 
                          : 'bg-slate-900/40 border-slate-600/30 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        canAfford ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-slate-700/40 text-slate-500'
                      }`}>
                        <AlertTriangle size={20} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className={`font-bold text-sm ${canAfford ? 'text-red-200' : 'text-slate-500'}`}>{quest.item}</div>
                        <div className="text-[10px] text-red-400/60 uppercase tracking-wider">
                          {quest.category} | 20% debuff | costs ◇{cost} neurozoids
                          {!canAfford && ` (have ◇${neurozoids})`}
                        </div>
                      </div>
                      <div className={`font-black text-sm ${canAfford ? 'text-red-400' : 'text-slate-500'}`}>-{quest.base_points}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {questItems.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <p className="font-game text-lg">NO QUESTS YET</p>
                <p className="text-sm mt-2">Open Admin Panel to add quests</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(
              activities.reduce((groups: Record<string, Activity[]>, activity) => {
                const date = new Date(activity.timestamp).toLocaleDateString();
                if (!groups[date]) groups[date] = [];
                groups[date].push(activity);
                return groups;
              }, {})
            ).map(([date, dayActivities]) => (
              <div key={date} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="font-game text-[10px] text-slate-500 uppercase tracking-widest">{date === new Date().toLocaleDateString() ? 'TODAY' : date}</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                {dayActivities.map((activity) => (
                  <div key={activity.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      activity.isDeduction ? 'bg-red-500/20 text-red-400' : 
                      activity.isEmergency ? 'bg-orange-500/20 text-orange-400' : 
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {activity.category[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-200 truncate">{activity.description}</div>
                      <div className="text-[10px] text-slate-500">{new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className={`font-black text-sm ${activity.points >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {activity.points >= 0 ? '+' : ''}{activity.points}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {activities.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <p className="font-game text-lg">NO HISTORY YET</p>
                <p className="text-sm mt-2">Complete quests to see your progress</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
