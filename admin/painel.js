(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Regras de segurança desta página (travadas por testes no repositório do app):
  //  - só a chave pública (config.js); nunca a chave de serviço nem qualquer segredo;
  //  - sessão só na aba (sessionStorage); nada no armazenamento persistente do navegador;
  //  - dados da nuvem entram na página SÓ como texto (textContent) ou atributos, nunca como HTML;
  //  - o servidor devolve apenas agregados e exige admin + MFA (aal2) em toda função.
  // ---------------------------------------------------------------------------

  const CFG = window.MOMENTO_ADMIN_CONFIG;
  const TELAS = ['tela-carregando', 'tela-login', 'tela-mfa-codigo', 'tela-mfa-cadastro', 'tela-sem-acesso', 'tela-painel'];
  const NS_SVG = 'http://www.w3.org/2000/svg';
  const CHAVE_SESSAO = 'momento-admin-auth';

  const estado = { cliente: null, dias: 30, fatorId: null, carregamento: 0 };

  const $ = (id) => document.getElementById(id);

  // ---------- rótulos em português (chaves desconhecidas aparecem como vieram) ----------
  const ROTULOS = {
    relacao: {
      mae: 'Mãe', pai: 'Pai', irmao_irma: 'Irmão/Irmã', namorado_namorada: 'Namorado(a)', esposo_esposa: 'Esposo(a)',
      filho_filha: 'Filho(a)', sobrinho_sobrinha: 'Sobrinho(a)', afilhado_afilhada: 'Afilhado(a)', amigo_amiga: 'Amigo(a)', outro: 'Outro',
    },
    comemoracao: { presente: 'Presente', restaurante: 'Restaurante', viagem: 'Viagem', experiencia: 'Experiência', gesto: 'Gesto', outro: 'Outro' },
    ambiente: { ar_livre: 'Ao ar livre', tranquilo: 'Tranquilo', indiferente: 'Indiferente', outro: 'Outro' },
    companhia: { junto: 'Junto', distancia: 'À distância', sozinho: 'Sozinho', outro: 'Outro' },
    evento: {
      aniversario: 'Aniversário', data_fixa_relacao: 'Data do relacionamento', data_casamento: 'Casamento', dia_das_maes: 'Dia das Mães',
      dia_dos_pais: 'Dia dos Pais', dia_dos_namorados: 'Dia dos Namorados', valentines_day: "Valentine's Day", dia_das_criancas: 'Dia das Crianças',
      marco_dias_juntos: 'Marcos de dias juntos', manual: 'Manual', sem_evento: 'Sem evento', outro: 'Outro',
    },
  };
  const rotulo = (grupo, chave) => (ROTULOS[grupo] && ROTULOS[grupo][chave]) || String(chave);

  // ---------- formatação ----------
  const N = (n) => Number(n || 0).toLocaleString('pt-BR');
  const pct = (parte, total) =>
    total ? (100 * parte / total).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—';
  /** Percentual SEMPRE com a contagem (poucos usuários na fase de teste). */
  const pctComContagem = (parte, total) => (total ? pct(parte, total) + ' (' + N(parte) + ' de ' + N(total) + ')' : '— (0 de 0)');
  const ddmm = (aaaammdd) => String(aaaammdd).slice(8, 10) + '/' + String(aaaammdd).slice(5, 7);

  // ---------- DOM seguro ----------
  function h(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = String(texto);
    return e;
  }
  function svg(tag, atributos) {
    const e = document.createElementNS(NS_SVG, tag);
    Object.keys(atributos || {}).forEach((k) => e.setAttribute(k, String(atributos[k])));
    return e;
  }
  function limpar(no) {
    while (no.firstChild) no.removeChild(no.firstChild);
  }
  function mostrar(tela) {
    TELAS.forEach((id) => { $(id).hidden = id !== tela; });
    $('btn-sair').hidden = !(tela === 'tela-painel' || tela === 'tela-mfa-codigo' || tela === 'tela-mfa-cadastro');
  }
  function mostrarErro(id, mensagem) {
    const e = $(id);
    e.textContent = mensagem;
    e.hidden = false;
  }
  function esconderErro(id) {
    $(id).hidden = true;
  }

  // ---------- gráficos SVG ----------
  function novoGrafico(largura, altura, descricao) {
    return svg('svg', { class: 'grafico', viewBox: '0 0 ' + largura + ' ' + altura, role: 'img', 'aria-label': descricao });
  }

  /** Colunas por dia (valores inteiros). */
  function graficoColunas(serie, descricao, classeBarra) {
    const L = 480, A = 190, ml = 30, mb = 22, mt = 14, mr = 6;
    const g = novoGrafico(L, A, descricao);
    const maximo = Math.max(1, ...serie.map((p) => p.valor));
    const w = (L - ml - mr) / Math.max(1, serie.length);
    const y = (v) => A - mb - (v / maximo) * (A - mb - mt);

    g.appendChild(svg('line', { class: 'eixo', x1: ml, y1: A - mb, x2: L - mr, y2: A - mb }));
    [0, maximo].forEach((v) => {
      const t = svg('text', { class: 'rotulo', x: ml - 4, y: y(v) + 3, 'text-anchor': 'end' });
      t.textContent = N(v);
      g.appendChild(t);
    });
    serie.forEach((p, i) => {
      const altura = Math.max(p.valor > 0 ? 2 : 0, A - mb - y(p.valor));
      const barra = svg('rect', { class: classeBarra || 'barra', x: ml + i * w + w * 0.15, y: A - mb - altura, width: Math.max(1, w * 0.7), height: altura, rx: 2 });
      const dica = svg('title');
      dica.textContent = ddmm(p.dia) + ': ' + N(p.valor);
      barra.appendChild(dica);
      g.appendChild(barra);
    });
    [0, Math.floor((serie.length - 1) / 2), serie.length - 1].forEach((i, k) => {
      if (!serie[i] || (k > 0 && i === 0)) return;
      const t = svg('text', { class: 'rotulo', x: ml + i * w + w / 2, y: A - 6, 'text-anchor': k === 0 ? 'start' : k === 1 ? 'middle' : 'end' });
      t.textContent = ddmm(serie[i].dia);
      g.appendChild(t);
    });
    return g;
  }

  /** Linha com área (ativos por dia). */
  function graficoLinha(serie, descricao) {
    const L = 480, A = 190, ml = 30, mb = 22, mt = 14, mr = 10;
    const g = novoGrafico(L, A, descricao);
    const maximo = Math.max(1, ...serie.map((p) => p.valor));
    const passo = serie.length > 1 ? (L - ml - mr) / (serie.length - 1) : 0;
    const x = (i) => ml + i * passo;
    const y = (v) => A - mb - (v / maximo) * (A - mb - mt);

    g.appendChild(svg('line', { class: 'eixo', x1: ml, y1: A - mb, x2: L - mr, y2: A - mb }));
    [0, maximo].forEach((v) => {
      const t = svg('text', { class: 'rotulo', x: ml - 4, y: y(v) + 3, 'text-anchor': 'end' });
      t.textContent = N(v);
      g.appendChild(t);
    });
    if (serie.length) {
      const pontos = serie.map((p, i) => x(i).toFixed(1) + ',' + y(p.valor).toFixed(1));
      g.appendChild(svg('polygon', { class: 'area', points: x(0).toFixed(1) + ',' + (A - mb) + ' ' + pontos.join(' ') + ' ' + x(serie.length - 1).toFixed(1) + ',' + (A - mb) }));
      g.appendChild(svg('polyline', { class: 'linha', points: pontos.join(' ') }));
      serie.forEach((p, i) => {
        const c = svg('circle', { class: 'ponto', cx: x(i), cy: y(p.valor), r: 3 });
        const dica = svg('title');
        dica.textContent = ddmm(p.dia) + ': ' + N(p.valor);
        c.appendChild(dica);
        g.appendChild(c);
      });
      [0, Math.floor((serie.length - 1) / 2), serie.length - 1].forEach((i, k) => {
        if (k > 0 && i === 0) return;
        const t = svg('text', { class: 'rotulo', x: x(i), y: A - 6, 'text-anchor': k === 0 ? 'start' : k === 1 ? 'middle' : 'end' });
        t.textContent = ddmm(serie[i].dia);
        g.appendChild(t);
      });
    }
    return g;
  }

  /** Retenção: 3 colunas (0–100%) com a contagem embaixo. */
  function graficoRetencao(linhas) {
    const L = 360, A = 200, mb = 40, mt = 22;
    const g = novoGrafico(L, A, 'Retenção D1, D7 e D30');
    g.setAttribute('class', 'grafico estreito');
    g.appendChild(svg('line', { class: 'eixo', x1: 10, y1: A - mb, x2: L - 10, y2: A - mb }));
    const w = (L - 20) / Math.max(1, linhas.length);
    linhas.forEach((r, i) => {
      const p = r.percentual === null || r.percentual === undefined ? null : Number(r.percentual);
      const altura = p === null ? 0 : Math.max(p > 0 ? 2 : 0, (p / 100) * (A - mb - mt));
      const cx = 10 + i * w + w / 2;
      g.appendChild(svg('rect', { class: 'barra-suave', x: cx - w * 0.3, y: A - mb - altura, width: w * 0.6, height: altura, rx: 3 }));
      const v = svg('text', { class: 'valor', x: cx, y: A - mb - altura - 5, 'text-anchor': 'middle' });
      v.textContent = p === null ? '—' : pct(r.retidos, r.coorte);
      g.appendChild(v);
      const m = svg('text', { class: 'rotulo', x: cx, y: A - mb + 14, 'text-anchor': 'middle' });
      m.textContent = r.marco;
      g.appendChild(m);
      const c = svg('text', { class: 'rotulo', x: cx, y: A - mb + 27, 'text-anchor': 'middle' });
      c.textContent = N(r.retidos) + ' de ' + N(r.coorte);
      g.appendChild(c);
    });
    return g;
  }

  /** Barras horizontais em HTML/CSS, com a contagem sempre à vista. */
  function barrasHorizontais(itens, total) {
    const caixa = h('div', 'barras');
    if (!itens.length) {
      caixa.appendChild(h('p', 'vazio', 'Sem dados ainda.'));
      return caixa;
    }
    const maximo = Math.max(1, ...itens.map((i) => i.valor));
    itens.forEach((item) => {
      const linha = h('div', 'barra-linha');
      linha.appendChild(h('div', 'barra-rotulo', item.rotulo));
      const trilho = h('div', 'barra-trilho');
      const enchimento = h('div', 'barra-enchimento');
      enchimento.style.width = (100 * item.valor / maximo).toFixed(1) + '%';
      trilho.appendChild(enchimento);
      linha.appendChild(trilho);
      linha.appendChild(h('div', 'barra-texto', total ? pctComContagem(item.valor, total) : N(item.valor)));
      caixa.appendChild(linha);
    });
    return caixa;
  }

  // ---------- blocos de interface ----------
  function bloco(titulo, conteudo) {
    const b = h('div', 'bloco');
    b.appendChild(h('h3', null, titulo));
    b.appendChild(conteudo);
    return b;
  }
  function secao(titulo) {
    return h('h2', null, titulo);
  }
  function indisponivel() {
    return h('p', 'vazio', 'Não foi possível carregar esta seção.');
  }
  function metrica(rotuloTexto, valor, detalhe) {
    const m = h('div', 'metrica');
    m.appendChild(h('div', 'metrica-rotulo', rotuloTexto));
    m.appendChild(h('div', 'metrica-valor', valor));
    if (detalhe) m.appendChild(h('div', 'metrica-detalhe', detalhe));
    return m;
  }
  function tabela(colunas, linhas) {
    const rolagem = h('div', 'tabela-rolagem');
    const t = h('table');
    const cab = h('tr');
    colunas.forEach((c) => cab.appendChild(h('th', c.num ? 'num' : null, c.titulo)));
    const thead = h('thead');
    thead.appendChild(cab);
    t.appendChild(thead);
    const corpo = h('tbody');
    linhas.forEach((linha) => {
      const tr = h('tr');
      linha.forEach((celula, i) => tr.appendChild(h('td', colunas[i].num ? 'num' : null, celula)));
      corpo.appendChild(tr);
    });
    t.appendChild(corpo);
    rolagem.appendChild(t);
    return linhas.length ? rolagem : h('p', 'vazio', 'Sem dados ainda.');
  }

  // ---------- séries (30/90 dias) ----------
  function conteudoSeries(cadastros, atividade) {
    const grade = h('div', 'grade');
    grade.appendChild(
      bloco('Novas contas por dia', cadastros ? graficoColunas(cadastros.map((p) => ({ dia: p.dia, valor: Number(p.total) })), 'Novas contas por dia', 'barra') : indisponivel())
    );
    grade.appendChild(
      bloco('Usuários ativos por dia', atividade ? graficoLinha(atividade.map((p) => ({ dia: p.dia, valor: Number(p.ativos) })), 'Usuários ativos por dia') : indisponivel())
    );
    return grade;
  }

  async function carregarSeries(dias) {
    const [cad, ativ] = await Promise.all([
      estado.cliente.rpc('admin_cadastros_por_dia', { p_dias: dias }),
      estado.cliente.rpc('admin_atividade_por_dia', { p_dias: dias }),
    ]);
    return { cadastros: cad.error ? null : cad.data, atividade: ativ.error ? null : ativ.data };
  }

  // ---------- renderização do painel inteiro ----------
  function renderizar(d) {
    const raiz = $('conteudo-painel');
    limpar(raiz);

    raiz.appendChild(h('div', 'aviso', 'Mostra apenas usuários logados com sincronização. Quem usa sem login não aparece aqui.'));

    // Cartões
    const r = d.resumo;
    const cartoes = h('div', 'cartoes');
    if (r) {
      cartoes.appendChild(metrica('Contas', N(r.total_contas), 'com login Google'));
      cartoes.appendChild(metrica('Ativos hoje', N(r.dau), pctComContagem(r.dau, r.total_contas)));
      cartoes.appendChild(metrica('Ativos 7 dias', N(r.wau), pctComContagem(r.wau, r.total_contas)));
      cartoes.appendChild(metrica('Ativos 30 dias', N(r.mau), pctComContagem(r.mau, r.total_contas)));
      cartoes.appendChild(metrica('Novos 7 dias', N(r.novos_7d), N(r.novos_30d) + ' nos últimos 30 dias'));
      cartoes.appendChild(
        metrica('Pessoas por usuário', r.media_pessoas_por_usuario === null ? '—' : Number(r.media_pessoas_por_usuario).toLocaleString('pt-BR'), N(r.total_pessoas) + ' pessoas em ' + N(r.usuarios_com_pessoas) + ' usuários')
      );
    } else {
      cartoes.appendChild(indisponivel());
    }
    raiz.appendChild(cartoes);

    // Séries e retenção
    const titulo = h('h2', null, 'Uso ao longo do tempo');
    const seletor = h('span', 'seletor');
    [30, 90].forEach((dias) => {
      const b = h('button', null, dias + ' dias');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(dias === estado.dias));
      b.addEventListener('click', async () => {
        estado.dias = dias;
        Array.from(seletor.children).forEach((x, i) => x.setAttribute('aria-pressed', String([30, 90][i] === dias)));
        const s = await carregarSeries(dias);
        limpar(areaSeries);
        areaSeries.appendChild(conteudoSeries(s.cadastros, s.atividade));
      });
      seletor.appendChild(b);
    });
    titulo.appendChild(seletor);
    raiz.appendChild(titulo);
    const areaSeries = h('div');
    areaSeries.appendChild(conteudoSeries(d.cadastros, d.atividade));
    raiz.appendChild(areaSeries);

    const gradeRet = h('div', 'grade');
    gradeRet.style.marginTop = '16px';
    gradeRet.appendChild(bloco('Retenção (voltou no dia 1, 7 e 30 após o primeiro dia)', d.retencao ? graficoRetencao(d.retencao) : indisponivel()));
    raiz.appendChild(gradeRet);

    // Quem são as pessoas cadastradas
    raiz.appendChild(secao('Pessoas cadastradas'));
    const gradePessoas = h('div', 'grade');
    const totalPessoas = r ? Number(r.total_pessoas) : 0;
    gradePessoas.appendChild(
      bloco('Por tipo de relação', d.relacao ? barrasHorizontais(d.relacao.map((i) => ({ rotulo: rotulo('relacao', i.tipo_relacao), valor: Number(i.total) })), totalPessoas) : indisponivel())
    );
    raiz.appendChild(gradePessoas);

    // Preferências
    raiz.appendChild(secao('Preferências de comemoração'));
    const gradePref = h('div', 'grade');
    if (d.preferencias) {
      const por = (cat, grupo) =>
        d.preferencias
          .filter((i) => i.categoria === cat)
          .map((i) => ({ rotulo: rotulo(grupo, i.valor), valor: Number(i.total), base: Number(i.base) }))
          .sort((a, b) => b.valor - a.valor);
      const base = d.preferencias.length ? Number(d.preferencias[0].base) : 0;
      gradePref.appendChild(bloco('Tipos de comemoração', barrasHorizontais(por('tipo_comemoracao', 'comemoracao'), base)));
      gradePref.appendChild(bloco('Ambiente', barrasHorizontais(por('ambiente', 'ambiente'), base)));
      gradePref.appendChild(bloco('Companhia', barrasHorizontais(por('companhia', 'companhia'), base)));

      const dep = d.preferencias.filter((i) => i.categoria === 'modo_depende' && i.valor === 'ativo')[0];
      const ant = d.preferencias.filter((i) => i.categoria === 'antecedencia_dias').sort((a, b) => Number(b.total) - Number(a.total))[0];
      const resumo = h('div');
      resumo.appendChild(h('p', null, 'Com "Depende do momento" ligado: ' + pctComContagem(dep ? Number(dep.total) : 0, base)));
      resumo.appendChild(
        h('p', null, 'Antecedência de lembrete mais usada: ' + (ant ? ant.valor + (Number(ant.valor) === 1 ? ' dia' : ' dias') + ' antes — ' + pctComContagem(Number(ant.total), base) : '—'))
      );
      gradePref.appendChild(bloco('Outros', resumo));
    } else {
      gradePref.appendChild(bloco('Preferências', indisponivel()));
    }
    raiz.appendChild(gradePref);

    // Eventos mais desativados
    raiz.appendChild(secao('Eventos mais desativados'));
    raiz.appendChild(
      h('p', 'mudo', 'Considera só quem personalizou o evento (a base é o número de personalizações, não de usuários).')
    );
    raiz.appendChild(
      d.eventos
        ? tabela(
            [{ titulo: 'Evento' }, { titulo: 'Desligado', num: true }],
            d.eventos.map((e) => [rotulo('evento', e.tipo_evento), pctComContagem(Number(e.desligados), Number(e.total))])
          )
        : indisponivel()
    );

    // Sugestões
    raiz.appendChild(secao('Sugestões mais exibidas'));
    if (d.sugestoes) {
      const porTipo = {};
      d.sugestoes.forEach((s) => { (porTipo[s.tipo_evento] = porTipo[s.tipo_evento] || []).push(s); });
      const tipos = Object.keys(porTipo);
      if (!tipos.length) raiz.appendChild(h('p', 'vazio', 'Sem dados ainda.'));
      tipos.forEach((tipo, i) => {
        const det = h('details');
        if (i === 0) det.open = true;
        det.appendChild(h('summary', null, rotulo('evento', tipo) + ' — ' + N(porTipo[tipo].length) + ' sugestões'));
        det.appendChild(
          tabela(
            [{ titulo: 'Sugestão' }, { titulo: 'Vezes', num: true }, { titulo: 'Usuários', num: true }],
            porTipo[tipo].slice(0, 10).map((s) => [s.titulo, N(s.vezes), N(s.usuarios)])
          )
        );
        raiz.appendChild(det);
      });
    } else {
      raiz.appendChild(indisponivel());
    }

    // Funil de notificações
    raiz.appendChild(secao('Funil de notificações'));
    const funil = d.funil;
    if (!funil) {
      raiz.appendChild(indisponivel());
    } else if (!funil.length || funil[0].disponivel === false) {
      raiz.appendChild(h('p', 'vazio', 'Ainda não disponível: o app ainda não registra o log de notificações.'));
    } else {
      raiz.appendChild(
        tabela(
          [{ titulo: 'Evento' }, { titulo: 'Agendadas', num: true }, { titulo: 'Tocadas', num: true }, { titulo: 'Falhas', num: true }, { titulo: 'Permissão concedida', num: true }, { titulo: 'Permissão negada', num: true }],
          funil.map((f) => [
            rotulo('evento', f.tipo_evento),
            N(f.agendadas),
            pctComContagem(Number(f.tocadas), Number(f.agendadas)),
            pctComContagem(Number(f.falhas), Number(f.agendadas)),
            N(f.permissao_concedida),
            N(f.permissao_negada),
          ])
        )
      );
    }
  }

  // ---------- carregamento ----------
  async function abrirPainel() {
    mostrar('tela-carregando');
    const resumo = await estado.cliente.rpc('admin_resumo');
    if (resumo.error && resumo.error.code === '42501') {
      // Não-admin ou sem aal2: nenhum outro dado é pedido, e a sessão é encerrada.
      await estado.cliente.auth.signOut();
      mostrar('tela-sem-acesso');
      return;
    }
    if (resumo.error || !resumo.data || !resumo.data.length) {
      // Falha que não é de permissão (rede, função ausente): não é "sem acesso"; mantém a sessão e avisa.
      limpar($('conteudo-painel'));
      $('conteudo-painel').appendChild(h('p', 'erro', 'Não foi possível carregar o painel agora. Tente de novo em instantes.'));
      mostrar('tela-painel');
      return;
    }
    const pedidos = {
      retencao: estado.cliente.rpc('admin_retencao'),
      relacao: estado.cliente.rpc('admin_pessoas_por_tipo_relacao'),
      preferencias: estado.cliente.rpc('admin_preferencias'),
      eventos: estado.cliente.rpc('admin_eventos'),
      sugestoes: estado.cliente.rpc('admin_sugestoes'),
      funil: estado.cliente.rpc('admin_funil_notificacoes'),
    };
    const series = await carregarSeries(estado.dias);
    const chaves = Object.keys(pedidos);
    const respostas = await Promise.all(chaves.map((k) => pedidos[k]));
    const dados = { resumo: resumo.data[0], cadastros: series.cadastros, atividade: series.atividade };
    chaves.forEach((k, i) => { dados[k] = respostas[i].error ? null : respostas[i].data; });
    renderizar(dados);
    mostrar('tela-painel');
  }

  // ---------- login e MFA ----------
  async function aposLogin() {
    mostrar('tela-carregando');
    const { data, error } = await estado.cliente.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) {
      mostrar('tela-login');
      mostrarErro('login-erro', 'Não foi possível entrar. Tente novamente.');
      return;
    }
    if (data.currentLevel === 'aal2') return abrirPainel();
    if (data.nextLevel === 'aal2') return pedirCodigo();
    return iniciarCadastroMfa();
  }

  async function pedirCodigo() {
    const { data, error } = await estado.cliente.auth.mfa.listFactors();
    const fator = !error && data && data.totp && data.totp[0];
    if (!fator) {
      mostrar('tela-login');
      mostrarErro('login-erro', 'Não foi possível entrar. Tente novamente.');
      return;
    }
    estado.fatorId = fator.id;
    $('mfa-codigo').value = '';
    esconderErro('mfa-codigo-erro');
    mostrar('tela-mfa-codigo');
    $('mfa-codigo').focus();
  }

  async function iniciarCadastroMfa() {
    // Restos de um cadastro abandonado (fator não verificado) são removidos antes de criar outro.
    const existentes = await estado.cliente.auth.mfa.listFactors();
    const pendentes = (existentes.data && existentes.data.all ? existentes.data.all : []).filter((f) => f.status !== 'verified');
    for (const f of pendentes) {
      await estado.cliente.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await estado.cliente.auth.mfa.enroll({ factorType: 'totp', issuer: 'Momento Painel', friendlyName: 'Painel ' + new Date().toISOString().slice(0, 10) });
    if (error || !data) {
      mostrar('tela-login');
      mostrarErro('login-erro', 'Não foi possível configurar o autenticador. Tente novamente.');
      return;
    }
    estado.fatorId = data.id;
    $('mfa-qr').src = data.totp.qr_code;
    $('mfa-segredo').textContent = data.totp.secret;
    $('mfa-cadastro-codigo').value = '';
    esconderErro('mfa-cadastro-erro');
    mostrar('tela-mfa-cadastro');
    $('mfa-cadastro-codigo').focus();
  }

  async function verificarCodigo(campoCodigo, idErro) {
    esconderErro(idErro);
    const codigo = $(campoCodigo).value.replace(/\s+/g, '');
    if (!/^[0-9]{6}$/.test(codigo)) {
      mostrarErro(idErro, 'Digite o código de 6 dígitos.');
      return;
    }
    const { error } = await estado.cliente.auth.mfa.challengeAndVerify({ factorId: estado.fatorId, code: codigo });
    if (error) {
      mostrarErro(idErro, 'Código inválido. Tente novamente.');
      return;
    }
    $(campoCodigo).value = '';
    $('mfa-qr').removeAttribute('src');
    $('mfa-segredo').textContent = '';
    const { data } = await estado.cliente.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.currentLevel === 'aal2') return abrirPainel();
    mostrarErro(idErro, 'Não foi possível concluir a verificação.');
  }

  async function sair() {
    try {
      await estado.cliente.auth.signOut();
    } finally {
      voltarAoLogin();
    }
  }

  function voltarAoLogin() {
    limpar($('conteudo-painel'));
    $('login-senha').value = '';
    $('mfa-qr').removeAttribute('src');
    $('mfa-segredo').textContent = '';
    esconderErro('login-erro');
    mostrar('tela-login');
  }

  function ligarEventos() {
    $('form-login').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      esconderErro('login-erro');
      const botao = ev.target.querySelector('button[type="submit"]');
      botao.disabled = true;
      try {
        const { error } = await estado.cliente.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-senha').value });
        $('login-senha').value = '';
        if (error) {
          mostrarErro('login-erro', 'E-mail ou senha inválidos.');
          return;
        }
        await aposLogin();
      } finally {
        botao.disabled = false;
      }
    });
    $('form-mfa-codigo').addEventListener('submit', (ev) => { ev.preventDefault(); verificarCodigo('mfa-codigo', 'mfa-codigo-erro'); });
    $('form-mfa-cadastro').addEventListener('submit', (ev) => { ev.preventDefault(); verificarCodigo('mfa-cadastro-codigo', 'mfa-cadastro-erro'); });
    $('btn-sair').addEventListener('click', sair);
  }

  async function iniciar() {
    ligarEventos();
    if (!window.supabase || !CFG) {
      mostrar('tela-login');
      mostrarErro('login-erro', 'Não foi possível carregar o painel. Recarregue a página.');
      return;
    }
    estado.cliente = window.supabase.createClient(CFG.supabaseUrl, CFG.publishableKey, {
      auth: {
        storage: window.sessionStorage, // só na aba: fechou, saiu
        storageKey: CHAVE_SESSAO,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    estado.cliente.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') voltarAoLogin();
    });
    const { data } = await estado.cliente.auth.getSession();
    if (data && data.session) {
      await aposLogin();
    } else {
      mostrar('tela-login');
    }
  }

  // Exposto só para conferência visual com dados fictícios (renderiza; não busca nada).
  window.MomentoPainel = Object.freeze({ renderizar: (dados) => { renderizar(dados); mostrar('tela-painel'); } });

  iniciar();
})();
