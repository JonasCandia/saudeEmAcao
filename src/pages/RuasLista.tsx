import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc,
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { Area, Rua, Pessoa, Atendimento, OperationType } from '../types';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Route, 
  AlertTriangle, 
  FileText, 
  Eye, 
  CalendarDays, 
  Loader2, 
  CheckCircle, 
  Map, 
  ChevronRight,
  Home,
  Users
} from 'lucide-react';

export const RuasLista: React.FC = () => {
  const { user } = useAuth();

  const [areas, setAreas] = useState<Area[]>([]);
  const [ruas, setRuas] = useState<Rua[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters State
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('todos');

  // Modal Create/Edit Rua State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRua, setSelectedRua] = useState<Rua | null>(null); // Null for create, Rua for edit
  const [ruaNome, setRuaNome] = useState('');
  const [ruaAreaId, setRuaAreaId] = useState('');
  const [savingRua, setSavingRua] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Deletion Check Modal
  const [ruaToDelete, setRuaToDelete] = useState<Rua | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingRua, setDeletingRua] = useState(false);

  // View Residents Modal
  const [selectedRuaForView, setSelectedRuaForView] = useState<Rua | null>(null);
  const [isViewResidentsOpen, setIsViewResidentsOpen] = useState(false);

  // 1. Listen real-time to Areas, Ruas, Persons, Atendimentos
  useEffect(() => {
    if (!user) return;

    // Fetch Areas
    const qAreas = query(collection(db, 'areas'), where('ownerId', '==', user.uid));
    const unsubscribeAreas = onSnapshot(qAreas, (snapshot) => {
      const list: Area[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Area);
      });
      list.sort((a, b) => a.nome.localeCompare(b.nome));
      setAreas(list);
    }, () => {});

    // Fetch Ruas
    const qRuas = query(collection(db, 'ruas'), where('ownerId', '==', user.uid));
    const unsubscribeRuas = onSnapshot(qRuas, (snapshot) => {
      const list: Rua[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Rua);
      });
      list.sort((a, b) => a.nome.localeCompare(b.nome));
      setRuas(list);
      setLoading(false);
    }, (err) => {
      setLoading(false);
      try {
        handleFirestoreError(err, OperationType.LIST, 'ruas');
      } catch (formattedError: any) {
        setErrorMsg(JSON.parse(formattedError.message).error);
      }
    });

    // Fetch Pessoas
    const qPessoas = query(collection(db, 'pessoas'), where('ownerId', '==', user.uid));
    const unsubscribePessoas = onSnapshot(qPessoas, (snapshot) => {
      const list: Pessoa[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Pessoa);
      });
      setPessoas(list);
    }, () => {});

    // Fetch Atendimentos
    const qAtendimentos = query(collection(db, 'atendimentos'), where('ownerId', '==', user.uid));
    const unsubscribeAtendimentos = onSnapshot(qAtendimentos, (snapshot) => {
      const list: Atendimento[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Atendimento);
      });
      setAtendimentos(list);
    }, () => {});

    return () => {
      unsubscribeAreas();
      unsubscribeRuas();
      unsubscribePessoas();
      unsubscribeAtendimentos();
    };
  }, [user]);

  // Handle open creation modal
  const openCreateModal = () => {
    setSelectedRua(null);
    setRuaNome('');
    // Select first area as default if available
    setRuaAreaId(areas.length > 0 ? (areas[0].id || '') : '');
    setModalError(null);
    setIsModalOpen(true);
  };

  // Handle open edit modal
  const openEditModal = (rua: Rua) => {
    setSelectedRua(rua);
    setRuaNome(rua.nome);
    setRuaAreaId(rua.areaId);
    setModalError(null);
    setIsModalOpen(true);
  };

  // Submit create or edit
  const handleSaveRua = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!ruaNome.trim()) {
      setModalError('O nome da rua é obrigatório.');
      return;
    }

    if (!ruaAreaId) {
      setModalError('Selecione uma área territorial para vincular esta rua.');
      return;
    }

    setSavingRua(true);
    setModalError(null);

    try {
      const areaObj = areas.find(a => a.id === ruaAreaId);
      const areaName = areaObj ? areaObj.nome : '';

      if (selectedRua && selectedRua.id) {
        // Update Rua
        const ruaRef = doc(db, 'ruas', selectedRua.id);
        await updateDoc(ruaRef, {
          nome: ruaNome.trim(),
          areaId: ruaAreaId
        });

        // Update flat representations on people associated with this street
        const linkedPessoas = pessoas.filter(p => p.ruaId === selectedRua.id);
        for (const p of linkedPessoas) {
          if (p.id) {
            await updateDoc(doc(db, 'pessoas', p.id), {
              rua: ruaNome.trim(),
              areaAtendimento: areaName // If area also changed
            });
          }
        }
      } else {
        // Create Rua
        const newRuaRef = doc(collection(db, 'ruas'));
        const payload: Rua = {
          nome: ruaNome.trim(),
          areaId: ruaAreaId,
          createdAt: serverTimestamp(),
          ownerId: user.uid
        };
        await setDoc(newRuaRef, payload);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      try {
        handleFirestoreError(err, selectedRua ? OperationType.UPDATE : OperationType.CREATE, 'ruas');
      } catch (formattedError: any) {
        setModalError(JSON.parse(formattedError.message).error);
      }
    } finally {
      setSavingRua(false);
    }
  };

  // Open deletion modal
  const openDeleteModal = (rua: Rua) => {
    setRuaToDelete(rua);
    setIsDeleteModalOpen(true);
  };

  // Execute deletion
  const executeDeleteRua = async () => {
    if (!ruaToDelete || !ruaToDelete.id) return;
    setDeletingRua(true);

    try {
      // Unlink residents first
      const linkedPessoas = pessoas.filter(p => p.ruaId === ruaToDelete.id);
      for (const p of linkedPessoas) {
        if (p.id) {
          await updateDoc(doc(db, 'pessoas', p.id), {
            ruaId: null
          });
        }
      }

      await deleteDoc(doc(db, 'ruas', ruaToDelete.id));
      setIsDeleteModalOpen(false);
      setRuaToDelete(null);
    } catch (err: any) {
      alert('Falha ao excluir rua: ' + err.message);
    } finally {
      setDeletingRua(false);
    }
  };

  // Collective schedule action: sets visitaPendente: true for all street residents
  const scheduleCollectiveVisit = async (rua: Rua) => {
    if (!rua.id) return;
    const residents = pessoas.filter(p => p.ruaId === rua.id);
    if (residents.length === 0) {
      alert('Não há moradores cadastrados nesta rua para agendar visitas.');
      return;
    }

    const confirmAction = window.confirm(
      `Agendar visita de saúde para todos os ${residents.length} moradores da rua "${rua.nome}"? Eles serão marcados como prioritários no planejamento de visitas.`
    );

    if (!confirmAction) return;

    try {
      for (const res of residents) {
        if (res.id) {
          await updateDoc(doc(db, 'pessoas', res.id), {
            visitaPendente: true
          });
        }
      }
      alert(`Agendamento de visita coletiva realizado com sucesso para a rua ${rua.nome}!`);
    } catch (err: any) {
      alert('Falha ao agendar visita coletiva: ' + err.message);
    }
  };

  // Dynamic values computation helpers:
  const getAreaName = (areaId: string) => {
    const area = areas.find(a => a.id === areaId);
    return area ? area.nome : 'Área não localizada';
  };

  const getStreetLastVisit = (ruaId: string) => {
    const streetPeopleIds = pessoas.filter(p => p.ruaId === ruaId).map(p => p.id);
    if (streetPeopleIds.length === 0) return 'Indisponível';
    
    // Filter atendimentos for current street residents
    const streetAtendimentos = atendimentos.filter(a => streetPeopleIds.includes(a.pessoaId));
    if (streetAtendimentos.length === 0) return 'Nunca visitada';
    
    let maxTime = 0;
    streetAtendimentos.forEach(a => {
      // Handle Date or Firestore Timestamp safely
      const time = a.dataVisita?.seconds ? a.dataVisita.seconds * 1000 : new Date(a.dataVisita).getTime();
      if (time > maxTime) maxTime = time;
    });

    if (maxTime === 0) return 'Nunca visitada';
    return new Date(maxTime).toLocaleDateString('pt-BR');
  };

  // Filtered Ruas output
  const filteredRuas = useMemo(() => {
    if (selectedAreaFilter === 'todos') return ruas;
    return ruas.filter(r => r.areaId === selectedAreaFilter);
  }, [ruas, selectedAreaFilter]);

  // View residents modal handler
  const openViewResidents = (rua: Rua) => {
    setSelectedRuaForView(rua);
    setIsViewResidentsOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Carregando ruas de atuação...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl tracking-tight text-slate-900">
            Gerenciamento de Ruas (Logradouros)
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Cadastre e acompanhe os logradouros, domicilios e as últimas visitas preventivas.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-600/10 transition-all self-start sm:self-auto cursor-pointer"
          id="btn-new-rua"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Rua</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* FILTER BUTTONS AND VIEW SELECTORS */}
      <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-3xs flex-wrap">
        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Filtrar por Área Territorial:</span>
        <select
          value={selectedAreaFilter}
          onChange={(e) => setSelectedAreaFilter(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-sm font-semibold rounded-lg text-slate-700 outline-none focus:border-emerald-500 cursor-pointer"
          id="ruas-area-filter"
        >
          <option value="todos">Todas as Áreas ({ruas.length})</option>
          {areas.map(a => (
            <option key={a.id} value={a.id}>
              {a.nome} ({ruas.filter(r => r.areaId === a.id).length})
            </option>
          ))}
        </select>
      </div>

      {/* MAIN TABLE LAYOUT */}
      {filteredRuas.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[10px] font-bold bg-slate-50/70">
                  <th className="py-4 px-6">Microárea Vinculada</th>
                  <th className="py-4 px-6">Logradouro / Rua</th>
                  <th className="py-4 px-6 text-center">Nº Domiciliados</th>
                  <th className="py-4 px-6 text-center">Última Visita na Rua</th>
                  <th className="py-4 px-6 text-right">Ações Técnicas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredRuas.map((rua) => {
                  const residentsCount = pessoas.filter(p => p.ruaId === rua.id).length;
                  const lastVisitText = getStreetLastVisit(rua.id || '');
                  return (
                    <tr key={rua.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-4 px-6 font-semibold text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <Map className="w-3.5 h-3.5 text-emerald-600" />
                          {getAreaName(rua.areaId)}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-bold text-slate-900 group">
                        <span className="flex items-center gap-1.5">
                          <Route className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                          {rua.nome}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className="font-mono bg-slate-50 rounded-lg px-2 py-1 text-slate-600 font-bold border border-slate-100">
                          {residentsCount}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`font-mono text-xs px-2.5 py-1 rounded-full font-bold border ${
                          lastVisitText === 'Nunca visitada' ? 'bg-orange-50 text-orange-650 border-orange-100' :
                          lastVisitText === 'Indisponível' ? 'bg-slate-50 text-slate-400 border-slate-100' :
                          'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}>
                          {lastVisitText}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2.5">
                          <button
                            onClick={() => openViewResidents(rua)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                            title="Ver moradores desta rua"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Contatos</span>
                          </button>

                          <button
                            onClick={() => scheduleCollectiveVisit(rua)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg cursor-pointer transition-colors border border-emerald-100"
                            title="Indicar que toda a rua precisa receber visita preventivamente"
                          >
                            <CalendarDays className="w-3.5 h-3.5" />
                            <span>Agendar Rua</span>
                          </button>

                          <button
                            onClick={() => openEditModal(rua)}
                            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg cursor-pointer"
                            title="Editar nome ou área da rua"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => openDeleteModal(rua)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            title="Excluir rua"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="py-20 text-center bg-white rounded-2xl border border-slate-200">
          <div className="p-4 bg-slate-50 text-slate-400 inline-block rounded-2xl mb-4">
            <Route className="w-10 h-10" />
          </div>
          <h3 className="font-display font-semibold text-slate-705 text-lg">Nenhum logradouro localizado</h3>
          <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
            Cadastre as ruas sob seu monitoramento para organizar suas programações periódicas por setores e logradouros.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-sm rounded-xl transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Rua</span>
          </button>
        </div>
      )}

      {/* FORM MODAL FOR CREATE/EDIT RUA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-150 overflow-hidden">
            <div className="h-1.5 bg-emerald-600" />
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-slate-900 font-display font-bold text-lg">
                    {selectedRua ? 'Editar Rua / Beco' : 'Cadastrar Nova Rua'}
                  </h3>
                  <p className="text-slate-400 text-xs mt-0.5 font-sans">Cadastre e atribua as ruas para indexação de domicilios.</p>
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

              {areas.length === 0 ? (
                <div className="p-4 text-center space-y-4">
                  <div className="p-3 bg-amber-50 text-amber-750 text-xs border border-amber-100 rounded-xl leading-relaxed">
                    Você precisa possuir ao menos uma microárea cadastrada antes de vincular ruas. Cadastre uma microárea primeiro!
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      alert('Vá para a página de Áreas e cadastre uma área primeiro.');
                    }}
                    className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold"
                  >
                    OK, entendi
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSaveRua} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Microárea Vinculada *
                    </label>
                    <select
                      required
                      value={ruaAreaId}
                      onChange={(e) => setRuaAreaId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-205 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-700 outline-none transition-all cursor-pointer font-sans"
                    >
                      {areas.map(a => (
                        <option key={a.id} value={a.id}>{a.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Nome do Logradouro / Rua *
                    </label>
                    <input
                      type="text"
                      required
                      value={ruaNome}
                      onChange={(e) => setRuaNome(e.target.value)}
                      maxLength={150}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-700 outline-none transition-all"
                      placeholder="Ex: Rua das Flores / Beco Verde 2"
                      id="rua-name-input"
                    />
                  </div>

                  <div className="flex justify-end gap-3 border-t border-slate-100 pt-5 mt-6">
                    <button
                      type="button"
                      disabled={savingRua}
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 hover:bg-slate-150 rounded-xl text-slate-600 font-bold text-sm transition-all cursor-pointer"
                    >
                      Descartar
                    </button>
                    <button
                      type="submit"
                      disabled={savingRua}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-500/10 transition-all cursor-pointer"
                    >
                      <span>{savingRua ? 'Gravando...' : 'Salvar Alterações'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW MORADORES (POPUP LISTING) */}
      {isViewResidentsOpen && selectedRuaForView && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-150 overflow-hidden">
            <div className="h-1.5 bg-emerald-650" />
            <div className="p-6">
              <div className="flex justify-between items-start mb-5 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-lg">Moradores na Rua {selectedRuaForView.nome}</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Microárea: {getAreaName(selectedRuaForView.areaId)}</p>
                </div>
                <button
                  onClick={() => setIsViewResidentsOpen(false)}
                  className="hover:bg-slate-100 rounded text-slate-400 font-semibold p-1 px-1.5 text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
                {pessoas.filter(p => p.ruaId === selectedRuaForView.id).length > 0 ? (
                  pessoas.filter(p => p.ruaId === selectedRuaForView.id).map((pessoa) => (
                    <div 
                      key={pessoa.id}
                      className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-150 rounded-xl transition-all cursor-pointer"
                      onClick={() => {
                        setIsViewResidentsOpen(false);
                        window.location.href = `/pessoa/${pessoa.id}`; // Smooth redirect
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-white text-emerald-600 rounded-lg border border-slate-200">
                          <Home className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{pessoa.nome}</p>
                          <p className="text-[11px] text-slate-400 font-medium">Casa/Complemento: {pessoa.casa} • {pessoa.idade} anos</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-405 italic text-sm">
                    Não há pessoas cadastradas com domicílio fixado nesta rua ainda.
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsViewResidentsOpen(false)}
                  className="px-5 py-2 hover:bg-slate-100 text-slate-600 rounded-xl font-bold text-sm transition-all cursor-pointer"
                >
                  Fechar Painel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RUA ASSOCIATED MEMBERS DELETE VERIFICATION MODAL */}
      {isDeleteModalOpen && ruaToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-150 overflow-hidden">
            <div className="h-1.5 bg-rose-600" />
            <div className="p-6">
              <div className="flex gap-3 text-rose-600 items-start mb-4">
                <div className="p-1.5 bg-rose-50 rounded-lg shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-slate-900 text-lg">Excluir Rua: {ruaToDelete.nome}</h3>
                  <p className="text-slate-500 text-xs mt-1">Isso removerá a rua permanentemente.</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 mb-5 text-xs text-slate-500 space-y-2 leading-relaxed">
                <p>
                  <strong>Total de moradores associados na rua:</strong> {pessoas.filter(p => p.ruaId === ruaToDelete.id).length}
                </p>
                <p>
                  Confirmando a exclusão desta rua, os moradores vinculados a ela continuarão salvos, contudo perderão a referência de Rua em suas fichas cadastrais (ficando em branco para posterior edição).
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  disabled={deletingRua}
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-150 text-slate-650 rounded-xl font-bold text-sm transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deletingRua}
                  onClick={executeDeleteRua}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer animate-pulse"
                  id="btn-confirm-delete-rua"
                >
                  <span>{deletingRua ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
