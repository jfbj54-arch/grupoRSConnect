const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const upload = multer({
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({
    extended: true,
    limit: '50mb'
}));

app.use(express.static(path.join(__dirname)));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Erro ao conectar ao PostgreSQL:', err.stack);
    } else {
        console.log('Conectado ao PostgreSQL.');
        release();
        criarTabelas();
    }
});

async function criarTabelas() {
    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                tipo TEXT,
                nome TEXT,
                doc TEXT,
                responsavel TEXT,
                email TEXT UNIQUE,
                senha TEXT,
                whatsapp TEXT,
                endereco TEXT,
                rg_cnh TEXT,
                profissao TEXT,
                tipo_chave_pix TEXT,
                pix TEXT,
                banco TEXT,
                conta TEXT,
                experiencia TEXT
            );

            CREATE TABLE IF NOT EXISTS prestadores (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                reputacao NUMERIC(3,2) DEFAULT 5.0,
                advertencias INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS servicos (
                id SERIAL PRIMARY KEY,

                titulo TEXT,
                categoria TEXT,
                local TEXT,
                endereco TEXT,

                valor TEXT,
                valor_diaria NUMERIC(10,2) DEFAULT 0,
                valor_liquido NUMERIC(10,2) DEFAULT 0,

                data_horario TEXT,
                forma_pgto TEXT,

                descricao TEXT,
                contrato_texto TEXT,

                empresa_email TEXT,
                empresa_whatsapp TEXT,
                empresa_nome TEXT,

                recorrencia TEXT DEFAULT 'unico',
                valor_total NUMERIC(10,2) DEFAULT 0,

                status TEXT DEFAULT 'ativo',
                motivo_cancelamento TEXT,

                prestador_email TEXT,
                prestador_id INTEGER,
                prestador_nome TEXT,
                prestador_pix TEXT,
                prestador_whatsapp TEXT,

                data_aceite TIMESTAMPTZ,

                foto_ponto TEXT,
                foto_checkin TEXT,
                foto_checkout TEXT,

                checkin_gps TEXT,
                checkout_gps TEXT,

                reservas JSONB DEFAULT '[]'::jsonb,
                mensagens JSONB DEFAULT '[]'::jsonb,

                selfie_confirmacao TEXT,
                documento_comprovante TEXT,

                presenca_confirmada BOOLEAN DEFAULT FALSE,

                status_checkin TEXT DEFAULT 'pendente',

                checkin_hora TEXT,
                checkout_hora TEXT,

                intervalo_inicio TEXT,
                intervalo_retorno TEXT,

                total_horas TEXT,

                comprovante_pagamento BOOLEAN DEFAULT FALSE,

                nota_oficial TEXT,
                nota_nome TEXT,
                nota_tipo TEXT,
                nota_remetente TEXT,
                nota_enviada_em TIMESTAMP,

                validado_empresa BOOLEAN DEFAULT FALSE,
                validado_em TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ledger_transacoes (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER,
                usuario_email TEXT,
                usuario_id INTEGER,
                tipo TEXT,
                tipo_movimento TEXT,
                valor NUMERIC(10,2) NOT NULL,
                status TEXT NOT NULL DEFAULT 'PROCESSADO',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS auditoria_sistema (
                id SERIAL PRIMARY KEY,
                usuario_email TEXT,
                acao TEXT NOT NULL,
                detalhes TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const colunasGarantir = [
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS categoria TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS data_horario TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS forma_pgto TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_texto TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_email TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_whatsapp TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_nome TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS recorrencia TEXT DEFAULT 'unico';",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS mensagens JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS documento_comprovante TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status_checkin TEXT DEFAULT 'pendente';",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_hora TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_hora TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_oficial TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_nome TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_tipo TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_remetente TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_enviada_em TIMESTAMP;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS data_aceite TIMESTAMPTZ;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkin TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkout TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_gps TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_gps TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_inicio TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_retorno TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS total_horas TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_empresa BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP;"
        ];

        for (const sql of colunasGarantir) {
            await pool.query(sql).catch(() => {});
        }

        await pool.query(`
            UPDATE servicos
            SET data_aceite = CURRENT_TIMESTAMP
            WHERE prestador_email IS NOT NULL
            AND data_aceite IS NULL
        `).catch(() => {});

        console.log('Banco atualizado com sucesso.');

    } catch (err) {
        console.error('Erro ao criar tabelas:', err);
    }
}

async function registrarAuditoria(email, acao, detalhes) {
    try {
        await pool.query(
            `
            INSERT INTO auditoria_sistema
            (usuario_email, acao, detalhes)
            VALUES ($1, $2, $3)
            `,
            [
                email || 'sistema',
                acao,
                detalhes
            ]
        );
    } catch (err) {
        console.error('Erro auditoria:', err);
    }
}

async function registrarLedger(servicoId, email, tipo, valor) {
    try {
        await pool.query(
            `
            INSERT INTO ledger_transacoes
            (servico_id, usuario_email, tipo_movimento, valor)
            VALUES ($1, $2, $3, $4)
            `,
            [
                servicoId,
                email,
                tipo,
                valor
            ]
        );
    } catch (err) {
        console.error('Erro ledger:', err);
    }
}

async function adicionarMensagemSistema(servicoId, texto) {
    try {
        const result = await pool.query(
            `SELECT mensagens FROM servicos WHERE id = $1`,
            [servicoId]
        );

        if (!result.rows.length) return;

        const mensagens = result.rows[0].mensagens || [];

        mensagens.push({
            remetente: 'SISTEMA',
            texto,
            data: new Date().toLocaleTimeString()
        });

        await pool.query(
            `UPDATE servicos SET mensagens = $1 WHERE id = $2`,
            [
                JSON.stringify(mensagens),
                servicoId
            ]
        );

    } catch (err) {
        console.error('Erro mensagem sistema:', err);
    }
}

/* =====================================================
   CADASTRO
===================================================== */

app.post('/api/auth/registrar', async (req, res) => {

    const d = req.body;

    try {

        const result = await pool.query(
            `
            INSERT INTO usuarios (
                tipo,
                nome,
                doc,
                responsavel,
                email,
                senha,
                whatsapp,
                endereco,
                rg_cnh,
                profissao,
                tipo_chave_pix,
                pix,
                banco,
                conta,
                experiencia
            )
            VALUES (
                $1,$2,$3,$4,$5,
                $6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15
            )
            RETURNING id
            `,
            [
                d.tipo,
                d.nome,
                d.doc,
                d.responsavel,
                d.email,
                d.senha,
                d.whatsapp,
                d.endereco,
                d.rgCnh,
                d.profissao,
                d.tipoChavePix,
                d.pix,
                d.banco,
                d.conta,
                d.experiencia
            ]
        );

        if (d.tipo === 'prestador') {
            await pool.query(
                `
                INSERT INTO prestadores (email)
                VALUES ($1)
                ON CONFLICT (email)
                DO NOTHING
                `,
                [d.email]
            );
        }

        res.json({
            sucesso: true,
            id: result.rows[0].id
        });

    } catch (err) {

        console.error('Erro cadastro:', err);

        res.json({
            sucesso: false,
            erro: 'E-mail já cadastrado ou erro nos dados.'
        });
    }
});

/* =====================================================
   LOGIN
===================================================== */

app.post('/api/auth/login', async (req, res) => {

    const {
        email,
        senha
    } = req.body;

    try {

        const result = await pool.query(
            `
            SELECT *
            FROM usuarios
            WHERE email = $1
            AND senha = $2
            `,
            [email, senha]
        );

        if (!result.rows.length) {
            return res.json({
                sucesso: false,
                erro: 'E-mail ou senha incorretos.'
            });
        }

        res.json({
            sucesso: true,
            usuario: result.rows[0]
        });

    } catch (err) {

        console.error('Erro login:', err);

        res.status(500).json({
            sucesso: false,
            erro: 'Erro no servidor.'
        });
    }
});

/* =====================================================
   LISTAR SERVIÇOS
===================================================== */

app.get('/api/servicos', async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT
                s.*,
                COALESCE(
                    NULLIF(s.empresa_nome, ''),
                    u.nome
                ) AS empresa_nome_resolvido
            FROM servicos s
            LEFT JOIN usuarios u
                ON LOWER(u.email) =
                   LOWER(s.empresa_email)
            ORDER BY s.id DESC
        `);

        const dados = result.rows.map(s => ({
            ...s,

            empresaEmail:
                s.empresa_email,

            empresaNome:
                s.empresa_nome_resolvido ||
                s.empresa_nome,

            forma_pagamento:
                s.forma_pgto,

            formaPagamento:
                s.forma_pgto,

            nota_fiscal_oficial:
                s.nota_oficial || null,

            nota_fiscal_remetente:
                s.nota_remetente || null,

            foto_checkin:
                s.foto_checkin ||
                s.foto_ponto ||
                null,

            fotoCheckin:
                s.foto_checkin ||
                s.foto_ponto ||
                null,

            foto_checkout:
                s.foto_checkout ||
                s.documento_comprovante ||
                null,

            fotoCheckout:
                s.foto_checkout ||
                s.documento_comprovante ||
                null,

            intervaloInicio:
                s.intervalo_inicio,

            intervaloRetorno:
                s.intervalo_retorno,

            totalHoras:
                s.total_horas,

            validadoEmpresa:
                !!s.validado_empresa
        }));

        res.json(dados);

    } catch (err) {

        console.error('Erro serviços:', err);

        res.status(500).json({
            erro: 'Erro ao buscar serviços.'
        });
    }
});

/* =====================================================
   PUBLICAR SERVIÇO
===================================================== */

app.post('/api/servicos', async (req, res) => {

    const s = req.body;

    try {

        const valorUnitario =
            parseFloat(
                String(s.valor)
                    .replace(',', '.')
            ) || 0;

        const recorrencia =
            s.recorrencia ||
            'unico';

        let valorTotal =
            valorUnitario;

        if (recorrencia === 'semanal') {
            valorTotal =
                valorUnitario * 4;
        }

        if (recorrencia === 'quinzenal') {
            valorTotal =
                valorUnitario * 2;
        }

        const valorLiquido =
            valorTotal * 0.90;

        const result =
            await pool.query(
                `
                INSERT INTO servicos (
                    titulo,
                    categoria,
                    local,
                    endereco,
                    valor,
                    valor_diaria,
                    valor_liquido,
                    data_horario,
                    forma_pgto,
                    descricao,
                    contrato_texto,
                    empresa_email,
                    empresa_whatsapp,
                    recorrencia,
                    valor_total,
                    empresa_nome,
                    status
                )
                VALUES (
                    $1,$2,$3,$4,$5,
                    $6,$7,$8,$9,$10,
                    $11,$12,$13,$14,$15,
                    $16,'ativo'
                )
                RETURNING id
                `,
                [
                    s.titulo,
                    s.categoria || 'Geral',
                    s.local,
                    s.endereco,
                    String(s.valor),
                    valorUnitario,
                    valorLiquido,
                    s.horario ||
                        s.dataHorario ||
                        'A combinar',
                    s.pagamento ||
                        s.formaPgto ||
                        'Pix',
                    s.descricao,
                    s.contrato ||
                        s.contratoTexto ||
                        '',
                    s.empresa_email ||
                        s.empresaEmail ||
                        '',
                    s.empresa_whatsapp ||
                        s.empresaWhatsapp ||
                        '',
                    recorrencia,
                    valorTotal,
                    s.empresa_nome ||
                        s.empresaNome ||
                        ''
                ]
            );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            id: result.rows[0].id
        });

    } catch (err) {

        console.error('Erro publicar:', err);

        res.status(500).json({
            sucesso: false,
            erro:
                'Erro ao publicar serviço: ' +
                err.message
        });
    }
});

/* =====================================================
   ENTRAR NA FILA
===================================================== */

app.post('/api/servicos/:id/fila', async (req, res) => {

    const id =
        req.params.id;

    const {
        prestadorEmail,
        prestadorNome,
        prestadorWhatsapp,
        prestadorPix,
        rgCnh
    } = req.body;

    try {

        const result =
            await pool.query(
                `
                SELECT *
                FROM servicos
                WHERE id = $1
                `,
                [id]
            );

        if (!result.rows.length) {

            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico =
            result.rows[0];

        let fila =
            Array.isArray(servico.reservas)
                ? servico.reservas
                : [];

        const statusServico =
            String(servico.status || '')
                .toLowerCase();

        const statusEncerrados = [
            'concluido',
            'aguardando_validacao',
            'validado',
            'aprovado',
            'pago',
            'cancelado'
        ];

        const vagaEncerrada =
            Boolean(servico.checkout_hora) ||
            Boolean(servico.validado_empresa) ||
            Boolean(servico.comprovante_pagamento) ||
            statusEncerrados.includes(
                statusServico
            );

        if (vagaEncerrada) {

            return res.status(409).json({
                sucesso: false,
                erro:
                    'Esta vaga já foi encerrada.'
            });
        }

        if (
            servico.prestador_email &&
            servico.prestador_email !==
            prestadorEmail
        ) {

            return res.status(409).json({
                sucesso: false,
                erro:
                    'Esta vaga já foi preenchida.'
            });
        }

        if (
            servico.prestador_email ===
            prestadorEmail
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Você já é o titular desta vaga.'
            });
        }

        if (
            fila.some(
                p =>
                    p.email ===
                    prestadorEmail
            )
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Você já está na fila.'
            });
        }

        if (fila.length >= 2) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'A fila desta vaga está completa.'
            });
        }

        fila.push({
            email:
                prestadorEmail,

            nome:
                prestadorNome,

            whatsapp:
                prestadorWhatsapp || '',

            pix:
                prestadorPix || '',

            rgCnh:
                rgCnh || '',

            entrouEm:
                new Date().toISOString()
        });

        await pool.query(
            `
            UPDATE servicos
            SET reservas = $1
            WHERE id = $2
            `,
            [
                JSON.stringify(fila),
                id
            ]
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,

            mensagem:
                `Você entrou na fila na posição ${fila.length}.`,

            posicao:
                fila.length
        });

    } catch (err) {

        console.error(
            'Erro ao entrar na fila:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao entrar na fila.'
        });
    }
});

/* =====================================================
   ACEITAR VAGA
===================================================== */

app.post('/api/servicos/:id/aceitar', async (req, res) => {

    const id =
        req.params.id;

    const {
        prestadorEmail,
        prestadorNome,
        prestadorPix,
        prestadorWhatsapp
    } = req.body;

    try {

        const result =
            await pool.query(
                `
                SELECT *
                FROM servicos
                WHERE id = $1
                `,
                [id]
            );

        if (!result.rows.length) {

            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico =
            result.rows[0];

        const fila =
            Array.isArray(servico.reservas)
                ? servico.reservas
                : [];

        const indice =
            fila.findIndex(
                p =>
                    p.email ===
                    prestadorEmail
            );

        if (indice === -1) {

            return res.status(403).json({
                sucesso: false,
                erro:
                    'Você não está na fila desta vaga.'
            });
        }

        if (
            servico.prestador_email
        ) {

            return res.status(409).json({
                sucesso: false,
                erro:
                    'Esta vaga já possui titular.'
            });
        }

        if (indice !== 0) {

            return res.status(403).json({
                sucesso: false,
                erro:
                    `Você está na posição ${indice + 1}. Apenas o primeiro da fila pode assumir.`
            });
        }

        const dadosFila =
            fila[indice];

        const prestadorResult =
            await pool.query(
                `
                SELECT id
                FROM usuarios
                WHERE email = $1
                `,
                [prestadorEmail]
            );

        const prestadorId =
            prestadorResult.rows[0]?.id ||
            null;

        const novaFila =
            fila.filter(
                p =>
                    p.email !==
                    prestadorEmail
            );

        const aceite =
            await pool.query(
                `
                UPDATE servicos
                SET
                    status =
                        'em_andamento',

                    prestador_email = $1,

                    prestador_id = $2,

                    prestador_nome = $3,

                    prestador_pix = $4,

                    prestador_whatsapp = $5,

                    reservas = $6,

                    data_aceite =
                        CURRENT_TIMESTAMP

                WHERE id = $7

                RETURNING data_aceite
                `,
                [
                    prestadorEmail,

                    prestadorId,

                    prestadorNome ||
                    dadosFila.nome,

                    prestadorPix ||
                    dadosFila.pix ||
                    '',

                    prestadorWhatsapp ||
                    dadosFila.whatsapp ||
                    '',

                    JSON.stringify(
                        novaFila
                    ),

                    id
                ]
            );

        await adicionarMensagemSistema(
            id,
            `${prestadorNome} assumiu a vaga titular.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,

            mensagem:
                'Vaga assumida com sucesso!',

            data_aceite:
                aceite.rows[0]
                    ?.data_aceite
        });

    } catch (err) {

        console.error(
            'Erro ao aceitar:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao aceitar serviço.'
        });
    }
});

