# Multiple Finance

Aplicativo financeiro privado desenvolvido com React, Vite, TypeScript, Tailwind e Supabase.

## Abrir no StackBlitz

1. Envie os arquivos do projeto para um repositório no GitHub. Não envie `.env.local`, `node_modules`, `dist`, `outputs` ou `work`.
2. Abra o endereço abaixo, substituindo o usuário e o repositório:

   `https://stackblitz.com/github/SEU_USUARIO/SEU_REPOSITORIO?startScript=dev`

3. No projeto aberto no StackBlitz, configure o arquivo especial `.env` do editor (ou **Settings > Variables**) somente para o preview:

   ```env
   VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON
   ```

4. Aguarde a instalação automática das dependências e execute `npm run dev` caso o preview não inicie sozinho.

Use somente a chave pública `anon` no frontend. Nunca adicione `service_role` ao GitHub ou ao StackBlitz. Não confirme o arquivo `.env` no GitHub. As migrations em `supabase/migrations` devem ser aplicadas separadamente em um projeto Supabase de teste; o StackBlitz executa apenas a aplicação web.
