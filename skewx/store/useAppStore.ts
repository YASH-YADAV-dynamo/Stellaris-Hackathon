import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_FORMULA_PARAMS, FormulaParams, FormulaType } from '@/types/orderbook';

interface AppState {
  darkMode: boolean;
  leaderboardSymbol:  string;
  leaderboardFormula: FormulaType;
  leaderboardParams:  FormulaParams;

  toggleDarkMode:        () => void;
  setLeaderboardSymbol:  (s: string) => void;
  setLeaderboardFormula: (f: FormulaType) => void;
  setLeaderboardParams:  (patch: Partial<FormulaParams>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      darkMode:           true,
      leaderboardSymbol:  'BTC/USD',
      leaderboardFormula: 'distanceWeighted',
      leaderboardParams:  DEFAULT_FORMULA_PARAMS,

      toggleDarkMode:        () => set(s => ({ darkMode: !s.darkMode })),
      setLeaderboardSymbol:  (leaderboardSymbol)  => set({ leaderboardSymbol }),
      setLeaderboardFormula: (leaderboardFormula) => set({ leaderboardFormula }),
      setLeaderboardParams:  (patch) => set(s => ({
        leaderboardParams: { ...s.leaderboardParams, ...patch },
      })),
    }),
    {
      name: 'obi-app',
      version: 1,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version === 0 && state.leaderboardSymbol) {
          const sym = state.leaderboardSymbol as string;
          if (!sym.includes('/')) {
            state.leaderboardSymbol = `${sym}/USD`;
          }
        }
        return state as unknown as AppState;
      },
    },
  ),
);