/* =====================================================
   CONFIRMAR PRESENÇA
===================================================== */

app.post(
    '/api/servicos/:id/confirmar-presenca',
    async (req, res) => {

        const id =
            req.params.id;

        const selfie =
            req.body.selfie;

        try {

            await pool.query(
                `
                UPDATE servicos
                SET
                    selfie_confirmacao = $1,
                    presenca_confirmada = TRUE
                WHERE id = $2
                `,
                [
                    selfie,
                    id
                ]
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true
            });

        } catch (err) {

            res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao confirmar presença.'
            });
        }
    }
);

/* =====================================================
   CHECK-IN
===================================================== */

app.post('/api/servicos/:id/checkin', async (req, res) => {

    const id =
        req.params.id;

    const foto =
        req.body.foto ||
        req.body.foto_checkin ||
        req.body.fotoCheckin;

    const hora =
        req.body.hora ||
        new Date()
            .toLocaleTimeString();

    const gps =
        req.body.gps ||
        req.body.checkin_gps ||
        null;

    try {

        const atual =
            await pool.query(
                `
                SELECT
                    checkin_hora,
                    checkout_hora
                FROM servicos
                WHERE id = $1
                `,
                [id]
            );

        if (!atual.rows.length) {

            return res.status(404).json({
                sucesso: false,
                erro:
                    'Serviço não encontrado.'
            });
        }

        if (
            atual.rows[0].checkin_hora
        ) {

            return res.status(409).json({
                sucesso: false,

                erro:
                    `Check-in já realizado às ${atual.rows[0].checkin_hora}.`
            });
        }

        if (!foto) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'A foto do check-in é obrigatória.'
            });
        }

        await pool.query(
            `
            UPDATE servicos
            SET
                foto_ponto = $1,
                foto_checkin = $1,
                checkin_hora = $2,
                checkin_gps = $3,
                status_checkin =
                    'realizado',
                status =
                    'em_andamento'
            WHERE id = $4
            `,
            [
                foto,
                hora,
                gps,
                id
            ]
        );

        io.emit(
            'atualizar_servicos'
        );

        res.json({
            sucesso: true,

            mensagem:
                'Check-in realizado com sucesso!',

            checkin_hora:
                hora,

            checkin_gps:
                gps
        });

    } catch (err) {

        console.error(
            'Erro check-in:',
            err
        );

        res.status(500).json({
            sucesso: false,

            erro:
                'Erro ao registrar check-in.'
        });
    }
});

