# IPP Manager · protótipo v0.2

Jogo de gestão ao estilo do Championship Manager clássico (listas e texto). O jogador é o country manager de um IPP que entra em Portugal, com um mandato de 400 MW prontos a construir (RtB) em cinco anos.

Abrir `index.html` no navegador (ficheiro único, sem dependências além das Google Fonts). No GitHub Pages: `/prototipo/ipp-manager/`.

- **Escolha da empresa, como no CM:** dez empresas reais (de EDP a Aura Power) e «Entrar em Portugal». A empresa define orçamento, reputação, tipo de mandato, meta, paciência do Comité, equipa e carteira inicial. As outras ficam como rivais com IA.
- **Carreira de mandatos:** cada mandato dura 5 anos (60 meses, um por clique em «Continuar»). Mandato cumprido dá um novo mandato com meta maior; falhado acaba a carreira. O mundo nasce de uma semente.
- **Três mercados:** terrenos (anúncios e cadastro), ligações à rede (leilão DGEG, pedido geral, acordo com o operador, mercado secundário de TRCs e projetos a meio) e pessoas (atributos 1–20 em intervalos, relatórios).
- **Mundo vivo:** rivais com estilos próprios (utility, cauteloso, agressivo, oportunista, fundo), reforços da REN, preços de mercado, notícias, caixa de entrada com decisões.

Isolado da consola (`index.html` da raiz): não lê nem escreve o save dela. As empresas reais aparecem como personagens de ficção: o que lhes acontece no jogo é inventado (aviso no ecrã de arranque). As pessoas são fictícias; os MW solares de cada empresa vêm de `content/data/empresas-arranque.json`; prazos e valores económicos são HIPÓTESE por calibrar.
