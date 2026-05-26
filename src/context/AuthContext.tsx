import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signOut as fbSignOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth } from '../firebase';
import { db } from '../firebase';
import { AgenteTerritorio } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  areaIds: string[];
  ruaIdsExtras: string[];
  legacyAccess: boolean;
  hasTerritoryProfile: boolean;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string) => Promise<User>;
  signInGoogle: () => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [ruaIdsExtras, setRuaIdsExtras] = useState<string[]>([]);
  const [legacyAccess, setLegacyAccess] = useState(true);
  const [hasTerritoryProfile, setHasTerritoryProfile] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setUser(currentUser);

      if (!currentUser) {
        setAreaIds([]);
        setRuaIdsExtras([]);
        setLegacyAccess(true);
        setHasTerritoryProfile(false);
        setLoading(false);
        return;
      }

      try {
        const agenteRef = doc(db, 'agentes', currentUser.uid);
        const agenteSnap = await getDoc(agenteRef);

        if (!agenteSnap.exists()) {
          // Transitional compatibility: while `agentes` profile does not exist,
          // fallback to legacy owner-level access.
          setAreaIds([]);
          setRuaIdsExtras([]);
          setLegacyAccess(true);
          setHasTerritoryProfile(false);
          setLoading(false);
          return;
        }

        const profile = agenteSnap.data() as AgenteTerritorio;
        setAreaIds(profile.areaIds || []);
        setRuaIdsExtras(profile.ruaIdsExtras || []);
        setLegacyAccess(false);
        setHasTerritoryProfile(true);
      } catch {
        // Permission/read failures keep app operational in legacy mode.
        setAreaIds([]);
        setRuaIdsExtras([]);
        setLegacyAccess(true);
        setHasTerritoryProfile(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return credential.user;
  };

  const signInGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    return credential.user;
  };

  const signOut = async () => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      areaIds,
      ruaIdsExtras,
      legacyAccess,
      hasTerritoryProfile,
      signInWithEmail,
      signUpWithEmail,
      signInGoogle,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
