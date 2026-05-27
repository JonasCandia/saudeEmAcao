# 🔍 Relatório de Teste Caótico - Saúde em Ação ACS

**Data:** 2026-05-27
**Agente:** Chaos Agent v1.0
**Ambiente:** http://localhost:3000
**Branch:** main
**Metodologia:** Teste exploratório via browser automatizado + análise estática de código-fonte

---

## 📊 Sumário Executivo

| Métrica | Valor |
|---|---|
| Páginas/rotas testadas | 11 |
| Total de problemas encontrados | 20 |
| 🔴 Críticos | 0 |
| 🟠 Altos | 2 |
| 🟡 Médios | 8 |
| 🟢 Baixos | 10 |
| **Status geral** | 🟡 Atenção |

**Destaques positivos:**
- Todas as rotas protegidas redirecionam corretamente para `/` sem vazar dados
- XSS não é executável em nenhum campo (React auto-escape + sem `dangerouslySetInnerHTML`)
- Firestore Rules robustas com validação de tamanho e de propriedade (`ownerId`)
- Path traversal via URL não produz efeitos colaterais
- Tentativa de acesso com ID de 222 caracteres não causa crash

---

## 📁 Problemas por Página

---

### 1. Login / Registro (`/`)

**URL:** `http://localhost:3000/`

---

#### 🐞 Problema #001 – Formulário de registro sem campo de confirmação de senha

- **Severidade:** Média
- **Tipo:** UX / Validação
- **Passo a passo:**
  1. Acesse `http://localhost:3000/`
  2. Clique em "Primeiro acesso? Registre-se aqui"
  3. Preencha o e-mail com `usuario@exemplo.com`
  4. Preencha a senha com `minhasenha123` (qualquer senha)
  5. Clique em "Registrar Nova Conta"
  6. Observe que a conta é criada sem nenhuma confirmação de que a senha foi digitada corretamente
