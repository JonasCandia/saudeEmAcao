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
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { Pessoa, Atendimento, Area, Rua, OperationType, Territorio } from '../types';
import { canAccessTerritory } from '../utils/territoryScope';
import { 
  Calendar,
  Search, 
  CheckCircle, 
  AlertCircle, 
  CalendarDays, 
  Clock, 
  HeartPlus, 
  MapPin, 
  CheckSquare, 
  Square, 
  ChevronRight,
  Filter,
  Stethoscope,
  ChevronDown
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const VisitasPendentes: React.FC = () => {
  const { user, areaIds, ruaIdsExtras, legacyAccess } = useAuth();

  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [ruas, setRuas] = useState<Rua[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters State
  const [filterArea, setFilterArea] = useState('todos');
  const [filterRua, setFilterRua] = useState('todos');
  const [filterDoenca, setFilterDoenca] = useState('todos');
  const [filterDias, setFilterDias] = useState('todos'); // 'todos', '>30', '>60'
  const [filterPrioridade, setFilterPrioridade] = useState('todos'); // 'todos', 'Alta', 'Media', 'Baixa'
  const [searchTerm, setSearchTerm] = useState('');

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Single Atendimento Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPessoaForVisit, setSelectedPessoaForVisit] = useState<Pessoa | null>(null);
  const [modalDataVisita, setModalDataVisita] = useState(new Date().toISOString().split('T')[0]);
  const [modalDescricao, setModalDescricao] = useState('');
  const [savingVisit, setSavingVisit] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Bulk Register Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkDescricao, setBulkDescricao] = useState('Atendimento realizado em visita coletiva e acompanhamento regional.');
  const [bulkDataVisita, setBulkDataVisita] = useState(new Date().toISOString().split('T')[0]);
  const [savingBulk, setSavingBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const pessoaChunks = useMemo(() => {
    const ids = pessoas.map((p) => p.id).filter((id): id is string => Boolean(id));
    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += 30) {
      chunks.push(ids.slice(index, index + 30));
    }
    return chunks;
  }, [pessoas]);

  // 1. Fetch data in real-time
  useEffect(() => {
    if (!user) return;

    // Listen to Territorio (areas + ruas from single doc)
    const territorioRef = doc(db, 'territorio', user.uid);
    const unsubscribeTerritorio = onSnapshot(territorioRef, (snap) => {
      const data = snap.exists()
        ? (snap.data() as Territorio)
        : { areas: {}, ruas: {}, casas: {}, ownerId: user.uid };

      const areasList: Area[] = Object.entries(data.areas || {})
        .map(([id, v]) => ({ id, ownerId: user.uid, nome: v.nome }))
        .filter(a => legacyAccess || areaIds.includes(a.id || ''));

      const ruasList: Rua[] = Object.entries(data.ruas || {})
        .map(([id, v]) => ({ id, ownerId: user.uid, nome: v.nome, areaId: v.areaId }))
        .filter(r => canAccessTerritory({
          areaId: r.areaId,
          ruaId: r.id,
          scope: { legacyAccess, areaIds, ruaIdsExtras },
        }));

      setAreas(areasList);
      setRuas(ruasList);
    });

    // Listen to Patients
    const qPessoas = query(collection(db, 'pessoas'), where('ownerId', '==', user.uid));
    const unsubscribePessoas = onSnapshot(qPessoas, (snapshot) => {
      const list: Pessoa[] = [];
      snapshot.forEach(doc => {
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
      setLoading(false);
    }, (err) => {
      setLoading(false);
      try {
        handleFirestoreError(err, OperationType.LIST, 'pessoas');
      } catch (formattedError: any) {
        setErrorMsg(JSON.parse(formattedError.message).error);
      }
    });

    return () => {
      unsubscribeTerritorio();
      unsubscribePessoas();
    };
  }, [user, legacyAccess, areaIds, ruaIdsExtras]);

  useEffect(() => {
    if (!user) return;

    if (pessoaChunks.length === 0) {
      setAtendimentos([]);
      return;
    }

    const unsubscribeAtendimentosList = pessoaChunks.map((chunk) => {
      const qAtendimentos = query(
        collection(db, 'atendimentos'),
        where('ownerId', '==', user.uid),
        where('pessoaId', 'in', chunk)
      );

      return onSnapshot(qAtendimentos, (snapshot) => {
        setAtendimentos((current) => {
          const next = current.filter((item) => !chunk.includes(item.pessoaId));
          snapshot.forEach(doc => { next.push({ id: doc.id, ...doc.data() } as Atendimento); });
          return next;
        });
      });
    });

    return () => {
      unsubscribeAtendimentosList.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, pessoaChunks]);

  // Aggregate Helper: gets the last visit and days elapsed for a resident
  const getPessoaVisitMetrics = (pessoaId: string) => {
    const pVisits = atendimentos.filter(a => a.pessoaId === pessoaId);
    if (pVisits.length === 0) {
      return { lastVisitDate: null, daysSince: 9999, neverVisited: true };
    }

    let maxTime = 0;
    let newestVisit: Atendimento | null = null;
    pVisits.forEach(v => {
      const time = v.dataVisita?.seconds ? v.dataVisita.seconds * 1000 : new Date(v.dataVisita).getTime();
      if (time > maxTime) {
        maxTime = time;
        newestVisit = v;
      }
    });

    if (!newestVisit || maxTime === 0) {
      return { lastVisitDate: null, daysSince: 9999, neverVisited: true };
    }

    const lastVisitDate = new Date(maxTime);
    const msDiff = Date.now() - lastVisitDate.getTime();
    const daysSince = Math.floor(msDiff / (1000 * 60 * 60 * 24));
    return { lastVisitDate, daysSince, neverVisited: false };
  };

  // Maps illnesses and schedules back to Priority score
  const getPessoaPriorityInfo = (pessoa: Pessoa) => {
    const { daysSince, neverVisited } = getPessoaVisitMetrics(pessoa.id || '');
    
    // Check for chronic conditions (any disease that's not 'Nenhuma')
    const hasChronic = pessoa.doencas && pessoa.doencas.length > 0 && !pessoa.doencas.includes('Nenhuma');

    // Rule: Explicitly scheduled is always Alta priority
    if (pessoa.visitaPendente === true) {
      return { rating: 'Alta', color: 'text-rose-700 bg-rose-50 border-rose-100', text: 'Agendada (Urgente)' };
    }

    // Rule 1: High Priority (Alta)
    // Over 60 days without visit OR has chronic condition and over 30 days without visit.
    if (daysSince > 60 || neverVisited || (hasChronic && (daysSince > 30 || neverVisited))) {
      return { rating: 'Alta', color: 'text-rose-700 bg-rose-50 border-rose-100', text: 'Alta Prioridade' };
    }

    // Rule 2: Medium Priority (Média)
    // Between 30 and 59 days without visit (without chronic disease or active schedules)
    if (daysSince >= 30 && daysSince <= 59) {
      return { rating: 'Média', color: 'text-amber-700 bg-amber-50 border-amber-100', text: 'Média Prioridade' };
    }

    // Rule 3: Low Priority (Baixa)
    // Less than 30 days without visit
    return { rating: 'Baixa', color: 'text-emerald-700 bg-emerald-50 border-emerald-100', text: 'Em Dia (Baixa)' };
  };

  // Compiled prioritised list representation
  const analyzedPessoas = useMemo(() => {
    return pessoas.map((p) => {
      const { lastVisitDate, daysSince, neverVisited } = getPessoaVisitMetrics(p.id || '');
      const priorityInfo = getPessoaPriorityInfo(p);
      return {
        ...p,
        lastVisitDate,
        daysSince,
        neverVisited,
        priorityRating: priorityInfo.rating,
        priorityStyle: priorityInfo.color,
        priorityText: priorityInfo.text
      };
    });
  }, [pessoas, atendimentos]);

  // Master Filtering on all conditions
  const filteredAndSortedPessoas = useMemo(() => {
    let list = [...analyzedPessoas];

    // Filter search text
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(p => p.nome.toLowerCase().includes(term));
    }

    // Filter Area
    if (filterArea !== 'todos') {
      list = list.filter(p => p.areaId === filterArea);
    }

    // Filter Rua
    if (filterRua !== 'todos') {
      list = list.filter(p => p.ruaId === filterRua);
    }

    // Filter Chronic Disease
    if (filterDoenca !== 'todos') {
      list = list.filter(p => p.doencas && p.doencas.includes(filterDoenca));
    }

    // Filter Days interval
    if (filterDias !== 'todos') {
      if (filterDias === '>30') {
        list = list.filter(p => p.daysSince > 30 || p.neverVisited);
      } else if (filterDias === '>60') {
        list = list.filter(p => p.daysSince > 60 || p.neverVisited);
      }
    }

    // Filter Priority Rating
    if (filterPrioridade !== 'todos') {
      list = list.filter(p => p.priorityRating === filterPrioridade);
    }

    // SORT SYSTEM:
    // 1. Scheduled (`visitaPendente: true`) and never visited at the very top
    // 2. Days since last visit descending (most elapsed first)
    list.sort((a, b) => {
      if (a.visitaPendente && !b.visitaPendente) return -1;
      if (!a.visitaPendente && b.visitaPendente) return 1;
      return b.daysSince - a.daysSince;
    });

    return list;
  }, [analyzedPessoas, searchTerm, filterArea, filterRua, filterDoenca, filterDias, filterPrioridade]);

  // Bulk toggle Selection helper
  const handleSelectToggle = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const visibleIds = filteredAndSortedPessoas.map(p => p.id).filter(id => id !== undefined) as string[];
      setSelectedIds(visibleIds);
    } else {
      setSelectedIds([]);
    }
  };

  // Open single visita register modal
  const openSingleVisitModal = (pessoa: Pessoa) => {
    setSelectedPessoaForVisit(pessoa);
    setModalDataVisita(new Date().toISOString().split('T')[0]);
    setModalDescricao('');
    setModalError(null);
    setIsModalOpen(true);
  };

  // Single visita creation submit
  const handleRegisterSingleVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPessoaForVisit || !selectedPessoaForVisit.id) return;

    if (!modalDescricao.trim()) {
      setModalError('Adicione um relatório/descrição sobre a visita.');
      return;
    }

    setSavingVisit(true);
    setModalError(null);

    try {
      const [year, month, day] = modalDataVisita.split('-').map(Number);
      const visitLocalDate = new Date(year, month - 1, day, 12, 0, 0);

      // 1. Create subdocument
      const newVisitRef = doc(collection(db, 'atendimentos'));
      await setDoc(newVisitRef, {
        pessoaId: selectedPessoaForVisit.id,
        dataVisita: Timestamp.fromDate(visitLocalDate),
        descricao: modalDescricao.trim(),
        createdAt: serverTimestamp(),
        ownerId: user.uid
      });

      // 2. Set scheduled flag to false in patient doc
      await updateDoc(doc(db, 'pessoas', selectedPessoaForVisit.id), {
        visitaPendente: false,
        updatedAt: serverTimestamp()
      });

      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'atendimentos');
      } catch (formattedError: any) {
        setModalError(JSON.parse(formattedError.message).error);
      }
    } finally {
      setSavingVisit(false);
    }
  };

  // Open Bulk Register Modal
  const openBulkRegister = () => {
    if (selectedIds.length === 0) return;
    setBulkDataVisita(new Date().toISOString().split('T')[0]);
    setBulkDescricao('Atendimento realizado em visita coletiva e acompanhamento regional.');
    setBulkError(null);
    setIsBulkModalOpen(true);
  };

  // Submit bulk visit confirmations
  const handleSaveBulkVisits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || selectedIds.length === 0) return;

    setSavingBulk(true);
    setBulkError(null);

    try {
      const [year, month, day] = bulkDataVisita.split('-').map(Number);
      const visitLocalDate = new Date(year, month - 1, day, 12, 0, 0);

      // Batch all writes for atomicity (max 500 ops; 2 ops per person)
      const batch = writeBatch(db);
      for (const id of selectedIds) {
        // 1. Create Atendimento doc
        const newVisitRef = doc(collection(db, 'atendimentos'));
        batch.set(newVisitRef, {
          pessoaId: id,
          dataVisita: Timestamp.fromDate(visitLocalDate),
          descricao: bulkDescricao.trim(),
          createdAt: serverTimestamp(),
          ownerId: user.uid
        });

        // 2. Clear pending status on Person
        batch.update(doc(db, 'pessoas', id), {
          visitaPendente: false,
          updatedAt: serverTimestamp()
        });
      }
      await batch.commit();

      // Complete operations
      setSelectedIds([]);
      setIsBulkModalOpen(false);
      alert('Visitas registradas com sucesso para todos os moradores selecionados!');
    } catch (err: any) {
      console.error(err);
      setBulkError('Falha ao gravar registros em lote: ' + err.message);
    } finally {
      setSavingBulk(false);
    }
  };

  // Reset all filters easily
  const handleClearFilters = () => {
    setFilterArea('todos');
    setFilterRua('todos');
    setFilterDoenca('todos');
    setFilterDias('todos');
    setFilterPrioridade('todos');
    setSearchTerm('');
  };

  // Get localized names
  const getAreaName = (areaId?: string) => {
    const item = areas.find(a => a.id === areaId);
    return item ? item.nome : 'N/A';
  };

  const getRuaName = (ruaId?: string) => {
    const item = ruas.find(r => r.id === ruaId);
    return item ? item.nome : 'N/A';
  };

  return (
    <div className="space-y-6">
      {/* Upper action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl tracking-tight text-slate-900">
            Acompanhamento de Próximas Visitas
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Planejamento inteligente priorizando residentes sem consultas recentes e focando em agravos crônicos.
          </p>
        </div>

        {selectedIds.length > 0 && (
          <button
            onClick={openBulkRegister}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-600/10 transition-all self-start sm:self-auto cursor-pointer animate-bounce"
            id="btn-bulk-visit"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Visitar Selecionados ({selectedIds.length})</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* FILTER CONSOLE CONTAINER */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Filter className="w-4 h-4 text-emerald-600" />
          <h3 className="font-display font-bold text-slate-800 text-sm">Filtros Avançados e Priorização</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Microárea</label>
            <select
              value={filterArea}
              onChange={(e) => {
                setFilterArea(e.target.value);
                setFilterRua('todos'); // Reset street filter on area change
              }}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white text-xs font-semibold rounded-lg text-slate-705 outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="todos">Todas as Áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Logradouro / Rua</label>
            <select
              value={filterRua}
              onChange={(e) => setFilterRua(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white text-xs font-semibold rounded-lg text-slate-705 outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="todos">Todas as Ruas</option>
              {ruas
                .filter(r => filterArea === 'todos' || r.areaId === filterArea)
                .map(r => <option key={r.id} value={r.id}>{r.nome}</option>)
              }
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Condição Crônica</label>
            <select
              value={filterDoenca}
              onChange={(e) => setFilterDoenca(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white text-xs font-semibold rounded-lg text-slate-705 outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="todos">Qualquer Doença</option>
              <option value="Hipertensão">Hipertensão</option>
              <option value="Diabetes">Diabetes</option>
              <option value="Asma">Asma</option>
              <option value="Obesidade">Obesidade</option>
              <option value="Outro">Outra</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Intervalo sem Visita</label>
            <select
              value={filterDias}
              onChange={(e) => setFilterDias(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white text-xs font-semibold rounded-lg text-slate-705 outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="todos">Qualquer intervalo</option>
              <option value=">30">Mais de 30 dias ({'>'}30d)</option>
              <option value=">60">Mais de 60 dias ({'>'}60d)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nível de Prioridade</label>
            <select
              value={filterPrioridade}
              onChange={(e) => setFilterPrioridade(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white text-xs font-semibold rounded-lg text-slate-705 outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="todos">Ver Todas ({pessoas.length})</option>
              <option value="Alta">Alta Prioridade</option>
              <option value="Média">Média</option>
              <option value="Baixa">Em Dia (Baixa)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-1 justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar morador por nome..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 text-xs font-medium text-slate-700 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:bg-white transition-all text-ellipsis"
            />
          </div>

          <button
            onClick={handleClearFilters}
            className="text-xs font-bold text-slate-450 hover:text-emerald-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 self-end sm:self-auto cursor-pointer"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-sm">Atualizando fila de prioridades...</p>
        </div>
      ) : (
        <>
          {filteredAndSortedPessoas.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="md:hidden divide-y divide-slate-100">
                {filteredAndSortedPessoas.map((p) => {
                  const isSelected = selectedIds.includes(p.id || '');
                  return (
                    <div
                      key={p.id}
                      className={`p-4 space-y-3 ${isSelected ? 'bg-emerald-50/20' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link to={`/pessoa/${p.id}`} className="font-semibold text-slate-900 text-sm block truncate hover:text-emerald-700">
                            {p.nome}
                          </Link>
                          <p className="text-[11px] text-slate-500 mt-1 truncate">
                            Casa: {p.casa}, {getRuaName(p.ruaId)}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            Microárea: {getAreaName(p.areaId)}
                          </p>
                        </div>

                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectToggle(p.id || '')}
                          className="rounded border-slate-350 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer mt-1"
                        />
                      </div>

                      <div className="flex flex-wrap gap-1">
                        <span className={`inline-flex px-2.5 py-1 text-[10px] font-bold rounded-lg border ${p.priorityStyle}`}>
                          {p.priorityText}
                        </span>
                        {p.doencas?.map(d => (
                          <span key={d} className="text-[9px] font-semibold bg-slate-50 border border-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            {d}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <p className="font-mono text-xs font-bold text-slate-700">
                            {p.lastVisitDate ? p.lastVisitDate.toLocaleDateString('pt-BR') : 'Nunca visitado'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {p.neverVisited ? 'Cadastro recente' : `${p.daysSince} dias transcorridos`}
                          </p>
                        </div>

                        <button
                          onClick={() => openSingleVisitModal(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-emerald-100"
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          <span>Registrar</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-bold bg-slate-50/70">
                      <th className="py-4 px-6 text-center w-12">
                        <input
                          type="checkbox"
                          checked={selectedIds.length > 0 && selectedIds.length === filteredAndSortedPessoas.length}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="rounded border-slate-350 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        />
                      </th>
                      <th className="py-4 px-4 font-bold">Nível Prioridade</th>
                      <th className="py-4 px-4">Morador</th>
                      <th className="py-4 px-4">Domicílio (Área/Rua)</th>
                      <th className="py-4 px-4 text-center">Último Atendimento</th>
                      <th className="py-4 px-4 text-right">Caderno de Campo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150/70 text-sm">
                    {filteredAndSortedPessoas.map((p) => {
                      const isSelected = selectedIds.includes(p.id || '');
                      return (
                        <tr 
                          key={p.id} 
                          className={`hover:bg-slate-50/40 transition-colors ${
                            isSelected ? 'bg-emerald-50/20' : ''
                          }`}
                        >
                          <td className="py-4 px-6 text-center w-12">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectToggle(p.id || '')}
                              className="rounded border-slate-350 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="py-4 px-4">
                            <span className={`inline-flex px-2.5 py-1 text-[10px] font-bold rounded-lg border ${p.priorityStyle}`}>
                              {p.priorityText}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="font-semibold text-slate-850">
                              <Link to={`/pessoa/${p.id}`} className="hover:text-emerald-700 hover:underline">
                                {p.nome}
                              </Link>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {p.doencas?.map(d => (
                                <span key={d} className="text-[9px] font-semibold bg-slate-50 border border-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                  {d}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-start gap-1 text-xs text-slate-500 max-w-[200px] truncate">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <div className="truncate">
                                <p className="font-bold text-slate-700 truncate">{getRuaName(p.ruaId)}</p>
                                <p className="text-slate-400 truncate">Casa: {p.casa} | Microárea: {getAreaName(p.areaId)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <p className="font-mono text-xs font-bold text-slate-650">
                              {p.lastVisitDate ? p.lastVisitDate.toLocaleDateString('pt-BR') : 'Nunca visitado'}
                            </p>
                            <p className="text-[10px] text-slate-405 font-mono mt-0.5">
                              {p.neverVisited ? 'Cadastro recente' : `${p.daysSince} dias transcorridos`}
                            </p>
                          </td>
                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => openSingleVisitModal(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-750 font-bold text-xs rounded-xl transition-all cursor-pointer border border-emerald-100"
                            >
                              <Stethoscope className="w-3.5 h-3.5" />
                              <span>Mais Detalhes</span>
                            </button>
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
              <div className="p-4 bg-slate-50 text-emerald-600 inline-block rounded-2xl mb-4">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h3 className="font-display font-semibold text-slate-755 text-lg">Nenhuma visita pendente!</h3>
              <p className="text-slate-405 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                Excelente trabalho! Todos os moradores da área de cobertura encontram-se com visitas domiciliares preventivas em dia.
              </p>
            </div>
          )}
        </>
      )}

      {/* REGISTRAR ATENDIMENTO SINGLE CLIENT MODAL */}
      {isModalOpen && selectedPessoaForVisit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-150 overflow-hidden">
            <div className="h-1.5 bg-emerald-600" />
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-slate-900 font-display font-bold text-lg">Registrar Visita Individual</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Laudo clínico para {selectedPessoaForVisit.nome}.</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-650 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="mb-4 p-3 bg-rose-50 text-rose-750 text-xs rounded-xl border border-rose-100 flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterSingleVisit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Data da Visita Domiciliar *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="date"
                      required
                      value={modalDataVisita}
                      onChange={(e) => setModalDataVisita(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-750"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Relatório Detalhado de Acompanhamento *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={modalDescricao}
                    onChange={(e) => setModalDescricao(e.target.value)}
                    maxLength={1000}
                    className="w-full p-4 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all placeholder-slate-400"
                    placeholder="Registre observações (sinais vitais, glicemia, aderência aos medicamentos, condições gerais)..."
                  />
                  <div className="text-right text-[10px] text-slate-400 font-mono mt-0.5">
                    {modalDescricao.length}/1000 caracteres
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-5 mt-6">
                  <button
                    type="button"
                    disabled={savingVisit}
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 hover:bg-slate-150 rounded-xl text-slate-600 font-bold text-sm transition-all"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    disabled={savingVisit}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    <span>{savingVisit ? 'Registrando...' : 'Confirmar e Salvar'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* REGISTER BULK VISITS MODAL */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-150 overflow-hidden">
            <div className="h-1.5 bg-emerald-650" />
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-slate-900 font-display font-bold text-lg">Registrar Visitas em Lote</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Esta ação adicionará uma visita para cada um dos {selectedIds.length} moradores simultaneamente.</p>
                </div>
                <button
                  onClick={() => setIsBulkModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-650 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {bulkError && (
                <div className="mb-4 p-3 bg-rose-50 text-rose-750 text-xs rounded-xl border border-rose-100 flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              <form onSubmit={handleSaveBulkVisits} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Data Coletiva da Visita *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="date"
                      required
                      value={bulkDataVisita}
                      onChange={(e) => setBulkDataVisita(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-755"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Descrição Coletiva / Ações Realizadas *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={bulkDescricao}
                    onChange={(e) => setBulkDescricao(e.target.value)}
                    maxLength={500}
                    className="w-full p-4 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all placeholder-slate-400"
                    placeholder="Descrição para anexar simultaneamente no histórico de todos os selecionados."
                  />
                  <div className="text-right text-[10px] text-slate-400 font-mono mt-0.5">
                    {bulkDescricao.length}/500 caracteres
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-5 mt-6">
                  <button
                    type="button"
                    disabled={savingBulk}
                    onClick={() => setIsBulkModalOpen(false)}
                    className="px-4 py-2 hover:bg-slate-150 rounded-xl text-slate-600 font-bold text-sm transition-all"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    disabled={savingBulk}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    <span>{savingBulk ? 'Gravando em lote...' : 'Confirmar Lote'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
