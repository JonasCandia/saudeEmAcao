import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { ArrowLeft, CheckSquare, Save, Square } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError } from '../firebase';
import { OperationType, Pessoa, Territorio } from '../types';
import { canAccessTerritory } from '../utils/territoryScope';
import {
  buildPessoaPayloadFromWizard,
  calculateAgeFromBirthDate,
  createDefaultPessoaWizardFormData,
  hydratePessoaWizardFormDataFromPessoa,
  PessoaWizardFormData,
  validateWizardStep,
} from '../utils/pessoaSchema';

type AreaOption = { id: string; nome: string };
type RuaOption = { id: string; nome: string; areaId: string };
type CasaOption = { id: string; identificacao: string; complemento?: string; areaId: string; ruaId: string };

const STEPS = [
  'Identificação',
  'Endereço e Território',
  'Socioeconômico',
  'Saúde e Triagem',
];

const CONDICOES_OPTIONS = [
  'Hipertensão',
  'Diabetes',
  'Asma',
  'DPOC/Enfisema',
  'AVC/Derrame',
  'Infarto',
  'Doença cardíaca',
  'Câncer',
  'Tuberculose',
  'Nenhuma',
  'Outros',
];

const DEFICIENCIAS_OPTIONS = ['Auditiva', 'Visual', 'Física', 'Intelectual/Cognitiva', 'TEA', 'Outra'];

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

const CRIANCAS_COM_QUEM_FICA_OPTIONS = [
  'Adulto responsável',
  'Outra(s) criança(s)',
  'Adolescente',
  'Sozinha',
  'Creche',
  'Outro',
];

