import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  setDoc,
  serverTimestamp,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { Pessoa, Atendimento, OperationType } from '../types';
import { 
  ArrowLeft, 
  Pencil, 
  Plus, 
  Calendar, 
  Layers, 
  User, 
  HeartCrack,
  Activity,
  Trash2,
  AlertCircle,
  FileText,
  Clock,
  HeartPlus,
  MapPin,
  CheckCircle,
  Stethoscope
} from 'lucide-react';

const formatDateString = (value?: string) => {
  if (!value) return 'Não informado';

  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;

  return `${day}/${month}/${year}`;
};

const formatTextValue = (value?: string) => {
  if (!value || !value.trim()) return 'Não informado';
  return value;
};

export const PessoaDetalhes: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDataVisita, setModalDataVisita] = useState(new Date().toISOString().split('T')[0]);
  const [modalDescricao, setModalDescricao] = useState('');
  const [savingVisit, setSavingVisit] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // 1. Fetch Patient profile & real-time Visits list
  useEffect(() => {
    if (!id || !user) return;

    const fetchPessoa = async () => {
      const path = `pessoas/${id}`;
      try {
        const docRef = doc(db, 'pessoas', id);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists()) {
          const data = snapshot.data() as Pessoa;
          
          if (data.ownerId !== user.uid) {
            setError('Você não possui autorização para consultar este cadastro.');
            setFetching(false);
            return;
          }

          setPessoa(data);
        } else {
          setError('Morador não localizado na microrregião.');
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.GET, path);
        } catch (formattedError: any) {
          setError(JSON.parse(formattedError.message).error);
        }
      } finally {
        setFetching(false);
      }
    };

    fetchPessoa();

    // Set up real-time subscription for visits belonging to this patient
    const pathAtendimentos = 'atendimentos';
    const q = query(
      collection(db, pathAtendimentos),
      where('pessoaId', '==', id),
      where('ownerId', '==', user.uid)
    );

    const unsubscribeAtendimentos = onSnapshot(
      q,
      (snapshot) => {
        const list: Atendimento[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Atendimento);
        });

        // Sort reverse-chronologically by visit date
        list.sort((a, b) => {
          const dateA = a.dataVisita?.seconds ? a.dataVisita.seconds * 1000 : new Date(a.dataVisita).getTime();
          const dateB = b.dataVisita?.seconds ? b.dataVisita.seconds * 1000 : new Date(b.dataVisita).getTime();
          return dateB - dateA;
        });

        setAtendimentos(list);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, pathAtendimentos);
        } catch (formattedError: any) {
          setError(`Falha ao obter histórico: ${JSON.parse(formattedError.message).error}`);
        }
      }
    );

    return () => {
      unsubscribeAtendimentos();
    };
  }, [id, user]);

  // Convert firestore timestamp safely
  const formatFullDate = (field: any) => {
    if (!field) return 'N/A';
    if (typeof field.toDate === 'function') {
      return field.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    if (field.seconds) {
      return new Date(field.seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    const d = new Date(field);
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Convert input YYYY-MM-DD back to local timezone Date to pass as Timestamp
  const handleRegisterAtendimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;

    if (!modalDescricao.trim()) {
      setModalError('A descrição da visita é de preenchimento obrigatório.');
      return;
    }

    setSavingVisit(true);
    setModalError(null);

    const path = 'atendimentos';

    try {
      // Parse local input date carefully
      const [year, month, day] = modalDataVisita.split('-').map(Number);
      // Construct native local Date (set seconds/minutes to avoid timestamp validation gaps)
      const visitLocalDate = new Date(year, month - 1, day, 12, 0, 0);

      // Create payload adhering strictly to the schema (exact keys count: 5 keys):
      // - pessoaId
      // - dataVisita
      // - descricao
      // - createdAt
      // - ownerId
      const newVisitDocRef = doc(collection(db, 'atendimentos'));
      
      const payload: any = {
        pessoaId: id,
        dataVisita: Timestamp.fromDate(visitLocalDate), // Firestore Timestamp
        descricao: modalDescricao.trim(),
        createdAt: serverTimestamp(), // Audit trail server timestamp
        ownerId: user.uid
      };

      await setDoc(newVisitDocRef, payload);

      // Reset modal and close
      setModalDescricao('');
      setModalDataVisita(new Date().toISOString().split('T')[0]);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.CREATE, path);
      } catch (formattedError: any) {
        setModalError(JSON.parse(formattedError.message).error);
      }
    } finally {
      setSavingVisit(false);
    }
  };

  const getDiseaseBadgeStyle = (disease: string) => {
    switch (disease) {
      case 'Hipertensão':
        return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'Diabetes':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Asma':
        return 'bg-sky-50 text-sky-700 border-sky-100';
      case 'Obesidade':
        return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'Nenhuma':
        return 'bg-slate-50 text-slate-400 border-slate-100';
      default:
        return 'bg-violet-50 text-violet-700 border-violet-100';
    }
  };

  const visitadoHoje = useMemo(() => {
    const today = new Date();
    return atendimentos.some((visita) => {
      const rawDate = visita.dataVisita?.seconds
        ? new Date(visita.dataVisita.seconds * 1000)
        : new Date(visita.dataVisita);

      return !Number.isNaN(rawDate.getTime())
        && rawDate.getDate() === today.getDate()
        && rawDate.getMonth() === today.getMonth()
        && rawDate.getFullYear() === today.getFullYear();
    });
  }, [atendimentos]);

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Carregando ficha clínica e visitas...</p>
      </div>
    );
  }

  if (error || !pessoa) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex gap-2 justify-center max-w-md mx-auto">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error || 'Não foi possível carregar as informações.'}</span>
        </div>
        <button
          onClick={() => navigate('/pessoas')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Lista</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Upper Navigation Action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/pessoas')}
            className="p-2 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer text-slate-500"
            title="Voltar para tabela"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-display font-bold text-2xl text-slate-900 tracking-tight">{pessoa.nome}</h2>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-500" />
              Área de Cobertura: {pessoa.areaAtendimento}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {visitadoHoje && (
                <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                  Visitado hoje
                </span>
              )}
              {pessoa.responsavelFamiliar && (
                <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                  Responsável
                </span>
              )}
              {pessoa.fumante && (
                <span className="inline-flex px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100">
                  Fumante
                </span>
              )}
              {pessoa.problemaRins && (
                <span className="inline-flex px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-100">
                  Problema nos rins
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Link
            to={`/pessoa/editar/${id}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-sm text-slate-700 transition-all cursor-pointer"
            id="btn-edit-pessoa"
          >
            <Pencil className="w-4 h-4 text-emerald-600" />
            <span>Editar Morador</span>
          </Link>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-600/10 transition-all cursor-pointer"
            id="btn-open-visit-modal"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Visita</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-display font-bold text-slate-900 text-base">Dados Cadastrais</h3>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ficha ampliada</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-sm">
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Nome completo</span>
            <span className="text-slate-800 font-medium">{pessoa.nome}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Nome social</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.nomeSocial)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Data de nascimento</span>
            <span className="text-slate-800 font-medium">{formatDateString(pessoa.dataNascimento)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Sexo</span>
            <span className="text-slate-800 font-medium">{pessoa.sexo}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">CPF</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.cpf)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">CNS</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.cns)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Contato</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.contato)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">E-mail</span>
            <span className="text-slate-800 font-medium break-all">{formatTextValue(pessoa.email)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Raça/Cor</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.racaCor)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Nacionalidade</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.nacionalidade)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Município/Estado</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.municipioEstado)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">NIS (PIS/PASEP)</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.nis)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Nome completo da mãe</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.nomeMae)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Nome completo do pai</span>
            <span className="text-slate-800 font-medium">{formatTextValue(pessoa.nomePai)}</span>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Endereço</span>
            <span className="text-slate-800 font-medium">{pessoa.rua}, {pessoa.casa} - {pessoa.areaAtendimento}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* RESIDENT BRIEF PROFILE CARD */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs h-fit space-y-6">
          <h3 className="font-display font-bold text-slate-905 text-base border-b border-slate-100 pb-2 flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-600" />
            Metadados do Residente
          </h3>

          <div className="space-y-4">
            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Idade Atual</span>
              <span className="text-slate-800 font-semibold text-sm">{pessoa.idade} anos</span>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Gênero Biológico</span>
              <span className={`inline-flex px-2 py-0.5 mt-1 text-xs font-bold rounded-md ${
                pessoa.sexo === 'Masculino' ? 'bg-cyan-50 text-cyan-700' :
                pessoa.sexo === 'Feminino' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'
              }`}>
                {pessoa.sexo}
              </span>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Endereço Domiciliar</span>
              <span className="text-slate-700 font-medium text-sm block mt-1">{pessoa.rua}</span>
              <span className="text-xs text-slate-400 font-semibold uppercase block mt-0.5">Casa/Complemento: {pessoa.casa}</span>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Condições Crônicas</span>
              <div className="flex flex-wrap gap-1">
                {pessoa.doencas && pessoa.doencas.length > 0 ? (
                  pessoa.doencas.map(disease => (
                    <span 
                      key={disease} 
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getDiseaseBadgeStyle(disease)}`}
                    >
                      {disease}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-350 italic">Nenhuma informada</span>
                )}
              </div>
            </div>
            
            <div className="border-t border-slate-100 pt-4 text-[11px] text-slate-400 font-mono space-y-1">
              <div>Criado em: {formatFullDate(pessoa.createdAt)}</div>
              <div>Atualizado em: {formatFullDate(pessoa.updatedAt)}</div>
            </div>
          </div>
        </div>

        {/* REVERSE CHRONOLOGICAL VISITATION HISTORY */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-150 pb-2">
            <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
              <Stethoscope className="w-5.5 h-5.5 text-emerald-600" />
              Histórico de Visitas Domiciliares
            </h3>
            <span className="font-mono text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg shrink-0">
              {atendimentos.length} {atendimentos.length === 1 ? 'visita' : 'visitas'}
            </span>
          </div>

          <div className="space-y-4">
            {atendimentos.length > 0 ? (
              atendimentos.map((visita) => (
                <div key={visita.id} className="bg-white rounded-2xl border border-slate-205 p-5 shadow-2xs relative overflow-hidden flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Small colored timeline stripe */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                  
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Visita Realizada
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 leading-relaxed break-words whitespace-pre-wrap">{visita.descricao}</p>
                  </div>

                  <div className="flex items-center md:flex-col md:items-end justify-between md:justify-start gap-2 shrink-0">
                    <div className="flex items-center gap-1 text-slate-400 font-mono font-medium text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatFullDate(visita.dataVisita)}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
                <div className="p-3.5 bg-slate-50 text-slate-400 inline-block rounded-2xl mb-3">
                  <FileText className="w-8 h-8" />
                </div>
                <h4 className="font-display font-semibold text-slate-700 text-base">Sem visitas anotadas</h4>
                <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">
                  Este morador ainda não recebeu visitas preventivas do ACS. Registre um atendimento para arquivamento clicando abaixo.
                </p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-sm rounded-xl transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Anotar Visita</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* REGISTRAR ATENDIMENTO (MODAL POPUP) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-150 overflow-hidden">
            <div className="h-2 bg-emerald-600" />
            <div className="p-6 sm:p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-slate-900 font-display font-bold text-lg">Registrar Atendimento</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Adicione os detalhes da visita domiciliar para {pessoa.nome}.</p>
                </div>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setModalError(null);
                  }}
                  className="p-1 px-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 font-semibold text-sm cursor-pointer"
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

              <form onSubmit={handleRegisterAtendimento} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Data da Visita Domiciliar *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                    <input
                      type="date"
                      required
                      value={modalDataVisita}
                      onChange={(e) => setModalDataVisita(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-700 outline-none transition-all cursor-pointer"
                      id="modal-visit-date"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Relatório da Visita / Conduta de Atendimento *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={modalDescricao}
                    onChange={(e) => setModalDescricao(e.target.value)}
                    maxLength={1000}
                    className="w-full p-4 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all focus:ring-1 focus:ring-emerald-500/30 placeholder-slate-400"
                    placeholder="Ex: Realizada aferição de pressão arterial (12x8). Paciente com adesão correta aos medicamentos da hipertensão. Orientado sobre agendamento de consulta médica."
                    id="modal-visit-desc"
                  />
                  <div className="text-right text-[10px] text-slate-400 font-mono mt-1">
                    {modalDescricao.length}/1000 caracteres
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    disabled={savingVisit}
                    onClick={() => {
                      setIsModalOpen(false);
                      setModalError(null);
                    }}
                    className="px-4 py-2 hover:bg-slate-150 rounded-xl text-slate-600 font-bold text-sm transition-all cursor-pointer"
                    id="btn-close-visit-modal"
                  >
                    Descartar
                  </button>
                  
                  <button
                    type="submit"
                    disabled={savingVisit}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-500/10 flex items-center gap-1.5 transition-all cursor-pointer"
                    id="btn-save-visit"
                  >
                    <span>{savingVisit ? 'Registrando...' : 'Confirmar e Salvar'}</span>
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
