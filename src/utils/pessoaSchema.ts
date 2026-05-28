import {
  Pessoa,
  PessoaEnderecoTerritorio,
  PessoaIdentificacao,
  PessoaSaude,
  PessoaSocioeconomico,
  SexoBiologico,
} from '../types';

export interface PessoaWizardFormData {
  identificacao: PessoaIdentificacao;
  enderecoTerritorio: PessoaEnderecoTerritorio;
  socioeconomico: PessoaSocioeconomico;
  saude: PessoaSaude;
}

export function calculateAgeFromBirthDate(dateISO: string): number | null {
  if (!dateISO) return null;
  const birth = new Date(dateISO);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const beforeBirthday = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;

  if (age < 0 || age > 120) return null;
  return age;
}

export function createDefaultPessoaWizardFormData(): PessoaWizardFormData {
  return {
    identificacao: {
      cpfCnsCidadao: '',
      nomeCompleto: '',
      nomeSocial: '',
      dataNascimento: '',
      sexo: 'Feminino',
      cidadaoResponsavelFamiliar: false,
      cpfCnsResponsavelFamiliar: '',
      racaCor: '',
      etnia: '',
      nissPisPasep: '',
      nomeMae: '',
      nomePai: '',
    },
    enderecoTerritorio: {
      areaAtendimento: '',
      rua: '',
      casa: '',
      casaId: '',
      microarea: '',
      foraArea: false,
      telefoneCelular: '',
      email: '',
    },
    socioeconomico: {
      parentescoResponsavelFamiliar: '',
      cursoFrequenta: '',
      situacaoMercadoTrabalho: '',
      criancas0a9ComQuemFica: [],
      orientacaoSexual: '',
      identidadeGenero: '',
    },
    saude: {
      deficiencias: [],
      condicoesReferidas: [],
      doencasRespiratorias: [],
      problemasRins: [],
      causaInternacao: '',
      plantasMedicinaisQuais: '',
    },
  };
}

function normalizeDocument(value: string): string {
  return value.replace(/\D/g, '');
}

/** Valida CPF com algoritmo de dígito verificador (rejeita sequências repetidas). */
export function isValidCPF(value: string): boolean {
  const digits = normalizeDocument(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // rejeita 000...000, 111...111, etc.

  const calc = (factor: number) => {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++) {
      sum += parseInt(digits[i]) * (factor - i);
    }
    const rem = (sum * 10) % 11;
    return rem === 10 || rem === 11 ? 0 : rem;
  };

  return calc(10) === parseInt(digits[9]) && calc(11) === parseInt(digits[10]);
}

/**
 * Valida CNS (Cartão Nacional de Saúde) com algoritmo módulo 11.
 * Aceita CNS provisório (início 7 ou 8) e definitivo (início 1, 2 ou 9).
 */
export function isValidCNS(value: string): boolean {
  const digits = normalizeDocument(value);
  if (digits.length !== 15) return false;

  const pis = digits.substring(0, 11);
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(pis[i]) * (15 - i);
  }

  let dsp = 0;
  let resultado = sum % 11;

  if (resultado !== 0) {
    dsp = 11 - resultado;
  }

  let cns: string;
  if (dsp === 0) {
    cns = pis + '000' + '1';
  } else if (dsp === 1) {
    sum += 2;
    resultado = sum % 11;
    dsp = resultado === 0 ? 0 : 11 - resultado;
    cns = pis + '001' + dsp;
  } else {
    cns = pis + '00' + dsp;
  }

  return digits === cns;
}

export function hydratePessoaWizardFormDataFromPessoa(pessoa: Pessoa): PessoaWizardFormData {
  const defaults = createDefaultPessoaWizardFormData();
  const birthFromAge = pessoa.idade >= 0 && pessoa.idade <= 120
    ? `${new Date().getFullYear() - pessoa.idade}-01-01`
    : '';

  return {
    identificacao: {
      ...defaults.identificacao,
      ...pessoa.identificacao,
      cpfCnsCidadao: pessoa.identificacao?.cpfCnsCidadao || '',
      nomeCompleto: pessoa.identificacao?.nomeCompleto || pessoa.nome || '',
      dataNascimento: pessoa.identificacao?.dataNascimento || birthFromAge,
      sexo: pessoa.identificacao?.sexo || pessoa.sexo || 'Feminino',
    },
    enderecoTerritorio: {
      ...defaults.enderecoTerritorio,
      ...pessoa.enderecoTerritorio,
      areaId: pessoa.enderecoTerritorio?.areaId || pessoa.areaId,
      areaAtendimento: pessoa.enderecoTerritorio?.areaAtendimento || pessoa.areaAtendimento || '',
      ruaId: pessoa.enderecoTerritorio?.ruaId || pessoa.ruaId,
      casaId: pessoa.enderecoTerritorio?.casaId || pessoa.casaId || '',
      rua: pessoa.enderecoTerritorio?.rua || pessoa.rua || '',
      casa: pessoa.enderecoTerritorio?.casa || pessoa.casa || '',
    },
    socioeconomico: {
      ...defaults.socioeconomico,
      ...pessoa.socioeconomico,
    },
    saude: {
      ...defaults.saude,
      ...pessoa.saude,
      condicoesReferidas: pessoa.saude?.condicoesReferidas || pessoa.doencas || [],
    },
  };
}

