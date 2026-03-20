
import React from 'react';
import { UserStats, Category } from '../types';
import { 
  Zap, 
  Heart, 
  Brain, 
  Target, 
  Award,
  Users
} from 'lucide-react';

interface StatsCardProps {
  stats: UserStats;
}

// Fixed CategoryIconMap to strictly align with the Category enum defined in types.ts
const CategoryIconMap: Record<Category, React.ReactNode> = {
  [Category.HEALTH]: <Heart className="text-rose-500" size={18} />,
  [Category.CAREER]: <Target className="text-amber-500" size={18} />,
  [Category.KNOWLEDGE]: <Brain className="text-indigo-500" size={18} />,
  [Category.FAMILY_SOCIAL]: <Users className="text-emerald-500" size={18} />,
  [Category.LEISURE]: <Target className="text-slate-500" size={18} />,
};

export const StatsCard: React.FC<StatsCardProps> = ({ stats }) => {
  const xpProgress = (stats.currentXP / stats.nextLevelXP) * 100;

  return (
    <div className="space-y-6">
      <div className="glass p-6 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Award size={80} />
        </div>
        
        <div className="flex justify-between items-end mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Current Level</p>
            <h2 className="text-5xl font-black italic mono tracking-tighter">LVL {stats.level}</h2>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Total XP</p>
            <p className="text-2xl font-bold mono">{stats.totalPoints.toLocaleString()}</p>
          </div>
        </div>

        <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden mb-2">
          <div 
            className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-1000 progress-bar-glow"
            style={{ width: `${xpProgress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] mono uppercase text-zinc-400 font-bold">
          <span>{stats.currentXP} XP</span>
          <span>{stats.nextLevelXP} XP TO NEXT LEVEL</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Object.values(Category).map((cat) => (
          <div key={cat} className="glass p-4 rounded-2xl flex items-center gap-3">
            <div className="p-2 bg-zinc-900/50 rounded-xl">
              {CategoryIconMap[cat]}
            </div>
            <div>
              <p className="text-[10px] uppercase text-zinc-500 font-bold leading-none mb-1">{cat}</p>
              <p className="text-lg font-bold mono leading-none">{stats.categoryPoints[cat] || 0}</p>
            </div>
          </div>
        ))}
        <div className="glass p-4 rounded-2xl flex items-center gap-3 bg-gradient-to-br from-violet-900/20 to-transparent border-violet-500/20">
          <div className="p-2 bg-zinc-900/50 rounded-xl">
            <Zap className="text-violet-400" size={18} />
          </div>
          <div>
            <p className="text-[10px] uppercase text-zinc-500 font-bold leading-none mb-1">Streak</p>
            <p className="text-lg font-bold mono leading-none">{stats.streak} Days</p>
          </div>
        </div>
      </div>
    </div>
  );
};