- **Resultado esperado:** O formulário de registro deve exigir que o usuário confirme a senha digitando-a duas vezes.
- **Resultado obtido:** A conta é criada com a senha digitada apenas uma vez. Um erro de digitação causaria bloqueio permanente para o usuário, que não teria como recuperar o acesso (ver Problema #002).
- **Evidência:** Análise do código `src/pages/Login.tsx` — apenas um campo `<input type="password">` no fluxo `isSignUp`.
- **Recomendação:** Adicionar um segundo campo de confirmação de senha ao modo `isSignUp`. Validar igualdade entre os dois valores antes de chamar `signUpWithEmail`.

---

#### 🐞 Problema #002 – Ausência de funcionalidade "Esqueci minha senha"

- **Severidade:** Média
- **Tipo:** UX / Funcionalidade ausente
- **Passo a passo:**
  1. Acesse `http://localhost:3000/`
  2. Procure por um link ou botão de recuperação de senha
  3. Observe que não existe tal opção em nenhum lugar da página
- **Resultado esperado:** Deve existir um link "Esqueci minha senha" que dispare um e-mail de redefinição via Firebase Auth (`sendPasswordResetEmail`).
- **Resultado obtido:** Sem recuperação de senha, um usuário que esqueça a senha fica permanentemente bloqueado e precisa criar uma nova conta.
- **Evidência:** Verificação completa do componente `src/pages/Login.tsx` — nenhum uso de `sendPasswordResetEmail` foi encontrado.
- **Recomendação:** Implementar fluxo com `sendPasswordResetEmail(auth, email)` do Firebase Auth. Adicionar link "Esqueci minha senha" abaixo do campo de senha no modo de login.

---

#### 🐞 Problema #003 – Validação de campos vazios delegada ao browser (inconsistência visual)

- **Severidade:** Baixa
- **Tipo:** UX / Acessibilidade
- **Passo a passo:**
  1. Acesse `http://localhost:3000/`
  2. Sem preencher nenhum campo, clique em "Entrar no Sistema"
  3. Observe o balão de tooltip nativo do browser aparecendo sobre o campo de e-mail
- **Resultado esperado:** A mensagem de erro deve ser exibida no mesmo estilo visual do design system da aplicação (como o `<motion.div>` com fundo rosa e ícone `AlertCircle`).
- **Resultado obtido:** O browser exibe seu próprio balão de validação HTML5 nativo ("Preencha este campo."), que é visualmente inconsistente com o restante da interface.
- **Evidência:** Screenshot capturado durante o teste.
- **Recomendação:** Remover o atributo `required` nativo do HTML e implementar a validação no evento `onSubmit` do formulário, exibindo os erros através do mecanismo de alerta já existente (`setError`).

---

#### 🐞 Problema #004 – Campo de senha sem opção de visualizar o conteúdo digitado

- **Severidade:** Baixa
- **Tipo:** UX
- **Passo a passo:**
  1. Acesse `http://localhost:3000/`
  2. Digite sua senha no campo "Senha de Acesso"
  3. Observe que não há ícone de "olho" para revelar a senha digitada
- **Resultado esperado:** Botão/ícone de toggle para mostrar/ocultar a senha, especialmente útil em dispositivos móveis.
- **Resultado obtido:** Campo sempre mascarado, aumentando chance de erro de digitação.
- **Evidência:** Análise do código `src/pages/Login.tsx` — campo `type="password"` sem toggle.
- **Recomendação:** Adicionar botão com ícone `Eye`/`EyeOff` do lucide-react que alterna o `type` entre `"password"` e `"text"`.

---

### 2. Guarda de Rotas e Navegação

---

#### ✅ Resultado #001 – Todas as rotas protegidas redirecionam para login

- Rotas testadas sem autenticação: `/dashboard`, `/pessoas`, `/areas`, `/ruas`, `/casas`, `/visitas-pendentes`, `/agente-territorio`
- Todas redirecionam para `http://localhost:3000/` corretamente.
- Path traversal `/pessoa/editar/../../../../etc/passwd` → redireciona para `/` ✅
- ID extremamente longo (222 chars) → redireciona para `/` ✅
- Rota inexistente `/rota-que-nao-existe` → redireciona para `/` ✅

---

### 3. Formulário de Pessoa – Wizard Multi-etapas (`/pessoa/novo`, `/pessoa/editar/:id`)

**URL:** `http://localhost:3000/pessoa/novo`

---

#### 🐞 Problema #005 – Campo CPF/CNS sem validação de formato no frontend

- **Severidade:** Média
- **Tipo:** Validação
- **Passo a passo:**
  1. Acesse `/pessoa/novo` (autenticado)
  2. No Step 1 (Identificação), preencha o campo CPF/CNS com `abc` ou `123` ou `99999999999` (CPF inválido) ou `' OR '1'='1`
  3. Preencha os demais campos obrigatórios e avance para o Step 2
  4. Observe que o formulário aceita qualquer string sem reclamar
- **Resultado esperado:** O campo deve validar se o valor é um CPF válido (11 dígitos + dígito verificador) ou um CNS válido (15 dígitos) antes de permitir avançar.
- **Resultado obtido:** Qualquer string é aceita. O backend (`buildPessoaPayloadFromWizard`) apenas remove caracteres não-numéricos via `normalizeDocument`, mas não valida o resultado. Um CPF como `000.000.000-00` passaria como `00000000000`.
- **Evidência:** `src/utils/pessoaSchema.ts` — `validateWizardStep` verifica apenas se o campo está preenchido (`!data.identificacao.cpfCnsCidadao.trim()`), não se é válido.
- **Recomendação:** Implementar validação de CPF (algoritmo de dígito verificador) ou CNS (regra de módulo 11) em `validateWizardStep`. Exibir máscara visual no campo.

---

#### 🐞 Problema #006 – Inconsistência de comprimento máximo entre `nomeCompleto` e `nome`

- **Severidade:** Média
- **Tipo:** Backend / Validação
- **Passo a passo:**
  1. Acesse `/pessoa/novo` (autenticado)
  2. No campo "Nome Completo", preencha com uma string de 105 caracteres (válida pela regra do campo: max 120)
  3. Complete os passos do wizard e submeta
  4. Observe um erro de permissão negada do Firestore
- **Resultado esperado:** O nome ser salvo corretamente ou uma mensagem de erro clara informando o limite de caracteres.
- **Resultado obtido:** A Firestore Rule valida `data.nome.size() <= 100` para o campo de nível raiz (`nome`), enquanto `isValidIdentificacao` permite `nomeCompleto.size() <= 120`. O campo `nome` é derivado de `nomeCompleto.trim()`, portanto nomes entre 101–120 caracteres causam falha silenciosa com erro genérico de permissão.
- **Evidência:** `firestore.rules` linhas `isValidPessoa` (nome ≤ 100) vs `isValidIdentificacao` (nomeCompleto ≤ 120).
- **Recomendação:** Alinhar os limites: definir `nomeCompleto.size() <= 100` em `isValidIdentificacao`, ou aumentar o limite de `nome` para 120 em `isValidPessoa`. Adicionar `maxLength={100}` no campo HTML.

---

#### 🐞 Problema #007 – Dados do wizard perdidos ao recarregar a página

- **Severidade:** Média
- **Tipo:** UX
- **Passo a passo:**
  1. Acesse `/pessoa/novo` (autenticado)
  2. Preencha os campos do Step 1 e avance para o Step 3
  3. Pressione F5 (recarregar página)
  4. Observe que todos os dados preenchidos são perdidos e o wizard retorna ao Step 1 zerado
- **Resultado esperado:** O estado do formulário deve ser preservado ao recarregar, ou o usuário deve ser avisado que vai perder seus dados.
- **Resultado obtido:** Todos os dados são descartados sem aviso. Um usuário que acidentalmente recarregue a página no meio do cadastro precisa recomeçar do zero.
- **Evidência:** `src/pages/PessoaForm.tsx` — estado gerenciado apenas via `useState`, sem persistência em `sessionStorage`/`localStorage` ou `beforeunload` handler.
- **Recomendação:** Persistir o `formData` em `sessionStorage` via `useEffect`, ou exibir um `window.confirm` no evento `beforeunload` quando o formulário tiver dados não salvos.

---

#### 🐞 Problema #008 – Inputs de texto sem atributo `maxLength` no HTML

- **Severidade:** Baixa
- **Tipo:** UX / Validação
- **Passo a passo:**
  1. Acesse `/pessoa/novo` (autenticado)
  2. Nos campos de texto livre (Nome Completo, Nome Social, Nome da Mãe, Microárea, Telefone, Casa/Número), tente digitar um texto muito longo (ex: 500 caracteres)
  3. O campo aceita todo o texto
  4. Ao submeter, o Firestore rejeita com erro genérico de permissão
- **Resultado esperado:** O campo deve limitar visualmente a entrada ao máximo permitido pelas regras do Firestore.
- **Resultado obtido:** O usuário pode digitar livremente, só recebendo erro após tentativa de gravação.
- **Evidência:** `src/pages/PessoaForm.tsx` — inputs `type="text"` sem `maxLength`.
- **Recomendação:** Adicionar `maxLength` correspondendo aos limites das Firestore Rules em todos os inputs de texto do formulário.

---

#### 🐞 Problema #009 – Campo de telefone e e-mail (endereço) sem validação de formato

- **Severidade:** Baixa
- **Tipo:** Validação
- **Passo a passo:**
  1. Acesse `/pessoa/novo` (autenticado)
  2. No Step 2 (Endereço), preencha o campo "Telefone" com `abc def` e o campo "E-mail" com `nao_e_email`
  3. Complete o wizard e salve
  4. Observe que os valores inválidos são aceitos e gravados
- **Resultado esperado:** O campo de telefone deve ter máscara `(XX) XXXXX-XXXX` e o campo de e-mail deve usar `type="email"` ou validação customizada.
- **Resultado obtido:** Ambos os campos aceitam qualquer string sem validação de formato.
- **Evidência:** `src/pages/PessoaForm.tsx` — `type="text"` em ambos os campos. `src/types.ts` — `telefoneCelular?: string`, `email?: string` sem formato definido.
- **Recomendação:** Usar `type="email"` para o campo de e-mail. Adicionar máscara de telefone brasileiro ou validação via regex no campo de telefone.

---

#### 🐞 Problema #010 – Somente o primeiro erro de validação é exibido por vez no wizard

- **Severidade:** Baixa
- **Tipo:** UX
- **Passo a passo:**
  1. Acesse `/pessoa/novo` (autenticado)
  2. No Step 1, deixe "Nome Completo", "CPF/CNS" e "Data de Nascimento" em branco
  3. Clique em "Próximo"
  4. Observe que apenas a mensagem "Informe o nome completo." é exibida
  5. Preencha o nome e clique novamente
  6. Agora aparece "Informe CPF/CNS do cidadão."
- **Resultado esperado:** Todos os erros de validação do step atual devem ser exibidos simultaneamente.
- **Resultado obtido:** `validateStepOrSetError` chama `setError(issues[0])`, exibindo apenas o primeiro erro. O usuário precisa corrigir e tentar avançar múltiplas vezes.
- **Evidência:** `src/pages/PessoaForm.tsx` — `setError(issues[0])`.
- **Recomendação:** Exibir todos os erros, por exemplo como uma lista `<ul>` dentro do alerta de erro existente.

---

### 4. Lista de Áreas (`/areas`)

**URL:** `http://localhost:3000/areas`

---

#### 🐞 Problema #011 – Exclusão em cascata sem uso de transação Firestore

- **Severidade:** Alta
- **Tipo:** Backend / Integridade de dados
- **Passo a passo:**
  1. Acesse `/areas` (autenticado, com área contendo ruas e pessoas vinculadas)
  2. Clique no botão de excluir uma área
  3. Confirme a exclusão no modal de aviso
  4. Simule uma falha de rede após a exclusão das ruas mas antes da exclusão das pessoas (ou da própria área)
  5. Observe que o estado do banco ficou parcialmente inconsistente
- **Resultado esperado:** A operação de exclusão em cascata deve ser atômica: ou tudo é excluído, ou nada é.
- **Resultado obtido:** `executeCascadeDelete` em `AreasLista.tsx` executa múltiplos `deleteDoc`/`updateDoc` em sequência sem usar `WriteBatch` ou transação. Uma falha parcial deixa ruas excluídas mas a área ainda existente, ou pessoas desvinculadas sem que a área tenha sido removida.
- **Evidência:** `src/pages/AreasLista.tsx` — laço `for...of` com múltiplos `await deleteDoc(...)` sem `WriteBatch`.
- **Recomendação:** Substituir por `writeBatch(db)` do Firestore, agrupando todas as operações em um único batch e chamando `await batch.commit()`. Para volumes maiores, utilizar Cloud Functions com transação server-side.

---

#### 🐞 Problema #012 – Campo "Nome da Área" no modal sem `maxLength`

- **Severidade:** Baixa
- **Tipo:** UX / Validação
- **Passo a passo:**
  1. Acesse `/areas` → clique em "Nova Área"
  2. Digite um nome com mais de 100 caracteres no campo "Nome da Área"
  3. Clique em "Salvar"
  4. O Firestore rejeita com erro de permissão (isValidArea: nome ≤ 100)
- **Resultado esperado:** O campo deve limitar a entrada a 100 caracteres com feedback visual.
- **Resultado obtido:** Erro opaco de permissão negada do Firestore.
- **Evidência:** `firestore.rules` → `isValidArea`, `data.nome.size() <= 100`. Sem `maxLength` no input do modal.
- **Recomendação:** Adicionar `maxLength={100}` no input do modal. Adicionar contador de caracteres.

---

### 5. Detalhes do Paciente e Registro de Visitas (`/pessoa/:id`)

**URL:** `http://localhost:3000/pessoa/[id]`

---

#### 🐞 Problema #013 – Modal de visita aceita datas futuras sem validação

- **Severidade:** Média
- **Tipo:** Validação / Integridade de dados
- **Passo a passo:**
  1. Acesse `/pessoa/[id]` de qualquer paciente (autenticado)
  2. Clique em "Registrar Visita"
  3. No campo de data, insira uma data futura (ex: 2099-12-31)
  4. Preencha a descrição e salve
  5. A visita é registrada com data no futuro
- **Resultado esperado:** O sistema deve rejeitar datas de visita superiores à data atual.
- **Resultado obtido:** Visitas com data futura são aceitas tanto no frontend quanto nas Firestore Rules (`isValidAtendimento` não valida se `dataVisita` está no passado). Isso polui o histórico clínico com dados fictícios.
- **Evidência:** `src/pages/PessoaDetalhes.tsx` — sem validação `visitLocalDate > new Date()`. `firestore.rules` — `data.dataVisita is timestamp` sem restrição de data máxima.
- **Recomendação:** Adicionar validação no frontend: `if (visitLocalDate > new Date()) { setModalError('A data da visita não pode ser futura.'); return; }`. Complementar na regra Firestore: `data.dataVisita <= request.time`.

---

#### 🐞 Problema #014 – Campo de descrição da visita sem `maxLength` no HTML

- **Severidade:** Baixa
- **Tipo:** UX / Validação
- **Passo a passo:**
  1. Acesse `/pessoa/[id]` → clique em "Registrar Visita"
  2. No campo de descrição, cole um texto com mais de 1.000 caracteres
  3. Salve
  4. O Firestore rejeita com erro de permissão (isValidAtendimento: descricao ≤ 1000)
- **Resultado esperado:** O textarea deve limitar a entrada a 1.000 caracteres com contador visual.
- **Resultado obtido:** Sem feedback antes da tentativa de gravação.
- **Evidência:** `firestore.rules` → `data.descricao.size() <= 1000`. Sem `maxLength` no textarea.
- **Recomendação:** Adicionar `maxLength={1000}` no textarea e exibir contador de caracteres restantes.

---

### 6. Visitas Pendentes (`/visitas-pendentes`)

**URL:** `http://localhost:3000/visitas-pendentes`

---

#### 🐞 Problema #015 – Registro em lote de visitas sem uso de WriteBatch/transação

- **Severidade:** Alta
- **Tipo:** Backend / Integridade de dados
- **Passo a passo:**
  1. Acesse `/visitas-pendentes` (autenticado)
  2. Selecione múltiplos pacientes para visita em lote
  3. Clique em "Registrar visita em lote"
  4. Se a rede falhar após os primeiros registros, parte dos pacientes terá a visita registrada e outra parte não
- **Resultado esperado:** O registro em lote deve ser atômico ou ter mecanismo de reprocessamento/idempotência.
- **Resultado obtido:** Múltiplos `setDoc` executados sequencialmente em loop sem WriteBatch. Falha parcial resulta em estado inconsistente.
- **Evidência:** `src/pages/VisitasPendentes.tsx` — laço com `await setDoc(...)` individual para cada visita.
- **Recomendação:** Usar `writeBatch(db)` agrupando todos os `setDoc` de atendimento + `updateDoc` de `visitaPendente`. Firestore Batch suporta até 500 operações por batch.

---

#### 🐞 Problema #016 – Campo de data na visita em lote aceita datas futuras

- **Severidade:** Média
- **Tipo:** Validação (mesma raiz do Problema #013)
- **Evidência:** Mesmo padrão de `modalDataVisita` sem validação de futuro em `VisitasPendentes.tsx`.
- **Recomendação:** Mesma correção do Problema #013 aplicada ao modal de lote.

---

### 7. Acessibilidade e Responsividade (Global)

---

#### 🐞 Problema #017 – Campos de formulário sem atributos ARIA adequados

- **Severidade:** Baixa
- **Tipo:** Acessibilidade
- **Observação:** Os inputs de texto não possuem `aria-required`, `aria-describedby` ou `aria-invalid`. Leitores de tela podem não anunciar corretamente o estado de erro ou obrigatoriedade dos campos.
- **Evidência:** Análise dos componentes de formulário — ausência de atributos ARIA em `Login.tsx`, `PessoaForm.tsx`, e nos modais de `AreasLista.tsx`.
- **Recomendação:** Adicionar `aria-required="true"` em campos obrigatórios, `aria-describedby` linkando ao elemento de erro, e `aria-invalid={!!error}` em campos com erro ativo.

---

#### 🐞 Problema #018 – Campo de e-mail de login sem `autocomplete="email"`

- **Severidade:** Baixa
- **Tipo:** UX / Acessibilidade
- **Observação:** Os campos de login não declaram `autocomplete="email"` e `autocomplete="current-password"`. Embora funcionem com gerenciadores de senhas populares, a omissão pode causar comportamento imprevisível em alguns navegadores e gerenciadores.
- **Evidência:** `src/pages/Login.tsx` — ausência do atributo `autocomplete`.
- **Recomendação:** Adicionar `autoComplete="email"` no input de e-mail e `autoComplete="current-password"` (login) ou `autoComplete="new-password"` (registro) no input de senha.

---

#### 🐞 Problema #019 – Página sem meta description e manifest incompleto

- **Severidade:** Baixa
- **Tipo:** SEO / PWA
- **Observação:** `index.html` não contém `<meta name="description">`. O `manifest.webmanifest` existe, mas deve-se verificar ícones e `theme_color` para a experiência PWA completa em dispositivos móveis.
- **Recomendação:** Adicionar `<meta name="description" content="...">` em `index.html`. Verificar `public/manifest.webmanifest`.

---

#### 🐞 Problema #020 – Ausência de política de Content Security Policy (CSP)

- **Severidade:** Média
- **Tipo:** Segurança
- **Observação:** Não foi encontrada configuração de Content Security Policy nos cabeçalhos HTTP ou via `<meta http-equiv="Content-Security-Policy">` no `index.html`. Embora não exista `dangerouslySetInnerHTML` no código (ótimo), uma CSP robusta é a camada de defesa em profundidade recomendada para aplicações SPA.
- **Evidência:** `index.html` — ausência de meta CSP. `firebase.json` — sem regras de cabeçalho de segurança.
- **Recomendação:** Configurar CSP no `firebase.json` via campo `"headers"`:
  ```json
  {
    "source": "/**",
    "headers": [
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com; ..." },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "X-Content-Type-Options", "value": "nosniff" }
    ]
  }
  ```

---

## 🛡️ Análise de Segurança — Resultados

| Vetor | Status | Observação |
|---|---|---|
| XSS via campos de texto | ✅ Seguro | React auto-escape; sem `dangerouslySetInnerHTML` |
| SQL/NoSQL Injection | ✅ Seguro | Firestore não é vulnerável a SQL injection; queries parametrizadas por natureza |
| Auth Bypass via URL | ✅ Seguro | `ProtectedRoute` bloqueia todas as rotas sem sessão ativa |
| Path Traversal via URL params | ✅ Seguro | Auth guard filtra antes de qualquer operação Firestore |
| Acesso cross-user (IDOR) | ✅ Seguro | Todas as Firestore Rules verificam `ownerId == request.auth.uid` |
| Elevação de privilégio | ✅ Seguro | Sem roles no frontend; Firestore Rules são a fonte de verdade |
| Dados não sanitizados na exibição | ✅ Seguro | React renderiza texto como nó de texto (não HTML) |
| Content Security Policy | ⚠️ Ausente | Ver Problema #020 |
| Segurança de senhas | ⚠️ Mínima | Firebase Auth enforça ≥6 chars; sem política de complexidade |

---

## 📌 Evidências Coletadas

### Screenshot 1 — Validação nativa do browser ao submeter formulário vazio
> Campo de e-mail recebe foco com tooltip "Preencha este campo." do navegador.

### Screenshot 2 — Erro após XSS no campo de senha
> Payload `<script>alert('XSS')</script>` enviado como senha; Firebase retorna `auth/invalid-credential`; sistema exibe "E-mail ou senha incorretos." — sem execução de script.

### Screenshot 3 — Erro de senha curta no registro
> Senha "123" no registro exibe corretamente "A senha deve ter no mínimo 6 caracteres."

### Log de Console — Erro de credencial inválida
```
FirebaseError: Firebase: Error (auth/invalid-credential).
  at _performFetchWithErrorHandling
  at async signInWithEmail (AuthContext.tsx:64:24)
  at async handleSubmit (Login.tsx:25:9)
```

---

## ✅ Próximos Passos Sugeridos (por prioridade)

### 🔴 Imediato (High Impact)
1. **[Problema #011 e #015]** — Substituir loops de Firestore por `writeBatch()` nas operações de exclusão em cascata e registro de visitas em lote. Evita corrupção silenciosa de dados.

### 🟡 Curto prazo (Médio Impacto)
2. **[Problema #002]** — Implementar "Esqueci minha senha" com `sendPasswordResetEmail` do Firebase Auth.
3. **[Problema #001]** — Adicionar campo de confirmação de senha no fluxo de registro.
4. **[Problema #013 e #016]** — Bloquear datas de visita futuras no frontend e nas Firestore Rules.
5. **[Problema #006]** — Alinhar limite de `nomeCompleto` (120) com `nome` (100) nas Firestore Rules ou vice-versa.
6. **[Problema #005]** — Implementar validação de CPF/CNS com algoritmo de dígito verificador.
7. **[Problema #007]** — Persistir estado do wizard no `sessionStorage` ou alertar sobre perda de dados no `beforeunload`.
8. **[Problema #020]** — Configurar cabeçalhos de segurança HTTP no `firebase.json` (CSP, X-Frame-Options, etc.).

### 🟢 Backlog (Baixo Impacto / UX Polish)
9. **[Problema #003]** — Substituir validação HTML5 nativa por validação no `onSubmit` com o alert do design system.
10. **[Problema #004]** — Adicionar toggle de visibilidade da senha.
11. **[Problema #008 e #012 e #014]** — Adicionar `maxLength` em todos os campos de texto alinhado às Firestore Rules.
12. **[Problema #009]** — Adicionar máscara de telefone e `type="email"` no campo de e-mail da pessoa.
13. **[Problema #010]** — Exibir todos os erros de validação do step simultaneamente.
14. **[Problema #017]** — Adicionar atributos ARIA para acessibilidade.
15. **[Problema #018]** — Adicionar `autocomplete` nos campos de login.