function listOrUndefined(values?: string[]) {
  if (!values || values.length === 0) return undefined;
  return values;
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

export function validateWizardStep(step: number, data: PessoaWizardFormData): string[] {
  const errors: string[] = [];
  const age = calculateAgeFromBirthDate(data.identificacao.dataNascimento);

  if (step === 0) {
    if (!data.identificacao.nomeCompleto.trim()) {
      errors.push('Informe o nome completo.');
    }
    if (!data.identificacao.cpfCnsCidadao.trim()) {
      errors.push('Informe CPF/CNS do cidadão.');
    } else {
      const digits = normalizeDocument(data.identificacao.cpfCnsCidadao);
      const validDoc = isValidCPF(digits) || isValidCNS(digits);
      if (!validDoc) {
        errors.push('CPF ou CNS inválido. Verifique os dígitos informados.');
      }
    }
    if (!data.identificacao.dataNascimento) {
      errors.push('Informe a data de nascimento.');
    }
    if (age === null) {
      errors.push('Data de nascimento inválida para cálculo de idade.');
    }
  }

  if (step === 1) {
    if (!data.enderecoTerritorio.areaAtendimento.trim()) {
      errors.push('Informe a área de atendimento.');
    }
    if (!data.enderecoTerritorio.rua.trim()) {
      errors.push('Informe o logradouro.');
    }
    if (!data.enderecoTerritorio.casa.trim()) {
      errors.push('Informe casa/complemento.');
    }
  }

  return errors;
}

export function buildPessoaPayloadFromWizard(args: {
  data: PessoaWizardFormData;
  ownerId: string;
  existing?: Pessoa;
}): Omit<Pessoa, 'id' | 'createdAt' | 'updatedAt'> {
  const { data, ownerId, existing } = args;
  const age = calculateAgeFromBirthDate(data.identificacao.dataNascimento) ?? existing?.idade ?? 0;
  const diseases = listOrUndefined(data.saude.condicoesReferidas) || ['Nenhuma'];

  const identificacao: PessoaIdentificacao = {
    ...data.identificacao,
    nomeCompleto: data.identificacao.nomeCompleto.trim(),
    cpfCnsCidadao: normalizeDocument(data.identificacao.cpfCnsCidadao),
    cpfCnsResponsavelFamiliar: data.identificacao.cpfCnsResponsavelFamiliar
      ? normalizeDocument(data.identificacao.cpfCnsResponsavelFamiliar)
      : '',
  };

  const areaAtendimentoNorm = data.enderecoTerritorio.areaAtendimento.trim();
  const enderecoTerritorio: PessoaEnderecoTerritorio = {
    ...data.enderecoTerritorio,
    areaAtendimento: areaAtendimentoNorm,
    microarea: areaAtendimentoNorm || undefined,
    rua: data.enderecoTerritorio.rua.trim(),
    casa: data.enderecoTerritorio.casa.trim(),
    areaId: data.enderecoTerritorio.areaId || undefined,
    ruaId: data.enderecoTerritorio.ruaId || undefined,
    casaId: data.enderecoTerritorio.casaId || undefined,
  };

  const socioeconomico: PessoaSocioeconomico = {
    ...data.socioeconomico,
    criancas0a9ComQuemFica: listOrUndefined(data.socioeconomico.criancas0a9ComQuemFica),
  };

  const saude: PessoaSaude = {
    ...data.saude,
    deficiencias: listOrUndefined(data.saude.deficiencias),
    condicoesReferidas: diseases,
    doencasRespiratorias: listOrUndefined(data.saude.doencasRespiratorias),
    problemasRins: listOrUndefined(data.saude.problemasRins),
  };

  return stripUndefined({
    nome: identificacao.nomeCompleto,
    idade: age,
    sexo: (identificacao.sexo || 'Feminino') as SexoBiologico,
    doencas: diseases,
    areaAtendimento: enderecoTerritorio.areaAtendimento,
    rua: enderecoTerritorio.rua,
    casa: enderecoTerritorio.casa,
    areaId: enderecoTerritorio.areaId || undefined,
    ruaId: enderecoTerritorio.ruaId || undefined,
    casaId: enderecoTerritorio.casaId || undefined,
    visitaPendente: existing?.visitaPendente || false,
    schemaVersion: 2,
    identificacao: stripUndefined(identificacao),
    enderecoTerritorio: stripUndefined(enderecoTerritorio),
    socioeconomico: stripUndefined(socioeconomico),
    saude: stripUndefined(saude),
    ownerId,
  });
}
