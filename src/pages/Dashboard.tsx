import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { Pessoa, Atendimento, OperationType } from '../types';
import { canAccessTerritory } from '../utils/territoryScope';
import { 
  Users, 
  CalendarCheck, 
  HeartCrack, 
  Activity, 
  TrendingUp, 
  Search, 
  ChevronRight, 
  SlidersHorizontal,
  Calendar,
  Layers,
  HeartPlus,
  Map as MapIcon,
  Route,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { user, areaIds, ruaIdsExtras, legacyAccess } = useAuth();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState<any>(null);

  // Filters State
  const [selectedArea, setSelectedArea] = useState('all');
  const [selectedDisease, setSelectedDisease] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const pessoaChunks = useMemo(() => {
    const ids = pessoas.map((p) => p.id).filter((id): id is string => Boolean(id));
    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += 30) {
      chunks.push(ids.slice(index, index + 30));
    }
    return chunks;
  }, [pessoas]);

  // 1. Data Subscriptions
  useEffect(() => {
    if (!user) return;

    const pathPessoas = 'pessoas';
    const qPessoas = query(
      collection(db, pathPessoas),
      where('ownerId', '==', user.uid)
    );

    const unsubPessoas = onSnapshot(
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
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, pathPessoas);
        } catch (formattedError: any) {
          setErrorInfo(JSON.parse(formattedError.message));
        }
      }
    );

    return () => {
      unsubPessoas();
    };
  }, [user, legacyAccess, areaIds, ruaIdsExtras]);

  useEffect(() => {
    if (!user) return;

    const pathAtendimentos = 'atendimentos';

    if (pessoaChunks.length === 0) {
      setAtendimentos([]);
      return;
    }

    const unsubAtendimentosList = pessoaChunks.map((chunk) => {
      const qAtendimentos = query(
        collection(db, pathAtendimentos),
        where('ownerId', '==', user.uid),
        where('pessoaId', 'in', chunk)
      );

      return onSnapshot(
        qAtendimentos,
        (snapshot) => {
          setAtendimentos((current) => {
            const next = current.filter((item) => !chunk.includes(item.pessoaId));
            snapshot.forEach((doc) => {
              next.push({ id: doc.id, ...doc.data() } as Atendimento);
            });
            return next;
          });
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, pathAtendimentos);
          } catch (formattedError: any) {
            setErrorInfo(JSON.parse(formattedError.message));
          }
        }
      );
    });

    return () => {
      unsubAtendimentosList.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, pessoaChunks]);

  // Convert firestore timestamp safely
  const parseFirestoreDate = (field: any): Date => {
    if (!field) return new Date();
    if (typeof field.toDate === 'function') return field.toDate();
    if (field.seconds) return new Date(field.seconds * 1000);
    const d = new Date(field);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  // 2. Compute Unique Neighborhoods/Areas
  const uniqueAreas = useMemo(() => {
    const areasSet = new Set<string>();
    pessoas.forEach(p => {
      if (p.areaAtendimento) areasSet.add(p.areaAtendimento);
    });
    return Array.from(areasSet).sort();
  }, [pessoas]);

  // 3. Filter patients & visits
  const filteredData = useMemo(() => {
    // A. Filter patients based on filters
    const matchedPessoas = pessoas.filter(p => {
      const matchesArea = selectedArea === 'all' || p.areaAtendimento === selectedArea;
      const matchesDisease = selectedDisease === 'all' || p.doencas?.includes(selectedDisease);
      return matchesArea && matchesDisease;
    });

    const activePessoaIds = new Set(matchedPessoas.map(p => p.id));

    // B. Filter visits
    const matchedAtendimentos = atendimentos.filter(a => {
      // Must belong to a matching patient
      if (!activePessoaIds.has(a.pessoaId)) return false;

      // Period filter
      const visitDate = parseFirestoreDate(a.dataVisita);
      const visitDateStr = visitDate.toISOString().split('T')[0]; // YYYY-MM-DD

      if (startDate && visitDateStr < startDate) return false;
      if (endDate && visitDateStr > endDate) return false;

      return true;
    });

    return {
      pessoas: matchedPessoas,
      atendimentos: matchedAtendimentos
    };
  }, [pessoas, atendimentos, selectedArea, selectedDisease, startDate, endDate]);

  // 4. Counts and Metrics
  const metrics = useMemo(() => {
    const totalPessoas = filteredData.pessoas.length;

    // Visitas no Mês Atual
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const atendimentosMes = filteredData.atendimentos.filter(a => {
      const d = parseFirestoreDate(a.dataVisita);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    // Genero
    let masculinos = 0;
    let femininos = 0;
    let outros = 0;

    filteredData.pessoas.forEach(p => {
      if (p.sexo === 'Masculino') masculinos++;
      else if (p.sexo === 'Feminino') femininos++;
      else outros++;
    });

    const pctFeminino = totalPessoas > 0 ? Math.round((femininos / totalPessoas) * 100) : 0;
    const pctMasculino = totalPessoas > 0 ? Math.round((masculinos / totalPessoas) * 150) : 0; // Wait, correct percentages to total 100%
    const realFeminino = totalPessoas > 0 ? Math.round((femininos / totalPessoas) * 100) : 0;
    const realMasculino = totalPessoas > 0 ? Math.round((masculinos / totalPessoas) * 100) : 0;
    const realOutros = totalPessoas > 0 ? (100 - realFeminino - realMasculino) : 0;

    // Diseases counts
    const diseaseCounts: Record<string, number> = {};
    filteredData.pessoas.forEach(p => {
      p.doencas?.forEach(d => {
        if (d && d !== 'Nenhuma') {
          diseaseCounts[d] = (diseaseCounts[d] || 0) + 1;
        }
      });
    });

    const topDiseases = Object.entries(diseaseCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Calculate how many people have >30 days since last visit or never visited
    let totalMais30DiasSemVisitas = 0;
    filteredData.pessoas.forEach(p => {
      const pVisits = atendimentos.filter(a => a.pessoaId === p.id);
      if (pVisits.length === 0) {
        totalMais30DiasSemVisitas++;
      } else {
        let newestTime = 0;
        pVisits.forEach(v => {
          const time = v.dataVisita?.seconds ? v.dataVisita.seconds * 1000 : new Date(v.dataVisita).getTime();
          if (time > newestTime) newestTime = time;
        });
        const days = (Date.now() - newestTime) / (1000 * 60 * 60 * 24);
        if (days > 30) {
          totalMais30DiasSemVisitas++;
        }
      }
    });

    return {
      totalPessoas,
      atendimentosMes,
      realFeminino,
      realMasculino,
      realOutros,
      topDiseases,
      totalMais30DiasSemVisitas
    };
  }, [filteredData]);

  // 5. Weekly Chart Calculations (Visits per day over current last 7 days)
  const chartData = useMemo(() => {
    const dates = [];
    const counts: Record<string, number> = {};

    // Get last 7 days formatted labels and seed maps
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString(); // easy date identifier
      dates.push({
        key,
        dayOfWeek: d.toLocaleDateString('pt-BR', { weekday: 'short' }),
        dayMonth: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        rawDate: d
      });
      counts[key] = 0;
    }

    // Populate counts
    atendimentos.forEach(a => {
      const visitDate = parseFirestoreDate(a.dataVisita);
      const visitKey = visitDate.toDateString();
      if (counts[visitKey] !== undefined) {
        counts[visitKey]++;
      }
    });

    const items = dates.map(d => ({
      label: d.dayOfWeek.replace('.', ''),
      subLabel: d.dayMonth,
      count: counts[d.key]
    }));

    const maxCount = Math.max(...items.map(item => item.count), 4); // default axis range max limit 4 if empty

    return {
      items,
      maxCount
    };
  }, [atendimentos]);

  // Extra Memo A: Coverage by unique Area (percent of houses visited in last 30 days)
  const areaCoverage = useMemo(() => {
    const coverageList: { name: string; total: number; visited: number; percent: number }[] = [];
    uniqueAreas.forEach(areaName => {
      const areaPessoas = pessoas.filter(p => p.areaAtendimento === areaName);
      if (areaPessoas.length === 0) return;
      
      let visitedCount = 0;
      areaPessoas.forEach(p => {
        const pVisits = atendimentos.filter(a => a.pessoaId === p.id);
        if (pVisits.length === 0) return;
        
        let newestTime = 0;
        pVisits.forEach(v => {
          const time = v.dataVisita?.seconds ? v.dataVisita.seconds * 1000 : new Date(v.dataVisita).getTime();
          if (time > newestTime) newestTime = time;
        });
        
        if (newestTime > 0) {
          const days = (Date.now() - newestTime) / (1000 * 60 * 60 * 24);
          if (days <= 30) {
            visitedCount++;
          }
        }
      });
      
      const percent = Math.round((visitedCount / areaPessoas.length) * 100);
      coverageList.push({ name: areaName, total: areaPessoas.length, visited: visitedCount, percent });
    });
    return coverageList;
  }, [pessoas, atendimentos, uniqueAreas]);

  // Extra Memo B: Critical Streets list containing pending counts
  const streetsWithPendingCount = useMemo(() => {
    const streetMap: Record<string, { name: string; area: string; pending: number; total: number }> = {};
    pessoas.forEach(p => {
      const streetName = p.rua || 'Sem logradouro';
      const areaName = p.areaAtendimento || 'Sem área';
      
      const pVisits = atendimentos.filter(a => a.pessoaId === p.id);
      let isPending = false;
      
      if (p.visitaPendente === true) {
        isPending = true;
      } else if (pVisits.length === 0) {
        isPending = true;
      } else {
        let newestTime = 0;
        pVisits.forEach(v => {
          const time = v.dataVisita?.seconds ? v.dataVisita.seconds * 1000 : new Date(v.dataVisita).getTime();
          if (time > newestTime) newestTime = time;
        });
        const days = (Date.now() - newestTime) / (1000 * 60 * 65 * 24); // safely days calculation
        const daysReal = (Date.now() - newestTime) / (1000 * 60 * 60 * 24);
        if (daysReal > 30) {
          isPending = true;
        }
      }
      
      if (!streetMap[streetName]) {
        streetMap[streetName] = { name: streetName, area: areaName, pending: 0, total: 0 };
      }
      streetMap[streetName].total++;
      if (isPending) {
        streetMap[streetName].pending++;
      }
    });
    
    return Object.values(streetMap)
      .filter(s => s.pending > 0)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 5);
  }, [pessoas, atendimentos]);

  // 6. Latest 5 registered visits joined with patient name
  const recentVisitsJoined = useMemo(() => {
    const sorted = [...atendimentos]
      .sort((a, b) => parseFirestoreDate(b.dataVisita).getTime() - parseFirestoreDate(a.dataVisita).getTime())
      .slice(0, 5);

    const pessoasMap = new Map<string, Pessoa>();
    pessoas.forEach(p => {
      if (p.id) pessoasMap.set(p.id, p);
    });

    return sorted.map(a => {
      const patient = pessoasMap.get(a.pessoaId);
      return {
        id: a.id,
        pessoaId: a.pessoaId,
        patientName: patient ? patient.nome : 'Paciente Excluído',
        date: parseFirestoreDate(a.dataVisita),
        descricao: a.descricao
      };
    });
  }, [atendimentos, pessoas]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header and quick triggers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl tracking-tight text-slate-900 sm:text-3xl">
            Visão Geral das Atividades
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Aqui estão os consolidados das suas ações na região de cobertura.
          </p>
        </div>

        <Link
          to="/pessoa/novo"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-600/10 transition-all self-start md:self-auto cursor-pointer"
          id="btn-register-new"
        >
          <HeartPlus className="w-5 h-5" />
          <span>Cadastrar Pessoa</span>
        </Link>
      </div>

      {errorInfo && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex gap-2.5">
          <span className="font-bold">Aviso de Banco de Dados:</span>
          <span>{errorInfo.error} (Operação: {errorInfo.operationType})</span>
        </div>
      )}

      {/* FILTER CONTROL HUB */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-100 pb-3">
          <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
          <h3 className="font-display font-semibold text-sm tracking-tight text-slate-900">
            Filtros do Dashboard
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Area filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
              Área de Atendimento
            </label>
            <div className="relative">
              <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 hover:border-slate-350 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-700 outline-none transition-all cursor-pointer"
                id="select-filter-area"
              >
                <option value="all">Todas as Áreas ({uniqueAreas.length})</option>
                {uniqueAreas.map(area => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Disease filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
              Doença Crônica
            </label>
            <div className="relative">
              <HeartCrack className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                value={selectedDisease}
                onChange={(e) => setSelectedDisease(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 hover:border-slate-350 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-700 outline-none transition-all cursor-pointer"
                id="select-filter-disease"
              >
                <option value="all">Ver Todas as Doenças</option>
                <option value="Hipertensão">Hipertensão</option>
                <option value="Diabetes">Diabetes</option>
                <option value="Asma">Asma</option>
                <option value="Obesidade">Obesidade</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
              Visitas a Partir De
            </label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-700 outline-none transition-all cursor-pointer"
                id="input-filter-date-start"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
              Até o Dia
            </label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-700 outline-none transition-all cursor-pointer"
                id="input-filter-date-end"
              />
            </div>
          </div>
        </div>

        {/* Clear filters row if any filter active */}
        {(selectedArea !== 'all' || selectedDisease !== 'all' || startDate !== '' || endDate !== '') && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => {
                setSelectedArea('all');
                setSelectedDisease('all');
                setStartDate('');
                setEndDate('');
              }}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
              id="btn-clear-filters"
            >
              Limpar Filtros Selecionados
            </button>
          </div>
        )}
      </section>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-100">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-sm">Buscando cadastros e registros...</p>
        </div>
      ) : (
        <>
          {/* STATS BENTO GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {/* Card 1: Pessoas cadastradas */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 flex items-center gap-5 shadow-xs relative overflow-hidden group">
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl transition-colors group-hover:bg-emerald-100">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pessoas Cadastradas</dt>
                <dd className="text-2xl font-display font-bold text-slate-900 mt-1">{metrics.totalPessoas}</dd>
              </div>
              <div className="absolute right-0 bottom-0 translate-y-3 translate-x-3 text-emerald-500/5 select-none pointer-events-none">
                <Users className="w-24 h-24" />
              </div>
            </div>

            {/* Card 2: Atendimentos no mes */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 flex items-center gap-5 shadow-xs relative overflow-hidden group">
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-xl transition-colors group-hover:bg-indigo-100">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Visitas Neste Mês</dt>
                <dd className="text-2xl font-display font-bold text-slate-900 mt-1">{metrics.atendimentosMes}</dd>
              </div>
              <div className="absolute right-0 bottom-0 translate-y-3 translate-x-3 text-indigo-500/5 select-none pointer-events-none">
                <CalendarCheck className="w-24 h-24" />
              </div>
            </div>

            {/* Card 3: Casas com +30 dias sem visita com link para visitas pendentes */}
            <Link
              to="/visitas-pendentes"
              className="bg-white hover:bg-rose-50/10 rounded-2xl border border-slate-200/80 p-6 flex items-center gap-5 shadow-xs relative overflow-hidden group transition-all"
              id="card-pending-visits"
            >
              <div className="p-4 bg-rose-50 text-rose-600 rounded-xl transition-colors group-hover:bg-rose-100">
                <AlertCircle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sem Visita &gt;30 Dias</dt>
                <dd className="text-2xl font-display font-bold text-rose-600 mt-1">{metrics.totalMais30DiasSemVisitas}</dd>
              </div>
              <div className="absolute right-0 bottom-0 translate-y-3 translate-x-3 text-rose-500/5 select-none pointer-events-none">
                <AlertCircle className="w-24 h-24" />
              </div>
            </Link>

            {/* Card 3: Distribuição por Sexo */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col justify-between gap-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Divisão por Gênero</dt>
                <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Ativo</span>
              </div>
              {metrics.totalPessoas > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span className="text-rose-500">M: {metrics.realFeminino}%</span>
                    <span className="text-cyan-500">H: {metrics.realMasculino}%</span>
                    {metrics.realOutros > 0 && <span className="text-slate-500">N: {metrics.realOutros}%</span>}
                  </div>
                  {/* Visual progress bar bar */}
                  <div className="w-full h-3 bg-slate-100 rounded-full flex overflow-hidden">
                    <div className="bg-rose-450 h-full transition-all duration-300" style={{ width: `${metrics.realFeminino}%` }} title="Feminino" />
                    <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${metrics.realMasculino}%` }} title="Masculino" />
                    {metrics.realOutros > 0 && (
                      <div className="bg-slate-400 h-full transition-all duration-300" style={{ width: `${metrics.realOutros}%` }} title="Outro" />
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-sm font-medium text-slate-400">Sem dados demográficos</span>
              )}
            </div>

            {/* Card 4: Top cronicas */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col justify-between gap-3 shadow-xs">
              <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Doenças Crônicas Comuns</dt>
              {metrics.topDiseases.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {metrics.topDiseases.map((el, i) => (
                    <div key={el.name} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 truncate max-w-[140px] flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        {el.name}
                      </span>
                      <span className="font-mono text-slate-400 font-medium px-1.5 py-0.5 bg-slate-50 rounded-sm">
                        {el.count} {el.count === 1 ? 'hab' : 'habs'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm font-medium text-slate-400">Nenhuma doença crônica listada</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* WEEKLY CHART CONTAINER */}
            <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col justify-between shadow-xs">
              <div>
                <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-600" />
                  Visitas na Última Semana
                </h3>
                <p className="text-slate-400 text-xs mt-1">Quantidade diária de acompanhamentos domiciliares</p>
              </div>

              {/* Handcrafted Animated Bar Graphic */}
              <div className="mt-8 flex items-end justify-between h-44 px-2 border-b border-slate-100 pb-2">
                {chartData.items.map((day) => {
                  // Calculate height percentage wrapper
                  const heightPercent = chartData.maxCount > 0 ? (day.count / chartData.maxCount) * 100 : 0;
                  return (
                    <div key={day.label + day.subLabel} className="flex flex-col items-center group relative w-1/7">
                      {/* Tooltip bubble on hover */}
                      <div className="absolute -top-10 scale-0 group-hover:scale-100 px-2 py-1 bg-slate-900 text-white text-xs font-bold rounded-lg transition-transform pointer-events-none shadow-md z-10 whitespace-nowrap text-center">
                        {day.count} {day.count === 1 ? 'visita' : 'visitas'}
                      </div>

                      {/* Bar body */}
                      <div className="w-6 md:w-8 bg-emerald-50 rounded-t-lg flex items-end overflow-hidden h-32 hover:bg-emerald-100 transition-colors">
                        <div
                          className="w-full bg-emerald-500 rounded-t-sm transition-all duration-500"
                          style={{ height: `${heightPercent || 4}%` }}
                        />
                      </div>

                      {/* Labels */}
                      <span className="text-xs font-bold text-slate-700 mt-2 capitalize">{day.label}</span>
                      <span className="text-[9px] font-medium text-slate-400">{day.subLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* LAST 5 VISITS LISTING */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
                    <CalendarCheck className="w-5 h-5 text-emerald-600" />
                    Últimas Visitas Registradas
                  </h3>
                  <Link to="/pessoas" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">
                    Ver Pessoas
                  </Link>
                </div>

                <div className="mt-4 divide-y divide-slate-100">
                  {recentVisitsJoined.length > 0 ? (
                    recentVisitsJoined.map((visit) => (
                      <div key={visit.id} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4 hover:bg-slate-50/50 px-2 rounded-xl transition-colors">
                        <div className="space-y-1 min-w-0">
                          <Link to={`/pessoa/${visit.pessoaId}`} className="font-semibold text-slate-800 hover:text-emerald-650 text-sm block truncate hover:underline">
                            {visit.patientName}
                          </Link>
                          <p className="text-xs text-slate-500 line-clamp-2 pr-4">{visit.descricao}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md inline-block">
                            {visit.date.toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <p className="text-sm font-medium text-slate-400">Nenhum atendimento registrado nesta região.</p>
                      <p className="text-xs text-slate-300 mt-1">Clique em cadastrar ou selecione um morador na aba de Pessoas para registrar atendimentos.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECUNDARIA FILA DE INDICADORES - COBERTURA E RUAS PENDENTES */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* COBERTURA POR ÁREA */}
            <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
                  <MapIcon className="w-5 h-5 text-emerald-600" />
                  Cobertura por Microárea
                </h3>
                <p className="text-slate-400 text-xs mt-1">Percentual de domicílios com visitas nos últimos 30 dias</p>
              </div>

              <div className="mt-6 space-y-4">
                {areaCoverage.length > 0 ? (
                  areaCoverage.map((item) => (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">{item.name}</span>
                        <span className="font-mono font-bold text-slate-500">{item.percent}% ({item.visited}/{item.total})</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.percent >= 70 ? 'bg-emerald-500' :
                            item.percent >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 italic">
                    Nenhuma área registrada para cálculo de cobertura.
                  </div>
                )}
              </div>
            </div>

            {/* RUAS COM MAIS PENDÊNCIAS */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Route className="w-5 h-5 text-emerald-600" />
                  Ruas Críticas com Visitas Pendentes
                </h3>
                <p className="text-slate-400 text-xs mt-1 font-sans">Localidades que concentram maior volume de moradores sem cobertura de 30 dias</p>
              </div>

              <div className="mt-4 overflow-x-auto">
                {streetsWithPendingCount.length > 0 ? (
                  <>
                    <div className="md:hidden space-y-2">
                      {streetsWithPendingCount.map((st) => (
                        <div key={st.name} className="border border-slate-100 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 text-sm truncate">{st.name}</p>
                              <p className="text-xs text-slate-500 truncate">{st.area}</p>
                            </div>
                            <span className="text-rose-600 font-bold font-mono bg-rose-50/50 px-1.5 py-0.5 rounded-lg border border-rose-100 text-xs shrink-0">
                              {st.pending}/{st.total}
                            </span>
                          </div>
                          <div className="pt-2">
                            <Link to="/visitas-pendentes" className="text-xs text-emerald-700 font-semibold">
                              Ver fila da região
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>

                    <table className="hidden md:table w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 px-2 text-left">Rua</th>
                          <th className="py-2.5 px-2 text-left">Microárea</th>
                          <th className="py-2.5 px-2 text-center">Pendentes</th>
                          <th className="py-2.5 px-2 text-center">Total</th>
                          <th className="py-2.5 px-2 text-right">Caderno de Campo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100/70 text-xs text-slate-650 border-b border-slate-100">
                        {streetsWithPendingCount.map((st) => (
                          <tr key={st.name} className="hover:bg-slate-50/40">
                            <td className="py-3 px-2 font-bold text-slate-800">{st.name}</td>
                            <td className="py-3 px-2 text-slate-450">{st.area}</td>
                            <td className="py-3 px-2 text-center">
                              <span className="text-rose-600 font-bold font-mono bg-rose-50/50 px-1.5 py-0.5 rounded-lg border border-rose-100">
                                {st.pending}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center font-mono font-medium">{st.total}</td>
                            <td className="py-3 px-2 text-right">
                              <Link
                                to="/visitas-pendentes"
                                className="text-emerald-700 hover:underline font-bold text-[11px]"
                              >
                                Ver Fila
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-400 italic">
                    Não existem ruas com visitas pendentes! Excelente cobertura geral.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
