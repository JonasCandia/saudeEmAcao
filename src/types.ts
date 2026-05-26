export interface Pessoa {
  id?: string;
  nome: string;
  nomeSocial?: string;
  idade: number;
  dataNascimento?: string;
  sexo: 'Masculino' | 'Feminino' | 'Outro';
  cpf?: string;
  cns?: string;
  contato?: string;
  email?: string;
  doencas: string[];
  fumante?: boolean;
  problemaRins?: boolean;
  responsavelFamiliar?: boolean;
  racaCor?: string;
  nacionalidade?: string;
  municipioEstado?: string;
  nomeMae?: string;
  nomePai?: string;
  nis?: string;
  areaAtendimento: string; // Flat name for display and fallback
  rua: string;              // Flat name for display and fallback
  casa: string;             // Number / complement
  areaId?: string;          // Modern reference to areas collection
  ruaId?: string;           // Modern reference to ruas collection
  visitaPendente?: boolean; // Scheduled flag for prioritization
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
