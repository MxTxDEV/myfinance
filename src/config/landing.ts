/**
 * TODA a copy, os links e as condições comerciais da landing page ficam aqui. Edite este arquivo (ou as variáveis de
 * ambiente indicadas) — nenhum componente precisa mudar. Nada aqui foi inventado: cada funcionalidade citada existe no app
 * e cada afirmação de segurança está implementada no código (ver docs/LANDING.md).
 */

export const product = {
  name: "Finance OS",
  tagline: "Painel financeiro com plano para quitar dívidas",
};

/** Destinos reais do app. Os CTAs só apontam para rotas que existem. */
export const links = {
  signup: "/cadastro",
  login: "/login",
  demo: "#demo",
};

/**
 * Vídeo da demonstração. Aceita: arquivo MP4/WebM (URL absoluta ou /arquivo.mp4 em public/) ou link do YouTube/Vimeo.
 * Deixe vazio para mostrar só a demonstração com as telas reais. Pode vir do ambiente: NEXT_PUBLIC_DEMO_VIDEO_URL.
 */
export const demoVideo = {
  url: process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? "",
  poster: "/landing/inicio.webp",
  title: "Demonstração do Finance OS",
};

/** E-mail público de contato (opcional). NEXT_PUBLIC_CONTACT_EMAIL — se vazio, o contato não aparece. */
export const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

/** Termos de uso e política de privacidade: preencha as URLs quando existirem. Vazio = o link não aparece. */
export const legal = {
  terms: process.env.NEXT_PUBLIC_TERMS_URL ?? "",
  privacy: process.env.NEXT_PUBLIC_PRIVACY_URL ?? "",
  /** Razão social / CNPJ: só mostrados se preenchidos. */
  company: process.env.NEXT_PUBLIC_COMPANY_INFO ?? "",
};

/** Variações de headline para teste futuro (a primeira é a usada). */
export const headlineVariants = [
  "Cada gasto no lugar certo. Cada dívida com data para acabar.",
  "Contas, cartões e dívidas em um painel só, com um plano para sair do vermelho.",
  "Saiba quanto pode gastar neste mês e quando fica livre das dívidas.",
  "Chega de fatura-surpresa: veja as próximas faturas dos seus cartões, mês a mês.",
];

export const hero = {
  eyebrow: "Controle financeiro pessoal",
  headline: headlineVariants[0],
  sub: "O Finance OS junta contas, cartões, faturas, parcelas e metas em um só lugar — e calcula quanto você pode gastar por mês e em que ordem quitar o que deve.",
  primaryCta: "Criar minha conta",
  secondaryCta: "Ver demonstração",
  note: "Telas reais do aplicativo, com dados fictícios.",
};

export const nav = [
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#demo", label: "Demonstração" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#seguranca", label: "Segurança" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Perguntas" },
];

/** Problema → consequência (cada item aponta para a funcionalidade real que resolve). */
export const problems = [
  { n: "01", title: "A fatura chega e ninguém lembra o que comprou.", cost: "Você descobre o tamanho do gasto só depois do vencimento.", fix: "Cada compra no cartão entra sozinha na fatura certa, e o limite usado sobe junto.", link: "#funcionalidades" },
  { n: "02", title: "As parcelas dos próximos meses ficam invisíveis.", cost: "O mês que vem já nasce comprometido e você só percebe quando fecha a conta.", fix: "Veja a fatura atual, a próxima e as seguintes, de 12 a 36 meses, com as parcelas já contadas.", link: "#funcionalidades" },
  { n: "03", title: "Dívidas espalhadas, sem ordem para pagar.", cost: "Dinheiro extra vai para a dívida errada e os juros comem o resto.", fix: "Cartões, carro e empréstimos viram um plano: ordem de quitação, data de saída e juros no caminho.", link: "#funcionalidades" },
  { n: "04", title: "Gasto pequeno some no meio do mês.", cost: "R$ 10 aqui, R$ 20 ali — e o mês fecha no negativo sem culpado.", fix: "Avisos no celular com os seus números: compras pequenas acumuladas e o ritmo do mês.", link: "#funcionalidades" },
];

