export type SexoBiologico = 'Masculino' | 'Feminino' | 'Outro';

export interface PessoaIdentificacao {
  cnsProfissional?: string;
  cbo?: string;
  cnes?: string;
  ine?: string;
  dataCadastro?: string;
  cpfCnsCidadao: string;
  cidadaoResponsavelFamiliar?: boolean;
  cpfCnsResponsavelFamiliar?: string;
  nomeCompleto: string;
  nomeSocial?: string;
  dataNascimento: string;
  sexo: SexoBiologico;
  racaCor?: string;
  etnia?: string;
  nissPisPasep?: string;
  nomeMae?: string;
  nomePai?: string;
}

export interface PessoaEnderecoTerritorio {
  areaId?: string;
  areaAtendimento: string;
  ruaId?: string;
  casaId?: string;
  rua: string;
  casa: string;
  microarea?: string;
  foraArea?: boolean;
  telefoneCelular?: string;
  email?: string;
}

export interface PessoaSocioeconomico {
  parentescoResponsavelFamiliar?: string;
  frequentaEscolaCreche?: boolean;
  cursoFrequenta?: string;
  situacaoMercadoTrabalho?: string;
  criancas0a9ComQuemFica?: string[];
  cuidadorTradicional?: boolean;
  participaGrupoComunitario?: boolean;
  planoSaudePrivado?: boolean;
  membroComunidadeTradicional?: boolean;
  orientacaoSexualInformada?: boolean;
  orientacaoSexual?: string;
  identidadeGeneroInformada?: boolean;
  identidadeGenero?: string;
}

export interface PessoaSaude {
  deficiencias?: string[];
  triagemInsegurancaSemDinheiroComida?: boolean;
  triagemInsegurancaSemComerPorFaltaDinheiro?: boolean;
  condicoesReferidas?: string[];
  doencasRespiratorias?: string[];
  problemasRins?: string[];
  internacaoUltimos12Meses?: boolean;
  causaInternacao?: string;
  problemasSaudeMental?: boolean;
  acamado?: boolean;
  domiciliado?: boolean;
  plantasMedicinais?: boolean;
  plantasMedicinaisQuais?: string;
}

export interface AgenteTerritorio {
  id?: string;
  areaIds: string[];
  ruaIdsExtras: string[];
  ownerId: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Pessoa {
  id?: string;
  nome: string;
  idade: number;
  sexo: SexoBiologico;
  doencas: string[];
  areaAtendimento: string; // Flat name for display and fallback
  rua: string;              // Flat name for display and fallback
  casa: string;             // Number / complement
  areaId?: string;          // Modern reference to areas collection
  ruaId?: string;           // Modern reference to ruas collection
  casaId?: string;          // Modern reference to casas collection
  visitaPendente?: boolean; // Scheduled flag for prioritization
  schemaVersion?: number;
  identificacao?: PessoaIdentificacao;
  enderecoTerritorio?: PessoaEnderecoTerritorio;
  socioeconomico?: PessoaSocioeconomico;
  saude?: PessoaSaude;
  createdAt: any;           // Firestore Timestamp or ServerTimestamp
  updatedAt: any;
  ownerId: string;
}

export interface Area {
  id?: string;
  nome: string;
  descricao?: string;
  createdAt: any;
  ownerId: string;
}

export interface Rua {
  id?: string;
  areaId: string;           // reference to areas
  nome: string;
  createdAt: any;
  ownerId: string;
}

export interface Casa {
  id?: string;
  areaId: string;
  ruaId: string;
  identificacao: string;
  complemento?: string;
  tipoImovel?: string;
  createdAt: any;
  updatedAt: any;
  ownerId: string;
}

export interface Atendimento {
  id?: string;
  pessoaId: string;
  dataVisita: any; // Date field or Firestore Timestamp
  descricao: string;
  createdAt: any;
  ownerId: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
