# Design

Figma: https://www.figma.com/design/6EcWdFCiefm6EuXRyaeWr7 (páginas **Tokens** e **Telas**: Início, Lançamento rápido, Movimentações — mobile 390×844 — e Início desktop 1280×800).

Observação: o plano gratuito do Figma limita variáveis a 1 modo por coleção; por isso há duas coleções, `Finance OS Light` e `Finance OS Dark`, com os mesmos nomes. O código (`src/app/globals.css`) é a fonte dos tokens e foi usado para ajustar as cores do Figma após a validação de contraste (WCAG AA).

## Tokens
| Token | Claro | Escuro |
|---|---|---|
| bg / surface / surface-2 / border | #F5F6F8 / #FFFFFF / #ECEEF2 / #E2E5EA | #0B0D10 / #14181D / #1D2229 / #272D35 |
| text / muted | #0E1217 / #5A6472 | #F2F4F7 / #9AA4B2 |
| accent | #4338CA | #8B84FF |
| income (entradas) | #0B7A3D | #3DD68C |
| expense (saídas/alertas) | #C42A30 | #FF7A7E |

Raios 10/16/24; espaçamento base 4; tipografia Inter (pilha de sistema como fallback), valores com `tabular-nums`. Cor nunca é o único sinal: valores levam sinal (+/−) e rótulos (receita/despesa).

## Navegação
Mobile: barra inferior fixa com 5 áreas (Início, Movimentações, **Adicionar** central destacado, Planejamento, Perfil). Desktop (≥768px): sidebar com a mesma organização.

## Componentes e estados
Cards, botões RECEBI/GASTEI, sheet de lançamento rápido (valor, descrição, categoria sugerida/favoritas, data, conta/cartão + "Mais detalhes"), linha de movimentação, filtros, barras de progresso (`role=progressbar`), estados vazios com instrução, erro (`role=alert`), sucesso (`role=status`) e "ocultar valores".
