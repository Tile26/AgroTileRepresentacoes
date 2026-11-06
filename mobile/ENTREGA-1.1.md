# AgroTile Representações — entrega 1.1.0

## Alterações e uso

1. **Clientes** abre uma seção exclusiva, sem os indicadores do painel. Cadastro, dados fiscais, pesquisa, edição, exclusão confirmada e histórico continuam disponíveis. O painel agora está em **Início**.
2. **Produtos → Adicionar/Editar** inclui Referência e Código de Barras como texto (zeros preservados e pesquisáveis), método Margem sobre venda ou Markup sobre custo, percentual editável e escolha entre manter venda ou recalcular quando mudar custo. Mudar de método não muda o preço. Produtos antigos mantêm preços; margem é calculada a partir deles. Custo zero impede calcular venda pelo percentual; venda zero exibe margem indefinida.
3. **Pedidos** insere o último item no topo. Itens têm identificador persistente. Editar quantidade/preço não muda a posição ou custo histórico. Pedidos antigos mantêm a ordem existente.
4. **Categorias → Gerar Bonificação** habilita unidades grátis nos novos itens. Pedido/PDF mostram quantidades e valor comercial bonificado, sem aumentar faturamento. Estoque e custo realizado incluem unidades grátis. Excluir pedido devolve as unidades vendidas e bonificadas. Desativar categoria mantém a bonificação histórica; permite conservá-la ou removê-la, sem aumentar benefício enquanto desativada. Romaneio inclui toda a quantidade física.
5. **Produtos → Entrada de produtos e relatórios** registra produto, data, quantidade, custo e venda considerados. Cadastro de produto abre sobre o lançamento, que permanece preenchido. Cadastre estoque inicial zero se a quantidade será recebida nesta entrada; depois selecione o novo produto. Cada entrada soma estoque uma única vez e mantém seu custo histórico. Custo diferente pede escolha explícita; venda só muda com escolha adicional. Histórico imutável, com estorno confirmado, motivo e checagem de saldo. Estorno mantém preços cadastrais atuais. Relatórios filtram hoje/ontem/7 dias/mês/mês anterior/período/produto/categoria histórica, agrupam por produto/categoria e exportam PDF/CSV UTF-8 com BOM e ponto e vírgula. Lucro potencial é separado de lucro realizado. Para corrigir lançamento, estorne e registre novamente.
6. **Configurações → Backup e Restauração** cria arquivo protegido por senha (12 caracteres mínimos), informa data/tamanho e permite exportar por compartilhamento do sistema. Restaurar solicita arquivo e senha, autentica o conteúdo, valida versão/relacionamentos e apresenta resumo antes da confirmação explícita de substituição. Não há autenticação/contas remotas; o usuário confirma que o arquivo pertence à sua operação. A senha não é persistida. Sem senha não há recuperação. Exportar exige concluir o salvamento no destino escolhido.

## Dados e segurança

- AsyncStorage mantém a chave `agrotile-v1`. Documento passa de versão 1 para 2 por migração aditiva. Não há tabelas SQL novas nem acesso aos dados reais do telefone durante desenvolvimento.
- Novos campos: categorias `bonusEnabled`; produtos `reference`, `barcode`, `pricingMethod`; itens `itemId`, `bonus`; coleções `entries`, `settings`.
- Entradas registram IDs, produto/categoria e nomes históricos, data comercial e hora de registro, quantidade, preços, totais, valores anteriores e escolhas de atualização. Estorno guarda data/motivo sem excluir lançamento.
- Antes de persistir migração, original é preservado em `agrotile-v1-before-v2`. Antes de restaurar, original é preservado em `agrotile-v1-before-restore`. Cópias internas têm a mesma proteção do armazenamento local do aplicativo; são para recuperação técnica e não substituem exportação.
- Escritas validam um documento completo clonado. Estado exibido só muda depois do sucesso da gravação única; falha não deixa atualização parcial das coleções.
- Backup externo versionado, AES-256-GCM com nonce aleatório de 96 bits, salt aleatório de 128 bits e PBKDF2-HMAC-SHA256 com 600.000 iterações, parâmetros limitados na importação. Metadados e conteúdo autenticados. Sem chave fixa, credenciais remotas ou serviços pagos. Limite de arquivo 40 MB. Bibliotecas `@noble/ciphers` e `@noble/hashes`; aleatoriedade nativa `expo-crypto`.
- Backup automático externo não implementado: não existe infraestrutura autenticada ou destino configurado. Para implementá-lo será necessário definir autenticação, destino, retenção e tratamento de falhas. Backup manual funciona no código e tem testes criptográficos; seleção/compartilhamento nativos ainda precisam de aparelho.

