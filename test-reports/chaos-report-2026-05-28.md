# 🔍 Relatório de Teste Caótico - Saúde em Ação ACS

**Data:** 2026-05-28
**Agente:** Chaos Agent v1.0
**Ambiente:** http://localhost:3000
**Branch:** main
**Metodologia:** Teste exploratório via browser automatizado (Playwright) + análise estática de código-fonte

---

## 📊 Sumário Executivo

| Métrica | Valor |
|---|---|
| Páginas/rotas testadas | 10 de 11 |
| Problemas novos encontrados | 8 |
| 🔴 Críticos | 0 |
| 🟠 Altos | 1 |
| 🟡 Médios | 2 |
| 🟢 Baixos | 5 |
| Melhorias confirmadas | 10 |
| **Status geral** | 🟡 Atenção — 1 bug alto identificado |

**Destaques positivos (mantidos desde 2026-05-27):**
- Todas as rotas protegidas redirecionam corretamente para `/` após logout
- Back button pós-logout permanece em `/login` (sem acesso a rota protegida anterior)
- XSS não é executável em nenhum campo de dado (React auto-escape)
- Firebase não revela se um e-mail está cadastrado ao solicitar redefinição de senha (prevenção de enumeração de e-mail)
- Formulário de registro valida divergência de senha antes de enviar
- Mensagens de erro de autenticação genéricas ("E-mail ou senha incorretos") — não vaza informação de debug
- Erro 400 do Firebase não exposto ao usuário final

---

## ✅ Melhorias Confirmadas (desde relatório 2026-05-27)

| # Problema Anterior | Descrição | Status |
|---|---|---|
| #002 | Link "Esqueci minha senha" adicionado na tela de login | ✅ Resolvido |
| #004 | Botão "Mostrar/ocultar senha" adicionado nos campos de senha | ✅ Resolvido |
| #005 | CPF/CNS validado com algoritmo de dígito verificador completo | ✅ Resolvido |
| #007 | Draft do formulário persiste via `sessionStorage` em reloads da página | ✅ Resolvido (parcial — veja Novo Problema #002) |
| #008 | `maxLength` adicionado nos campos principais do wizard (nome, CPF, nomeSocial, etc.) | ✅ Resolvido (parcial) |
| #009 | `type="tel"` e `type="email"` adicionados nos campos correspondentes do wizard | ✅ Resolvido |
| #010 | Múltiplos erros de validação exibidos simultaneamente no wizard | ✅ Resolvido |
| #012 | `maxLength={100}` e contador de caracteres no modal de Nova Área | ✅ Resolvido |
| — | Banner de aviso quando território não está configurado (Step 2 do wizard) | ✅ Novo feature |
| — | Handler `beforeunload` alerta abandono de formulário com dados preenchidos | ✅ Novo feature |

---

## 🐛 Novos Problemas Encontrados

---

### 🟢 BAIXO — Problema #001
**Página:** Dashboard (`/dashboard`)
**Título:** Filtro de período aceita intervalo de datas invertido sem validação

**Descrição:**
O filtro de data de início e data de fim no Dashboard aceita configurações onde a data de início é posterior à data de fim (ex: início em 2025-12-01, fim em 2025-01-01). O sistema não emite aviso, não corrige automaticamente e aparentemente processa o intervalo invertido sem feedback ao usuário.

**Passos para reproduzir:**
1. Acessar `/dashboard`
2. Preencher campo "Data inicial" com uma data futura (ex: 2030-01-01)
3. Manter "Data final" com data menor
4. Observar: nenhum erro é exibido

**Impacto:** Baixo — pode gerar resultados vazios ou confusos, mas não causa quebra funcional.
**Sugestão:** Validar `startDate <= endDate` e exibir mensagem de erro inline.

---

### 🟡 MÉDIO — Problema #002
**Página:** PessoaForm (`/pessoa/novo`)
**Título:** Draft do `sessionStorage` não é restaurado ao navegar de volta via React Router

**Descrição:**
Ao preencher parcialmente o formulário `/pessoa/novo` e navegar para outra rota (ex: `/pessoas`) e retornar, o rascunho salvo no `sessionStorage` não é restaurado. Os campos aparecem vazios.

**Causa Raiz Identificada (análise estática `src/pages/PessoaForm.tsx`):**
Race condition com React StrictMode. O hook `useEffect` de restauração (deps: `[]`) lê o draft do `sessionStorage` na primeira montagem. O hook de persistência (deps: `[isEditMode, formData]`) re-executa com o estado inicial vazio na *segunda* montagem (StrictMode double-invoke), sobrescrevendo o draft antes que o estado React seja atualizado. Em produção (sem StrictMode), o bug pode não ocorrer, mas indica dependência frágil na ordem de efeitos.

