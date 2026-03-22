import React, { useState } from 'react';
import { X, Plus, Trash2, Save, AlertTriangle, Zap, Sparkles, Loader2 } from 'lucide-react';
import { QuestItem, Category } from '../types';
import { geminiService } from '../services/geminiService';

interface AdminPanelProps {
  questItems: QuestItem[];
  onSave: (items: QuestItem[]) => void;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ questItems, onSave, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [items, setItems] = useState<QuestItem[]>([...questItems]);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 400);
  };

  const [newItem, setNewItem] = useState<QuestItem>({
    item: '',
    category: Category.KNOWLEDGE,
    base_points: 50,
    isDeduction: false,
    isEmergency: false,
    unitLabel: '',
    unitBase: 1,
    decayPerRepeat: 10,
    minPoints: 0
  });

  const handleAddItem = () => {
    if (!newItem.item.trim()) return;
    setItems([...items, newItem]);
    setNewItem({
      item: '',
      category: Category.KNOWLEDGE,
      base_points: 50,
      isDeduction: false,
      isEmergency: false,
      unitLabel: '',
      unitBase: 1,
      decayPerRepeat: 10,
      minPoints: 0
    });
  };

  const handleAutoFill = async () => {
    if (!newItem.item.trim() || isAutoFilling) return;
    setIsAutoFilling(true);
    try {
      const result = await geminiService.analyzeQuest(newItem.item);
      setNewItem(prev => ({
        ...prev,
        category: (result.category as Category) || prev.category,
        base_points: result.base_points ?? prev.base_points,
        isDeduction: result.isDeduction ?? prev.isDeduction,
        unitLabel: result.unitLabel ?? prev.unitLabel,
        unitBase: result.unitBase ?? prev.unitBase,
        decayPerRepeat: result.decayPerRepeat ?? prev.decayPerRepeat,
        minPoints: result.minPoints ?? prev.minPoints,
      }));
    } catch (err) {
      console.error("Auto-fill failed:", err);
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: keyof QuestItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  return (
    <div className={`fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[600] flex flex-col p-6 ${isClosing ? 'tv-screen-off' : 'tv-screen-on'}`} style={{ paddingTop: 'max(env(safe-area-inset-top), 48px)' }}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-game text-2xl text-white">ADMIN PANEL</h2>
        <button onClick={handleClose} className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {/* Add New Item Form */}
        <div className="bg-white/5 rounded-2xl p-5 border border-white/10 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-game text-sm text-blue-400">ADD NEW QUEST</h3>
            <button 
              onClick={handleAutoFill}
              disabled={isAutoFilling || !newItem.item.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded-lg text-[10px] font-game text-purple-400 hover:bg-purple-600/30 transition-all disabled:opacity-50"
            >
              {isAutoFilling ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              AI AUTO-FILL
            </button>
          </div>
          
          <input 
            type="text"
            placeholder="Quest Name (e.g. 'Walk 10 minutes')"
            value={newItem.item}
            onChange={(e) => setNewItem({ ...newItem, item: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 ring-blue-500"
          />

          <div className="flex gap-3">
            <select 
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            >
              {Object.values(Category).map(cat => (
                <option key={cat} value={cat} className="bg-slate-800">{cat}</option>
              ))}
            </select>
            <input 
              type="number"
              placeholder="XP"
              value={newItem.base_points}
              onChange={(e) => setNewItem({ ...newItem, base_points: parseInt(e.target.value) || 0 })}
              className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            />
          </div>

          {/* Unit & Diminishing returns */}
          <div className="flex gap-3">
            <input 
              type="text"
              placeholder="Unit (e.g. minutes)"
              value={newItem.unitLabel || ''}
              onChange={(e) => setNewItem({ ...newItem, unitLabel: e.target.value })}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            />
            <input 
              type="number"
              placeholder="Base unit"
              value={newItem.unitBase || 1}
              onChange={(e) => setNewItem({ ...newItem, unitBase: parseInt(e.target.value) || 1 })}
              className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Decay/repeat</label>
              <input 
                type="number"
                value={newItem.decayPerRepeat || 10}
                onChange={(e) => setNewItem({ ...newItem, decayPerRepeat: parseInt(e.target.value) || 0 })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Min points</label>
              <input 
                type="number"
                value={newItem.minPoints || 0}
                onChange={(e) => setNewItem({ ...newItem, minPoints: parseInt(e.target.value) || 0 })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* Type toggles */}
          <div className="flex gap-3">
            <button
              onClick={() => setNewItem({ ...newItem, isDeduction: !newItem.isDeduction, isEmergency: false })}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all ${
                newItem.isDeduction 
                  ? 'bg-red-500/20 border-red-500/40 text-red-400' 
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              <AlertTriangle size={14} /> DEDUCTION
            </button>
            <button
              onClick={() => setNewItem({ ...newItem, isEmergency: !newItem.isEmergency, isDeduction: false })}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all ${
                newItem.isEmergency 
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' 
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              <Zap size={14} /> EMERGENCY
            </button>
          </div>

          <button 
            onClick={handleAddItem}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
          >
            <Plus size={18} /> ADD QUEST
          </button>
        </div>

        {/* Save Changes Button (Moved above Current Quests) */}
        <div className="pt-2">
          <button 
            onClick={() => onSave(items)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-game text-lg py-4 rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98]"
          >
            <Save size={20} /> SAVE CHANGES
          </button>
        </div>

        {/* Quest List */}
        <div className="space-y-2">
          <h3 className="font-game text-sm text-slate-500 px-2">CURRENT QUESTS</h3>
          {items.map((item, idx) => (
            <div key={idx} className={`rounded-xl p-3 flex items-center gap-3 border ${
              item.isDeduction 
                ? 'bg-red-500/5 border-red-500/20' 
                : item.isEmergency 
                  ? 'bg-orange-500/5 border-orange-500/20'
                  : 'bg-white/5 border-white/5'
            }`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {item.isDeduction && <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />}
                  {item.isEmergency && <Zap size={12} className="text-orange-400 flex-shrink-0" />}
                  <input 
                    type="text"
                    value={item.item}
                    onChange={(e) => handleUpdateItem(idx, 'item', e.target.value)}
                    className="w-full bg-transparent text-white font-bold text-sm focus:outline-none truncate"
                  />
                </div>
                <div className="flex gap-2 items-center mt-1">
                  <select 
                    value={item.category}
                    onChange={(e) => handleUpdateItem(idx, 'category', e.target.value)}
                    className="bg-transparent text-[10px] text-white/40 uppercase tracking-widest focus:outline-none"
                  >
                    {Object.values(Category).map(cat => (
                      <option key={cat} value={cat} className="bg-slate-800">{cat}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-blue-400 font-black">XP:{item.base_points}</span>
                  {item.unitLabel && (
                    <span className="text-[10px] text-slate-500">per {item.unitBase} {item.unitLabel}</span>
                  )}
                  {item.decayPerRepeat ? (
                    <span className="text-[10px] text-yellow-500">-{item.decayPerRepeat}/rep</span>
                  ) : null}
                </div>
              </div>
              <button 
                onClick={() => handleRemoveItem(idx)}
                className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex-shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
