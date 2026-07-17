# Supabase — Multiple Finance

## Ordem das migrations

1. `202607130001_initial_schema.sql`: enums, tabelas, constraints, índices e triggers.
2. `202607130002_rls_policies.sql`: funções privadas, RLS, grants e aceite seguro de convite.
3. `202607130003_receipts_storage.sql`: bucket privado e policies do Storage.
4. `202607130004_group_flows_realtime.sql`: criação transacional de grupos, prévia segura de convite e publicação Realtime.

## Autenticação

O app usa `signInWithPassword` e `signUp` do Supabase Auth. O trigger `on_auth_user_created` cria a linha correspondente em `public.profiles` e também cobre usuários existentes quando a primeira migration é aplicada.

No frontend, configure apenas:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

Nunca coloque `service_role`, secret key ou credenciais administrativas em variáveis `VITE_*`.

## Comprovantes

O bucket `receipts` é privado. O nome do objeto dentro do bucket deve seguir:

```text
{groupId}/{receiptId}.jpg
```

O caminho completo exibido pela aplicação será `receipts/{groupId}/{receiptId}.jpg`. As policies validam que o usuário é membro ativo do grupo presente no primeiro segmento.

## Convites

A tabela `group_invites` não possui acesso para usuários anônimos nem leitura para membros comuns. Um usuário autenticado aceita o token por `public.accept_group_invite(token)`. A função valida expiração, limite de usos, grupo não arquivado e cria a associação sem retornar dados privados antes do aceite.

## Verificação

Depois de aplicar as migrations, execute `supabase/tests/0001_security_assertions.sql` no banco local ou no SQL Editor para confirmar que todas as tabelas têm RLS e policies e que o bucket permanece privado.
