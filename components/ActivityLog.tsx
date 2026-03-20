
import React from 'react';
import { Activity, Category } from '../types';
import { Clock } from 'lucide-react';

interface ActivityLogProps {
  activities: Activity[];
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ activities }) => {
  if (activities.length === 0) {
    return (
      <div className="text-center py-12 glass rounded-3xl">
        <p className="text-zinc-500 text-sm font-medium">No quests completed yet.</p>
        <p className="text-zinc-600 text-xs">Start logging to begin your journey.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 px-2">Quest History</h3>
      {activities.slice().reverse().map((activity) => (
        <div key={activity.id} className="glass p-4 rounded-2xl border-l-4 border-l-violet-500/50 group hover:bg-white/5 transition-colors">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-black uppercase text-violet-400 tracking-tighter">
              {activity.category}
            </span>
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 mono">
              <Clock size={10} />
              {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <p className="text-sm font-medium mb-2 leading-snug">{activity.description}</p>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-zinc-500 italic flex-1 pr-4">"{activity.analysis}"</p>
            <span className="text-sm font-black mono text-emerald-400">+{activity.points} XP</span>
          </div>
        </div>
      ))}
    </div>
  );
};