## Principais arquivos

- `mobile/App.js`: integração de telas, formulários, pedido e PDF.
- `mobile/domain.js`: migração, identidades de itens, bonificações/estoque/lucro.
- `mobile/business.js`: preços, entradas, estornos, filtros e CSV.
- `mobile/storage.js`: validação e substituição segura.
- `mobile/backup.js`: criptografia e leitura autenticada.
- `mobile/OperationsUI.js`: entradas, relatórios e backup.
- `mobile/search.js`: referência/código na pesquisa.
- `mobile/features.test.mjs`: novos testes e falhas simuladas.
- `mobile/package.json`, `package-lock.json`, `app.json`, `eas.json`: dependências gratuitas, comandos e runtime 1.1.0.

## Validações executadas

- `node domain.test.mjs`: passou; estoque, edição, exclusão, lucro, painel, positivação e romaneio.
- `node search.test.mjs`: passou; 251 clientes e 150 produtos, acentos e busca.
- `node features.test.mjs`: passou; migração sem mutação, margem/markup, identificação, ordem persistida, custos por item, bonificações, entradas repetidas, estornos, datas, filtros, CSV e proteção contra fórmulas, backup, senha incorreta, adulteração, versão inválida, relações inválidas e falhas de armazenamento.
- ESLint com `no-undef:error`: passou após correções.
- TypeScript `--noEmit --allowJs`: passou na análise de arquivos JS/JSX; não equivale a conversão para TypeScript estrito.
- `node node_modules/expo/bin/cli export --platform android`: passou, 669 módulos, bundle Hermes de aproximadamente 6,4 MB. Exportação JS não equivale à instalação/teste do APK.
- `git diff --check`: passou.
- `npm audit`: 16 alertas moderados na cadeia de ferramentas Expo/ESLint (glob/minimatch), nenhum alto/crítico. A correção forçada sugerida inclui regressão para Expo 52; não aplicada para evitar quebra do SDK 58. Nenhum alerta atribuído às bibliotecas criptográficas adicionadas. Revisão de dependências deve acompanhar atualizações compatíveis.

## Execução

Na pasta `mobile`:

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npx expo start
npx expo export --platform android
```

Novo APK necessário por módulos nativos de criptografia/seleção de arquivo. Runtime 1.1.0 impede enviar estas mudanças ao APK 1.0.0. Perfil `preview` gera APK de teste interno; nenhuma publicação em produção foi autorizada nesta entrega. Antes de qualquer build, conferir franquia gratuita. Consulta em 06/11/2026 confirmou plano Free, 2 de 15 builds Android usados e estimativa zero.

## Validação pendente no aparelho

Instalar atualização sobre o APK existente, sem desinstalar/limpar dados; conferir clientes e pedidos após migração. Testar seleção de clientes/produtos, teclado e formulários, bonificação com baixa/devolução, entrada e estorno, PDF e WhatsApp, CSV no Excel, exportação/importação em outro celular, senha errada e cancelamento. Medir o tempo de derivação da senha no aparelho real. Não foi possível executar esses testes sem dispositivo/emulador Android conectado.

Não há decisão comercial pendente que bloqueie a implementação. Publicação em produção depende de autorização e validação no aparelho. Dados reais não foram restaurados, apagados ou migrados por este ambiente de desenvolvimento.