**Passos para reproduzir:**
1. Acessar `/pessoa/novo`
2. Preencher campo "Nome Completo" com qualquer valor
3. Clicar em "Moradores" no menu lateral (navegação React Router)
4. Clicar em "Nova Pessoa" para retornar a `/pessoa/novo`
5. Observar: campos aparecem vazios (draft não restaurado)

**Impacto:** Médio — perda de dados do usuário em cenário frequente (navegação acidental).
**Sugestão:** Usar `useRef` para flag de "já restaurou" ou inverter a ordem dos effects (checar `sessionStorage` antes de persistir estado inicial).

---

### 🟡 MÉDIO — Problema #003
**Página:** PessoaForm Step 2 (`/pessoa/novo` — etapa 2)
**Título:** Validação de `areaId` ocorre apenas no submit final, não na transição entre etapas

**Descrição:**
Para usuários com `legacyAccess = false` (que possuem perfil territorial configurado), o campo `areaId` é obrigatório para salvar uma ficha. Porém, essa validação só é executada no momento do submit final (etapa 4), não na transição da etapa 2 (onde o campo de área aparece). O usuário preenche 4 etapas completas de dados para só então receber o erro de área não selecionada.

**Passos para reproduzir:**
1. Garantir que o usuário possui `agentes/{uid}` doc com `areaIds` não vazio
2. Acessar `/pessoa/novo`
3. Preencher etapa 1 normalmente, avançar para etapa 2
4. Não selecionar uma área (ignorar o campo)
5. Avançar para etapas 3 e 4, preencher dados
6. Clicar em "Salvar Ficha"
7. Observar: erro sobre área não selecionada exibido apenas agora

**Impacto:** Médio — UX degradada; dados perdidos ou usuário frustrado.
**Sugestão:** Adicionar validação de `areaId` também na função `validateWizardStep(2, data)` dentro de `pessoaSchema.ts`.

---

### 🟢 BAIXO — Problema #004
**Página:** Áreas (`/areas`) e Ruas (`/ruas`)
**Título:** `window.alert()` nativo usado para mensagens de erro de validação

**Descrição:**
As páginas de Áreas e Ruas utilizam `window.alert()` nativo do browser para exibir mensagens de erro (ex: "Nenhuma área cadastrada" ao tentar criar uma Rua sem áreas). Isso é inconsistente com o design system do restante do aplicativo (que usa componentes toast/alert inline) e bloqueia automação de testes.

**Passos para reproduzir:**
1. Acessar `/ruas` sem nenhuma área cadastrada
2. Clicar em "Nova Rua"
3. Observar: `window.alert()` nativo do browser é exibido em vez de componente inline

**Impacto:** Baixo — inconsistência visual/UX; bloqueia automação de testes.
**Sugestão:** Substituir `window.alert()` por toast notification ou inline error state.

---

### 🟢 BAIXO — Problema #005
**Página:** Áreas (`/areas`)
**Título:** Botão "Nova Área" inacessível via ferramentas de automação (Framer Motion instabilidade)

**Descrição:**
O botão "Nova Área" e outros botões da aplicação utilizam Framer Motion para animações de transição. O Playwright não consegue executar `.click()` convencional pois o elemento nunca é detectado como "estável" (a animação impede o critério de estabilidade do Playwright). É necessário usar `page.evaluate(() => btn?.click())` como workaround.

**Impacto:** Baixo — afeta exclusivamente automação/testes; nenhum impacto no usuário final.
**Sugestão:** Adicionar `data-testid` nos elementos interativos críticos e configurar `motion.div` com `initial={false}` em ambientes de teste, ou usar `reduceMotion` via Framer Motion.

---

### 🟠 ALTO — Problema #006
**Página:** Meu Território (`/agente-territorio`)
**Título:** "Salvar Perfil Territorial" com zero áreas executa sem confirmação, potencialmente bloqueando acesso a todos os dados

**Descrição:**
O botão "Salvar Perfil Territorial" executa imediatamente ao clique, sem diálogo de confirmação, mesmo quando nenhuma área está selecionada. Ao salvar, cria (ou sobrescreve) o documento `agentes/{uid}` no Firestore com `areaIds: []`.

