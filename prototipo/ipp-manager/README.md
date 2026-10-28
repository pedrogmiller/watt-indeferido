# IPP Manager · protótipo v0.1

Jogo de gestão ao estilo do Championship Manager clássico (listas e texto). O jogador é o country manager de um IPP que entra em Portugal, com um mandato de 400 MW prontos a construir (RtB) em cinco anos.

Abrir `index.html` no navegador (ficheiro único, sem dependências além das Google Fonts). No GitHub Pages: `/prototipo/ipp-manager/`.

- **Carreira de mandatos:** cada mandato dura 5 anos (60 meses, um por clique em «Continuar»). Mandato cumprido dá um novo mandato com meta maior; falhado acaba a carreira. O mundo nasce de uma semente.
- **Três mercados:** terrenos (anúncios e cadastro), ligações à rede (leilão DGEG, pedido geral, acordo com o operador, mercado secundário de TRCs e projetos a meio) e pessoas (atributos 1–20 em intervalos, relatórios).
- **Mundo vivo:** seis rivais fictícios com estilos próprios, reforços da REN, preços de mercado, notícias, caixa de entrada com decisões.

Isolado da consola (`index.html` da raiz): não lê nem escreve o save dela. Empresas rivais e pessoas são fictícias; prazos e valores económicos são HIPÓTESE por calibrar.