/* =====================================================
   INTERVALO
===================================================== */

app.post(
    '/api/servicos/:id/intervalo/iniciar',
    async (req, res) => {

        const id =
            req.params.id;

        const hora =
            req.body.hora ||
            new Date()
                .toLocaleTimeString();

        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            if (
                !result.rows[0]
                    .checkin_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Faça o check-in primeiro.'
                });
            }

            await pool.query(
                `
                UPDATE servicos
                SET
                    intervalo_inicio = $1,
                    intervalo_retorno = NULL
                WHERE id = $2
                `,
                [
                    hora,
                    id
                ]
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                intervalo_inicio:
                    hora
            });

        } catch (err) {

            res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao iniciar intervalo.'
            });
        }
    }
);

app.post(
    '/api/servicos/:id/intervalo/retornar',
    async (req, res) => {

        const id =
            req.params.id;

        const hora =
            req.body.hora ||
            new Date()
                .toLocaleTimeString();

        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            if (
                !result.rows[0]
                    .intervalo_inicio
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhum intervalo iniciado.'
                });
            }

            await pool.query(
                `
                UPDATE servicos
                SET
                    intervalo_retorno = $1
                WHERE id = $2
                `,
                [
                    hora,
                    id
                ]
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                intervalo_retorno:
                    hora
            });

        } catch (err) {

            res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao retornar.'
            });
        }
    }
);