Como resultado, o `AuthContext` detecta a existência do documento e define `legacyAccess = false` com `areaIds = []`. Isso muda o comportamento de escopo territorial de **acesso total** (modo legado) para **acesso filtrado por áreas** com lista vazia — efetivamente **bloqueando o acesso a todos os cadastros existentes** (moradores, áreas, ruas, casas, visitas).

**Passos para reproduzir:**
1. Acessar `/agente-territorio` em modo legado (sem `agentes/{uid}` doc)
2. Verificar: 0 áreas selecionadas
3. Clicar em "Salvar Perfil Territorial" sem selecionar nenhuma área
4. Observar: toast "Perfil territorial salvo com sucesso." aparece sem confirmação
5. Navegar para `/pessoas` — mostra "0 de 0 registros" (dados inacessíveis)

**Evidência coletada:**
- `dialogMessage: ""` — nenhum dialog de confirmação foi disparado
- Snapshot após clique: `generic [ref=e84]: Perfil territorial salvo com sucesso.`
- Página `/pessoas` após save: `Mostrando 0 de 0 registros`

**Impacto:** Alto — usuário pode perder acesso a todos os seus dados com um clique acidental. Recuperação requer que o usuário retorne a `/agente-territorio` e adicione áreas manualmente (se souber o que fazer).
**Sugestão:**
1. Exibir modal de confirmação com aviso: "Salvar sem áreas selecionadas irá restringir seu acesso. Deseja continuar?"
2. **Ou** bloquear o save quando `areaIds` está vazio e `legacyAccess = true`, com mensagem explicativa
3. Adicionar botão "Voltar ao modo legado" para recuperação fácil

---

### 🟢 BAIXO — Problema #007
**Página:** Login (`/`) e Registro
**Título:** `autocomplete` incorreto no campo de senha

**Descrição:**
O atributo `autocomplete` do campo de senha (Senha de Acesso) está definido como `"email"` tanto no formulário de login quanto no de registro. O correto seria:
- Login: `autocomplete="current-password"`
- Registro (novo campo senha): `autocomplete="new-password"` (já correto no campo de *confirmação*)

O valor incorreto faz com que gerenciadores de senha tentem preencher o campo de senha com um endereço de e-mail, causando comportamento inesperado e erros de autofill.

**Evidência:**
```js
// Resultado de page.$$eval('input', ...) na página de registro:
{ type: "password", autocomplete: "email", placeholder: "Sua senha secreta" }
{ type: "password", autocomplete: "new-password", placeholder: "Repita a senha" }
```

**Impacto:** Baixo — afeta usabilidade com gerenciadores de senha; pode frustrar usuários que dependem de autofill.
**Sugestão:** Alterar `autocomplete="email"` para `autocomplete="current-password"` (login) e `autocomplete="new-password"` (registro).

---

### 🟢 BAIXO — Problema #008
**Página:** Login (`/`) e Registro
**Título:** Ausência de `maxLength` nos campos de e-mail e senha

**Descrição:**
Os campos de e-mail e senha na tela de Login/Registro não possuem atributo `maxLength` (`maxLength = -1`). Isso permite que o usuário insira strings arbitrariamente longas (testado com 509 caracteres no email e 1000 no campo de senha) que são enviadas diretamente ao Firebase Auth.

Embora o Firebase provavelmente rejeite ou trunque valores excessivos no backend, a ausência de limite no frontend:
1. Não fornece feedback imediato ao usuário sobre input inválido
2. Permite envio de payloads grandes para o serviço de auth
3. É inconsistente com os limites aplicados nos outros formulários do app

**Evidência:**
```js
{ type: "email", maxLength: -1 }  // aceita 509+ chars
{ type: "password", maxLength: -1 }  // aceita 1000+ chars
```

**Impacto:** Baixo — nenhuma vulnerabilidade crítica identificada (Firebase valida server-side), mas inconsistente com boas práticas.
**Sugestão:** Adicionar `maxLength={254}` no campo de email (limite RFC 5321) e `maxLength={128}` no campo de senha.

---

## 📋 Registro de Testes por Página

