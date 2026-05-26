import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { Pessoa, OperationType } from '../types';
import { 
  HeartPulse, 
  ArrowLeft, 
  Save, 
  MapPin, 
  User, 
  Calendar,
  Layers,
  HeartCrack,
  CheckSquare,
  Square
} from 'lucide-react';

export const PessoaForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isEditMode = !!id;

  const [nome, setNome] = useState('');
  const [idade, setIdade] = useState<number | ''>('');
  const [sexo, setSexo] = useState<'Masculino' | 'Feminino' | 'Outro'>('Feminino');
  const [selectedDiseases, setSelectedDiseases] = useState<string[]>([]);
  const [areaAtendimento, setAreaAtendimento] = useState('');
  const [rua, setRua] = useState('');
  const [casa, setCasa] = useState('');
  const [areaId, setAreaId] = useState('');
  const [ruaId, setRuaId] = useState('');
  const [areasList, setAreasList] = useState<any[]>([]);
  const [ruasList, setRuasList] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);

  const diseaseOptions = [
    'Hipertensão',
    'Diabetes',
    'Asma',
    'Obesidade',
    'Nenhuma',
    'Outros'
  ];

  // Subscription to all Areas and Ruas on Mount
  useEffect(() => {
    if (!user) return;
    
    // Fetch areas
    const unsubAreas = onSnapshot(
      query(collection(db, 'areas'), where('ownerId', '==', user.uid)),
      (snap) => {
        const list: any[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a,b) => a.nome.localeCompare(b.nome));
        setAreasList(list);
      }
    );

    // Fetch ruas
    const unsubRuas = onSnapshot(
      query(collection(db, 'ruas'), where('ownerId', '==', user.uid)),
      (snap) => {
        const list: any[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a,b) => a.nome.localeCompare(b.nome));
        setRuasList(list);
      }
    );

    return () => {
      unsubAreas();
      unsubRuas();
    };
  }, [user]);

  // 1. Fetch Patient details if in editing mode
  useEffect(() => {
    if (!isEditMode || !id || !user) return;

    const fetchPessoa = async () => {
      const path = `pessoas/${id}`;
      try {
        const docRef = doc(db, 'pessoas', id);
        const snapshot = await getDoc(docRef);
        
        if (snapshot.exists()) {
          const data = snapshot.data() as Pessoa;
          
          if (data.ownerId !== user.uid) {
            setError('Você não possui permissão para editar os dados desse residente.');
            setFetching(false);
            return;
          }

          setNome(data.nome);
          setIdade(data.idade);
          setSexo(data.sexo);
          setSelectedDiseases(data.doencas || []);
          setAreaAtendimento(data.areaAtendimento);
          setRua(data.rua);
          setCasa(data.casa);
          setAreaId(data.areaId || '');
          setRuaId(data.ruaId || '');
        } else {
          setError('Residente não encontrado no sistema.');
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
  }, [id, isEditMode, user]);

  // 2. Handle Diseases checkbox toggle
  const handleDiseaseToggle = (disease: string) => {
    if (disease === 'Nenhuma') {
      // Toggle none: unselect all others and select none
      if (selectedDiseases.includes('Nenhuma')) {
        setSelectedDiseases([]);
      } else {
        setSelectedDiseases(['Nenhuma']);
      }
    } else {
      // Toggle specific disease
      let updated = [...selectedDiseases].filter(d => d !== 'Nenhuma');
      if (updated.includes(disease)) {
        updated = updated.filter(d => d !== disease);
      } else {
        updated.push(disease);
      }
      setSelectedDiseases(updated);
    }
  };

  // 3. Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!nome.trim() || idade === '' || !areaAtendimento.trim() || !rua.trim() || !casa.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setLoading(true);
    setError(null);

    // Clean diseases list (if empty, default to "Nenhuma")
    const diseasesToSave = selectedDiseases.length > 0 ? selectedDiseases : ['Nenhuma'];

    try {
      if (isEditMode && id) {
        // Edit record
        // In the security rules: incoming().createdAt == existing().createdAt
        // We shouldn't modify ownerId, and createdAt.
        // Let's first fetch the existing document to assert we preserve createdAt & ownerId
        const docRef = doc(db, 'pessoas', id);
        const existingSnap = await getDoc(docRef);
        if (!existingSnap.exists()) {
          throw new Error('Incapaz de localizar cadastro original para alteração.');
        }
        const existingData = existingSnap.data();

        const path = `pessoas/${id}`;
        
        const payload: any = {
          nome: nome.trim(),
          idade: Number(idade),
          sexo,
          doencas: diseasesToSave,
          areaAtendimento: areaAtendimento.trim(),
          rua: rua.trim(),
          casa: casa.trim(),
          createdAt: existingData.createdAt, // preserved as required
          updatedAt: serverTimestamp(), // updated to current server timer
          ownerId: user.uid // preserved
        };
        if (areaId) payload.areaId = areaId;
        if (ruaId) payload.ruaId = ruaId;

        await setDoc(docRef, payload);
        navigate(`/pessoa/${id}`);
      } else {
        // Create record
        // In the safety rules: incoming().createdAt == request.time & incoming().updatedAt == request.time
        // And document ID must match isValidId
        // Let's generate a secure alphabetical/numerical ID to avoid permissions rejection
        const newDocRef = doc(collection(db, 'pessoas')); // auto-generate standard Firestore ID
        const path = `pessoas/${newDocRef.id}`;
        
        const payload: any = {
          nome: nome.trim(),
          idade: Number(idade),
          sexo,
          doencas: diseasesToSave,
          areaAtendimento: areaAtendimento.trim(),
          rua: rua.trim(),
          casa: casa.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ownerId: user.uid
        };
        if (areaId) payload.areaId = areaId;
        if (ruaId) payload.ruaId = ruaId;

        await setDoc(newDocRef, payload);
        navigate('/pessoas');
      }
    } catch (err: any) {
      console.error(err);
      try {
        const operation = isEditMode ? OperationType.UPDATE : OperationType.CREATE;
        const recordId = isEditMode && id ? id : 'nova-pessoa';
        handleFirestoreError(err, operation, `pessoas/${recordId}`);
      } catch (formattedError: any) {
        setError(JSON.parse(formattedError.message).error);
      }
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Carregando dados cadastrais...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Navigation action bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer text-slate-500"
          title="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-display font-bold text-xl tracking-tight text-slate-900">
            {isEditMode ? 'Atualizar Perfil de Residente' : 'Registrar Novo Morador'}
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Preencha as informações cadastrais básicas e de saúde para acompanhamento preventivo.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex gap-2.5">
          <span className="font-bold">Aviso:</span>
          <span>{error}</span>
        </div>
      )}

      {/* FORM CARD */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6">
          <h3 className="font-display font-bold text-slate-900 text-base border-b border-slate-150 pb-2 flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-600" />
            Dados Pessoais
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Full Name */}
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Nome Completo *
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all focus:ring-1 focus:ring-emerald-500/30"
                  placeholder="Nome sem abreviações"
                  id="form-nome"
                />
              </div>
            </div>

            {/* Age */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Idade *
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="number"
                  required
                  min="0"
                  max="120"
                  value={idade}
                  onChange={(e) => setIdade(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all focus:ring-1 focus:ring-emerald-500/30"
                  placeholder="Anos"
                  id="form-idade"
                />
              </div>
            </div>

            {/* Gender Selection */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Sexo Biológico *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['Feminino', 'Masculino', 'Outro'].map((gender) => {
                  const isSelected = sexo === gender;
                  return (
                    <button
                      key={gender}
                      type="button"
                      onClick={() => setSexo(gender as any)}
                      className={`py-2.5 px-3 border rounded-xl font-semibold text-xs tracking-wide transition-all cursor-pointer text-center ${
                        isSelected 
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                      id={`form-gender-${gender.toLowerCase()}`}
                    >
                      {gender}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <h3 className="font-display font-bold text-slate-900 text-base border-b border-slate-150 pb-2 pt-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            Endereço & Território
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Neighborhood Service Area */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Área de Atendimento *
              </label>
              <div className="relative">
                {areasList.length > 0 ? (
                  <select
                    required
                    value={areaId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setAreaId(selectedId);
                      const selectedObj = areasList.find(a => a.id === selectedId);
                      setAreaAtendimento(selectedObj ? selectedObj.nome : '');
                      setRuaId('');
                      setRua('');
                    }}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all cursor-pointer font-sans h-[42px]"
                    id="form-area"
                  >
                    <option value="">Selecione uma área</option>
                    {areasList.map(a => (
                      <option key={a.id} value={a.id}>{a.nome}</option>
                    ))}
                  </select>
                ) : (
                  <div className="relative">
                    <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input
                      type="text"
                      required
                      value={areaAtendimento}
                      onChange={(e) => setAreaAtendimento(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all h-[42px]"
                      placeholder="Ex: Área 05"
                      id="form-area"
                    />
                  </div>
                )}
              </div>
              {areasList.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1.5 leading-relaxed font-sans font-medium">
                  Atalho: Crie Áreas territoriais fixas na barra para preenchimento ágil.
                </p>
              )}
            </div>

            {/* Street */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Nome do Logradouro / Rua *
              </label>
              {ruasList.length > 0 ? (
                <select
                  required
                  value={ruaId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setRuaId(selectedId);
                    const selectedObj = ruasList.find(r => r.id === selectedId);
                    setRua(selectedObj ? selectedObj.nome : '');
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all cursor-pointer font-sans h-[42px]"
                  id="form-rua"
                  disabled={!areaId}
                >
                  <option value="">{areaId ? 'Selecione uma rua' : 'Selecione a área territorial primeiro'}</option>
                  {ruasList.filter(r => r.areaId === areaId).map(r => (
                    <option key={r.id} value={r.id}>{r.nome}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  value={rua}
                  onChange={(e) => setRua(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all h-[42px]"
                  placeholder="Ex: Rua das Flores"
                  id="form-rua"
                />
              )}
            </div>

            {/* House identifier */}
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Complemento / Casa / Nº *
              </label>
              <input
                type="text"
                required
                value={casa}
                onChange={(e) => setCasa(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-medium text-slate-800 outline-none transition-all focus:ring-1 focus:ring-emerald-500/30"
                placeholder="Ex: Casa 12B"
                id="form-casa"
              />
            </div>
          </div>

          <h4 className="font-display font-bold text-slate-900 text-base border-b border-slate-150 pb-2 pt-4 flex items-center gap-2">
            <HeartCrack className="w-5 h-5 text-emerald-600" />
            Condições Crônicas Diagnosticadas
          </h4>

          {/* Disease Multi-selection view wrapper */}
          <div className="grid grid-cols-2 gap-3">
            {diseaseOptions.map((disease) => {
              const isChecked = selectedDiseases.includes(disease);
              return (
                <button
                  key={disease}
                  type="button"
                  onClick={() => handleDiseaseToggle(disease)}
                  className={`p-3.5 border rounded-xl flex items-center gap-3 transition-all cursor-pointer text-left ${
                    isChecked 
                      ? 'border-emerald-500 bg-emerald-50/50 text-slate-900 shadow-3xs' 
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                  id={`btn-disease-${disease.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <span className="shrink-0">
                    {isChecked ? (
                      <CheckSquare className="w-5 h-5 text-emerald-600 stroke-2" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-350 stroke-1" />
                    )}
                  </span>
                  <span className="text-xs font-semibold tracking-wide">{disease}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Buttons Action bar */}
        <div className="bg-slate-50/60 border-t border-slate-150 px-6 py-4 flex justify-end gap-3.5">
          <button
            type="button"
            disabled={loading}
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 hover:bg-slate-150 rounded-xl text-slate-600 font-bold text-sm transition-all cursor-pointer"
            id="btn-cancel"
          >
            Cancelar
          </button>
          
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-500/10 flex items-center gap-1.5 transition-all cursor-pointer"
            id="btn-save"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Salvando...' : 'Salvar Ficha'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
