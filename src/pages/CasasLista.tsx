import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Area, Casa, Rua } from '../types';
import { canAccessTerritory } from '../utils/territoryScope';
import { Home, Plus, Save } from 'lucide-react';

export const CasasLista: React.FC = () => {
  const { user, areaIds, ruaIdsExtras, legacyAccess } = useAuth();

  const [areas, setAreas] = useState<Area[]>([]);
  const [ruas, setRuas] = useState<Rua[]>([]);
  const [casas, setCasas] = useState<Casa[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCasa, setEditingCasa] = useState<Casa | null>(null);
  const [areaId, setAreaId] = useState('');
  const [ruaId, setRuaId] = useState('');
  const [identificacao, setIdentificacao] = useState('');
  const [complemento, setComplemento] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    const unsubAreas = onSnapshot(
      query(collection(db, 'areas'), where('ownerId', '==', user.uid)),
      (snapshot) => {
        const list: Area[] = [];
        snapshot.forEach((item) => {
          const area = { id: item.id, ...item.data() } as Area;
          if (!legacyAccess && !areaIds.includes(area.id || '')) return;
          list.push(area);
        });
        list.sort((a, b) => a.nome.localeCompare(b.nome));
        setAreas(list);
      }
    );

    const unsubRuas = onSnapshot(
      query(collection(db, 'ruas'), where('ownerId', '==', user.uid)),
      (snapshot) => {
        const list: Rua[] = [];
        snapshot.forEach((item) => {
          const rua = { id: item.id, ...item.data() } as Rua;
          if (!canAccessTerritory({
            areaId: rua.areaId,
            ruaId: rua.id,
            scope: { legacyAccess, areaIds, ruaIdsExtras },
          })) return;
          list.push(rua);
        });
        list.sort((a, b) => a.nome.localeCompare(b.nome));
        setRuas(list);
      }
    );

    const unsubCasas = onSnapshot(
      query(collection(db, 'casas'), where('ownerId', '==', user.uid)),
      (snapshot) => {
        const list: Casa[] = [];
        snapshot.forEach((item) => {
          const casa = { id: item.id, ...item.data() } as Casa;
          if (!canAccessTerritory({
            areaId: casa.areaId,
            ruaId: casa.ruaId,
            scope: { legacyAccess, areaIds, ruaIdsExtras },
          })) return;
          list.push(casa);
        });
        list.sort((a, b) => a.identificacao.localeCompare(b.identificacao));
        setCasas(list);
        setLoading(false);
      }
    );

    return () => {
      unsubAreas();
      unsubRuas();
      unsubCasas();
    };
  }, [user, legacyAccess, areaIds, ruaIdsExtras]);

  const ruasDaArea = useMemo(() => {
    if (!areaId) return [];
    return ruas.filter((rua) => rua.areaId === areaId);
  }, [ruas, areaId]);

  const openCreate = () => {
    setEditingCasa(null);
    setAreaId(areas[0]?.id || '');
    setRuaId('');
    setIdentificacao('');
    setComplemento('');
    setModalOpen(true);
  };

  const openEdit = (casa: Casa) => {
    setEditingCasa(casa);
    setAreaId(casa.areaId);
    setRuaId(casa.ruaId);
    setIdentificacao(casa.identificacao);
    setComplemento(casa.complemento || '');
    setModalOpen(true);
  };

  const saveCasa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!areaId || !ruaId || !identificacao.trim()) return;

    setSaving(true);
    try {
      if (editingCasa?.id) {
        await updateDoc(doc(db, 'casas', editingCasa.id), {
          areaId,
          ruaId,
          identificacao: identificacao.trim(),
          complemento: complemento.trim() || null,
          updatedAt: serverTimestamp(),
        });
      } else {
        const newRef = doc(collection(db, 'casas'));
        await setDoc(newRef, {
          areaId,
          ruaId,
          identificacao: identificacao.trim(),
          complemento: complemento.trim() || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ownerId: user.uid,
        });
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const getAreaName = (id?: string) => areas.find((a) => a.id === id)?.nome || 'Área não encontrada';
  const getRuaName = (id?: string) => ruas.find((r) => r.id === id)?.nome || 'Rua não encontrada';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Carregando casas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl tracking-tight text-slate-900">Cadastro de Casas</h2>
          <p className="text-slate-500 text-sm mt-1">Mantenha os domicílios vinculados a rua e área para seleção rápida no cadastro de pessoas.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Casa</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {casas.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {casas.map((casa) => (
              <div key={casa.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 flex items-center gap-2">
                    <Home className="w-4 h-4 text-emerald-600" />
                    {casa.identificacao}
                    {casa.complemento ? ` - ${casa.complemento}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {getAreaName(casa.areaId)} • {getRuaName(casa.ruaId)}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(casa)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Editar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-14 text-center text-slate-500 text-sm">Nenhuma casa cadastrada no seu escopo territorial.</div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="h-1.5 bg-emerald-600" />
            <form onSubmit={saveCasa} className="p-6 space-y-4">
              <h3 className="text-slate-900 font-display font-bold text-lg">
                {editingCasa ? 'Editar Casa' : 'Cadastrar Nova Casa'}
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Área *</label>
                <select
                  required
                  value={areaId}
                  onChange={(e) => {
                    setAreaId(e.target.value);
                    setRuaId('');
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">Selecione</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Rua *</label>
                <select
                  required
                  value={ruaId}
                  onChange={(e) => setRuaId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  disabled={!areaId}
                >
                  <option value="">Selecione</option>
                  {ruasDaArea.map((rua) => (
                    <option key={rua.id} value={rua.id}>{rua.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Identificação *</label>
                <input
                  required
                  type="text"
                  value={identificacao}
                  onChange={(e) => setIdentificacao(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  placeholder="Ex: 12, 12A, Fundos"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Complemento</label>
                <input
                  type="text"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  placeholder="Ex: Bloco B, Casa 2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Salvando...' : 'Salvar Casa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};