/* =====================================================
   CHECK-OUT
===================================================== */

app.post(
    '/api/servicos/:id/checkout',
    upload.single('fotoCheckout'),
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const foto =
                req.body.foto ||
                req.body.foto_checkout ||
                req.body.fotoCheckout ||
                (
                    arquivo
                        ? `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        : null
                );

            const hora =
                req.body.hora ||
                new Date()
                    .toLocaleTimeString();

            const gps =
                req.body.gps ||
                req.body.checkout_gps ||
                null;

            const totalHoras =
                req.body.total_horas ||
                '';

            const pix =
                req.body.prestador_pix ||
                req.body.prestadorPix ||
                null;

            const forma =
                req.body.forma_pagamento ||
                req.body.formaPagamento ||
                null;

            const atual =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (!atual.rows.length) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            if (
                !atual.rows[0]
                    .checkin_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Faça o check-in primeiro.'
                });
            }

            if (
                atual.rows[0]
                    .checkout_hora
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        `Check-out já realizado às ${atual.rows[0].checkout_hora}.`
                });
            }

            if (!foto) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A foto do check-out é obrigatória.'
                });
            }

            await pool.query(
                `
                UPDATE servicos
                SET
                    status =
                        'aguardando_validacao',

                    status_checkin =
                        'concluido',

                    checkout_hora = $1,

                    foto_checkout = $2,

                    documento_comprovante = $2,

                    checkout_gps = $3,

                    total_horas = $4,

                    prestador_pix =
                        COALESCE(
                            $5,
                            prestador_pix
                        ),

                    forma_pgto =
                        COALESCE(
                            $6,
                            forma_pgto
                        ),

                    comprovante_pagamento =
                        FALSE,

                    validado_empresa =
                        FALSE

                WHERE id = $7
                `,
                [
                    hora,
                    foto,
                    gps,
                    totalHoras,
                    pix,
                    forma,
                    id
                ]
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,

                mensagem:
                    'Serviço finalizado e enviado para validação da empresa!',

                checkout_hora:
                    hora,

                checkout_gps:
                    gps,

                total_horas:
                    totalHoras
            });

        } catch (err) {

            console.error(
                'Erro checkout:',
                err
            );

            res.status(500).json({
                sucesso: false,

                erro:
                    'Erro ao fazer check-out.'
            });
        }
    }
);

/* =====================================================
   NOTA FISCAL
===================================================== */

app.post(
    '/api/servicos/:id/nota-oficial',
    upload.single('notaFiscal'),
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const nota =
                arquivo
                    ? `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                    : (
                        req.body.notaFiscal ||
                        req.body.nota_fiscal_oficial ||
                        null
                    );

            if (!nota) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhum arquivo de Nota Fiscal recebido.'
                });
            }

            await pool.query(
                `
                UPDATE servicos
                SET
                    nota_oficial = $1,
                    nota_nome = $2,
                    nota_tipo = $3,
                    nota_remetente = $4,
                    nota_enviada_em =
                        CURRENT_TIMESTAMP
                WHERE id = $5
                `,
                [
                    nota,

                    arquivo?.originalname ||
                    'nota-fiscal',

                    arquivo?.mimetype ||
                    'arquivo',

                    req.body
                        .notaFiscalRemetente ||
                    'Usuário',

                    id
                ]
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                mensagem:
                    'Nota Fiscal enviada com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro NF:',
                err
            );

            res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar Nota Fiscal.'
            });
        }
    }
);

