# Observatório EFI — instalação passo a passo

Sistema do projeto **Educação Financeira Infantil** (IF Goiano, Campus Rio Verde).
Funciona como app instalável no Android e no iPhone, com login, fotos e vídeos pela câmera, painel de metas, estatística e infográfico executivo.

Você vai usar dois serviços gratuitos: **Supabase** (login, banco de dados e fotos) e **Vercel** (publica o site). Tempo estimado: 20 a 30 minutos.

## 1. Criar o banco no Supabase
1. Entre em https://supabase.com e crie uma conta (pode usar o Google).
2. Clique em **New project**. Dê o nome `observatorio-efi`, escolha uma senha de banco (guarde-a) e a região **South America (São Paulo)**.
3. Quando o projeto ficar pronto, abra **SQL Editor** > **New query**, cole todo o conteúdo do arquivo `supabase/schema.sql` e clique em **Run**. Deve aparecer "Success".
4. Abra **Project Settings** > **API**. Copie:
   - **Project URL**
   - a chave **anon public**
5. Abra o arquivo `config.js` deste projeto e cole os dois valores entre as aspas.

## 2. Ajustes no Supabase antes do primeiro acesso
Em **Authentication** > **Sign In / Providers** > **Email**, **desligue "Confirm email"** e salve. O sistema não depende mais do e-mail de confirmação: quem entra é só quem recebe um convite seu.

Por que o e-mail de confirmação não chegava: no plano gratuito, o serviço de e-mail padrão do Supabase só envia para endereços da própria equipe do projeto e tem limite muito baixo. Não é erro do app. Se quiser que o "Esqueci minha senha" também funcione para todos, configure um serviço de e-mail próprio em **Authentication** > **Emails** > **SMTP Settings** (por exemplo Brevo ou Resend, ambos com plano gratuito).

## 2b. Criar sua conta de administrador
Faça isto **antes** de enviar qualquer convite.
1. Se você já tentou se cadastrar antes e ficou "preso" sem e-mail, abra **Authentication** > **Users** no Supabase, apague esse usuário (menu dos três pontos > **Delete user**) e rode de novo o `supabase/schema.sql` (ele pode ser executado várias vezes sem problema).
2. Crie a conta do administrador direto no Supabase, sem e-mail: **Authentication** > **Users** > **Add user** > **Create new user**. Informe `danilo.barbosa@ifgoiano.edu.br` e uma senha, e marque **Auto Confirm User**. O sistema reconhece esse e-mail e o torna **administrador geral** automaticamente. (Só o primeiro administrador entra assim; todas as outras pessoas entram por convite.)
3. Entre no site com esse e-mail e senha.

## 3. Publicar o site na Vercel
Opção A, pelo GitHub (recomendada):
1. Crie uma conta em https://github.com e um repositório **privado** chamado `observatorio-efi`. Envie todos os arquivos desta pasta (botão **Add file** > **Upload files**).
2. Em https://vercel.com, entre com o GitHub, clique em **Add New** > **Project**, escolha o repositório e clique em **Deploy**. Não precisa mudar nenhuma configuração.

Opção B, pelo computador: com Node instalado, rode `npx vercel` dentro desta pasta e responda às perguntas.

Depois de publicar, a Vercel mostra o endereço (algo como `observatorio-efi.vercel.app`).

## 4. Avisar o Supabase do endereço
No Supabase, abra **Authentication** > **URL Configuration**:
- **Site URL**: o endereço da Vercel.
- **Redirect URLs**: o mesmo endereço.

Isso faz os links de confirmação de e-mail e de "esqueci minha senha" voltarem para o observatório.

## 5. Convidar a equipe
1. Entre no site e abra a aba **Equipe**.
2. Em **Convidar pessoa**, digite o e-mail e escolha a categoria: **Coordenador**, **Extensionista** ou **Parceiro**. Clique em **Criar convite**.
3. Aparecem os botões **Enviar por e-mail** (abre o seu programa de e-mail com a mensagem pronta), **WhatsApp** e **Copiar link**. Envie.
4. A pessoa abre o link, informa o nome, cria a senha e já entra com a categoria que você escolheu. Não precisa de aprovação nem de confirmação por e-mail.
5. O convite vale por 7 dias e só funciona uma vez, e só para o e-mail informado. Na mesma tela você acompanha quem aceitou, quem está aguardando e pode cancelar um convite.

Categorias:
- **Administrador**: tudo, inclusive gerenciar a equipe.
- **Coordenador**: cadastros, exclusões e convites para extensionistas e parceiros.
- **Extensionista**: registra oficinas, avaliações, fotos e vídeos.
- **Parceiro (só consulta)**: vê painel, análise e infográfico. Só enxerga fotos com autorização de imagem.

Quem não tem convite não consegue criar conta.

## 6. Instalar no celular
- **Android (Chrome)**: abra o endereço, toque no menu (três pontos) > **Instalar app**.
- **iPhone (Safari)**: abra o endereço, toque em **Compartilhar** > **Adicionar à Tela de Início**.

A câmera e a galeria abrem normalmente. Sem internet, oficinas e fotos ficam numa fila e são enviadas quando a conexão voltar (o aviso aparece no topo).

## Cuidados com dados de crianças (LGPD)
- As crianças aparecem só por **código**. Não cadastre nome completo.
- Registre o consentimento dos responsáveis em cada criança.
- Marque "autorização de imagem" só quando houver termo assinado. Fotos sem autorização não entram no infográfico nem aparecem para parceiros.
- Defina com a Diretoria de Extensão quem será o controlador dos dados e por quanto tempo eles serão guardados.
- No plano gratuito do Supabase, projetos ficam pausados após cerca de uma semana sem uso e há limite de espaço (cerca de 1 GB de arquivos). As fotos são reduzidas antes do envio para economizar espaço. Faça um backup (exportar CSV) ao fim de cada ciclo.

## O que tem em cada arquivo
- `index.html`, `styles.css`, `app.js`: o aplicativo.
- `config.js`: seus dados do Supabase.
- `sw.js`, `manifest.webmanifest`, ícones: fazem o app instalável e abrir sem internet.
- `supabase/schema.sql`: tabelas, regras de acesso e armazenamento de fotos.