export interface Feature { id: string; name: string; benefit: string; text: string; size: "xl" | "lg" | "md" | "sm"; shot?: string }
/** Somente funcionalidades que existem no app. */
export const features: Feature[] = [
  { id: "plano", name: "Plano de quitação", benefit: "Saiba a ordem e a data para sair das dívidas.", text: "Cadastre cartões, carro e empréstimos. O app compara juros mais altos primeiro (paga menos juros) com menor saldo primeiro e mostra o mês em que cada dívida zera.", size: "xl", shot: "dividas" },
  { id: "cartoes", name: "Cartões e faturas", benefit: "Fatura atual, próxima e as seguintes, sem surpresa.", text: "Vários cartões, limite usado, parcelas mês a mês e pagamento de fatura. Cada compra lançada sobe a fatura automaticamente.", size: "lg", shot: "cartoes" },
  { id: "gastar", name: "Quanto posso gastar", benefit: "Um teto mensal calculado com a sua renda.", text: "Renda menos despesas fixas, parcelas e reserva: o app mostra o gasto livre do mês, por dia, e quanto sobra para acelerar a quitação.", size: "md" },
  { id: "orcamentos", name: "Orçamentos por categoria", benefit: "Limites que avisam antes de estourar.", text: "Defina um teto por categoria e acompanhe o quanto já usou no mês, com comparação com o mês anterior.", size: "md", shot: "orcamentos" },
  { id: "fixas", name: "Despesas fixas", benefit: "Aluguel, internet e escola previstos todo mês.", text: "Cadastre uma vez (nome, valor e dia) e a conta entra nas previsões e nos avisos de vencimento.", size: "sm", shot: "fixas" },
  { id: "metas", name: "Metas", benefit: "Veja em quantos meses cada meta fecha.", text: "Reserva de emergência, viagem, o que for: progresso, quanto guardar por mês e a projeção realista.", size: "sm", shot: "metas" },
  { id: "avisos", name: "Avisos no celular", benefit: "Lembretes de vencimento e frases que seguram o impulso.", text: "Horários sorteados dentro da janela que você escolhe, até 100 mensagens por dia, inclusive com os seus próprios números.", size: "md", shot: "notificacoes" },
  { id: "importar", name: "Importar extrato", benefit: "Traga o que já aconteceu sem digitar.", text: "Envie OFX, CSV ou PDF do banco ou da fatura. Revise, grave e reenvie à vontade: não duplica.", size: "sm" },
  { id: "auto", name: "Lançamento automático", benefit: "Compra no Apple Pay entra sozinha.", text: "Com uma chave pessoal e um Atalho do iPhone, cada pagamento vira um lançamento. Conexão com o banco via Open Finance quando configurada.", size: "sm" },
  { id: "offline", name: "Funciona sem internet", benefit: "Registre onde estiver.", text: "Instale como app. Sem sinal, o lançamento fica na fila e sincroniza quando a conexão volta.", size: "sm" },
];

export const demoTabs = [
  { id: "inicio", label: "Início", caption: "Saldo, resumo do mês e a mensagem do dia." },
  { id: "cartoes", label: "Cartões", caption: "Faturas atual e próxima, limite usado e mês a mês." },
  { id: "dividas", label: "Dívidas", caption: "Quanto posso gastar e o plano para quitar tudo." },
  { id: "metas", label: "Metas", caption: "Progresso, quanto guardar por mês e prazo realista." },
  { id: "orcamentos", label: "Orçamentos", caption: "Limite por categoria e uso do mês." },
  { id: "notificacoes", label: "Avisos", caption: "Você escolhe quantas mensagens e em que horário." },
];

export const benefits = [
  { title: "Decida com número, não com palpite", text: "Antes de gastar, você sabe o teto do mês e o que já está comprometido nas próximas faturas." },
  { title: "Pague na ordem que custa menos", text: "O plano mostra quanto de juros cada ordem de quitação gera, com base nas taxas que você informar." },
  { title: "Tudo no mesmo lugar", text: "Contas, cartões, dívidas, metas e investimentos acompanhados juntos, com o patrimônio líquido calculado." },
  { title: "Mantenha o hábito", text: "Avisos de vencimento e mensagens no horário que você definir ajudam a olhar para o dinheiro todo dia." },
];

