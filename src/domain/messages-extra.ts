// Mais mensagens (sem repetir as antigas). Parte é escrita à mão; parte é GERADA com contas feitas pelo código,
// então os números sempre batem (nada de multiplicação de cabeça).
const n = (v: number) => v.toLocaleString("pt-BR");

/** "Gasto pequeno acumulado": o valor se repete e vira um número grande. */
const SMALL_AMOUNTS = [5, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 50];
const SMALL_LEADS: ((a: number) => string)[] = [
  (a) => `Gasto pequeno não existe. R$ ${n(a)} por dia são R$ ${n(a * 30)} por mês e R$ ${n(a * 365)} por ano.`,
  (a) => `Aquele "só R$ ${n(a)}" de hoje, repetido todo dia, vira R$ ${n(a * 365)} no ano. Ainda é só?`,
  (a) => `R$ ${n(a)} três vezes por semana são R$ ${n(a * 3 * 52)} por ano. Você sabe para onde foi o último?`,
  (a) => `Compras de R$ ${n(a)} acumuladas: 5 por semana viram R$ ${n(a * 5 * 52)} por ano. É assim que o mês fecha no negativo.`,
  (a) => `O que deixa a conta no vermelho raramente é uma compra grande. São as de R$ ${n(a)}, uma atrás da outra: ${n(a * 20)} em 20 compras.`,
  (a) => `Se você gastar R$ ${n(a)} a mais por dia útil, são R$ ${n(a * 22)} por mês saindo sem você perceber.`,
];

export const SMALL_SPEND_MESSAGES: readonly string[] = SMALL_AMOUNTS.flatMap((a, i) => [SMALL_LEADS[i % SMALL_LEADS.length](a), SMALL_LEADS[(i + 3) % SMALL_LEADS.length](a)])
  .filter((v, i, arr) => arr.indexOf(v) === i);

/** Investir em vez de gastar: só soma de aportes (sem prometer rendimento). */
const APORTES = [30, 50, 80, 100, 150, 200, 250, 400, 500];
export const INVEST_EXTRA_MESSAGES: readonly string[] = [
  ...APORTES.map((m, i) => `📈 R$ ${n(m)} por mês guardados durante ${[2, 3, 5, 4, 3, 5, 2, 3, 4][i]} anos são R$ ${n(m * 12 * [2, 3, 5, 4, 3, 5, 2, 3, 4][i])} só de aportes, antes de qualquer rendimento.`),
  ...APORTES.map((m) => `💰 Em vez de gastar R$ ${n(m)} hoje, aporte. Se repetir todo mês, em 1 ano são R$ ${n(m * 12)} que viraram patrimônio, e não fatura.`),
  "🧮 Regra dos 10%: antes de pagar qualquer conta, separe 10% do que entrou. Quem faz isso por 5 anos tem um colchão de seis meses sem perceber.",
  "🛡️ Reserva de emergência primeiro: 3 a 6 meses de gastos. Só depois vale correr atrás de rentabilidade.",
  "📅 Programe o aporte para o dia seguinte ao salário. O dinheiro que você não vê é o que você não gasta.",
  "🐢 Quem investe devagar e sempre ganha de quem investe muito uma vez e some. Constância é o que paga.",
  "🏦 Antes de parcelar, pergunte: essa parcela cabe no lugar do meu aporte? Se não cabe, você não precisa disso agora.",
  "🔁 Cada vez que você troca uma compra por impulso por um aporte, você compra um pedaço de liberdade, e ele não vai embora.",
  "📊 Olhe o seu patrimônio líquido uma vez por semana. Quem acompanha o placar joga melhor.",
  "🧠 O investimento mais seguro é aquele que você entende. Se não entendeu, ainda não é hora de colocar dinheiro nele.",
  "🌱 Comece pelo valor que não dói. R$ 20 por semana, sem falhar, vencem R$ 500 que você promete e esquece.",
  "⚖️ Diversifique: não coloque tudo no mesmo lugar, nem em dívida cara, nem em promessa de lucro fácil. Desconfie de lucro garantido.",
  "🪙 Investir não é para quem tem dinheiro sobrando. É para quem decidiu que o dinheiro não vai mais sobrar só para a fatura.",
  "📚 Antes de aportar, estude o básico: o que é, quanto custa, quando posso resgatar. Quem não entende o que compra vira cliente de promessa.",
  "🔐 Separe o dinheiro do investimento da conta que você usa no dia a dia. O que fica longe da vista fica longe do impulso.",
  "⏱️ Cinco minutos para programar um aporte automático valem mais do que cinco anos de boas intenções.",
  "🎯 Dê um nome para o seu investimento: 'Reserva', 'Viagem', 'Liberdade'. Dinheiro com nome é mais difícil de gastar.",
  "🧯 Reserva de emergência é seguro contra você mesmo: evita que um imprevisto vire dívida no cartão.",
  "🏡 Quem investe pensando no futuro compra tranquilidade, e ela é o ativo que mais valoriza com o tempo.",
  "📉 Cuidado com 'oportunidade imperdível'. Se promete muito e rápido, você é a oportunidade de alguém.",
  "🌊 Todo mês uma marolinha de aporte, e em alguns anos é uma onda. Só não pare no meio do caminho.",
  "🧭 Defina o objetivo do investimento e o prazo. Sem prazo, qualquer coisa vira motivo para resgatar.",
  "🧱 Pague a dívida cara antes de investir: o juro do cartão ganha de qualquer rendimento que você vai encontrar.",
  "🔄 Reaporte o que sobrar do mês, mesmo pouco. Constância bate quantia.",
];

