import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

// Zustand store for authentication state.
// Zustand is a lightweight state manager — think of it as a global variable
// that any component can read or update, and React will re-render automatically.
interface AuthState {
  session: Session | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isLoading: true, // true on startup while we check for an existing session
  setSession: (session) => set({ session }),
  setLoading: (isLoading) => set({ isLoading }),
}));