/* =====================================================
   VALIDAR SERVIÇO
===================================================== */

app.post(
    '/api/servicos/:id/validar',
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            if (
                !result.rows[0]
                    .checkout_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O prestador ainda não fez o check-out.'
                });
            }

            await pool.query(
                `
                UPDATE servicos
                SET
                    validado_empresa =
                        TRUE,

                    validado_em =
                        CURRENT_TIMESTAMP,

                    status =
                        'validado'

                WHERE id = $1
                `,
                [id]
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,

                mensagem:
                    'Serviço validado pela empresa.'
            });

        } catch (err) {

            res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao validar serviço.'
            });
        }
    }
);

/* =====================================================
   PAGAMENTO
===================================================== */

app.post(
    '/api/servicos/:id/aprovar',
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const servico =
                result.rows[0];

            if (
                !servico.validado_empresa
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A empresa precisa validar o serviço primeiro.'
                });
            }

            await pool.query(
                `
                UPDATE servicos
                SET
                    status =
                        'pago',

                    comprovante_pagamento =
                        TRUE

                WHERE id = $1
                `,
                [id]
            );

            await registrarLedger(
                id,
                servico.prestador_email,
                'REPASSE_PRESTADOR',
                servico.valor_liquido ||
                servico.valor_diaria ||
                0
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,

                mensagem:
                    'Pagamento registrado com sucesso!',

                prestador_pix:
                    servico.prestador_pix,

                forma_pagamento:
                    servico.forma_pgto
            });

        } catch (err) {

            console.error(
                'Erro pagamento:',
                err
            );

            res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao aprovar pagamento.'
            });
        }
    }
);