export const SPEND_EXTRA_MESSAGES: readonly string[] = [
  ...SMALL_SPEND_MESSAGES,
  "Delivery de novo? Some o que você gastou com comida pronta neste mês. O número costuma assustar mais que o prato.",
  "Mercado, farmácia, app de transporte: nenhum é grande sozinho. Juntos, são o rombo do mês.",
  "A fatura do cartão é a soma de todas as vezes que você pensou 'depois eu vejo'. O 'depois' chegou.",
  "Compra no automático: o app guardou seu cartão para que você não precise pensar. Pense você, então.",
  "Ficar sem dinheiro no dia 20 é consequência do dia 5, do dia 8 e do dia 12. Cada um parecia inofensivo.",
  "Assinatura que você esqueceu é o gasto mais fiel da sua vida: nunca falha e nunca avisa.",
  "Frete grátis é a forma mais barata que a loja encontrou de te fazer comprar mais.",
  "Cupom de desconto não economiza; só dá a sensação. Economizar é não comprar.",
  "Se a compra não cabe na renda deste mês, ela não cabe. Parcelar só empurra a conta para quem você será depois.",
  "Antes de aceitar a parcela, some o total. A parcela é o jeito que a loja encontrou de esconder o preço.",
  "O limite do cartão não é o seu dinheiro. É o quanto o banco acredita que você aguenta de juros.",
  "Cada vez que você usa o rotativo, o banco ganha um sócio na sua vida, e esse sócio nunca tira férias.",
  "Quem controla o dia controla o mês. Registre o gasto agora, enquanto você lembra.",
  "Fome não é desculpa para pedir o terceiro lanche da semana. Marmita é o investimento mais subestimado que existe.",
  "O que você ganhou hoje já está comprometido com aluguel, contas e dívida. O que sobrar é o que você tem para escolher.",
  "Não gaste hoje o que ainda não chegou. O 13º, o bônus e a restituição não são seus até caírem na conta.",
  "Se um gasto precisa ser escondido do seu orçamento, ele já é um gasto errado.",
  "Desconto de 'só hoje' é pressão para você não pensar. Pensar é o seu poder. Use.",
  "Pague a dívida mais cara primeiro. Cada dia com juro alto é um dia em que o dinheiro trabalha contra você.",
  "O saldo no app engana: parte dele já tem dono. Subtraia as contas do mês antes de se sentir rico.",
  "A conta que você adia só cresce. Juros não esperam você estar pronto.",
  "Troque o 'eu mereço' por 'eu planejei'. O primeiro gasta. O segundo constrói.",
];

