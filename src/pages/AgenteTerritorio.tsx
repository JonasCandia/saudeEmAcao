import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Area, Rua, Territorio } from '../types';
import { Save, ShieldCheck } from 'lucide-react';

export const AgenteTerritorio: React.FC = () => {
  const { user, legacyAccess } = useAuth();

  const [areas, setAreas] = useState<Area[]>([]);
  const [ruas, setRuas] = useState<Rua[]>([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [selectedRuaIdsExtras, setSelectedRuaIdsExtras] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasExistingProfile, setHasExistingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;

    const unsubTerritorio = onSnapshot(
      doc(db, 'territorio', user.uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as Territorio) : { areas: {}, ruas: {}, casas: {}, ownerId: user.uid };
        const areasList: Area[] = Object.entries(data.areas || {})
          .map(([id, v]) => ({ id, ownerId: user.uid, nome: v.nome, descricao: v.descricao, createdAt: v.createdAt }))
          .sort((a, b) => a.nome.localeCompare(b.nome));
        const ruasList: Rua[] = Object.entries(data.ruas || {})
          .map(([id, v]) => ({ id, ownerId: user.uid, nome: v.nome, areaId: v.areaId, createdAt: v.createdAt }))
          .sort((a, b) => a.nome.localeCompare(b.nome));
        setAreas(areasList);
        setRuas(ruasList);
      }
    );

    return () => {
      unsubTerritorio();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      setLoading(true);
      try {
        const ref = doc(db, 'agentes', user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as { areaIds?: string[]; ruaIdsExtras?: string[] };
          setHasExistingProfile(true);
          setSelectedAreaIds(data.areaIds || []);
          setSelectedRuaIdsExtras(data.ruaIdsExtras || []);
        } else {
          setHasExistingProfile(false);
          setSelectedAreaIds([]);
          setSelectedRuaIdsExtras([]);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const ruasExtrasOptions = useMemo(() => {
    return ruas.filter((rua) => !selectedAreaIds.includes(rua.areaId));
  }, [ruas, selectedAreaIds]);

  const toggleArea = (areaId: string) => {
    setSelectedAreaIds((prev) => {
      if (prev.includes(areaId)) {
        return prev.filter((id) => id !== areaId);
      }
      return [...prev, areaId];
    });
    setSelectedRuaIdsExtras((prev) => prev.filter((ruaId) => {
      const rua = ruas.find((r) => r.id === ruaId);
      return rua ? rua.areaId !== areaId : true;
    }));
  };

  const toggleRuaExtra = (ruaId: string) => {
    setSelectedRuaIdsExtras((prev) => {
      if (prev.includes(ruaId)) {
        return prev.filter((id) => id !== ruaId);
      }
      return [...prev, ruaId];
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        ownerId: user.uid,
        areaIds: selectedAreaIds,
        ruaIdsExtras: selectedRuaIdsExtras,
        updatedAt: serverTimestamp(),
        ...(!hasExistingProfile ? { createdAt: serverTimestamp() } : {}),
      };

      await setDoc(doc(db, 'agentes', user.uid), payload, { merge: true });
      setHasExistingProfile(true);
      setMessage('Perfil territorial salvo com sucesso.');
    } catch (error: any) {
      setMessage(`Falha ao salvar perfil territorial: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Carregando perfil territorial...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display font-bold text-2xl tracking-tight text-slate-900">
          Perfil Territorial do Agente
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Selecione as áreas principais e, opcionalmente, ruas extras de apoio em outras áreas.
        </p>
      </div>

      {legacyAccess && (
        <div className="p-4 bg-amber-50 text-amber-800 text-sm rounded-xl border border-amber-100">
          Seu acesso está em modo legado. Salvar este perfil ativa o escopo territorial por áreas e ruas extras.
        </div>
      )}

      {message && (
        <div className="p-4 bg-slate-50 text-slate-700 text-sm rounded-xl border border-slate-200">
          {message}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-900">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold">Áreas principais</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {areas.map((area) => (
            <label key={area.id} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <input
                type="checkbox"
                checked={selectedAreaIds.includes(area.id || '')}
                onChange={() => toggleArea(area.id || '')}
                className="rounded border-slate-300"
              />
              <span className="text-sm font-medium text-slate-700">{area.nome}</span>
            </label>
          ))}
          {areas.length === 0 && <p className="text-sm text-slate-400">Nenhuma área cadastrada.</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Ruas extras de apoio</h3>
        <p className="text-xs text-slate-500">
          Ruas extras servem para exceções fora das áreas principais. Ruas de áreas já selecionadas não aparecem aqui.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ruasExtrasOptions.map((rua) => (
            <label key={rua.id} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <input
                type="checkbox"
                checked={selectedRuaIdsExtras.includes(rua.id || '')}
                onChange={() => toggleRuaExtra(rua.id || '')}
                className="rounded border-slate-300"
              />
              <span className="text-sm font-medium text-slate-700">{rua.nome}</span>
            </label>
          ))}
          {ruasExtrasOptions.length === 0 && (
            <p className="text-sm text-slate-400">Não há ruas elegíveis para exceção no momento.</p>
          )}
        </div>
      </div>

      <div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Salvando...' : 'Salvar Perfil Territorial'}</span>
        </button>
      </div>
    </div>
  );
};