/* =====================================================
   CHAT
===================================================== */

app.post(
    '/api/servicos/:id/chat',
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const result =
                await pool.query(
                    `
                    SELECT mensagens
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    sucesso: false
                });
            }

            const mensagens =
                result.rows[0]
                    .mensagens ||
                [];

            mensagens.push({
                remetente:
                    req.body.remetente,

                email:
                    req.body.email,

                texto:
                    req.body.texto,

                data:
                    new Date()
                        .toLocaleTimeString()
            });

            await pool.query(
                `
                UPDATE servicos
                SET mensagens = $1
                WHERE id = $2
                `,
                [
                    JSON.stringify(
                        mensagens
                    ),
                    id
                ]
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true
            });

        } catch (err) {

            res.status(500).json({
                sucesso: false
            });
        }
    }
);

/* =====================================================
   EXCLUIR SERVIÇO
===================================================== */

app.delete(
    '/api/servicos/:id',
    async (req, res) => {

        try {

            await pool.query(
                `
                DELETE FROM servicos
                WHERE id = $1
                `,
                [
                    req.params.id
                ]
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true
            });

        } catch (err) {

            res.status(500).json({
                sucesso: false
            });
        }
    }
);

/* =====================================================
   SOCKET
===================================================== */

io.on(
    'connection',
    socket => {

        console.log(
            'Cliente conectado:',
            socket.id
        );

    }
);

/* =====================================================
   INDEX
===================================================== */

app.get(
    '/',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'index.html'
            )
        );

    }
);

/* =====================================================
   SERVIDOR
===================================================== */

const PORT =
    process.env.PORT ||
    10000;

server.listen(
    PORT,
    () => {

        console.log(
            `RS Connect rodando na porta ${PORT}`
        );

    }
);