export const MOTIVATION_EXTRA_MESSAGES: readonly string[] = [
  "🔥 Cada dia sem registrar seus gastos é um dia em que você joga no escuro. Abra o app e registre agora.",
  "💥 Dívida não some por esperança. Some por parcela paga, uma atrás da outra. Qual você paga hoje?",
  "🚨 Se a sua meta está parada, a culpa é do seu hábito, e hábito se troca. Comece hoje.",
  "⚡ O mês só fecha no azul para quem decide isso nos primeiros dias, e não no último.",
  "🧨 Você já sabe o que precisa fazer. O que falta é fazer agora, e não depois do próximo gasto.",
  "💪 O dia ruim passa. A dívida que você deixou crescer por causa dele, não.",
  "🏁 Falta pouco para a próxima conquista. Abandonar agora é pagar o preço inteiro sem receber nada.",
  "📉 Cada mês no vermelho torna o próximo mais difícil. Quebre a sequência neste.",
  "🛑 Controlar dinheiro é chato. Dever é pior. Escolha o chato.",
  "⏳ Quem começa pequeno e persiste passa quem espera o momento perfeito. O momento perfeito não vem.",
  "🎯 Escolha uma dívida, uma meta, um número. Foque nele hoje. Foco derrota dispersão.",
  "🔒 Prometa para si mesmo e cumpra. Quem não cumpre com o próprio dinheiro não cumpre com mais nada.",
  "🥊 Não negocie com a preguiça. Ela sempre pede só mais um dia, e o dia vira o mês.",
  "🔨 Está difícil? Ótimo: significa que está mudando algo que importa. Segure mais um dia.",
  "🧱 Uma parcela paga é um tijolo a menos entre você e a liberdade. Pague a de hoje.",
  "💣 Quem adia a conta da própria vida acaba tendo ela cobrada em condições piores.",
  "🛡️ Seu eu do futuro depende das decisões chatas de hoje. Seja bom para ele.",
  "⚔️ Todo mundo começa devendo e sem reserva. O que muda é quem para de ceder.",
  "🚀 O progresso é lento, mas o de quem não faz nada é zero. Faça o pequeno agora.",
  "🔋 Sem vontade? Faça pelo hábito. Hábito não precisa de motivação, só de repetição.",
  "🧭 Reveja o plano de quitação hoje. Quem acompanha a dívida paga mais rápido do que quem a ignora.",
  "🏆 Quem chega ao fim do mês com sobra não é o que ganha mais. É o que decidiu quanto ia gastar antes de gastar.",
  "🔥 Ontem foi ontem. O que vale é o próximo gasto: ele é o que você ainda controla.",
  "💥 Você já fez a parte mais difícil: olhar para os números. Agora é seguir o plano, um dia de cada vez.",
  "🚨 Quem para quando fica difícil nunca vê o que vem depois. Segure mais uma semana.",
  "⚡ Cada pagamento em dia melhora o seu futuro. Cada atraso o encarece. Qual você escolhe hoje?",
  "🧨 Plano que fica só no aplicativo não paga dívida. O que paga é decisão tomada na hora de gastar.",
  "💪 Falhou num dia? Registre, ajuste e continue. Desistir é o único erro que não tem conserto.",
  "🏁 Quanto mais perto do fim, mais forte a vontade de largar. É aí que quem vence aguenta.",
  "📉 Gastar sem controle é a forma mais cara de adiar a vida que você quer. Controle hoje.",
  "🛑 Nenhuma compra do dia vale o atraso da sua liberdade. Pense antes de pagar.",
  "🎯 Seu único trabalho hoje: gastar menos do que planejou. Só isso. Faça.",
  "🔒 A pessoa que você quer ser em 1 ano depende do que você faz hoje, e não da vontade que você sente.",
  "🔨 O difícil é começar a poupar. Depois, o difícil é voltar a gastar sem pensar.",
];
