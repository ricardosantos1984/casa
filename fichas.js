// =====================================================================
//  Fichas de estudo — 5.º ano (Ema)
//  Tipos de pergunta:
//    mc  → escolha múltipla: o = opções, c = índice da opção certa (0 = primeira)
//    txt → resposta escrita: r = lista de respostas aceites
//    num → resposta numérica: r = número certo (aceita vírgula ou ponto)
//  e = explicação mostrada depois de corrigir
// =====================================================================
window.FICHAS = [
  {
    id: "pt", nome: "Português", sigla: "Pt", cor: "#FF8A65",
    fichas: [
      {
        id: "pt1", titulo: "Classes de palavras", sub: "Nomes, adjetivos, verbos, pronomes, advérbios",
        q: [
          { t: "mc", p: "Na frase «O gato preto dorme no sofá», a palavra «gato» é um…", o: ["nome comum", "adjetivo", "verbo", "advérbio"], c: 0, e: "«Gato» designa um animal: é um nome comum." },
          { t: "mc", p: "Na mesma frase, «preto» é um…", o: ["nome", "adjetivo", "verbo", "pronome"], c: 1, e: "«Preto» dá uma característica ao gato: é um adjetivo." },
          { t: "mc", p: "E «dorme» é um…", o: ["nome", "adjetivo", "verbo", "determinante"], c: 2, e: "«Dorme» indica uma ação: é um verbo (dormir)." },
          { t: "mc", p: "«Tomar» é um nome…", o: ["comum", "próprio", "coletivo", "abstrato"], c: 1, e: "Nomes de cidades, pessoas e países são nomes próprios e escrevem-se com maiúscula." },
          { t: "mc", p: "«Cardume» é um nome coletivo. Representa um conjunto de…", o: ["abelhas", "ovelhas", "peixes", "lobos"], c: 2, e: "Cardume = conjunto de peixes. Enxame = abelhas, rebanho = ovelhas, alcateia = lobos." },
          { t: "mc", p: "Em «Ela comprou dois livros», a palavra «Ela» é um…", o: ["nome", "pronome pessoal", "determinante", "adjetivo"], c: 1, e: "«Ela» substitui o nome de uma pessoa: é um pronome pessoal." },
          { t: "mc", p: "Em «A Ema correu rapidamente», a palavra «rapidamente» é um…", o: ["adjetivo", "verbo", "advérbio", "nome"], c: 2, e: "«Rapidamente» diz como ela correu (modo): é um advérbio." },
          { t: "txt", p: "Escreve o plural de «pão».", r: ["pães"], e: "Pão → pães." },
          { t: "txt", p: "Escreve o feminino de «ator».", r: ["atriz"], e: "Ator → atriz." },
          { t: "txt", p: "Escreve um antónimo (o contrário) de «alto».", r: ["baixo"], e: "O contrário de alto é baixo." },
        ],
      },
      {
        id: "pt2", titulo: "Tempos verbais", sub: "Presente, pretérito perfeito, pretérito imperfeito e futuro",
        q: [
          { t: "mc", p: "«Eu canto no coro.» O verbo está no…", o: ["presente", "pretérito perfeito", "pretérito imperfeito", "futuro"], c: 0, e: "A ação acontece agora/habitualmente: presente do indicativo." },
          { t: "mc", p: "«Ontem nós jogámos à bola.» O verbo está no…", o: ["presente", "pretérito perfeito", "pretérito imperfeito", "futuro"], c: 1, e: "Ação terminada no passado: pretérito perfeito." },
          { t: "mc", p: "«Quando era pequena, a Ema brincava no parque.» O verbo «brincava» está no…", o: ["presente", "pretérito perfeito", "pretérito imperfeito", "futuro"], c: 2, e: "Ação habitual no passado: pretérito imperfeito." },
          { t: "mc", p: "«Amanhã iremos à praia.» O verbo está no…", o: ["presente", "pretérito perfeito", "pretérito imperfeito", "futuro"], c: 3, e: "Ação que ainda vai acontecer: futuro." },
          { t: "txt", p: "Completa no pretérito perfeito: «Ontem eu ___ (comer) sopa.»", r: ["comi"], e: "Eu comi." },
          { t: "txt", p: "Completa no futuro: «Amanhã tu ___ (ir) à escola.»", r: ["irás"], e: "Tu irás (futuro do verbo ir)." },
          { t: "txt", p: "Completa no presente: «Nós ___ (ser) amigos.»", r: ["somos"], e: "Nós somos." },
          { t: "txt", p: "Qual é o infinitivo (o nome) do verbo em «Eles fizeram os trabalhos»?", r: ["fazer"], e: "Fizeram vem do verbo fazer." },
          { t: "mc", p: "Qual destas formas está no pretérito imperfeito?", o: ["eu estudei", "eu estudava", "eu estudarei", "eu estudo"], c: 1, e: "Estudava = pretérito imperfeito. Estudei = perfeito; estudarei = futuro; estudo = presente." },
        ],
      },
      {
        id: "pt3", titulo: "Tipos de frase e pontuação", sub: "Declarativa, interrogativa, exclamativa, imperativa",
        q: [
          { t: "mc", p: "«Que dia tão bonito!» é uma frase…", o: ["declarativa", "interrogativa", "exclamativa", "imperativa"], c: 2, e: "Exprime emoção e termina com ponto de exclamação: exclamativa." },
          { t: "mc", p: "«Fecha a porta, por favor.» é uma frase…", o: ["declarativa", "interrogativa", "exclamativa", "imperativa"], c: 3, e: "Dá uma ordem ou pedido: imperativa." },
          { t: "mc", p: "«Onde vives?» é uma frase…", o: ["declarativa", "interrogativa", "exclamativa", "imperativa"], c: 1, e: "Faz uma pergunta: interrogativa." },
          { t: "mc", p: "«O Sol nasce a este.» é uma frase…", o: ["declarativa", "interrogativa", "exclamativa", "imperativa"], c: 0, e: "Informa sobre algo: declarativa." },
          { t: "txt", p: "Passa para a forma negativa: «Eu gosto de sopa.»", r: ["eu não gosto de sopa", "não gosto de sopa"], e: "Eu não gosto de sopa." },
          { t: "mc", p: "Em «Comprei maçãs, peras e laranjas», as vírgulas servem para…", o: ["fazer uma pergunta", "separar os elementos de uma enumeração", "terminar a frase", "indicar uma fala"], c: 1, e: "Numa enumeração, a vírgula separa os elementos." },
          { t: "mc", p: "Num texto com diálogo, o travessão (—) serve para…", o: ["indicar a fala de uma personagem", "separar os parágrafos", "fazer uma pergunta", "mostrar espanto"], c: 0, e: "O travessão introduz a fala de cada personagem." },
          { t: "mc", p: "Qual destas frases está bem pontuada?", o: ["Ema, vens jantar?", "Ema vens, jantar?", "Ema vens jantar.", "Ema, vens, jantar"], c: 0, e: "O vocativo (Ema) separa-se por vírgula e a pergunta termina com «?»." },
        ],
      },
    ],
  },
  {
    id: "mat", nome: "Matemática", sigla: "Ma", cor: "#4C9BFF",
    fichas: [
      {
        id: "mat1", titulo: "Números naturais e operações", sub: "Cálculo, divisores, múltiplos, potências",
        q: [
          { t: "num", p: "Calcula: 125 × 4", r: 500, e: "125 × 4 = 500." },
          { t: "num", p: "Calcula: 1008 ÷ 8", r: 126, e: "1008 ÷ 8 = 126." },
          { t: "num", p: "Calcula: 3 + 4 × 5", r: 23, e: "Primeiro a multiplicação: 4 × 5 = 20; depois 3 + 20 = 23." },
          { t: "mc", p: "Qual destes números é divisível por 3?", o: ["241", "312", "506", "721"], c: 1, e: "3 + 1 + 2 = 6, que é múltiplo de 3. Por isso 312 é divisível por 3." },
          { t: "mc", p: "Qual destes números é primo?", o: ["21", "27", "29", "33"], c: 2, e: "29 só é divisível por 1 e por si próprio. 21 = 3×7, 27 = 3×9, 33 = 3×11." },
          { t: "num", p: "Qual é o máximo divisor comum de 12 e 18?", r: 6, e: "Divisores de 12: 1, 2, 3, 4, 6, 12. De 18: 1, 2, 3, 6, 9, 18. O maior comum é 6." },
          { t: "num", p: "Qual é o mínimo múltiplo comum de 4 e 6?", r: 12, e: "Múltiplos de 4: 4, 8, 12… De 6: 6, 12… O menor comum é 12." },
          { t: "num", p: "Calcula a potência 2³", r: 8, e: "2³ = 2 × 2 × 2 = 8." },
          { t: "num", p: "Quantos múltiplos de 6 há entre 20 e 40?", r: 3, e: "São 24, 30 e 36." },
          { t: "num", p: "A Ema tem 48 cromos e quer dividi-los igualmente por 6 amigas. Quantos cromos recebe cada uma?", r: 8, e: "48 ÷ 6 = 8 cromos." },
        ],
      },
      {
        id: "mat2", titulo: "Frações, decimais e percentagens", sub: "Frações equivalentes, operações, conversões",
        q: [
          { t: "mc", p: "Qual destas frações é equivalente a 1/2?", o: ["2/3", "3/6", "3/4", "1/3"], c: 1, e: "3/6 = 1/2 (dividimos o numerador e o denominador por 3)." },
          { t: "num", p: "Escreve 3/4 em número decimal.", r: 0.75, e: "3 ÷ 4 = 0,75." },
          { t: "num", p: "Calcula: 0,5 + 0,25", r: 0.75, e: "0,50 + 0,25 = 0,75." },
          { t: "txt", p: "Calcula e escreve como fração: 2/5 + 1/5", r: ["3/5"], e: "Com o mesmo denominador, somam-se os numeradores: 3/5." },
          { t: "mc", p: "Qual é o maior número?", o: ["0,65", "0,7", "0,605", "0,07"], c: 1, e: "0,7 = 0,700, que é maior do que 0,650, 0,605 e 0,070." },
          { t: "num", p: "Quanto é 1/4 de 20?", r: 5, e: "20 ÷ 4 = 5." },
          { t: "txt", p: "Escreve 6/8 na forma de fração irredutível.", r: ["3/4"], e: "Dividindo ambos por 2: 3/4." },
          { t: "num", p: "Quanto é 25% de 80?", r: 20, e: "25% é um quarto: 80 ÷ 4 = 20." },
          { t: "num", p: "Calcula: 3,2 × 10", r: 32, e: "Multiplicar por 10 anda uma casa com a vírgula: 32." },
          { t: "num", p: "Uma piza foi cortada em 8 fatias e comeram-se 3. Que percentagem da piza sobrou? (escreve só o número)", r: 62.5, e: "Sobraram 5/8 = 0,625 = 62,5%." },
        ],
      },
      {
        id: "mat3", titulo: "Geometria e medida", sub: "Ângulos, triângulos, perímetro e área",
        q: [
          { t: "mc", p: "Um ângulo de 90° chama-se…", o: ["agudo", "reto", "obtuso", "raso"], c: 1, e: "90° = ângulo reto." },
          { t: "mc", p: "Um ângulo de 120° é…", o: ["agudo", "reto", "obtuso", "raso"], c: 2, e: "Entre 90° e 180°: obtuso." },
          { t: "num", p: "Quanto mede um ângulo raso (em graus)?", r: 180, e: "Ângulo raso = 180°." },
          { t: "num", p: "Quanto é a soma dos ângulos internos de um triângulo (em graus)?", r: 180, e: "Em qualquer triângulo, a soma é 180°." },
          { t: "num", p: "Num triângulo, dois ângulos medem 50° e 60°. Quanto mede o terceiro?", r: 70, e: "180 − 50 − 60 = 70°." },
          { t: "mc", p: "Um triângulo com os três lados iguais é…", o: ["escaleno", "isósceles", "equilátero", "retângulo"], c: 2, e: "Três lados iguais = equilátero." },
          { t: "mc", p: "Um triângulo com um ângulo reto é…", o: ["acutângulo", "retângulo", "obtusângulo", "equilátero"], c: 1, e: "Tem um ângulo de 90°: retângulo." },
          { t: "num", p: "Qual é o perímetro (em cm) de um quadrado com 5 cm de lado?", r: 20, e: "4 × 5 = 20 cm." },
          { t: "num", p: "Qual é a área (em cm²) de um retângulo com 6 cm por 4 cm?", r: 24, e: "6 × 4 = 24 cm²." },
          { t: "num", p: "Quantos centímetros tem 1,5 metros?", r: 150, e: "1 m = 100 cm, logo 1,5 m = 150 cm." },
        ],
      },
    ],
  },
  {
    id: "cn", nome: "Ciências Naturais", sigla: "CN", cor: "#4CD08A",
    fichas: [
      {
        id: "cn1", titulo: "Diversidade dos animais", sub: "Revestimento, locomoção, alimentação, reprodução, respiração",
        q: [
          { t: "mc", p: "A baleia respira por…", o: ["brânquias", "pulmões", "pele", "traqueias"], c: 1, e: "A baleia é um mamífero: respira por pulmões e vem à superfície buscar ar." },
          { t: "mc", p: "O revestimento das aves é feito de…", o: ["pelos", "escamas", "penas", "carapaça"], c: 2, e: "Todas as aves têm penas." },
          { t: "mc", p: "Os peixes respiram por…", o: ["pulmões", "brânquias", "pele", "traqueias"], c: 1, e: "As brânquias retiram o oxigénio dissolvido na água." },
          { t: "mc", p: "Qual destes animais é ovíparo (nasce de um ovo)?", o: ["vaca", "cão", "galinha", "golfinho"], c: 2, e: "A galinha põe ovos. Os outros são vivíparos." },
          { t: "mc", p: "Qual destes animais é herbívoro?", o: ["leão", "coelho", "lobo", "águia"], c: 1, e: "O coelho alimenta-se de plantas." },
          { t: "mc", p: "Os animais que comem plantas e outros animais chamam-se…", o: ["herbívoros", "carnívoros", "omnívoros", "insetívoros"], c: 2, e: "Omnívoros comem de tudo (por exemplo, o ser humano e o urso)." },
          { t: "mc", p: "A minhoca desloca-se por…", o: ["marcha", "salto", "rastejamento", "voo"], c: 2, e: "A minhoca rasteja, contraindo e esticando o corpo." },
          { t: "mc", p: "O morcego é…", o: ["uma ave", "um mamífero", "um réptil", "um inseto"], c: 1, e: "O morcego voa, mas tem pelos e amamenta as crias: é um mamífero." },
          { t: "txt", p: "Como se chama o revestimento da maioria dos peixes?", r: ["escamas"], e: "Os peixes estão cobertos de escamas." },
        ],
      },
      {
        id: "cn2", titulo: "As plantas", sub: "Partes da planta, fotossíntese, reprodução",
        q: [
          { t: "mc", p: "Que parte da planta absorve a água e os sais minerais do solo?", o: ["folha", "caule", "raiz", "flor"], c: 2, e: "A raiz fixa a planta e absorve água e sais minerais." },
          { t: "mc", p: "Como se chama o processo em que as plantas produzem o seu alimento com a luz do Sol?", o: ["respiração", "fotossíntese", "germinação", "polinização"], c: 1, e: "Na fotossíntese, a planta usa luz, água e dióxido de carbono para produzir alimento." },
          { t: "mc", p: "Na fotossíntese, as plantas libertam para o ar…", o: ["oxigénio", "dióxido de carbono", "azoto", "vapor de sal"], c: 0, e: "Libertam oxigénio, que nós respiramos." },
          { t: "mc", p: "O pigmento verde das folhas chama-se…", o: ["clorofila", "seiva", "pólen", "néctar"], c: 0, e: "A clorofila capta a luz do Sol." },
          { t: "mc", p: "Qual é o órgão de reprodução das plantas com flor?", o: ["raiz", "caule", "folha", "flor"], c: 3, e: "A flor produz as sementes que darão origem a novas plantas." },
          { t: "mc", p: "O transporte do pólen de uma flor para outra chama-se…", o: ["germinação", "polinização", "fotossíntese", "transpiração"], c: 1, e: "A polinização pode ser feita pelo vento ou por insetos, como as abelhas." },
          { t: "mc", p: "As árvores que perdem as folhas no outono são de folha…", o: ["persistente", "caduca", "composta", "aquática"], c: 1, e: "Folha caduca: cai no outono (ex.: castanheiro). Persistente: fica todo o ano (ex.: pinheiro)." },
          { t: "txt", p: "O que protege as sementes e muitas vezes comemos? (uma palavra)", r: ["fruto", "o fruto", "frutos"], e: "O fruto protege as sementes." },
        ],
      },
      {
        id: "cn3", titulo: "Água, ar, rochas e solo", sub: "Propriedades, mudanças de estado, tipos de rochas",
        q: [
          { t: "mc", p: "A água pura é…", o: ["colorida e com cheiro", "incolor, inodora e insípida", "salgada", "sempre sólida"], c: 1, e: "Sem cor (incolor), sem cheiro (inodora) e sem sabor (insípida)." },
          { t: "mc", p: "Qual é o gás que existe em maior quantidade no ar?", o: ["oxigénio", "dióxido de carbono", "azoto (nitrogénio)", "hélio"], c: 2, e: "O azoto é cerca de 78% do ar; o oxigénio cerca de 21%." },
          { t: "mc", p: "A passagem da água do estado líquido para o gasoso chama-se…", o: ["fusão", "solidificação", "vaporização", "condensação"], c: 2, e: "Líquido → gasoso: vaporização (por exemplo, a evaporação)." },
          { t: "mc", p: "A passagem do estado sólido para o líquido (gelo a derreter) chama-se…", o: ["fusão", "solidificação", "vaporização", "condensação"], c: 0, e: "Sólido → líquido: fusão." },
          { t: "mc", p: "O granito forma-se pelo arrefecimento do magma. É uma rocha…", o: ["sedimentar", "magmática", "metamórfica", "orgânica"], c: 1, e: "Rochas que vêm do magma são magmáticas." },
          { t: "mc", p: "Que rocha faz efervescência (bolhinhas) quando se lhe deita um ácido, como o vinagre?", o: ["granito", "calcário", "basalto", "areia"], c: 1, e: "O calcário reage com os ácidos e liberta dióxido de carbono." },
          { t: "txt", p: "Como se chama a matéria orgânica em decomposição que torna o solo fértil?", r: ["húmus", "humus"], e: "O húmus resulta da decomposição de restos de seres vivos." },
          { t: "mc", p: "A água própria para beber chama-se…", o: ["água salgada", "água potável", "água destilada", "água residual"], c: 1, e: "Água potável é segura para beber." },
        ],
      },
    ],
  },
  {
    id: "hgp", nome: "História e Geografia de Portugal", sigla: "HGP", cor: "#F2C14E",
    fichas: [
      {
        id: "hgp1", titulo: "A Península Ibérica", sub: "Localização, mares, rios e relevo",
        q: [
          { t: "mc", p: "A Península Ibérica situa-se no continente…", o: ["africano", "europeu", "asiático", "americano"], c: 1, e: "Fica no sudoeste da Europa." },
          { t: "mc", p: "Que países ocupam a maior parte da Península Ibérica?", o: ["Portugal e França", "Portugal e Espanha", "Espanha e Itália", "Portugal e Marrocos"], c: 1, e: "Portugal e Espanha (também lá ficam Andorra e Gibraltar)." },
          { t: "mc", p: "Que oceano banha a costa de Portugal continental?", o: ["Pacífico", "Índico", "Atlântico", "Ártico"], c: 2, e: "O Oceano Atlântico fica a oeste e a sul de Portugal." },
          { t: "mc", p: "Que mar banha a costa leste de Espanha?", o: ["Mar Mediterrâneo", "Mar do Norte", "Mar Báltico", "Mar Vermelho"], c: 0, e: "O Mediterrâneo fica a leste e sul da Península." },
          { t: "mc", p: "O estreito que separa a Península Ibérica de África chama-se…", o: ["Estreito de Gibraltar", "Estreito da Mancha", "Estreito de Magalhães", "Estreito do Bósforo"], c: 0, e: "O Estreito de Gibraltar tem cerca de 14 km na parte mais estreita." },
          { t: "mc", p: "Qual é o ponto mais alto de Portugal continental?", o: ["Serra do Gerês", "Serra da Estrela", "Serra de Sintra", "Serra do Marão"], c: 1, e: "A Torre, na Serra da Estrela, tem cerca de 1993 m. O ponto mais alto de Portugal é a Montanha do Pico, nos Açores." },
          { t: "mc", p: "Qual é o rio mais longo da Península Ibérica?", o: ["Douro", "Guadiana", "Tejo", "Mondego"], c: 2, e: "O Tejo tem cerca de 1000 km e desagua em Lisboa." },
          { t: "mc", p: "Quais são os arquipélagos portugueses?", o: ["Canárias e Baleares", "Açores e Madeira", "Madeira e Canárias", "Açores e Cabo Verde"], c: 1, e: "Os Açores e a Madeira são as regiões autónomas de Portugal." },
          { t: "mc", p: "O rio que passa em Tomar chama-se…", o: ["Nabão", "Zêzere", "Mondego", "Sado"], c: 0, e: "O rio Nabão atravessa Tomar e é afluente do Zêzere." },
        ],
      },
      {
        id: "hgp2", titulo: "Primeiros povos, romanos e muçulmanos", sub: "Da Pré-História à Reconquista",
        q: [
          { t: "mc", p: "Os primeiros seres humanos viviam da caça, da pesca e da recoleção e mudavam muitas vezes de lugar. Eram…", o: ["sedentários", "nómadas", "agricultores", "comerciantes"], c: 1, e: "Nómadas: não tinham habitação fixa." },
          { t: "mc", p: "Quando começaram a praticar a agricultura e a pastorícia, passaram a ser…", o: ["nómadas", "sedentários", "navegadores", "guerreiros"], c: 1, e: "Fixaram-se num lugar: tornaram-se sedentários." },
          { t: "mc", p: "Que povo, liderado por Viriato, resistiu aos romanos?", o: ["Fenícios", "Lusitanos", "Gregos", "Visigodos"], c: 1, e: "Os Lusitanos, chefiados por Viriato, lutaram contra os romanos." },
          { t: "mc", p: "Os romanos chegaram à Península Ibérica em…", o: ["218 a.C.", "711", "1143", "1500"], c: 0, e: "Chegaram em 218 a.C." },
          { t: "mc", p: "Que língua dos romanos deu origem ao português?", o: ["grego", "árabe", "latim", "celta"], c: 2, e: "O português vem do latim." },
          { t: "mc", p: "Qual destas é uma herança dos romanos?", o: ["as estradas e as pontes", "o arroz-doce", "os azulejos", "a pólvora"], c: 0, e: "Os romanos construíram estradas, pontes, aquedutos e cidades." },
          { t: "mc", p: "Os muçulmanos entraram na Península Ibérica em…", o: ["218 a.C.", "711", "1128", "1249"], c: 1, e: "Em 711 vieram do Norte de África." },
          { t: "mc", p: "A religião dos muçulmanos é o…", o: ["cristianismo", "judaísmo", "islamismo", "budismo"], c: 2, e: "Os muçulmanos seguem o islamismo." },
          { t: "mc", p: "A luta dos cristãos para recuperarem os territórios aos muçulmanos chama-se…", o: ["Romanização", "Reconquista", "Descobrimentos", "Restauração"], c: 1, e: "A Reconquista Cristã." },
        ],
      },
      {
        id: "hgp3", titulo: "A formação de Portugal", sub: "De condado a reino independente",
        q: [
          { t: "mc", p: "Quem foi o primeiro rei de Portugal?", o: ["D. Dinis", "D. Afonso Henriques", "D. Sancho I", "D. João I"], c: 1, e: "D. Afonso Henriques, o Conquistador." },
          { t: "mc", p: "O Condado Portucalense foi entregue pelo rei de Leão e Castela a…", o: ["D. Henrique e D. Teresa", "D. Afonso III", "Viriato", "D. Dinis e D. Isabel"], c: 0, e: "D. Henrique e D. Teresa, pais de D. Afonso Henriques." },
          { t: "num", p: "Em que ano foi a Batalha de São Mamede?", r: 1128, e: "Em 1128 D. Afonso Henriques venceu as tropas da mãe e passou a governar o condado." },
          { t: "num", p: "Em que ano foi assinado o Tratado de Zamora?", r: 1143, e: "Em 1143, Afonso VII de Leão e Castela reconheceu D. Afonso Henriques como rei." },
          { t: "mc", p: "Em 1179, a bula Manifestis Probatum…", o: ["declarou guerra a Castela", "reconheceu Portugal como reino independente", "fundou a Universidade", "criou a moeda portuguesa"], c: 1, e: "O Papa reconheceu D. Afonso Henriques como rei e Portugal como reino independente." },
          { t: "mc", p: "Em 1147, D. Afonso Henriques conquistou aos muçulmanos Santarém e…", o: ["Porto", "Lisboa", "Faro", "Braga"], c: 1, e: "Em 1147 conquistou Santarém e Lisboa (com a ajuda de cruzados)." },
          { t: "mc", p: "Em 1160, o mestre dos Templários Gualdim Pais começou a construir o castelo de…", o: ["Guimarães", "Tomar", "Óbidos", "Leiria"], c: 1, e: "O Castelo de Tomar, onde hoje está o Convento de Cristo. É a tua cidade!" },
          { t: "num", p: "Em que ano D. Afonso III conquistou o Algarve, completando a Reconquista em Portugal?", r: 1249, e: "Em 1249, com a conquista de Faro." },
        ],
      },
    ],
  },
  {
    id: "ing", nome: "Inglês", sigla: "En", cor: "#B58CFF",
    fichas: [
      {
        id: "ing1", titulo: "Vocabulary", sub: "Family, colours, numbers, days",
        q: [
          { t: "mc", p: "How do you say «mãe» in English?", o: ["father", "mother", "sister", "aunt"], c: 1, e: "Mãe = mother." },
          { t: "mc", p: "«Avô» in English is…", o: ["grandmother", "uncle", "grandfather", "cousin"], c: 2, e: "Avô = grandfather. Avó = grandmother." },
          { t: "txt", p: "Write «irmã» in English.", r: ["sister"], e: "Irmã = sister. Irmão = brother." },
          { t: "txt", p: "What colour is the sky on a sunny day?", r: ["blue"], e: "The sky is blue." },
          { t: "txt", p: "Write «amarelo» in English.", r: ["yellow"], e: "Amarelo = yellow." },
          { t: "txt", p: "Write the number 12 in English.", r: ["twelve"], e: "12 = twelve." },
          { t: "txt", p: "Write the number 30 in English.", r: ["thirty"], e: "30 = thirty (13 = thirteen)." },
          { t: "txt", p: "What day comes after Monday?", r: ["tuesday"], e: "Monday → Tuesday." },
          { t: "mc", p: "Which month comes after March?", o: ["May", "February", "April", "June"], c: 2, e: "March → April." },
        ],
      },
      {
        id: "ing2", titulo: "Verb to be & have got", sub: "am / is / are · have got / has got",
        q: [
          { t: "mc", p: "I ___ ten years old.", o: ["am", "is", "are", "has"], c: 0, e: "I am." },
          { t: "mc", p: "She ___ my best friend.", o: ["am", "is", "are", "have"], c: 1, e: "She is." },
          { t: "mc", p: "They ___ in the park.", o: ["am", "is", "are", "has"], c: 2, e: "They are." },
          { t: "mc", p: "He ___ got a dog.", o: ["have", "has", "is", "are"], c: 1, e: "He / she / it has got." },
          { t: "mc", p: "We ___ got two cats.", o: ["has", "have", "is", "am"], c: 1, e: "I / you / we / they have got." },
          { t: "txt", p: "Write the question: «___ you hungry?» (one word)", r: ["are"], e: "Are you hungry?" },
          { t: "txt", p: "Write in the negative: «I am happy.»", r: ["i am not happy", "i'm not happy", "im not happy"], e: "I am not happy / I'm not happy." },
          { t: "txt", p: "What is the plural of «child»?", r: ["children"], e: "One child, two children." },
        ],
      },
      {
        id: "ing3", titulo: "Daily routine & time", sub: "Telling the time, present simple",
        q: [
          { t: "mc", p: "«I get up at seven o'clock» means…", o: ["Deito-me às sete", "Levanto-me às sete", "Almoço às sete", "Saio às sete"], c: 1, e: "Get up = levantar-se." },
          { t: "mc", p: "8:30 — What time is it?", o: ["It's half past eight", "It's quarter past eight", "It's eight o'clock", "It's half past nine"], c: 0, e: "30 minutes past = half past." },
          { t: "mc", p: "3:15 — What time is it?", o: ["It's quarter to three", "It's quarter past three", "It's half past three", "It's three o'clock"], c: 1, e: "15 minutes past = quarter past." },
          { t: "mc", p: "«Breakfast» is…", o: ["almoço", "jantar", "pequeno-almoço", "lanche"], c: 2, e: "Breakfast = pequeno-almoço; lunch = almoço; dinner = jantar." },
          { t: "txt", p: "Complete: «She ___ (go) to school every day.»", r: ["goes"], e: "He / she / it + goes." },
          { t: "txt", p: "Complete: «He ___ (have) lunch at one o'clock.»", r: ["has"], e: "He has lunch." },
          { t: "txt", p: "What is the opposite of «early»?", r: ["late"], e: "Early ↔ late." },
          { t: "mc", p: "«I brush my teeth» means…", o: ["Lavo a cara", "Penteio o cabelo", "Lavo os dentes", "Tomo banho"], c: 2, e: "Brush my teeth = lavar os dentes." },
        ],
      },
    ],
  },
];