| Página | Rota | Status | Observações |
|---|---|---|---|
| Login | `/` | ✅ Testado | XSS rejeitado pelo tipo email; mensagens genéricas ✅; sem maxLength ⚠️; autocomplete incorreto ⚠️ |
| Dashboard | `/dashboard` | ✅ Testado | Filtro de datas invertido aceito sem aviso ⚠️ |
| Moradores | `/pessoas` | ✅ Testado | XSS seguro; estado vazio exibido corretamente |
| Nova Pessoa (Step 1) | `/pessoa/novo` | ✅ Testado | CPF/CNS validado ✅; múltiplos erros simultâneos ✅ |
| Nova Pessoa (Step 2) | `/pessoa/novo` | ✅ Testado | areaId só valida no submit final ⚠️ |
| Nova Pessoa (Step 3) | `/pessoa/novo` | ✅ Testado | Sem campos obrigatórios; funciona corretamente |
| Nova Pessoa (Step 4) | `/pessoa/novo` | ✅ Testado | Toggle de condições funcional |
| Áreas | `/areas` | ✅ Testado | window.alert() nativo ⚠️; Framer Motion bloqueia automação ⚠️ |
| Ruas | `/ruas` | ✅ Testado | window.alert() nativo quando sem áreas ⚠️ |
| Casas | `/casas` | ✅ Testado | Funcional; depende de Rua/Área cadastrada |
| Visitas Pendentes | `/visitas-pendentes` | ✅ Testado | XSS seguro; filtros funcionais |
| Meu Território | `/agente-territorio` | ✅ Testado | Bug crítico: salva com 0 áreas sem confirmação 🔴 |
| Editar Pessoa | `/pessoa/editar/:id` | ⚠️ Não testado | — |

---

## 🔒 Análise de Segurança

| Vetor | Status | Observação |
|---|---|---|
| XSS via campos de formulário | ✅ Seguro | React auto-escape; nenhum `dangerouslySetInnerHTML` detectado |
| SQL Injection | ✅ N/A | Firestore não usa SQL; parâmetros passados como objetos |
| Injeção em campos de auth | ✅ Seguro | Firebase Auth rejeita; erro genérico exibido ao usuário |
| Enumeração de e-mail (reset senha) | ✅ Seguro | Firebase retorna sucesso mesmo para e-mails não cadastrados |
| Acesso a rotas protegidas sem auth | ✅ Seguro | `ProtectedRoute` redireciona para `/` |
| Acesso a dados de outro usuário | ✅ Seguro | `ownerId` scoping nas regras do Firestore |
| Path traversal via URL | ✅ Seguro | IDs inválidos retornam 404 ou estado vazio sem crash |
| Payloads longos em auth | ⚠️ Atenção | Sem `maxLength` nos campos de login/registro |
| Lockout acidental por configuração errada | ⚠️ Atenção | Save de território vazio muda permissões sem confirmação |

---

## 🎯 Recomendações Priorizadas

### Prioridade Alta
1. **Problema #006 — Meu Território:** Adicionar confirmação antes de salvar perfil territorial com 0 áreas selecionadas, com aviso claro sobre perda de acesso legado. Considerar também um mecanismo de recuperação visível (botão "Restaurar acesso legado").

### Prioridade Média
2. **Problema #002 — PessoaForm:** Corrigir race condition do sessionStorage usando flag `useRef` para controlar a ordem de restauração vs. persistência.
3. **Problema #003 — PessoaForm:** Mover validação de `areaId` para a transição da etapa 2, não apenas no submit final.

### Prioridade Baixa
4. **Problema #007 — Login/Registro:** Corrigir `autocomplete` do campo de senha para `current-password` (login) e `new-password` (registro).
5. **Problema #008 — Login/Registro:** Adicionar `maxLength` nos campos de e-mail (254) e senha (128).
6. **Problema #004 — Áreas/Ruas:** Substituir `window.alert()` por componente de toast/error inline.
7. **Problema #001 — Dashboard:** Validar que data início ≤ data fim.
8. **Problema #005 — Áreas:** Adicionar `data-testid` nos botões principais para melhorar testabilidade.

---

## 📎 Apêndice: Arquivos Relevantes Analisados

| Arquivo | Relevância |
|---|---|
| `src/pages/Login.tsx` | Formulário de auth; autocomplete; maxLength; validações |
| `src/pages/PessoaForm.tsx` | Wizard; sessionStorage draft; areaId validation |
| `src/pages/AgenteTerritorio.tsx` | Bug #006: save com 0 áreas |
| `src/context/AuthContext.tsx` | legacyAccess; consequence of agentes/{uid} doc |
| `src/utils/pessoaSchema.ts` | validateWizardStep; CPF/CNS algorithms |
| `firestore.rules` | Server-side validation constraints |

---

*Relatório gerado por Chaos Agent v1.0 em 2026-05-28*
*Próxima execução recomendada após correção dos Problemas #002, #003 e #006*
