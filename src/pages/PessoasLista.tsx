import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { Pessoa, OperationType } from '../types';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Eye, 
  Pencil, 
  Trash2, 
  MapPin, 
  Info,
  UserPlus,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';

export const PessoasLista: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorInfo, setErrorInfo] = useState<any>(null);
  
  // Pagination State
  const [visibleCount, setVisibleCount] = useState(10);

  // Deletion Modal safety check
  const [pessoaToDelete, setPessoaToDelete] = useState<Pessoa | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 1. Listen real-time to Patient list
  useEffect(() => {
    if (!user) return;

    const pathPessoas = 'pessoas';
    const q = query(
      collection(db, pathPessoas),
      where('ownerId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Pessoa[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Pessoa);
        });
        // Sort alphabetically by patient name
        list.sort((a, b) => a.nome.localeCompare(b.nome));
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

    return () => unsubscribe();
  }, [user]);

  // 2. Filter list locally by search term
  const filteredPessoas = useMemo(() => {
    if (!searchTerm.trim()) return pessoas;
    const termLower = searchTerm.toLowerCase();
    return pessoas.filter(p => p.nome.toLowerCase().includes(termLower));
  }, [pessoas, searchTerm]);

  // 3. Paginated output
  const paginatedPessoas = useMemo(() => {
    return filteredPessoas.slice(0, visibleCount);
  }, [filteredPessoas, visibleCount]);

  // 4. Delete operation
  const confirmDelete = async () => {
    if (!pessoaToDelete || !pessoaToDelete.id) return;
    setDeleting(true);
    const path = `pessoas/${pessoaToDelete.id}`;
    
    try {
      await deleteDoc(doc(db, 'pessoas', pessoaToDelete.id));
      setPessoaToDelete(null);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, path);
      } catch (formattedError: any) {
        setErrorInfo(JSON.parse(formattedError.message));
      }
    } finally {
      setDeleting(false);
    }
  };

  // Safe color picker for diseases
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

  return (
    <div className="space-y-6">
      {/* Header section with total count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl tracking-tight text-slate-900">
            Pessoas Sob Acompanhamento
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Lista completa de famílias e indivíduos na sua microrregião de trabalho.
          </p>
        </div>

        <Link
          to="/pessoa/novo"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-600/10 transition-all self-start sm:self-auto cursor-pointer"
          id="btn-new-pessoa"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Pessoa</span>
        </Link>
      </div>

      {errorInfo && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex gap-2.5">
          <span className="font-bold">Aviso de Erro do Firestore:</span>
          <span>{errorInfo.error} (Operação: {errorInfo.operationType})</span>
        </div>
      )}

      {/* SEARCH AND TOOLS BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setVisibleCount(10); // reset visible count upon typing
            }}
            placeholder="Pesquisar por nome de morador..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl focus:ring-1 focus:ring-emerald-500/30 font-medium text-sm text-slate-800 outline-none transition-all"
            id="input-search-pessoas"
          />
        </div>

        <div className="text-sm font-semibold text-slate-400 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0">
          Mostrando {Math.min(filteredPessoas.length, visibleCount)} de {filteredPessoas.length} registros
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-sm">Carregando lista de cadastrados...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {filteredPessoas.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-55 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                    <th className="py-4 px-6">Nome Completo</th>
                    <th className="py-4 px-6 w-20 text-center">Idade</th>
                    <th className="py-4 px-6 w-28 text-center">Sexo</th>
                    <th className="py-4 px-6">Área / Logradouro</th>
                    <th className="py-4 px-6">Condições Crônicas</th>
                    <th className="py-4 px-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPessoas.map((pessoa) => (
                    <tr key={pessoa.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <Link to={`/pessoa/${pessoa.id}`} className="font-semibold text-slate-900 hover:text-emerald-650 hover:underline text-sm block">
                          {pessoa.nome}
                        </Link>
                      </td>
                      <td className="py-4 px-6 text-center font-mono font-medium text-sm text-slate-700">
                        {pessoa.idade}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-bold rounded-lg ${
                          pessoa.sexo === 'Masculino' ? 'bg-cyan-50 text-cyan-700' :
                          pessoa.sexo === 'Feminino' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'
                        }`}>
                          {pessoa.sexo}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-700 truncate max-w-[200px]" title={pessoa.rua}>
                            {pessoa.rua}, {pessoa.casa}
                          </span>
                          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            Área: {pessoa.areaAtendimento}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap gap-1 md:max-w-xs">
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
                            <span className="text-xs text-slate-300 italic">Nenhuma informada</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/pessoa/${pessoa.id}`}
                            className="p-1 px-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                            title="Ver detalhes e visitas"
                            id={`btn-view-${pessoa.id}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Visitas</span>
                          </Link>

                          <Link
                            to={`/pessoa/editar/${pessoa.id}`}
                            className="p-1.5 text-slate-500 hover:text-indigo-650 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Editar cadastro"
                            id={`btn-edit-${pessoa.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>

                          <button
                            onClick={() => setPessoaToDelete(pessoa)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            title="Excluir cadastro"
                            id={`btn-delete-${pessoa.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="p-3 bg-slate-50 text-slate-400 inline-block rounded-2xl mb-4">
                <Info className="w-8 h-8" />
              </div>
              <p className="text-slate-500 font-semibold text-lg">Nenhum morador encontrado</p>
              <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
                {searchTerm ? 'Experimente refazer a busca digitando outros termos.' : 'Registre os moradores de sua área de cobertura clicando no link abaixo.'}
              </p>
              {!searchTerm && (
                <Link
                  to="/pessoa/novo"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-sm rounded-xl transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Cadastrar Primeiro</span>
                </Link>
              )}
            </div>
          )}

          {/* MORE LOAD ACTIONS CARD */}
          {filteredPessoas.length > visibleCount && (
            <div className="border-t border-slate-100 p-4 flex justify-center bg-slate-50/50">
              <button
                onClick={() => setVisibleCount(prev => prev + 10)}
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 bg-white hover:text-slate-800 hover:shadow-xs px-4 py-2.5 rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
                id="btn-load-more"
              >
                <span>Mostrar Mais Residentes</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* CONFIRM DELETION DIALOG MODAL */}
      {pessoaToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-150 overflow-hidden">
            <div className="h-1 bg-rose-500" />
            <div className="p-6">
              <div className="flex gap-4 items-start">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-slate-900 font-display font-bold text-lg">Confirmar Remoção</h3>
                  <p className="text-slate-500 text-sm mt-1">
                    Você está prestes a excluir o registro de <span className="font-bold text-slate-800">{pessoaToDelete.nome}</span>. 
                    Esta operação removerá o cadastro de forma permanente.
                  </p>
                  <p className="text-[11px] text-rose-500 font-bold bg-rose-50 rounded px-2 py-1 mt-2">
                    Nota: O histórico de visitas domiciliares vinculadas ficará inacessível.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setPessoaToDelete(null)}
                  className="px-4 py-2 hover:bg-slate-100 text-slate-500 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                  id="btn-cancel-delete"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-rose-650 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl font-bold text-sm shadow-md shadow-rose-500/10 transition-all cursor-pointer"
                  id="btn-confirm-delete"
                >
                  {deleting ? 'Removendo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
