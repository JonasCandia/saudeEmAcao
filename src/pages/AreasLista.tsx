import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc,
  deleteField,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { Area, Rua, Pessoa, OperationType, Territorio } from '../types';
import { canAccessTerritory } from '../utils/territoryScope';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Map, 
  AlertTriangle, 
  PlusCircle, 
  Route,
  Users
} from 'lucide-react';

export const AreasLista: React.FC = () => {
  const { user, areaIds, ruaIdsExtras, legacyAccess } = useAuth();

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

  // 1. Fetch Areas + Ruas from single territorio doc
  useEffect(() => {
    if (!user) return;

    const territorioRef = doc(db, 'territorio', user.uid);
    const unsubscribeTerritorio = onSnapshot(
      territorioRef,
      (snap) => {
        const data = snap.exists() ? (snap.data() as Territorio) : { areas: {}, ruas: {}, casas: {}, ownerId: user.uid };
        const areasMap = data.areas || {};
        const ruasMap = data.ruas || {};

        const areasList: Area[] = Object.entries(areasMap)
          .map(([id, v]) => ({ id, ownerId: user.uid, nome: v.nome, descricao: v.descricao, createdAt: v.createdAt }))
          .filter(a => legacyAccess || areaIds.includes(a.id || ''))
          .sort((a, b) => a.nome.localeCompare(b.nome));

        const ruasList: Rua[] = Object.entries(ruasMap)
          .map(([id, v]) => ({ id, ownerId: user.uid, nome: v.nome, areaId: v.areaId, createdAt: v.createdAt }))
          .filter(r => canAccessTerritory({ areaId: r.areaId, ruaId: r.id, scope: { legacyAccess, areaIds, ruaIdsExtras } }));

        setAreas(areasList);
        setRuas(ruasList);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'territorio');
        } catch (formattedError: any) {
          setErrorMsg(JSON.parse(formattedError.message).error);
        }
      }
    );

    // Fetch Pessoas to update references
    const qPessoas = query(collection(db, 'pessoas'), where('ownerId', '==', user.uid));
    const unsubscribePessoas = onSnapshot(
      qPessoas,
      (snapshot) => {
        const list: Pessoa[] = [];
        snapshot.forEach((doc) => {
          const pessoa = { id: doc.id, ...doc.data() } as Pessoa;
          if (!canAccessTerritory({
            areaId: pessoa.areaId,
            ruaId: pessoa.ruaId,
            scope: { legacyAccess, areaIds, ruaIdsExtras },
          })) {
            return;
          }
          list.push(pessoa);
        });
        setPessoas(list);
      },
      () => {}
    );

    return () => {
      unsubscribeTerritorio();
      unsubscribePessoas();
    };
  }, [user, legacyAccess, areaIds, ruaIdsExtras]);

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
      const territorioRef = doc(db, 'territorio', user.uid);

      if (selectedArea && selectedArea.id) {
        const areaId = selectedArea.id;
        const trimmedDescricaoEdit = areaDescricao.trim();
        const updatedArea = {
          nome: areaNome.trim(),
          createdAt: selectedArea.createdAt,
          ...(trimmedDescricaoEdit ? { descricao: trimmedDescricaoEdit } : {}),
        };
        await setDoc(
          territorioRef,
          { ownerId: user.uid, areas: { [areaId]: updatedArea } },
          { mergeFields: ['ownerId', `areas.${areaId}`] }
        );

        // Sync flat name on linked pessoas
        const linkedPessoas = pessoas.filter(p => p.areaId === areaId);
        for (const p of linkedPessoas) {
          if (p.id) {
            await updateDoc(doc(db, 'pessoas', p.id), {
              areaAtendimento: areaNome.trim()
            });
          }
        }
      } else {
        // Create new area
        const newId = crypto.randomUUID().replace(/-/g, '');
        const trimmedDescricao = areaDescricao.trim();
        const newArea = {
          nome: areaNome.trim(),
          createdAt: Timestamp.now(),
          ...(trimmedDescricao ? { descricao: trimmedDescricao } : {}),
        };
        await setDoc(
          territorioRef,
          { ownerId: user.uid, areas: { [newId]: newArea } },
          { mergeFields: ['ownerId', `areas.${newId}`] }
        );
      }

      setIsModalOpen(false);
    } catch (err: any) {
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
      const territorioRef = doc(db, 'territorio', user!.uid);
      const areaId = areaToDelete.id;

      // Build a single batch for atomicity: rua deletes + area delete + pessoa unlinks
      const batch = writeBatch(db);

      // 1. Delete all ruas + the area itself from the territory doc in one update
      const territorioUpdates: Record<string, any> = {};
      const linkedRuas = ruas.filter(r => r.areaId === areaId);
      linkedRuas.forEach(r => {
        if (r.id) territorioUpdates[`ruas.${r.id}`] = deleteField();
      });
      territorioUpdates[`areas.${areaId}`] = deleteField();
      batch.update(territorioRef, territorioUpdates);

      // 2. Unlink area/rua refs from linked pessoas
      const linkedPessoas = pessoas.filter(p => p.areaId === areaId);
      linkedPessoas.forEach(p => {
        if (p.id) {
          batch.update(doc(db, 'pessoas', p.id), { areaId: null, ruaId: null });
        }
      });

      await batch.commit();

      setIsCascadeDeleteOpen(false);
      setAreaToDelete(null);
    } catch (err: any) {
      setErrorMsg(`Falha ao excluir a área. ${err.message}`);
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <h2 className="font-display font-bold text-2xl tracking-tight text-slate-900">
            Áreas de Atendimento (Territórios)
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            Cadastre as microáreas de atuação do seu bairro ou comunidade.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Map className="h-3.5 w-3.5" />
            {areas.length} {areas.length === 1 ? 'área ativa' : 'áreas ativas'}
          </div>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/10 transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:bg-emerald-800 sm:self-auto"
          id="btn-new-area"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Área</span>
        </button>
      </div>

      {errorMsg && (
        <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="leading-6">{errorMsg}</span>
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
                className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5 transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-950/5"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-100">
                        <Map className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-lg font-bold text-slate-900">{area.nome}</h3>
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                          Microárea territorial
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(area)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                        title="Editar informações da área"
                        aria-label={`Editar área ${area.nome}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCheck(area)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                        title="Remover área"
                        aria-label={`Remover área ${area.nome}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="min-h-12 text-sm leading-6 text-slate-500">
                    {area.descricao || <span className="italic text-slate-400">Sem descrição cadastrada.</span>}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Route className="h-4 w-4" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Ruas</span>
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{totalRuasVal}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Users className="h-4 w-4" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Cadastros</span>
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{totalMoradoresVal}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4 text-xs font-medium text-slate-500">
                  {totalMoradoresVal > 0
                    ? 'Use a edição para ajustar o nome ou a descrição da microárea.'
                    : 'Área pronta para receber ruas e moradores vinculados.'}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm shadow-slate-950/5">
          <div className="mb-4 inline-flex rounded-2xl bg-slate-50 p-4 text-slate-400 ring-1 ring-slate-200">
            <Map className="w-10 h-10" />
          </div>
          <h3 className="font-display text-lg font-semibold text-slate-900">Nenhuma área registrada</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Cadastre sua primeira microárea de trabalho (ex: "Jardim Primavera") para poder vincular as ruas e seus respectivos domicílios.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Cadastrar Área</span>
          </button>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="h-1.5 bg-emerald-600" />
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-slate-900 font-display font-bold text-lg">
                    {selectedArea ? 'Editar Área' : 'Nova Área Territorial'}
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-slate-500">Defina as características da microárea para manter o território bem organizado.</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  aria-label="Fechar modal de área"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div
                  id="area-modal-error"
                  role="alert"
                  aria-live="assertive"
                  className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleSaveArea} className="space-y-4">
                <div>
                  <label htmlFor="area-name-input" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Nome da Microárea *
                  </label>
                  <input
                    type="text"
                    required
                    value={areaNome}
                    onChange={(e) => setAreaNome(e.target.value)}
                    maxLength={100}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
                    placeholder="Ex: Jardim Primavera / Microárea 02"
                    id="area-name-input"
                    aria-required="true"
                    aria-invalid={!!modalError}
                    aria-describedby={modalError ? 'area-modal-error' : undefined}
                  />
                </div>

                <div>
                  <label htmlFor="area-desc-input" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Breve Descrição / Pontos de Referência (Opcional)
                  </label>
                  <textarea
                    value={areaDescricao}
                    onChange={(e) => setAreaDescricao(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
                    placeholder="Ex: Próximo à praça central e ao posto de saúde secundário."
                    id="area-desc-input"
                  />
                  <div className="mt-1 text-right font-mono text-[10px] text-slate-400">
                    {areaDescricao.length}/500 caracteres
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-5 mt-6">
                  <button
                    type="button"
                    disabled={savingArea}
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    disabled={savingArea}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-emerald-500/10 transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="h-1.5 bg-rose-600" />
            <div className="p-6">
              <div className="flex gap-3 text-rose-600 items-start mb-4">
                <div className="p-2 bg-rose-50 rounded-xl shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-slate-900 text-lg leading-6">Excluir Área: {areaToDelete.nome}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-500">Essa operação causará alterações em cascata irreversíveis.</p>
                </div>
              </div>

              <div className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex items-center justify-between gap-4 font-semibold text-slate-700">
                  <span>Ruas pertencentes a esta área:</span>
                  <span className="font-mono text-rose-600">{ruas.filter(r => r.areaId === areaToDelete.id).length} cadastros</span>
                </div>
                <p className="leading-6 text-slate-500">
                  As ruas pertencentes a esta microárea serão excluídas permanentemente.
                </p>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3 font-semibold text-slate-700">
                  <span>Moradores associados:</span>
                  <span className="font-mono text-emerald-600">{pessoas.filter(p => p.areaId === areaToDelete.id).length} cadastros</span>
                </div>
                <p className="leading-6 text-slate-500">
                  Os moradores associados continuarão cadastrados, contudo os campos correspondentes à Área e Rua serão limpos para reatribuição.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  disabled={deletingCascaded}
                  onClick={() => setIsCascadeDeleteOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deletingCascaded}
                  onClick={executeCascadeDelete}
                  className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-rose-500/10 transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 active:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
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