export const PessoaForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, areaIds, ruaIdsExtras, legacyAccess } = useAuth();

  const isEditMode = Boolean(id);

  const [formData, setFormData] = useState<PessoaWizardFormData>(createDefaultPessoaWizardFormData());
  const [currentStep, setCurrentStep] = useState(0);

  const [areasList, setAreasList] = useState<AreaOption[]>([]);
  const [ruasList, setRuasList] = useState<RuaOption[]>([]);
  const [casasList, setCasasList] = useState<CasaOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditMode);
  const [lastStepChange, setLastStepChange] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const setError = (msg: string | null) => setErrors(msg ? [msg] : []);

  const SESSION_KEY = 'pessoaForm_draft';

  // Restaura rascunho do sessionStorage ao montar (apenas modo novo)
  useEffect(() => {
    if (isEditMode) return;
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        setFormData(JSON.parse(saved));
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste rascunho no sessionStorage a cada alteração (apenas modo novo)
  useEffect(() => {
    if (isEditMode) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(formData));
    } catch {
      // sessionStorage indisponível (modo privado com quota esgotada)
    }
  }, [isEditMode, formData]);

  // Avisa o usuário ao sair/recarregar a página se houver dados preenchidos
  useEffect(() => {
    const hasData = formData.identificacao.nomeCompleto.trim() !== '' ||
      formData.identificacao.cpfCnsCidadao.trim() !== '';
    if (!hasData) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [formData.identificacao.nomeCompleto, formData.identificacao.cpfCnsCidadao]);

  const idadeCalculada = useMemo(
    () => calculateAgeFromBirthDate(formData.identificacao.dataNascimento),
    [formData.identificacao.dataNascimento]
  );

  const ruasFiltradas = useMemo(() => {
    if (!formData.enderecoTerritorio.areaId) return [];
    return ruasList.filter((rua) => rua.areaId === formData.enderecoTerritorio.areaId);
  }, [ruasList, formData.enderecoTerritorio.areaId]);

  const casasFiltradas = useMemo(() => {
    if (!formData.enderecoTerritorio.ruaId) return [];
    return casasList.filter((casa) => casa.ruaId === formData.enderecoTerritorio.ruaId);
  }, [casasList, formData.enderecoTerritorio.ruaId]);

  useEffect(() => {
    if (!user) return;

    const unsubTerritorio = onSnapshot(
      doc(db, 'territorio', user.uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as Territorio) : { areas: {}, ruas: {}, casas: {}, ownerId: user.uid };
        const areasMap = data.areas || {};
        const ruasMap = data.ruas || {};
        const casasMap = data.casas || {};

        const areasList: AreaOption[] = Object.entries(areasMap)
          .map(([id, v]) => ({ id, nome: v.nome }))
          .filter(a => legacyAccess || areaIds.includes(a.id))
          .sort((a, b) => a.nome.localeCompare(b.nome));

        const ruasList: RuaOption[] = Object.entries(ruasMap)
          .map(([id, v]) => ({ id, nome: v.nome, areaId: v.areaId }))
          .filter(r => canAccessTerritory({ areaId: r.areaId, ruaId: r.id, scope: { legacyAccess, areaIds, ruaIdsExtras } }))
          .sort((a, b) => a.nome.localeCompare(b.nome));

        const casasList: CasaOption[] = Object.entries(casasMap)
          .map(([id, v]) => ({ id, identificacao: v.identificacao, complemento: v.complemento, areaId: v.areaId, ruaId: v.ruaId }))
          .filter(c => canAccessTerritory({ areaId: c.areaId, ruaId: c.ruaId, scope: { legacyAccess, areaIds, ruaIdsExtras } }))
          .sort((a, b) => a.identificacao.localeCompare(b.identificacao));

        setAreasList(areasList);
        setRuasList(ruasList);
        setCasasList(casasList);

        // If the previously selected areaId is no longer accessible, clear it
        setFormData((prev) => {
          const currentAreaId = prev.enderecoTerritorio.areaId;
          if (currentAreaId && !areasList.find(a => a.id === currentAreaId)) {
            return {
              ...prev,
              enderecoTerritorio: {
                ...prev.enderecoTerritorio,
                areaId: undefined,
                areaAtendimento: '',
                ruaId: undefined,
                rua: '',
                casaId: undefined,
              },
            };
          }
          return prev;
        });
      }
    );

    return () => {
      unsubTerritorio();
    };
  }, [user, legacyAccess, areaIds, ruaIdsExtras]);

  useEffect(() => {
    if (!isEditMode || !id || !user) return;

    const fetchPessoa = async () => {
      const path = `pessoas/${id}`;
      try {
        const pessoaRef = doc(db, 'pessoas', id);
        const snapshot = await getDoc(pessoaRef);

        if (!snapshot.exists()) {
          setError('Cadastro não encontrado.');
          return;
        }

        const pessoa = snapshot.data() as Pessoa;
        if (pessoa.ownerId !== user.uid) {
          setError('Você não possui permissão para editar este cadastro.');
          return;
        }
        if (!canAccessTerritory({
          areaId: pessoa.areaId,
          ruaId: pessoa.ruaId,
          scope: { legacyAccess, areaIds, ruaIdsExtras },
        })) {
          setError('Este cadastro está fora do seu escopo territorial.');
          return;
        }

        setFormData(hydratePessoaWizardFormDataFromPessoa(pessoa));
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
  }, [id, isEditMode, user, legacyAccess, areaIds, ruaIdsExtras]);

  const updateIdentificacao = (field: keyof PessoaWizardFormData['identificacao'], value: any) => {
    setFormData((prev) => ({
      ...prev,
      identificacao: {
        ...prev.identificacao,
        [field]: value,
      },
    }));
  };

  const updateEndereco = (field: keyof PessoaWizardFormData['enderecoTerritorio'], value: any) => {
    setFormData((prev) => ({
      ...prev,
      enderecoTerritorio: {
        ...prev.enderecoTerritorio,
        [field]: value,
      },
    }));
  };

  const updateSocio = (field: keyof PessoaWizardFormData['socioeconomico'], value: any) => {
    setFormData((prev) => ({
      ...prev,
      socioeconomico: {
        ...prev.socioeconomico,
        [field]: value,
      },
    }));
  };

  const updateSaude = (field: keyof PessoaWizardFormData['saude'], value: any) => {
    setFormData((prev) => ({
      ...prev,
      saude: {
        ...prev.saude,
        [field]: value,
      },
    }));
  };

  const toggleListValue = (values: string[] | undefined, value: string) => {
    const current = values || [];

    if (value === 'Nenhuma') {
      return current.includes('Nenhuma') ? [] : ['Nenhuma'];
    }

    const withoutNone = current.filter((item) => item !== 'Nenhuma');
    return withoutNone.includes(value)
      ? withoutNone.filter((item) => item !== value)
      : [...withoutNone, value];
  };

  const validateStepOrSetError = (step: number): boolean => {
    const issues = validateWizardStep(step, formData);
    if (issues.length === 0) {
      setErrors([]);
      return true;
    }

    setErrors(issues);
    return false;
  };

  const handleNext = () => {
    if (!validateStepOrSetError(currentStep)) return;
    setLastStepChange(Date.now());
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (currentStep < STEPS.length - 1) return;
    if (Date.now() - lastStepChange < 500) return;

    const step0Issues = validateWizardStep(0, formData);
    const step1Issues = validateWizardStep(1, formData);

    if (!legacyAccess && !formData.enderecoTerritorio.areaId) {
      step1Issues.push('Selecione uma área territorial da lista. Configure seu território em "Meu Território" se não houver opções disponíveis.');
    } else if (!legacyAccess && formData.enderecoTerritorio.areaId && !areaIds.includes(formData.enderecoTerritorio.areaId)) {
      step1Issues.push('A área selecionada não está no seu escopo territorial. Por favor, selecione novamente.');
    }

    if (step0Issues.length > 0 || step1Issues.length > 0) {
      if (step0Issues.length > 0) {
        setErrors(step0Issues);
        setCurrentStep(0);
      } else {
        setErrors(step1Issues);
        setCurrentStep(1);
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEditMode && id) {
        const pessoaRef = doc(db, 'pessoas', id);
        const existingSnap = await getDoc(pessoaRef);
        if (!existingSnap.exists()) {
          throw new Error('Cadastro original não encontrado para atualização.');
        }

        const existingPessoa = existingSnap.data() as Pessoa;
        const basePayload = buildPessoaPayloadFromWizard({
          data: formData,
          ownerId: user.uid,
          existing: existingPessoa,
        });
        const editFinalPayload = {
          ...basePayload,
          createdAt: existingPessoa.createdAt,
          updatedAt: serverTimestamp(),
          ownerId: existingPessoa.ownerId,
        };
        await setDoc(pessoaRef, editFinalPayload);
        navigate(`/pessoa/${id}`);
      } else {
        const newDocRef = doc(db, 'pessoas', crypto.randomUUID().replace(/-/g, ''));
        const basePayload = buildPessoaPayloadFromWizard({
          data: formData,
          ownerId: user.uid,
        });
        const createFinalPayload = {
          ...basePayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(newDocRef, createFinalPayload);
        sessionStorage.removeItem(SESSION_KEY);
        navigate('/pessoas');
      }
    } catch (err) {
      try {
        handleFirestoreError(err, isEditMode ? OperationType.UPDATE : OperationType.CREATE, 'pessoas');
      } catch (formattedError: any) {
        setError(JSON.parse(formattedError.message).error);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    if (currentStep === 0) {
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Nome completo *</label>
              <input
                type="text"
                value={formData.identificacao.nomeCompleto}
                onChange={(e) => updateIdentificacao('nomeCompleto', e.target.value)}
                maxLength={100}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                placeholder="Nome sem abreviações"
                aria-required="true"
                aria-invalid={errors.length > 0}
                aria-describedby={errors.length > 0 ? 'wizard-errors' : undefined}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">CPF/CNS *</label>
              <input
                type="text"
                value={formData.identificacao.cpfCnsCidadao}
                onChange={(e) => updateIdentificacao('cpfCnsCidadao', e.target.value)}
                maxLength={20}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                placeholder="Somente números"
                aria-required="true"
                aria-invalid={errors.length > 0}
                aria-describedby={errors.length > 0 ? 'wizard-errors' : undefined}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Data de nascimento *</label>
              <input
                type="date"
                value={formData.identificacao.dataNascimento}
                onChange={(e) => updateIdentificacao('dataNascimento', e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                aria-required="true"
                aria-invalid={errors.length > 0}
                aria-describedby={errors.length > 0 ? 'wizard-errors' : undefined}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Idade calculada</label>
              <input
                type="text"
                readOnly
                value={idadeCalculada === null ? 'Aguardando data válida' : `${idadeCalculada} anos`}
                className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Sexo *</label>
              <select
                value={formData.identificacao.sexo}
                onChange={(e) => updateIdentificacao('sexo', e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
              >
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Nome social</label>
              <input
                type="text"
                value={formData.identificacao.nomeSocial || ''}
                onChange={(e) => updateIdentificacao('nomeSocial', e.target.value)}
                maxLength={120}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Raça/Cor</label>
              <select
                value={formData.identificacao.racaCor || ''}
                onChange={(e) => updateIdentificacao('racaCor', e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Selecionar</option>
                <option value="Branca">Branca</option>
                <option value="Preta">Preta</option>
                <option value="Parda">Parda</option>
                <option value="Amarela">Amarela</option>
                <option value="Indígena">Indígena</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Nome da mãe</label>
              <input
                type="text"
                value={formData.identificacao.nomeMae || ''}
                onChange={(e) => updateIdentificacao('nomeMae', e.target.value)}
                maxLength={120}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
      );
    }

    if (currentStep === 1) {
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Área de atendimento *</label>
              {!legacyAccess && areasList.length === 0 && (
                <p className="text-xs text-amber-600 mb-1.5">Nenhum território configurado. Acesse "Meu Território" para configurar suas áreas antes de cadastrar pessoas.</p>
              )}
              {areasList.length > 0 ? (
                <select
                  value={formData.enderecoTerritorio.areaId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selected = areasList.find((area) => area.id === selectedId);
                    updateEndereco('areaId', selectedId || undefined);
                    updateEndereco('areaAtendimento', selected?.nome || '');
                    updateEndereco('microarea', selected?.nome || '');
                    updateEndereco('ruaId', undefined);
                    updateEndereco('casaId', undefined);
                    updateEndereco('rua', '');
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione</option>
                  {areasList.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.enderecoTerritorio.areaAtendimento}
                  onChange={(e) => {
                    updateEndereco('areaAtendimento', e.target.value);
                    updateEndereco('microarea', e.target.value);
                  }}
                  maxLength={100}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Logradouro *</label>
              {ruasFiltradas.length > 0 ? (
                <select
                  value={formData.enderecoTerritorio.ruaId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selected = ruasFiltradas.find((rua) => rua.id === selectedId);
                    updateEndereco('ruaId', selectedId || undefined);
                    updateEndereco('casaId', undefined);
                    updateEndereco('rua', selected?.nome || '');
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                  disabled={!formData.enderecoTerritorio.areaId}
                >
                  <option value="">Selecione</option>
                  {ruasFiltradas.map((rua) => (
                    <option key={rua.id} value={rua.id}>
                      {rua.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.enderecoTerritorio.rua}
                  onChange={(e) => updateEndereco('rua', e.target.value)}
                  maxLength={150}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Casa cadastrada</label>
              {casasFiltradas.length > 0 ? (
                <select
                  value={formData.enderecoTerritorio.casaId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selected = casasFiltradas.find((casa) => casa.id === selectedId);
                    updateEndereco('casaId', selectedId || undefined);
                    if (selected) {
                      const nomeCasa = selected.complemento
                        ? `${selected.identificacao} - ${selected.complemento}`
                        : selected.identificacao;
                      updateEndereco('casa', nomeCasa);
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                  disabled={!formData.enderecoTerritorio.ruaId}
                >
                  <option value="">Selecione</option>
                  {casasFiltradas.map((casa) => (
                    <option key={casa.id} value={casa.id}>
                      {casa.complemento
                        ? `${casa.identificacao} - ${casa.complemento}`
                        : casa.identificacao}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500">
                  Nenhuma casa cadastrada para a rua selecionada.
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Casa/Número *</label>
              <input
                type="text"
                value={formData.enderecoTerritorio.casa}
                onChange={(e) => updateEndereco('casa', e.target.value)}
                maxLength={50}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Telefone celular</label>
              <input
                type="tel"
                value={formData.enderecoTerritorio.telefoneCelular || ''}
                onChange={(e) => updateEndereco('telefoneCelular', formatPhone(e.target.value))}
                maxLength={15}
                placeholder="(XX) XXXXX-XXXX"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">E-mail</label>
              <input
                type="email"
                value={formData.enderecoTerritorio.email || ''}
                onChange={(e) => updateEndereco('email', e.target.value)}
                maxLength={120}
                placeholder="exemplo@email.com"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Fora da área?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateEndereco('foraArea', true)}
                  className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
                    formData.enderecoTerritorio.foraArea ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => updateEndereco('foraArea', false)}
                  className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
                    !formData.enderecoTerritorio.foraArea ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  Não
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (currentStep === 2) {
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Situação no mercado de trabalho</label>
              <select
                value={formData.socioeconomico.situacaoMercadoTrabalho || ''}
                onChange={(e) => updateSocio('situacaoMercadoTrabalho', e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Selecionar</option>
                <option value="Empregado">Empregado</option>
                <option value="Assalariado sem carteira">Assalariado sem carteira</option>
                <option value="Autônomo com previdência">Autônomo com previdência</option>
                <option value="Autônomo sem previdência">Autônomo sem previdência</option>
                <option value="Desempregado">Desempregado</option>
                <option value="Não trabalha">Não trabalha</option>
                <option value="Servidor público">Servidor público</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Frequenta escola/creche?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateSocio('frequentaEscolaCreche', true)}
                  className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
                    formData.socioeconomico.frequentaEscolaCreche === true
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => updateSocio('frequentaEscolaCreche', false)}
                  className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
                    formData.socioeconomico.frequentaEscolaCreche === false
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  Não
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Com quem crianças de 0 a 9 anos ficam?</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CRIANCAS_COM_QUEM_FICA_OPTIONS.map((item) => {
                  const selected = (formData.socioeconomico.criancas0a9ComQuemFica || []).includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() =>
                        updateSocio(
                          'criancas0a9ComQuemFica',
                          toggleListValue(formData.socioeconomico.criancas0a9ComQuemFica, item)
                        )
                      }
                      className={`p-2.5 border rounded-lg text-xs text-left flex items-center gap-2 ${
                        selected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      <span>{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Condições/situações de saúde autorreferidas</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CONDICOES_OPTIONS.map((item) => {
              const selected = (formData.saude.condicoesReferidas || []).includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    updateSaude('condicoesReferidas', toggleListValue(formData.saude.condicoesReferidas, item))
                  }
                  className={`p-2.5 border rounded-lg text-xs text-left flex items-center gap-2 ${
                    selected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  <span>{item}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tem alguma deficiência?</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DEFICIENCIAS_OPTIONS.map((item) => {
              const selected = (formData.saude.deficiencias || []).includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => updateSaude('deficiencias', toggleListValue(formData.saude.deficiencias, item))}
                  className={`p-2.5 border rounded-lg text-xs text-left flex items-center gap-2 ${
                    selected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  <span>{item}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Carregando cadastro...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
            {isEditMode ? 'Atualizar Ficha Individual' : 'Nova Ficha Individual'}
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">Fluxo em etapas para reduzir erros em campo.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <span>Etapa {currentStep + 1} de {STEPS.length}</span>
          <span>{STEPS[currentStep]}</span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 transition-all"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div
          id="wizard-errors"
          role="alert"
          aria-live="assertive"
          className="p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100">
          {errors.length === 1 ? (
            <div className="flex gap-2.5">
              <span className="font-bold">Aviso:</span>
              <span>{errors[0]}</span>
            </div>
          ) : (
            <>
              <span className="font-bold block mb-1.5">Corrija os seguintes campos:</span>
              <ul className="list-disc list-inside space-y-0.5">
                {errors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 sm:p-8">{renderStep()}</div>

        <div className="bg-slate-50/60 border-t border-slate-150 px-6 py-4 flex flex-col-reverse sm:flex-row justify-between gap-3.5">
          <button
            type="button"
            disabled={loading || currentStep === 0}
            onClick={handleBack}
            className="w-full sm:w-auto px-5 py-2.5 hover:bg-slate-150 rounded-xl text-slate-600 font-bold text-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Etapa anterior
          </button>

          <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
            {currentStep < STEPS.length - 1 ? (
              <button
                type="button"
                disabled={loading}
                onClick={handleNext}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all cursor-pointer"
              >
                Próxima etapa
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{loading ? 'Salvando...' : 'Salvar Ficha'}</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