export const steps = [
  { title: "Crie sua conta", text: "Cadastro com e-mail e senha. Cada conta enxerga somente os próprios dados." },
  { title: "Cadastre contas, cartões e dívidas", text: "Informe o que cada fatura já tem e as parcelas dos próximos meses." },
  { title: "Registre gastos em dois toques", text: "Pelo botão RECEBI/GASTEI, importando o extrato ou automatizando pelo Atalho do iPhone." },
  { title: "Acompanhe o plano e receba avisos", text: "Veja o quanto pode gastar, a data estimada de quitação e os lembretes de vencimento." },
];

/** Somente o que está implementado e testado no código. Sem certificações, sem “proteção absoluta”. */
export const security = [
  { title: "Senha protegida", text: "As senhas são guardadas apenas como hash (scrypt), nunca em texto legível." },
  { title: "Dados isolados por conta", text: "Cada consulta é filtrada pelo usuário da sessão. Uma conta não acessa dados de outra — isso é coberto por testes automatizados." },
  { title: "Painel administrativo sem os seus valores", text: "O painel do administrador mostra apenas as contas e a contagem de lançamentos, nunca valores nem descrições." },
  { title: "Sessão e cabeçalhos de segurança", text: "Sessão em cookie assinado e inacessível ao JavaScript, limite de tentativas de login e cabeçalhos como HSTS e CSP." },
  { title: "Você no controle", text: "Exporte seus dados em CSV/JSON e exclua a conta com todos os dados quando quiser." },
  { title: "Bancos sem sua senha", text: "Na conexão via Open Finance (Pluggy), a autorização acontece no ambiente do banco; o app nunca vê sua senha bancária." },
];

export interface Plan { name: string; price: string; period: string; description: string; features: string[]; cta: string; href: string; highlight?: boolean; checkout?: boolean }
/**
 * PLANOS — ainda não definidos. Preencha para exibir os cartões de preço (nome, preço, período, benefícios, CTA).
 * Se `checkout: true`, o clique dispara o evento de compra (use a URL do seu checkout em `href`).
 * Enquanto a lista estiver vazia, a página mostra apenas que a cobrança ainda não está configurada.
 */
export const plans: Plan[] = [];

export const faq = [
  { q: "Preciso conectar meu banco para usar?", a: "Não. Você pode lançar gastos manualmente, importar extratos (OFX, CSV ou PDF) ou automatizar pelo Atalho do iPhone. A conexão direta com o banco via Open Finance é opcional e depende de configuração do serviço (Pluggy)." },
  { q: "Quanto custa?", a: "Hoje o aplicativo não tem cobrança configurada. Quando os planos forem definidos, eles aparecerão nesta página." },
  { q: "Como o app calcula a data para quitar as dívidas?", a: "É uma simulação com os saldos, parcelas e juros que você informa, somando o valor extra que sobra no mês. Ela não substitui o contrato do banco: juros reais de cartão e financiamento variam. Atualize os valores de vez em quando." },
  { q: "Posso cadastrar mais de um cartão?", a: "Sim, quantos precisar. Cada um tem fatura atual, próxima e meses seguintes, limite usado e juros próprios." },
  { q: "O que acontece quando eu gasto no cartão?", a: "A compra entra na fatura do mês certo, o limite usado sobe e a dívida do cartão no plano de quitação aumenta sozinha. Compras parceladas entram uma parcela em cada fatura." },
  { q: "Funciona no iPhone e no Android?", a: "Sim, pelo navegador, e dá para instalar como app. As notificações dependem do suporte do aparelho e da permissão que você der." },
  { q: "Quem consegue ver os meus dados?", a: "Somente você. O administrador do serviço vê o cadastro e a quantidade de lançamentos, nunca valores ou descrições." },
  { q: "Posso apagar minha conta?", a: "Sim. Em Perfil → Conta você exclui a conta e todos os seus dados, e pode exportar antes uma cópia em CSV ou JSON." },
];

export const finalCta = {
  title: "Comece pelo que está comprometido nos próximos meses.",
  text: "Crie a conta, informe as faturas dos seus cartões e veja o plano para quitar tudo.",
  cta: "Criar minha conta",
};

export const demoDisclaimer = "Dados fictícios. As telas são do aplicativo real, geradas com uma conta de demonstração.";
