import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  addDoc, 
  setDoc,
  updateDoc,
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { Area, Rua, Pessoa, OperationType } from '../types';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Map, 
  AlertTriangle, 
  FileText, 
  PlusCircle, 
  Info,
  Route,
  Users
} from 'lucide-react';

export const AreasLista: React.FC = () => {
  const { user } = useAuth();

  const [areas, setAreas] = useState<Area[]>([]);
  const [ruas, setRuas] = useState<Rua[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null); // Null for create, Area for edit
  const [areaNome, setAreaNome] = useState('');
  const [areaDescricao, setAreaDescricao] = useState('');
  const [savingArea, setSavingArea] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Cascade Deletion Confirm Modal State
  const [areaToDelete, setAreaToDelete] = useState<Area | null>(null);
  const [isCascadeDeleteOpen, setIsCascadeDeleteOpen] = useState(false);
  const [deletingCascaded, setDeletingCascaded] = useState(false);

  // 1. Fetch Areas
  useEffect(() => {
    if (!user) return;

    const path = 'areas';
    const qAreas = query(collection(db, 'areas'), where('ownerId', '==', user.uid));
    const unsubscribeAreas = onSnapshot(
      qAreas,
      (snapshot) => {
        const list: Area[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Area);
        });
        list.sort((a, b) => a.nome.localeCompare(b.nome));
        setAreas(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, path);
        } catch (formattedError: any) {
          setErrorMsg(JSON.parse(formattedError.message).error);
        }
      }
    );

    // Fetch Ruas dynamically to count references
    const qRuas = query(collection(db, 'ruas'), where('ownerId', '==', user.uid));
    const unsubscribeRuas = onSnapshot(
      qRuas,
      (snapshot) => {
        const list: Rua[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Rua);
        });
        setRuas(list);
      },
      () => {}
    );

    // Fetch Pessoas to update references
    const qPessoas = query(collection(db, 'pessoas'), where('ownerId', '==', user.uid));
    const unsubscribePessoas = onSnapshot(
      qPessoas,
      (snapshot) => {
        const list: Pessoa[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Pessoa);
        });
        setPessoas(list);
      },
      () => {}
    );

    return () => {
      unsubscribeAreas();
      unsubscribeRuas();
      unsubscribePessoas();
    };
  }, [user]);

  // Handle open creation modal
  const openCreateModal = () => {
    setSelectedArea(null);
    setAreaNome('');
    setAreaDescricao('');
    setModalError(null);
    setIsModalOpen(true);
  };

  // Handle open edit modal
  const openEditModal = (area: Area) => {
    setSelectedArea(area);
    setAreaNome(area.nome);
    setAreaDescricao(area.descricao || '');
    setModalError(null);
    setIsModalOpen(true);
  };

  // Submit form (create or edit)
  const handleSaveArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!areaNome.trim()) {
      setModalError('O nome da área é obrigatório.');
      return;
    }

    setSavingArea(true);
    setModalError(null);

    try {
      if (selectedArea && selectedArea.id) {
        // Update Area doc
        const areaRef = doc(db, 'areas', selectedArea.id);
        await updateDoc(areaRef, {
          nome: areaNome.trim(),
          descricao: areaDescricao.trim() || null,
        });

        // Also if we renamed an Area, we update flat representation on people linked to it!
        // We do this dynamically in client logic safely
        const linkedPessoas = pessoas.filter(p => p.areaId === selectedArea.id);
        for (const p of linkedPessoas) {
          if (p.id) {
            await updateDoc(doc(db, 'pessoas', p.id), {
              areaAtendimento: areaNome.trim()
            });
          }
        }
      } else {
        // Create new Area doc with custom ID to prevent collisions
        const newAreaRef = doc(collection(db, 'areas'));
        const trimmedDescricao = areaDescricao.trim();
        const payload = {
          nome: areaNome.trim(),
          ...(trimmedDescricao ? { descricao: trimmedDescricao } : {}),
          createdAt: serverTimestamp(),
          ownerId: user.uid
        };
        await setDoc(newAreaRef, payload);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      try {
        handleFirestoreError(err, selectedArea ? OperationType.UPDATE : OperationType.CREATE, 'areas');
      } catch (formattedError: any) {
        setModalError(JSON.parse(formattedError.message).error);
      }
    } finally {
      setSavingArea(false);
    }
  };

  // Handle Delete Area Button
  const handleDeleteCheck = (area: Area) => {
    setAreaToDelete(area);
    setIsCascadeDeleteOpen(true);
  };

  // Confirms cascade deletion
  const executeCascadeDelete = async () => {
    if (!areaToDelete || !areaToDelete.id) return;
    setDeletingCascaded(true);

    try {
      // 1. Delete all ruas in this area
      const linkedRuas = ruas.filter(r => r.areaId === areaToDelete.id);
      for (const rua of linkedRuas) {
        if (rua.id) {
          await deleteDoc(doc(db, 'ruas', rua.id));
        }
      }

      // 2. Unlink/null references from pessoas in this area
      const linkedPessoas = pessoas.filter(p => p.areaId === areaToDelete.id);
      for (const p of linkedPessoas) {
        if (p.id) {
          await updateDoc(doc(db, 'pessoas', p.id), {
            areaId: null,
            ruaId: null
          });
        }
      }

      // 3. Delete the area document
      await deleteDoc(doc(db, 'areas', areaToDelete.id));

      setIsCascadeDeleteOpen(false);
      setAreaToDelete(null);
    } catch (err: any) {
      console.error(err);
      alert('Falha ao excluir a área: ' + err.message);
    } finally {
      setDeletingCascaded(false);
    }
  };

  // Dynamic counts helper
  const getAreaStats = (areaId: string) => {
    const totalRuasVal = ruas.filter(r => r.areaId === areaId).length;
    const totalMoradoresVal = pessoas.filter(p => p.areaId === areaId).length;
    return { totalRuasVal, totalMoradoresVal };
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Carregando áreas de atuação...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upper Navigation panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl tracking-tight text-slate-900">
            Áreas de Atendimento (Territórios)
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Cadastre as microáreas de atuação do seu bairro ou comunidade.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-600/10 transition-all self-start sm:self-auto cursor-pointer"
          id="btn-new-area"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Área</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Areas Cards Grid */}
      {areas.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {areas.map((area) => {
            const { totalRuasVal, totalMoradoresVal } = getAreaStats(area.id || '');
            return (
              <div 
                key={area.id} 
                className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                {/* Visual marker decoration */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                      <Map className="w-5 h-5" />
                    </div>
                    <h3 className="font-display font-bold text-lg text-slate-905 truncate">{area.nome}</h3>
                  </div>

                  <p className="text-slate-500 text-sm h-10 overflow-hidden line-clamp-2">
                    {area.descricao || <span className="text-slate-350 italic">Sem descrição disponível</span>}
                  </p>

                  {/* Tiny metadata metrics row */}
                  <div className="flex items-center gap-4 pt-2 text-xs font-semibold text-slate-400">
                    <span className="flex items-center gap-1">
                      <Route className="w-3.5 h-3.5 text-slate-400" />
                      {totalRuasVal} {totalRuasVal === 1 ? 'Rua' : 'Ruas'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {totalMoradoresVal} {totalMoradoresVal === 1 ? 'Cadastro' : 'Cadastros'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-t border-slate-100 pt-4 mt-5 justify-end">
                  <button
                    onClick={() => openEditModal(area)}
                    className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                    title="Editar informações da área"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCheck(area)}
                    className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    title="Remover Área"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-20 text-center bg-white rounded-2xl border border-slate-200">
          <div className="p-4 bg-slate-50 text-slate-400 inline-block rounded-2xl mb-4">
            <Map className="w-10 h-10" />
          </div>
          <h3 className="font-display font-semibold text-slate-705 text-lg">Nenhuma área registrada</h3>
          <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
            Cadastre sua primeira microárea de trabalho (ex: "Jardim Primavera") para poder vincular as ruas e seus respectivos domicílios.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-sm rounded-xl transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Cadastrar Área</span>
          </button>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-150 overflow-hidden">
            <div className="h-1.5 bg-emerald-600" />
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-slate-900 font-display font-bold text-lg">
                    {selectedArea ? 'Editar Área' : 'Nova Área Territorial'}
                  </h3>
                  <p className="text-slate-400 text-xs mt-0.5">Defina as características da área de amostragem clínica.</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="hover:bg-slate-100 rounded text-slate-400 font-semibold p-1 px-1.5 text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="mb-4 p-3 bg-rose-50 text-rose-750 text-xs rounded-xl border border-rose-100 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleSaveArea} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Nome da Microárea *
                  </label>
                  <input
                    type="text"
                    required
                    value={areaNome}
                    onChange={(e) => setAreaNome(e.target.value)}
                    maxLength={100}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-700 outline-none transition-all"
                    placeholder="Ex: Jardim Primavera / Microárea 02"
                    id="area-name-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Breve Descrição / Pontos de Referência (Opcional)
                  </label>
                  <textarea
                    value={areaDescricao}
                    onChange={(e) => setAreaDescricao(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-700 outline-none transition-all placeholder-slate-400"
                    placeholder="Ex: Próximo à praça central e ao posto de saúde secundário."
                    id="area-desc-input"
                  />
                  <div className="text-right text-[10px] text-slate-350 font-mono mt-0.5">
                    {areaDescricao.length}/500 caracteres
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-5 mt-6">
                  <button
                    type="button"
                    disabled={savingArea}
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 hover:bg-slate-150 rounded-xl text-slate-600 font-bold text-sm transition-all cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    disabled={savingArea}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-500/10 transition-all cursor-pointer"
                  >
                    <span>{savingArea ? 'Gravando...' : 'Salvar Alterações'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CASCADE DELETE WARNING MODAL */}
      {isCascadeDeleteOpen && areaToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-150 overflow-hidden">
            <div className="h-1.5 bg-rose-650" />
            <div className="p-6">
              <div className="flex gap-3 text-rose-600 items-start mb-4">
                <div className="p-2 bg-rose-50 rounded-xl shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-slate-900 text-lg leading-6">Excluir Área: {areaToDelete.nome}</h3>
                  <p className="text-slate-500 text-xs mt-1">Essa operação causará alterações em cascata irreversíveis:</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 mb-6 space-y-2 text-xs">
                <div className="flex justify-between font-semibold text-slate-650">
                  <span>Ruas pertencentes a esta área:</span>
                  <span className="font-mono text-rose-600">{ruas.filter(r => r.areaId === areaToDelete.id).length} cadastros</span>
                </div>
                <p className="text-slate-450 leading-relaxed">
                  As ruas pertencentes a esta microárea serão excluídas permanentemente.
                </p>
                <div className="flex justify-between font-semibold text-slate-655 pt-2 border-t border-slate-200/50">
                  <span>Moradores associados:</span>
                  <span className="font-mono text-emerald-600">{pessoas.filter(p => p.areaId === areaToDelete.id).length} cadastros</span>
                </div>
                <p className="text-slate-450 leading-relaxed">
                  Os moradores associados continuarão cadastrados, contudo os campos correspondentes à Área e Rua serão limpos para reatribuição.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  disabled={deletingCascaded}
                  onClick={() => setIsCascadeDeleteOpen(false)}
                  className="px-4 py-2 hover:bg-slate-150 text-slate-600 rounded-xl font-bold text-sm transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deletingCascaded}
                  onClick={executeCascadeDelete}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-sm rounded-xl shadow-md shadow-rose-500/10 transition-all cursor-pointer"
                  id="btn-confirm-delete-area"
                >
                  <span>{deletingCascaded ? 'Limpando...' : 'Sim, Excluir em Cascata'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
