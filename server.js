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
        origin: "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
    }
});

const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : false
});

function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function horaAtualRS() {
    return new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'America/Sao_Paulo'
    });
}

function numeroRS(valor) {
    if (typeof valor === 'number') {
        return Number.isFinite(valor) ? valor : 0;
    }

    let texto = String(valor ?? '')
        .replace(/R\$/gi, '')
        .replace(/\s/g, '');

    if (texto.includes(',')) {
        texto = texto.replace(/\./g, '').replace(',', '.');
    }

    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
}

function parseReservas(valor) {
    if (Array.isArray(valor)) return valor;

    try {
        const parsed = JSON.parse(valor || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function buscarServico(servicoId) {
    const resultado = await pool.query(
        'SELECT * FROM servicos WHERE id = $1 LIMIT 1',
        [servicoId]
    );

    return resultado.rows[0] || null;
}

function prestadorEhTitular(servico, email) {
    return normalizarEmail(servico?.prestador_email) === normalizarEmail(email);
}

function empresaEhResponsavel(servico, email) {
    return normalizarEmail(servico?.empresa_email) === normalizarEmail(email);
}

async function registrarLedger(servicoId, email, tipoMovimento, valor) {
    try {
        await pool.query(
            `INSERT INTO ledger_transacoes
             (servico_id, usuario_email, tipo_movimento, valor)
             VALUES ($1, $2, $3, $4)`,
            [
                servicoId,
                email || 'sistema',
                tipoMovimento,
                numeroRS(valor)
            ]
        );
    } catch (err) {
        console.error('Erro ao registrar ledger:', err.message);
    }
}

async function registrarAuditoria(email, acao, detalhes) {
    try {
        await pool.query(
            `INSERT INTO auditoria_sistema
             (usuario_email, acao, detalhes)
             VALUES ($1, $2, $3)`,
            [
                email || 'sistema',
                acao,
                detalhes || ''
            ]
        );
    } catch (err) {
        console.error('Erro ao registrar auditoria:', err.message);
    }
}

function emitirAtualizacao(servicoId = null) {
    const payload = {
        servicoId,
        atualizadoEm: new Date().toISOString()
    };

    io.emit('atualizar_servicos', payload);
    io.emit('servicosAtualizados', payload);
    io.emit('servicos_atualizados', payload);
}


// ============================================================
// BANCO DE DADOS
// ============================================================

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
                experiencia TEXT,
                descricao TEXT
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
                cidade TEXT,
                endereco TEXT,
                valor TEXT,
                valor_diaria NUMERIC(10,2) DEFAULT 0,
                valor_liquido NUMERIC(10,2) DEFAULT 0,
                data_horario TEXT,
                horario_fim TEXT,
                forma_pgto TEXT,
                descricao TEXT,
                contrato_texto TEXT,
                empresa_email TEXT,
                empresa_nome TEXT,
                empresa_whatsapp TEXT,
                responsavel_servico TEXT,
                whatsapp_responsavel TEXT,
                recorrencia TEXT DEFAULT 'unico',
                valor_total NUMERIC(10,2) DEFAULT 0,
                status TEXT DEFAULT 'ativo',
                motivo_cancelamento TEXT,
                prestador_email TEXT,
                prestador_id INTEGER,
                prestador_nome TEXT,
                prestador_pix TEXT,
                prestador_whatsapp TEXT,
                foto_ponto TEXT,
                reservas JSONB DEFAULT '[]'::jsonb,
                mensagens JSONB DEFAULT '[]'::jsonb,
                selfie_confirmacao TEXT,
                documento_comprovante TEXT,
                presenca_confirmada BOOLEAN DEFAULT FALSE,
                presenca_hora TEXT,
                presenca_latitude TEXT,
                presenca_longitude TEXT,
                presenca_precisao TEXT,
                status_checkin TEXT DEFAULT 'pendente',
                checkin_hora TEXT,
                checkin_foto TEXT,
                checkin_latitude TEXT,
                checkin_longitude TEXT,
                intervalo_inicio TEXT,
                intervalo_fim TEXT,
                intervalo_retorno TEXT,
                em_intervalo BOOLEAN DEFAULT FALSE,
                checkout_hora TEXT,
                checkout_foto TEXT,
                checkout_latitude TEXT,
                checkout_longitude TEXT,
                validado_empresa BOOLEAN DEFAULT FALSE,
                validado_em TIMESTAMP,
                pagamento_autorizado BOOLEAN DEFAULT FALSE,
                pagamento_autorizado_em TIMESTAMP,
                pagamento_realizado BOOLEAN DEFAULT FALSE,
                pagamento_realizado_em TIMESTAMP,
                comprovante_pagamento BOOLEAN DEFAULT FALSE,
                comprovante_pagamento_arquivo TEXT,
                contrato_assinado TEXT,
                contrato_assinado_em TIMESTAMP,
                nota_oficial TEXT
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

            CREATE TABLE IF NOT EXISTS pagamentos (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER NOT NULL,
                empresa_email TEXT,
                prestador_email TEXT,
                valor NUMERIC(12,2) DEFAULT 0,
                forma_pagamento TEXT,
                status TEXT DEFAULT 'PENDENTE',
                comprovante TEXT,
                autorizado_em TIMESTAMP,
                pago_em TIMESTAMP,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS documentos_rs (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER,
                empresa_email TEXT,
                prestador_email TEXT,
                categoria TEXT,
                nome TEXT,
                arquivo TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS conversas (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER NOT NULL,
                empresa_email TEXT NOT NULL,
                prestador_email TEXT NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ativo BOOLEAN DEFAULT TRUE,
                UNIQUE (servico_id, empresa_email, prestador_email)
            );

            CREATE TABLE IF NOT EXISTS mensagens_chat (
                id SERIAL PRIMARY KEY,
                conversa_id INTEGER NOT NULL
                    REFERENCES conversas(id)
                    ON DELETE CASCADE,

                servico_id INTEGER NOT NULL,
                remetente_email TEXT NOT NULL,
                destinatario_email TEXT NOT NULL,
                mensagem TEXT NOT NULL,
                tipo TEXT DEFAULT 'texto',
                lida BOOLEAN DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const colunasGarantir = [
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS descricao TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS categoria TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS cidade TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS data_horario TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS horario_fim TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS forma_pgto TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_texto TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_email TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_nome TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_whatsapp TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS responsavel_servico TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS whatsapp_responsavel TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS recorrencia TEXT DEFAULT 'unico';",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS mensagens JSONB DEFAULT '[]'::jsonb;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS documento_comprovante TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_hora TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_latitude TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_longitude TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_precisao TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status_checkin TEXT DEFAULT 'pendente';",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_hora TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_foto TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_latitude TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_longitude TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_inicio TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_fim TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_retorno TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS em_intervalo BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_hora TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_foto TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_latitude TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_longitude TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_empresa BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_autorizado BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_autorizado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_realizado BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_realizado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_arquivo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_assinado TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_assinado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_oficial TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;"
        ];

        for (const sql of colunasGarantir) {
            try {
                await pool.query(sql);
            } catch (err) {
                console.warn(
                    'Aviso ao garantir coluna:',
                    err.message
                );
            }
        }

        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS
                idx_pagamento_servico_prestador
            ON pagamentos(servico_id, prestador_email);

            CREATE INDEX IF NOT EXISTS
                idx_conversas_empresa
            ON conversas(empresa_email);

            CREATE INDEX IF NOT EXISTS
                idx_conversas_prestador
            ON conversas(prestador_email);

            CREATE INDEX IF NOT EXISTS
                idx_chat_conversa
            ON mensagens_chat(conversa_id);

            CREATE INDEX IF NOT EXISTS
                idx_documentos_empresa
            ON documentos_rs(empresa_email);
        `);

        console.log(
            '✅ Tabelas e colunas RS Connect verificadas.'
        );

    } catch (err) {

        console.error(
            '❌ Erro ao criar/verificar tabelas:',
            err
        );
    }
}

pool.connect((err, client, release) => {

    if (err) {
        console.error(
            'Erro ao conectar ao PostgreSQL:',
            err.stack
        );
        return;
    }

    console.log(
        'Conectado com sucesso ao banco PostgreSQL.'
    );

    release();

    criarTabelas().catch(err => {
        console.error(
            'Erro na inicialização do banco:',
            err
        );
    });
});


// ============================================================
// AUTENTICAÇÃO
// ============================================================

app.post('/api/auth/registrar', async (req, res) => {

    const d = req.body;

    try {

        const email = normalizarEmail(d.email);

        if (
            !d.tipo ||
            !d.nome ||
            !email ||
            !d.senha
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Preencha tipo, nome, e-mail e senha.'
            });
        }

        const query = `
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
                experiencia,
                descricao
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,
                $9,$10,$11,$12,$13,$14,$15,$16
            )
            RETURNING *
        `;

        const params = [
            d.tipo,
            d.nome,
            d.doc || d.documento || '',
            d.responsavel || '',
            email,
            d.senha,
            d.whatsapp || '',
            d.endereco || '',
            d.rgCnh || d.rg_cnh || '',
            d.profissao || '',
            d.tipoChavePix || d.tipo_chave_pix || '',
            d.pix || '',
            d.banco || '',
            d.conta || '',
            d.experiencia || '',
            d.descricao || ''
        ];

        const result = await pool.query(
            query,
            params
        );

        if (
            String(d.tipo).toLowerCase()
            ===
            'prestador'
        ) {

            await pool.query(
                `
                INSERT INTO prestadores (email)
                VALUES ($1)
                ON CONFLICT (email)
                DO NOTHING
                `,
                [email]
            );
        }

        await registrarAuditoria(
            email,
            'CADASTRO_USUARIO',
            `Novo usuário tipo ${d.tipo} cadastrado.`
        );

        return res.json({
            sucesso: true,
            id: result.rows[0].id,
            usuario: result.rows[0]
        });

    } catch (err) {

        console.error(
            'Erro no cadastro:',
            err.message
        );

        return res.status(400).json({
            sucesso: false,

            erro:
                err.code === '23505'
                    ? 'Este e-mail já está cadastrado.'
                    : 'Erro ao criar cadastro.'
        });
    }
});


app.post('/api/auth/login', async (req, res) => {

    const email =
        normalizarEmail(
            req.body?.email
        );

    const senha =
        String(
            req.body?.senha || ''
        );

    try {

        const result =
            await pool.query(
                `
                SELECT *

                FROM usuarios

                WHERE
                    LOWER(email) = LOWER($1)

                AND
                    senha = $2

                LIMIT 1
                `,
                [
                    email,
                    senha
                ]
            );

        if (!result.rows.length) {

            return res.status(401).json({
                sucesso: false,
                erro: 'E-mail ou senha incorretos.'
            });
        }

        await registrarAuditoria(
            email,
            'LOGIN',
            'Login realizado com sucesso.'
        );

        return res.json({
            sucesso: true,
            usuario: result.rows[0]
        });

    } catch (err) {

        console.error(
            'Erro no login:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro no servidor.'
        });
    }
});


// ============================================================
// SERVIÇOS
// ============================================================

app.get('/api/servicos', async (req, res) => {

    try {

        const result =
            await pool.query(
                `
                SELECT *
                FROM servicos
                ORDER BY id DESC
                `
            );

        return res.json(
            result.rows
        );

    } catch (err) {

        console.error(
            'Erro ao buscar serviços:',
            err
        );

        return res.status(500).json({
            erro: 'Erro ao buscar serviços.'
        });
    }
});


app.post('/api/servicos', async (req, res) => {

    const s = req.body;

    try {

        const valorUnitario =
            numeroRS(s.valor);

        const tipoRecorrencia =
            s.recorrencia ||
            'unico';

        let valorTotalGarantia =
            valorUnitario;

        if (
            tipoRecorrencia === 'semanal'
        ) {

            valorTotalGarantia =
                valorUnitario * 4;

        } else if (
            tipoRecorrencia === 'quinzenal'
        ) {

            valorTotalGarantia =
                valorUnitario * 2;
        }

        const taxaPlataforma =
            valorTotalGarantia * 0.10;

        const valorLiquido =
            valorTotalGarantia -
            taxaPlataforma;

        const empresaEmail =
            normalizarEmail(
                s.empresaEmail ||
                s.empresa_email
            );

        let empresaNome =
            s.empresaNome ||
            s.empresa_nome ||
            '';

        if (
            !empresaNome &&
            empresaEmail
        ) {

            const usuarioEmpresa =
                await pool.query(
                    `
                    SELECT nome
                    FROM usuarios
                    WHERE LOWER(email) = LOWER($1)
                    LIMIT 1
                    `,
                    [empresaEmail]
                );

            empresaNome =
                usuarioEmpresa
                    .rows[0]
                    ?.nome ||
                '';
        }

        const result =
            await pool.query(
                `
                INSERT INTO servicos (

                    titulo,
                    categoria,
                    local,
                    cidade,
                    endereco,

                    valor,
                    valor_diaria,
                    valor_liquido,

                    data_horario,
                    horario_fim,
                    forma_pgto,

                    descricao,
                    contrato_texto,

                    empresa_email,
                    empresa_nome,
                    empresa_whatsapp,

                    responsavel_servico,
                    whatsapp_responsavel,

                    recorrencia,
                    valor_total,
                    status

                )

                VALUES (

                    $1,$2,$3,$4,$5,
                    $6,$7,$8,
                    $9,$10,$11,
                    $12,$13,
                    $14,$15,$16,
                    $17,$18,
                    $19,$20,
                    'ativo'

                )

                RETURNING *
                `,
                [
                    s.titulo,

                    s.categoria ||
                    'Geral',

                    s.local ||
                    s.cidade ||
                    '',

                    s.cidade ||
                    '',

                    s.endereco ||
                    '',

                    String(
                        valorUnitario
                    ),

                    valorUnitario,

                    valorLiquido,

                    s.dataHorario ||
                    s.data_horario ||
                    (
                        s.data &&
                        s.horario
                            ? `${s.data}T${s.horario}`
                            : 'A combinar'
                    ),

                    s.horarioFim ||
                    s.horario_fim ||
                    '',

                    s.formaPgto ||
                    s.formaPagamento ||
                    s.forma_pgto ||
                    s.pagamento ||
                    'Pix',

                    s.descricao ||
                    '',

                    s.contratoTexto ||
                    s.contrato_texto ||
                    s.contrato ||
                    '',

                    empresaEmail,

                    empresaNome,

                    s.empresaWhatsapp ||
                    s.empresa_whatsapp ||
                    '',

                    s.responsavelServico ||
                    s.responsavel_servico ||
                    '',

                    s.whatsappResponsavel ||
                    s.whatsapp_responsavel ||
                    '',

                    tipoRecorrencia,

                    valorTotalGarantia
                ]
            );

        const servico =
            result.rows[0];

        await registrarLedger(
            servico.id,
            empresaEmail,
            'RETENCAO_GARANTIA',
            valorTotalGarantia
        );

        await registrarAuditoria(
            empresaEmail,
            'PUBLICAR_SERVICO',
            `Serviço #${servico.id} publicado.`
        );

        emitirAtualizacao(
            servico.id
        );

        return res.json({
            sucesso: true,
            id: servico.id,
            servico
        });

    } catch (err) {

        console.error(
            'Erro ao publicar serviço:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                'Erro ao publicar serviço: ' +
                err.message
        });
    }
});


// ============================================================
// ACEITAR VAGA — TITULAR / RESERVA
// ============================================================

app.post('/api/servicos/:id/aceitar', async (req, res) => {

    const servicoId =
        Number(
            req.params.id
        );

    try {

        const servico =
            await buscarServico(
                servicoId
            );

        if (!servico) {

            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const prestadorEmail =
            normalizarEmail(
                req.body?.prestadorEmail
            );

        const prestadorNome =
            req.body?.prestadorNome ||
            prestadorEmail;

        const prestadorPix =
            req.body?.prestadorPix ||
            '';

        const prestadorWhatsapp =
            req.body?.prestadorWhatsapp ||
            '';

        const rgCnh =
            req.body?.rgCnh ||
            '';

        if (!prestadorEmail) {

            return res.status(400).json({
                sucesso: false,
                erro: 'Prestador não informado.'
            });
        }

        let reservas =
            parseReservas(
                servico.reservas
            );

        if (
            normalizarEmail(
                servico.prestador_email
            )
            ===
            prestadorEmail
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Você já é o Titular desta vaga.'
            });
        }

        if (
            reservas.some(
                r =>
                    normalizarEmail(
                        typeof r === 'string'
                            ? r
                            : r.email ||
                              r.prestador_email
                    )
                    ===
                    prestadorEmail
            )
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Você já está na Reserva desta vaga.'
            });
        }

        const prestadorRes =
            await pool.query(
                `
                SELECT id
                FROM usuarios
                WHERE LOWER(email) = LOWER($1)
                LIMIT 1
                `,
                [
                    prestadorEmail
                ]
            );

        const prestadorId =
            prestadorRes
                .rows[0]
                ?.id ||
            null;

        if (
            !servico.prestador_email
        ) {

            await pool.query(
                `
                UPDATE servicos

                SET
                    status = 'em_andamento',

                    prestador_email = $1,
                    prestador_id = $2,
                    prestador_nome = $3,
                    prestador_pix = $4,
                    prestador_whatsapp = $5

                WHERE id = $6
                `,
                [
                    prestadorEmail,
                    prestadorId,
                    prestadorNome,
                    prestadorPix,
                    prestadorWhatsapp,
                    servicoId
                ]
            );

            await registrarAuditoria(
                prestadorEmail,
                'ACEITAR_SERVICO',
                `Prestador assumiu a Vaga Titular #${servicoId}.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Você assumiu a Vaga Titular!'
            });
        }

        if (
            reservas.length >= 2
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'A fila de reservas já está lotada.'
            });
        }

        reservas.push({
            email:
                prestadorEmail,

            nome:
                prestadorNome,

            whatsapp:
                prestadorWhatsapp,

            rgCnh,

            pix:
                prestadorPix
        });

        await pool.query(
            `
            UPDATE servicos

            SET reservas = $1::jsonb

            WHERE id = $2
            `,
            [
                JSON.stringify(
                    reservas
                ),
                servicoId
            ]
        );

        await registrarAuditoria(
            prestadorEmail,
            'ENTRAR_RESERVA',
            `Prestador entrou na Reserva do serviço #${servicoId}.`
        );

        emitirAtualizacao(
            servicoId
        );

        return res.json({
            sucesso: true,
            mensagem:
                'Você entrou na Fila de Reserva (Emergência)!'
        });

    } catch (err) {

        console.error(
            'Erro ao aceitar vaga:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                'Erro ao aceitar vaga.'
        });
    }
});
// ============================================================
// FILA DE RESERVA — COMPATIBILIDADE COM INDEX NOVO
// ============================================================

app.post('/api/servicos/:id/fila', async (req, res) => {

    const servicoId =
        Number(
            req.params.id
        );

    try {

        const servico =
            await buscarServico(
                servicoId
            );

        if (!servico) {

            return res.status(404).json({
                erro:
                    'Serviço não encontrado.'
            });
        }

        if (
            !servico.prestador_email
        ) {

            return res.status(400).json({
                erro:
                    'A vaga Titular ainda está disponível.'
            });
        }

        const prestadorEmail =
            normalizarEmail(
                req.body?.prestadorEmail
            );

        const prestadorNome =
            req.body?.prestadorNome ||
            prestadorEmail;

        const prestadorWhatsapp =
            req.body?.prestadorWhatsapp ||
            '';

        const prestadorPix =
            req.body?.prestadorPix ||
            '';

        if (!prestadorEmail) {

            return res.status(400).json({
                erro:
                    'Prestador não informado.'
            });
        }

        let reservas =
            parseReservas(
                servico.reservas
            );

        if (
            normalizarEmail(
                servico.prestador_email
            )
            ===
            prestadorEmail
        ) {

            return res.status(400).json({
                erro:
                    'Você já é o Titular desta vaga.'
            });
        }

        const jaEstaNaReserva =
            reservas.some(
                reserva =>
                    normalizarEmail(
                        typeof reserva === 'string'
                            ? reserva
                            : reserva.email ||
                              reserva.prestador_email
                    )
                    ===
                    prestadorEmail
            );

        if (
            jaEstaNaReserva
        ) {

            return res.status(400).json({
                erro:
                    'Você já está na Reserva desta vaga.'
            });
        }

        if (
            reservas.length >= 2
        ) {

            return res.status(400).json({
                erro:
                    'As duas Reservas já estão preenchidas.'
            });
        }

        reservas.push({
            email:
                prestadorEmail,

            nome:
                prestadorNome,

            whatsapp:
                prestadorWhatsapp,

            pix:
                prestadorPix
        });

        await pool.query(
            `
            UPDATE servicos

            SET reservas = $1::jsonb

            WHERE id = $2
            `,
            [
                JSON.stringify(
                    reservas
                ),
                servicoId
            ]
        );

        await registrarAuditoria(
            prestadorEmail,
            'ENTRAR_RESERVA',
            `Prestador entrou na Reserva do serviço #${servicoId}.`
        );

        emitirAtualizacao(
            servicoId
        );

        return res.json({
            sucesso: true,
            mensagem:
                'Você entrou na Reserva de Emergência!'
        });

    } catch (err) {

        console.error(
            'Erro na fila de reserva:',
            err
        );

        return res.status(500).json({
            erro:
                'Erro ao entrar na Reserva.'
        });
    }
});


// ============================================================
// SAIR DA VAGA / SAIR DA RESERVA
// PROMOÇÃO AUTOMÁTICA DA PRIMEIRA RESERVA
// ============================================================

app.post('/api/servicos/:id/sair-vaga', async (req, res) => {

    const servicoId =
        Number(
            req.params.id
        );

    const prestadorEmail =
        normalizarEmail(
            req.body?.prestadorEmail
        );

    try {

        const servico =
            await buscarServico(
                servicoId
            );

        if (!servico) {

            return res.status(404).json({
                erro:
                    'Serviço não encontrado.'
            });
        }

        let reservas =
            parseReservas(
                servico.reservas
            );

        // ====================================================
        // SE QUEM SAIU É O TITULAR
        // ====================================================

        if (
            prestadorEhTitular(
                servico,
                prestadorEmail
            )
        ) {

            let novoTitular =
                null;

            if (
                reservas.length > 0
            ) {

                novoTitular =
                    reservas.shift();
            }

            // =================================================
            // EXISTE RESERVA → PROMOVER
            // =================================================

            if (
                novoTitular
            ) {

                const novoEmail =
                    normalizarEmail(
                        novoTitular.email ||
                        novoTitular.prestador_email
                    );

                const novoNome =
                    novoTitular.nome ||
                    novoEmail;

                const novoWhatsapp =
                    novoTitular.whatsapp ||
                    '';

                const novoPix =
                    novoTitular.pix ||
                    '';

                let novoPrestadorId =
                    null;

                try {

                    const usuario =
                        await pool.query(
                            `
                            SELECT id

                            FROM usuarios

                            WHERE
                                LOWER(email) = LOWER($1)

                            LIMIT 1
                            `,
                            [
                                novoEmail
                            ]
                        );

                    novoPrestadorId =
                        usuario.rows[0]
                            ?.id ||
                        null;

                } catch (erroId) {

                    console.warn(
                        'Não foi possível buscar ID do novo Titular:',
                        erroId.message
                    );
                }

                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        prestador_email = $1,
                        prestador_id = $2,
                        prestador_nome = $3,
                        prestador_whatsapp = $4,
                        prestador_pix = $5,

                        reservas = $6::jsonb,

                        presenca_confirmada = FALSE,
                        presenca_hora = NULL,
                        selfie_confirmacao = NULL,

                        presenca_latitude = NULL,
                        presenca_longitude = NULL,
                        presenca_precisao = NULL,

                        checkin_hora = NULL,
                        checkin_foto = NULL,
                        checkin_latitude = NULL,
                        checkin_longitude = NULL,

                        intervalo_inicio = NULL,
                        intervalo_fim = NULL,
                        intervalo_retorno = NULL,
                        em_intervalo = FALSE,

                        checkout_hora = NULL,
                        checkout_foto = NULL,
                        checkout_latitude = NULL,
                        checkout_longitude = NULL,

                        status_checkin = 'pendente',

                        validado_empresa = FALSE,
                        validado_em = NULL,

                        pagamento_autorizado = FALSE,
                        pagamento_autorizado_em = NULL,

                        pagamento_realizado = FALSE,
                        pagamento_realizado_em = NULL,

                        status = 'em_andamento'

                    WHERE id = $7
                    `,
                    [
                        novoEmail,
                        novoPrestadorId,
                        novoNome,
                        novoWhatsapp,
                        novoPix,

                        JSON.stringify(
                            reservas
                        ),

                        servicoId
                    ]
                );

                await registrarAuditoria(
                    prestadorEmail,
                    'DESISTENCIA_TITULAR',
                    `Titular saiu do serviço #${servicoId}. A primeira Reserva foi promovida.`
                );

                await registrarAuditoria(
                    novoEmail,
                    'PROMOVIDO_TITULAR',
                    `Reserva promovida automaticamente para Titular do serviço #${servicoId}.`
                );

                emitirAtualizacao(
                    servicoId
                );

                return res.json({
                    sucesso: true,

                    mensagem:
                        'Você saiu da vaga. A primeira Reserva foi promovida para Titular.',

                    novoTitular: {
                        email:
                            novoEmail,

                        nome:
                            novoNome
                    }
                });
            }

            // =================================================
            // NÃO EXISTE RESERVA → VAGA FICA ABERTA
            // =================================================

            await pool.query(
                `
                UPDATE servicos

                SET
                    prestador_email = NULL,
                    prestador_id = NULL,
                    prestador_nome = NULL,
                    prestador_pix = NULL,
                    prestador_whatsapp = NULL,

                    presenca_confirmada = FALSE,
                    presenca_hora = NULL,
                    selfie_confirmacao = NULL,

                    presenca_latitude = NULL,
                    presenca_longitude = NULL,
                    presenca_precisao = NULL,

                    checkin_hora = NULL,
                    checkin_foto = NULL,
                    checkin_latitude = NULL,
                    checkin_longitude = NULL,

                    intervalo_inicio = NULL,
                    intervalo_fim = NULL,
                    intervalo_retorno = NULL,
                    em_intervalo = FALSE,

                    checkout_hora = NULL,
                    checkout_foto = NULL,
                    checkout_latitude = NULL,
                    checkout_longitude = NULL,

                    status_checkin = 'pendente',

                    validado_empresa = FALSE,
                    validado_em = NULL,

                    pagamento_autorizado = FALSE,
                    pagamento_autorizado_em = NULL,

                    status = 'ativo'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );

            await registrarAuditoria(
                prestadorEmail,
                'DESISTENCIA_TITULAR',
                `Titular saiu do serviço #${servicoId}. Não havia Reserva.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Você saiu da vaga. A vaga Titular ficou disponível novamente.'
            });
        }

        // ====================================================
        // SE QUEM SAIU É UMA RESERVA
        // ====================================================

        const tamanhoAntes =
            reservas.length;

        reservas =
            reservas.filter(
                reserva =>
                    normalizarEmail(
                        typeof reserva === 'string'
                            ? reserva
                            : reserva.email ||
                              reserva.prestador_email
                    )
                    !==
                    prestadorEmail
            );

        if (
            reservas.length ===
            tamanhoAntes
        ) {

            return res.status(400).json({
                erro:
                    'Você não está vinculado a esta vaga.'
            });
        }

        await pool.query(
            `
            UPDATE servicos

            SET reservas = $1::jsonb

            WHERE id = $2
            `,
            [
                JSON.stringify(
                    reservas
                ),
                servicoId
            ]
        );

        await registrarAuditoria(
            prestadorEmail,
            'SAIR_RESERVA',
            `Prestador saiu da Reserva do serviço #${servicoId}.`
        );

        emitirAtualizacao(
            servicoId
        );

        return res.json({
            sucesso: true,
            mensagem:
                'Você saiu da Reserva.'
        });

    } catch (err) {

        console.error(
            'Erro ao sair da vaga:',
            err
        );

        return res.status(500).json({
            erro:
                'Erro ao sair da vaga.'
        });
    }
});


// ============================================================
// EXCLUIR SERVIÇO
// ============================================================

app.delete('/api/servicos/:id', async (req, res) => {

    const servicoId =
        Number(
            req.params.id
        );

    try {

        await pool.query(
            `
            DELETE FROM servicos

            WHERE id = $1
            `,
            [
                servicoId
            ]
        );

        await registrarAuditoria(
            'sistema',
            'DELETAR_SERVICO',
            `Serviço #${servicoId} removido.`
        );

        emitirAtualizacao(
            servicoId
        );

        return res.json({
            sucesso: true,
            mensagem:
                'Serviço removido com sucesso!'
        });

    } catch (err) {

        console.error(
            'Erro ao excluir serviço:',
            err
        );

        return res.status(500).json({
            erro:
                'Erro ao excluir serviço.'
        });
    }
});


// ============================================================
// CONTRATO ASSINADO
// INDEX ENVIA COMO FormData:
// arquivo + prestadorEmail
// ============================================================

app.post(
    '/api/servicos/:id/contrato-assinado',

    upload.single(
        'arquivo'
    ),

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const prestadorEmail =
                normalizarEmail(
                    req.body?.prestadorEmail
                );

            if (
                !prestadorEhTitular(
                    servico,
                    prestadorEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Somente o Titular pode enviar o contrato.'
                });
            }

            let arquivo =
                '';

            let nomeArquivo =
                'contrato-assinado.pdf';

            if (
                req.file
            ) {

                if (
                    req.file.mimetype !==
                    'application/pdf'
                ) {

                    return res.status(400).json({
                        erro:
                            'O contrato precisa ser PDF.'
                    });
                }

                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer.toString(
                            'base64'
                        )
                    }`;

                nomeArquivo =
                    req.file.originalname ||
                    nomeArquivo;

            } else {

                arquivo =
                    String(
                        req.body?.arquivo ||
                        ''
                    );

                nomeArquivo =
                    String(
                        req.body?.nomeArquivo ||
                        nomeArquivo
                    );

                if (
                    arquivo.startsWith(
                        'data:'
                    )
                    &&
                    !arquivo.startsWith(
                        'data:application/pdf'
                    )
                ) {

                    return res.status(400).json({
                        erro:
                            'O contrato precisa ser PDF.'
                    });
                }
            }

            if (
                !arquivo
            ) {

                return res.status(400).json({
                    erro:
                        'Selecione o contrato assinado.'
                });
            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    contrato_assinado = $1,
                    contrato_assinado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $2
                `,
                [
                    arquivo,
                    servicoId
                ]
            );

            await pool.query(
                `
                INSERT INTO documentos_rs (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    categoria,
                    nome,
                    arquivo

                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    'CONTRATO',
                    $4,
                    $5
                )
                `,
                [
                    servicoId,

                    servico.empresa_email,

                    prestadorEmail,

                    nomeArquivo,

                    arquivo
                ]
            );

            await registrarAuditoria(
                prestadorEmail,
                'CONTRATO_ASSINADO',
                `Contrato do serviço #${servicoId} enviado.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Contrato assinado enviado com sucesso.'
            });

        } catch (err) {

            console.error(
                'Erro ao enviar contrato:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao salvar contrato.'
            });
        }
    }
);


// ============================================================
// CONFIRMAR PRESENÇA
// FOTO AO VIVO + GPS
// ============================================================

app.post(
    '/api/servicos/:id/confirmar-presenca',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const prestadorEmail =
                normalizarEmail(
                    req.body?.prestadorEmail
                );

            if (
                prestadorEmail &&
                !prestadorEhTitular(
                    servico,
                    prestadorEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Somente o Titular pode confirmar presença.'
                });
            }

            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                '';

            const latitude =
                req.body?.latitude ??
                '';

            const longitude =
                req.body?.longitude ??
                '';

            const precisao =
                req.body?.precisao ??
                req.body?.precisaoGps ??
                '';

            if (
                !foto
            ) {

                return res.status(400).json({
                    erro:
                        'A foto tirada na hora é obrigatória.'
                });
            }

            if (
                latitude === '' ||
                longitude === ''
            ) {

                return res.status(400).json({
                    erro:
                        'A localização GPS é obrigatória.'
                });
            }

            const hora =
                horaAtualRS();

            await pool.query(
                `
                UPDATE servicos

                SET
                    selfie_confirmacao = $1,

                    presenca_confirmada = TRUE,

                    presenca_hora = $2,

                    presenca_latitude = $3,

                    presenca_longitude = $4,

                    presenca_precisao = $5

                WHERE id = $6
                `,
                [
                    foto,

                    hora,

                    String(
                        latitude
                    ),

                    String(
                        longitude
                    ),

                    String(
                        precisao
                    ),

                    servicoId
                ]
            );

            await registrarAuditoria(
                prestadorEmail ||
                'sistema',

                'CONFIRMAR_PRESENCA',

                `Presença confirmada no serviço #${servicoId}.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Presença confirmada com sucesso!',

                hora
            });

        } catch (err) {

            console.error(
                'Erro ao confirmar presença:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao confirmar presença.'
            });
        }
    }
);


// ============================================================
// CHECK-IN NOVO
// FOTO + GPS
// ============================================================

app.post(
    '/api/servicos/:id/checkin',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const prestadorEmail =
                normalizarEmail(
                    req.body?.prestadorEmail
                );

            if (
                !prestadorEhTitular(
                    servico,
                    prestadorEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Somente o Titular pode registrar entrada.'
                });
            }

            if (
                !servico.presenca_confirmada
            ) {

                return res.status(400).json({
                    erro:
                        'Confirme sua presença antes do check-in.'
                });
            }

            if (
                servico.checkin_hora
            ) {

                return res.status(400).json({
                    erro:
                        'A entrada já foi registrada.'
                });
            }

            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                '';

            const latitude =
                req.body?.latitude ??
                '';

            const longitude =
                req.body?.longitude ??
                '';

            if (
                !foto
            ) {

                return res.status(400).json({
                    erro:
                        'A foto tirada na hora é obrigatória.'
                });
            }

            if (
                latitude === '' ||
                longitude === ''
            ) {

                return res.status(400).json({
                    erro:
                        'A localização GPS é obrigatória.'
                });
            }

            const hora =
                horaAtualRS();

            await pool.query(
                `
                UPDATE servicos

                SET
                    foto_ponto = $1,

                    checkin_foto = $1,

                    checkin_hora = $2,

                    checkin_latitude = $3,

                    checkin_longitude = $4,

                    status_checkin = 'realizado',

                    status = 'EM_SERVICO'

                WHERE id = $5
                `,
                [
                    foto,

                    hora,

                    String(
                        latitude
                    ),

                    String(
                        longitude
                    ),

                    servicoId
                ]
            );

            await registrarAuditoria(
                prestadorEmail,

                'CHECKIN_PONTO',

                `Check-in realizado no serviço #${servicoId}.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Entrada registrada com sucesso.',

                hora
            });

        } catch (err) {

            console.error(
                'Erro no check-in:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao registrar entrada.'
            });
        }
    }
);


// ============================================================
// COMPATIBILIDADE COM CHECK-IN ANTIGO
// /ponto
// ============================================================

app.post(
    '/api/servicos/:id/ponto',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const foto =
                req.body?.foto ||
                '';

            const hora =
                req.body?.hora ||
                horaAtualRS();

            await pool.query(
                `
                UPDATE servicos

                SET
                    foto_ponto = $1,

                    checkin_foto = $1,

                    checkin_hora = $2,

                    status_checkin =
                        'realizado',

                    status =
                        'EM_SERVICO'

                WHERE id = $3
                `,
                [
                    foto,
                    hora,
                    servicoId
                ]
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true
            });

        } catch (err) {

            console.error(
                'Erro no ponto antigo:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao registrar ponto.'
            });
        }
    }
);


// ============================================================
// FIM DA PARTE 2
// ============================================================
// ============================================================
// INTERVALO
// ============================================================

app.post(
    '/api/servicos/:id/intervalo/iniciar',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const prestadorEmail =
                normalizarEmail(
                    req.body?.prestadorEmail
                );

            if (
                !prestadorEhTitular(
                    servico,
                    prestadorEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Somente o Titular pode iniciar o intervalo.'
                });
            }

            if (
                !servico.checkin_hora
            ) {

                return res.status(400).json({
                    erro:
                        'Registre a entrada antes de iniciar o intervalo.'
                });
            }

            if (
                servico.checkout_hora
            ) {

                return res.status(400).json({
                    erro:
                        'O serviço já foi finalizado.'
                });
            }

            if (
                servico.em_intervalo
            ) {

                return res.status(400).json({
                    erro:
                        'Você já está em intervalo.'
                });
            }

            const hora =
                horaAtualRS();

            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_inicio = $1,

                    intervalo_fim = NULL,

                    intervalo_retorno = NULL,

                    em_intervalo = TRUE

                WHERE id = $2
                `,
                [
                    hora,
                    servicoId
                ]
            );

            await registrarAuditoria(
                prestadorEmail,

                'INICIAR_INTERVALO',

                `Intervalo iniciado no serviço #${servicoId} às ${hora}.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Intervalo iniciado.',

                hora
            });

        } catch (err) {

            console.error(
                'Erro ao iniciar intervalo:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao iniciar intervalo.'
            });
        }
    }
);


// ============================================================
// VOLTAR DO INTERVALO
// ============================================================

app.post(
    '/api/servicos/:id/intervalo/retornar',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const prestadorEmail =
                normalizarEmail(
                    req.body?.prestadorEmail
                );

            if (
                !prestadorEhTitular(
                    servico,
                    prestadorEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Somente o Titular pode retornar do intervalo.'
                });
            }

            if (
                !servico.intervalo_inicio
            ) {

                return res.status(400).json({
                    erro:
                        'Nenhum intervalo foi iniciado.'
                });
            }

            if (
                !servico.em_intervalo
            ) {

                return res.status(400).json({
                    erro:
                        'Você não está em intervalo.'
                });
            }

            const hora =
                horaAtualRS();

            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_fim = $1,

                    intervalo_retorno = $1,

                    em_intervalo = FALSE

                WHERE id = $2
                `,
                [
                    hora,
                    servicoId
                ]
            );

            await registrarAuditoria(
                prestadorEmail,

                'RETORNO_INTERVALO',

                `Prestador retornou do intervalo no serviço #${servicoId} às ${hora}.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Retorno do intervalo registrado.',

                hora
            });

        } catch (err) {

            console.error(
                'Erro ao retornar do intervalo:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao retornar do intervalo.'
            });
        }
    }
);


// ============================================================
// CHECK-OUT
// FOTO + GPS
// ============================================================

app.post(
    '/api/servicos/:id/checkout',

    upload.single(
        'fotoCheckout'
    ),

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const prestadorEmail =
                normalizarEmail(
                    req.body?.prestadorEmail ||
                    servico.prestador_email
                );

            if (
                !prestadorEhTitular(
                    servico,
                    prestadorEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Somente o Titular pode registrar saída.'
                });
            }

            if (
                !servico.checkin_hora
            ) {

                return res.status(400).json({
                    erro:
                        'Registre a entrada antes da saída.'
                });
            }

            if (
                servico.em_intervalo
            ) {

                return res.status(400).json({
                    erro:
                        'Volte do intervalo antes de registrar a saída.'
                });
            }

            if (
                servico.checkout_hora
            ) {

                return res.status(400).json({
                    erro:
                        'A saída já foi registrada.'
                });
            }

            let foto =
                req.body?.foto ||
                req.body?.selfie ||
                req.body?.fotoCheckout ||
                '';

            if (
                !foto &&
                req.file
            ) {

                foto =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer.toString(
                            'base64'
                        )
                    }`;
            }

            if (
                !foto
            ) {

                return res.status(400).json({
                    erro:
                        'A foto tirada na hora é obrigatória.'
                });
            }

            const latitude =
                req.body?.latitude ??
                '';

            const longitude =
                req.body?.longitude ??
                '';

            if (
                latitude === '' ||
                longitude === ''
            ) {

                return res.status(400).json({
                    erro:
                        'A localização GPS é obrigatória.'
                });
            }

            const hora =
                req.body?.hora ||
                horaAtualRS();

            await pool.query(
                `
                UPDATE servicos

                SET
                    checkout_hora = $1,

                    checkout_foto = $2,

                    checkout_latitude = $3,

                    checkout_longitude = $4,

                    documento_comprovante =
                        COALESCE(
                            $2,
                            documento_comprovante
                        ),

                    status_checkin =
                        'concluido',

                    status =
                        'AGUARDANDO_VALIDACAO'

                WHERE id = $5
                `,
                [
                    hora,

                    foto,

                    String(
                        latitude
                    ),

                    String(
                        longitude
                    ),

                    servicoId
                ]
            );

            await registrarAuditoria(
                prestadorEmail,

                'CHECKOUT',

                `Saída registrada no serviço #${servicoId}.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Saída registrada. Aguardando validação da empresa.',

                hora
            });

        } catch (err) {

            console.error(
                'Erro no check-out:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao realizar check-out.'
            });
        }
    }
);


// ============================================================
// VALIDAR SERVIÇO PELA EMPRESA
// ============================================================

app.post(
    '/api/servicos/:id/validar',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const empresaEmail =
                normalizarEmail(
                    req.body?.empresaEmail
                );

            if (
                !empresaEhResponsavel(
                    servico,
                    empresaEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Somente a empresa responsável pode validar este serviço.'
                });
            }

            if (
                !servico.checkout_hora
            ) {

                return res.status(400).json({
                    erro:
                        'O prestador ainda não realizou o check-out.'
                });
            }

            if (
                servico.validado_empresa
            ) {

                return res.status(400).json({
                    erro:
                        'Este serviço já foi validado.'
                });
            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    validado_empresa = TRUE,

                    validado_em =
                        CURRENT_TIMESTAMP,

                    status =
                        'VALIDADO'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );

            await registrarAuditoria(
                empresaEmail,

                'VALIDAR_SERVICO',

                `Serviço #${servicoId} validado pela empresa.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Serviço validado com sucesso.'
            });

        } catch (err) {

            console.error(
                'Erro ao validar serviço:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao validar serviço.'
            });
        }
    }
);


// ============================================================
// AUTORIZAR PAGAMENTO
// ============================================================

app.post(
    '/api/servicos/:id/autorizar-pagamento',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const empresaEmail =
                normalizarEmail(
                    req.body?.empresaEmail
                );

            if (
                !empresaEhResponsavel(
                    servico,
                    empresaEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Empresa sem permissão.'
                });
            }

            if (
                !servico.validado_empresa
            ) {

                return res.status(400).json({
                    erro:
                        'Valide o serviço antes de autorizar o pagamento.'
                });
            }

            if (
                !servico.prestador_email
            ) {

                return res.status(400).json({
                    erro:
                        'Este serviço não possui Titular.'
                });
            }

            const valor =
                numeroRS(
                    servico.valor_liquido ||
                    servico.valor_total ||
                    servico.valor
                );

            const formaPagamento =
                servico.forma_pgto ||
                'Pix';

            await pool.query(
                `
                INSERT INTO pagamentos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    valor,
                    forma_pagamento,
                    status,
                    autorizado_em

                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    'AUTORIZADO',
                    CURRENT_TIMESTAMP
                )

                ON CONFLICT (
                    servico_id,
                    prestador_email
                )

                DO UPDATE SET

                    empresa_email =
                        EXCLUDED.empresa_email,

                    valor =
                        EXCLUDED.valor,

                    forma_pagamento =
                        EXCLUDED.forma_pagamento,

                    status =
                        'AUTORIZADO',

                    autorizado_em =
                        CURRENT_TIMESTAMP
                `,
                [
                    servicoId,

                    servico.empresa_email,

                    servico.prestador_email,

                    valor,

                    formaPagamento
                ]
            );

            await pool.query(
                `
                UPDATE servicos

                SET
                    pagamento_autorizado =
                        TRUE,

                    pagamento_autorizado_em =
                        CURRENT_TIMESTAMP,

                    status =
                        'PAGAMENTO_AUTORIZADO'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );

            await registrarAuditoria(
                empresaEmail,

                'AUTORIZAR_PAGAMENTO',

                `Pagamento do serviço #${servicoId} autorizado.`
            );

            emitirAtualizacao(
                servicoId
            );

            io.emit(
                'pagamento_atualizado',
                {
                    servicoId
                }
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Pagamento autorizado com sucesso.'
            });

        } catch (err) {

            console.error(
                'Erro ao autorizar pagamento:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao autorizar pagamento.'
            });
        }
    }
);


// ============================================================
// COMPROVANTE DE PAGAMENTO
// ============================================================

app.post(
    '/api/servicos/:id/comprovante-pagamento',

    upload.single(
        'arquivo'
    ),

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const empresaEmail =
                normalizarEmail(
                    req.body?.empresaEmail
                );

            if (
                !empresaEhResponsavel(
                    servico,
                    empresaEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Somente a empresa pode enviar o comprovante.'
                });
            }

            if (
                !servico.pagamento_autorizado
            ) {

                return res.status(400).json({
                    erro:
                        'O pagamento ainda não foi autorizado.'
                });
            }

            let arquivo =
                '';

            let nomeArquivo =
                'comprovante';

            if (
                req.file
            ) {

                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer.toString(
                            'base64'
                        )
                    }`;

                nomeArquivo =
                    req.file.originalname ||
                    nomeArquivo;

            } else {

                arquivo =
                    String(
                        req.body?.arquivo ||
                        ''
                    );

                nomeArquivo =
                    String(
                        req.body?.nomeArquivo ||
                        nomeArquivo
                    );
            }

            if (
                !arquivo
            ) {

                return res.status(400).json({
                    erro:
                        'Selecione o comprovante.'
                });
            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    comprovante_pagamento =
                        TRUE,

                    comprovante_pagamento_arquivo =
                        $1,

                    pagamento_realizado =
                        TRUE,

                    pagamento_realizado_em =
                        CURRENT_TIMESTAMP,

                    status =
                        'PAGO'

                WHERE id = $2
                `,
                [
                    arquivo,
                    servicoId
                ]
            );

            await pool.query(
                `
                UPDATE pagamentos

                SET
                    comprovante = $1,

                    status =
                        'PAGO',

                    pago_em =
                        CURRENT_TIMESTAMP

                WHERE
                    servico_id = $2

                AND
                    LOWER(
                        prestador_email
                    )
                    =
                    LOWER($3)
                `,
                [
                    arquivo,

                    servicoId,

                    servico.prestador_email
                ]
            );

            await pool.query(
                `
                INSERT INTO documentos_rs (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    categoria,
                    nome,
                    arquivo

                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    'COMPROVANTE',
                    $4,
                    $5
                )
                `,
                [
                    servicoId,

                    servico.empresa_email,

                    servico.prestador_email,

                    nomeArquivo,

                    arquivo
                ]
            );

            await registrarLedger(
                servicoId,

                servico.prestador_email,

                'REPASSE_PRESTADOR',

                servico.valor_liquido
            );

            await registrarAuditoria(
                empresaEmail,

                'COMPROVANTE_PAGAMENTO',

                `Comprovante do serviço #${servicoId} arquivado.`
            );

            emitirAtualizacao(
                servicoId
            );

            io.emit(
                'pagamento_atualizado',
                {
                    servicoId
                }
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Pagamento registrado e comprovante arquivado.'
            });

        } catch (err) {

            console.error(
                'Erro no comprovante de pagamento:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao registrar comprovante.'
            });
        }
    }
);


// ============================================================
// HISTÓRICO FINANCEIRO DO PRESTADOR
// ============================================================

app.get(
    '/api/prestador/:email/historico-pagamentos',

    async (req, res) => {

        try {

            const email =
                normalizarEmail(
                    req.params.email
                );

            const resultado =
                await pool.query(
                    `
                    SELECT *

                    FROM pagamentos

                    WHERE
                        LOWER(
                            prestador_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        email
                    ]
                );

            return res.json({
                sucesso: true,

                pagamentos:
                    resultado.rows
            });

        } catch (err) {

            console.error(
                'Erro no histórico de pagamentos:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao carregar pagamentos.'
            });
        }
    }
);


// ============================================================
// NOTA FISCAL / COMPATIBILIDADE COM SISTEMA ANTIGO
// ============================================================

app.post(
    '/api/servicos/:id/nota-oficial',

    upload.single(
        'notaFiscal'
    ),

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const arquivo =
                req.file;

            const dadosNota =
                req.body?.notaFiscal ||
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${
                            arquivo.buffer.toString(
                                'base64'
                            )
                        }`
                        :
                        ''
                );

            if (
                !dadosNota
            ) {

                return res.status(400).json({
                    erro:
                        'Nenhum arquivo de nota fiscal enviado.'
                });
            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    nota_oficial = $1

                WHERE id = $2
                `,
                [
                    dadosNota,

                    servicoId
                ]
            );

            await registrarAuditoria(
                'sistema',

                'ENVIO_NOTA_FISCAL',

                `Nota fiscal enviada para o serviço #${servicoId}.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Nota fiscal enviada com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro ao enviar nota fiscal:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao processar a nota fiscal.'
            });
        }
    }
);


// ============================================================
// PAINEL DA EMPRESA
// ============================================================

app.get(
    '/api/empresa/:email/painel',

    async (req, res) => {

        try {

            const empresaEmail =
                normalizarEmail(
                    req.params.email
                );

            const servicosRes =
                await pool.query(
                    `
                    SELECT *

                    FROM servicos

                    WHERE
                        LOWER(
                            empresa_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        id DESC
                    `,
                    [
                        empresaEmail
                    ]
                );

            const pagamentosRes =
                await pool.query(
                    `
                    SELECT *

                    FROM pagamentos

                    WHERE
                        LOWER(
                            empresa_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        criado_em DESC
                    `,
                    [
                        empresaEmail
                    ]
                );

            const documentosRes =
                await pool.query(
                    `
                    SELECT

                        id,
                        servico_id,
                        empresa_email,
                        prestador_email,
                        categoria,
                        nome,
                        criado_em

                    FROM documentos_rs

                    WHERE
                        LOWER(
                            empresa_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        criado_em DESC
                    `,
                    [
                        empresaEmail
                    ]
                );

            const servicos =
                servicosRes.rows;

            const trabalhadores =
                new Map();

            for (
                const servico
                of servicos
            ) {

                if (
                    !servico.prestador_email
                ) {

                    continue;
                }

                const chave =
                    normalizarEmail(
                        servico.prestador_email
                    );

                if (
                    !trabalhadores.has(
                        chave
                    )
                ) {

                    trabalhadores.set(
                        chave,
                        {
                            email:
                                servico.prestador_email,

                            nome:
                                servico.prestador_nome ||
                                servico.prestador_email,

                            servicos:
                                0,

                            concluidos:
                                0,

                            valorTotal:
                                0
                        }
                    );
                }

                const trabalhador =
                    trabalhadores.get(
                        chave
                    );

                trabalhador.servicos++;

                if (
                    servico.checkout_hora
                ) {

                    trabalhador.concluidos++;
                }

                trabalhador.valorTotal +=
                    numeroRS(
                        servico.valor_liquido ||
                        servico.valor_total ||
                        servico.valor
                    );
            }

            return res.json({
                sucesso: true,

                empresaEmail,

                resumo: {

                    totalServicos:
                        servicos.length,

                    trabalhadores:
                        trabalhadores.size,

                    emAndamento:
                        servicos.filter(
                            s =>
                                s.checkin_hora &&
                                !s.checkout_hora
                        )
                        .length,

                    aguardandoValidacao:
                        servicos.filter(
                            s =>
                                s.checkout_hora &&
                                !s.validado_empresa
                        )
                        .length,

                    pagamentosPendentes:
                        servicos.filter(
                            s =>
                                s.validado_empresa &&
                                !s.pagamento_realizado
                        )
                        .length
                },

                trabalhadores:
                    Array.from(
                        trabalhadores.values()
                    ),

                servicos,

                pagamentos:
                    pagamentosRes.rows,

                documentos:
                    documentosRes.rows
            });

        } catch (err) {

            console.error(
                'Erro no painel da empresa:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao carregar painel da empresa.'
            });
        }
    }
);


// ============================================================
// ARQUIVO DIGITAL
// ============================================================

app.get(
    '/api/empresa/:email/arquivo',

    async (req, res) => {

        try {

            const empresaEmail =
                normalizarEmail(
                    req.params.email
                );

            const [
                servicosRes,
                documentosRes,
                pagamentosRes
            ] =
                await Promise.all([

                    pool.query(
                        `
                        SELECT *

                        FROM servicos

                        WHERE
                            LOWER(
                                empresa_email
                            )
                            =
                            LOWER($1)

                        ORDER BY
                            id DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *

                        FROM documentos_rs

                        WHERE
                            LOWER(
                                empresa_email
                            )
                            =
                            LOWER($1)

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *

                        FROM pagamentos

                        WHERE
                            LOWER(
                                empresa_email
                            )
                            =
                            LOWER($1)

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    )
                ]);

            const servicos =
                servicosRes.rows;

            const documentos =
                documentosRes.rows;

            const trabalhadoresMap =
                new Map();

            servicos.forEach(
                servico => {

                    if (
                        servico.prestador_email
                    ) {

                        trabalhadoresMap.set(
                            normalizarEmail(
                                servico.prestador_email
                            ),

                            {
                                email:
                                    servico.prestador_email,

                                nome:
                                    servico.prestador_nome ||
                                    servico.prestador_email
                            }
                        );
                    }

                    parseReservas(
                        servico.reservas
                    )
                    .forEach(
                        reserva => {

                            const email =
                                normalizarEmail(
                                    typeof reserva ===
                                    'string'
                                        ?
                                        reserva
                                        :
                                        reserva.email ||
                                        reserva.prestador_email
                                );

                            if (!email) {
                                return;
                            }

                            trabalhadoresMap.set(
                                email,
                                {
                                    email,

                                    nome:
                                        typeof reserva ===
                                        'string'
                                            ?
                                            reserva
                                            :
                                            reserva.nome ||
                                            email
                                }
                            );
                        }
                    );
                }
            );

            return res.json({
                sucesso: true,

                pastas: {

                    trabalhadores:
                        Array.from(
                            trabalhadoresMap.values()
                        ),

                    contratos:
                        documentos.filter(
                            d =>
                                d.categoria ===
                                'CONTRATO'
                        ),

                    servicosRealizados:
                        servicos.filter(
                            s =>
                                Boolean(
                                    s.checkout_hora
                                )
                        ),

                    escalas:
                        servicos,

                    pagamentos:
                        pagamentosRes.rows,

                    comprovantes:
                        documentos.filter(
                            d =>
                                d.categoria ===
                                'COMPROVANTE'
                        ),

                    historico:
                        servicos,

                    documentos
                }
            });

        } catch (err) {

            console.error(
                'Erro no Arquivo Digital:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao carregar Arquivo Digital.'
            });
        }
    }
);


// ============================================================
// FIM DA PARTE 3
// ============================================================
// ============================================================
// HISTÓRICO INDIVIDUAL DO TRABALHADOR
// ============================================================

app.get(
    '/api/empresa/:empresaEmail/trabalhador/:prestadorEmail',

    async (req, res) => {

        try {

            const empresaEmail =
                normalizarEmail(
                    req.params.empresaEmail
                );

            const prestadorEmail =
                normalizarEmail(
                    req.params.prestadorEmail
                );

            const [
                servicosRes,
                pagamentosRes,
                documentosRes
            ] =
                await Promise.all([

                    pool.query(
                        `
                        SELECT *

                        FROM servicos

                        WHERE
                            LOWER(
                                empresa_email
                            )
                            =
                            LOWER($1)

                        AND
                            LOWER(
                                prestador_email
                            )
                            =
                            LOWER($2)

                        ORDER BY
                            id DESC
                        `,
                        [
                            empresaEmail,
                            prestadorEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *

                        FROM pagamentos

                        WHERE
                            LOWER(
                                empresa_email
                            )
                            =
                            LOWER($1)

                        AND
                            LOWER(
                                prestador_email
                            )
                            =
                            LOWER($2)

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail,
                            prestadorEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT

                            id,
                            servico_id,
                            categoria,
                            nome,
                            criado_em

                        FROM documentos_rs

                        WHERE
                            LOWER(
                                empresa_email
                            )
                            =
                            LOWER($1)

                        AND
                            LOWER(
                                prestador_email
                            )
                            =
                            LOWER($2)

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail,
                            prestadorEmail
                        ]
                    )
                ]);

            return res.json({

                sucesso: true,

                trabalhador: {

                    email:
                        prestadorEmail,

                    nome:
                        servicosRes
                            .rows[0]
                            ?.prestador_nome
                        ||
                        prestadorEmail
                },

                totalServicos:
                    servicosRes.rows.length,

                servicos:
                    servicosRes.rows,

                pagamentos:
                    pagamentosRes.rows,

                documentos:
                    documentosRes.rows
            });

        } catch (err) {

            console.error(
                'Erro no histórico do trabalhador:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao carregar histórico do trabalhador.'
            });
        }
    }
);


// ============================================================
// DOCUMENTOS DE UM SERVIÇO
// ============================================================

app.get(
    '/api/servicos/:id/documentos',

    async (req, res) => {

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *

                    FROM documentos_rs

                    WHERE
                        servico_id = $1

                    ORDER BY
                        criado_em DESC
                    `,
                    [
                        Number(
                            req.params.id
                        )
                    ]
                );

            return res.json({
                sucesso: true,

                documentos:
                    resultado.rows
            });

        } catch (err) {

            console.error(
                'Erro ao carregar documentos:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao carregar documentos.'
            });
        }
    }
);


// ============================================================
// CHAT REAL
// ============================================================

async function usuarioPodeAcessarChat(
    servicoId,
    usuarioEmail
) {

    const servico =
        await buscarServico(
            servicoId
        );

    if (!servico) {

        return {
            autorizado:
                false,

            motivo:
                'Serviço não encontrado.'
        };
    }

    const email =
        normalizarEmail(
            usuarioEmail
        );

    const empresaEmail =
        normalizarEmail(
            servico.empresa_email
        );

    const prestadorEmail =
        normalizarEmail(
            servico.prestador_email
        );

    if (
        email ===
        empresaEmail
    ) {

        return {
            autorizado:
                true,

            tipo:
                'empresa',

            servico,

            empresaEmail,

            prestadorEmail
        };
    }

    if (
        email ===
        prestadorEmail
    ) {

        return {
            autorizado:
                true,

            tipo:
                'prestador',

            servico,

            empresaEmail,

            prestadorEmail
        };
    }

    return {
        autorizado:
            false,

        motivo:
            'Você não possui acesso ao chat deste serviço.'
    };
}


// ============================================================
// CRIAR OU LOCALIZAR CONVERSA
// ============================================================

async function obterOuCriarConversa(
    servicoId
) {

    const servico =
        await buscarServico(
            servicoId
        );

    if (!servico) {

        throw new Error(
            'Serviço não encontrado.'
        );
    }

    const empresaEmail =
        normalizarEmail(
            servico.empresa_email
        );

    const prestadorEmail =
        normalizarEmail(
            servico.prestador_email
        );

    if (!empresaEmail) {

        throw new Error(
            'Serviço sem empresa vinculada.'
        );
    }

    if (!prestadorEmail) {

        throw new Error(
            'O chat será liberado quando houver um Titular.'
        );
    }

    const resultado =
        await pool.query(
            `
            INSERT INTO conversas (

                servico_id,
                empresa_email,
                prestador_email

            )

            VALUES (
                $1,
                $2,
                $3
            )

            ON CONFLICT (

                servico_id,
                empresa_email,
                prestador_email

            )

            DO UPDATE SET

                atualizado_em =
                    CURRENT_TIMESTAMP,

                ativo =
                    TRUE

            RETURNING *
            `,
            [
                servicoId,

                empresaEmail,

                prestadorEmail
            ]
        );

    return resultado.rows[0];
}


function nomeSalaChat(
    conversaId
) {

    return `chat_${conversaId}`;
}


// ============================================================
// LISTAR CONVERSAS
// ============================================================

app.get(
    '/api/chat/conversas',

    async (req, res) => {

        try {

            const email =
                normalizarEmail(
                    req.query.email
                );

            if (!email) {

                return res.status(400).json({
                    erro:
                        'E-mail obrigatório.'
                });
            }

            // ------------------------------------------------
            // GARANTIR CONVERSAS DOS SERVIÇOS VINCULADOS
            // ------------------------------------------------

            const servicosRes =
                await pool.query(
                    `
                    SELECT id

                    FROM servicos

                    WHERE
                        prestador_email
                        IS NOT NULL

                    AND
                        (
                            LOWER(
                                empresa_email
                            )
                            =
                            LOWER($1)

                            OR

                            LOWER(
                                prestador_email
                            )
                            =
                            LOWER($1)
                        )
                    `,
                    [
                        email
                    ]
                );

            for (
                const item
                of servicosRes.rows
            ) {

                try {

                    await obterOuCriarConversa(
                        item.id
                    );

                } catch {
                    // ignora serviços sem condições de chat
                }
            }

            const resultado =
                await pool.query(
                    `
                    SELECT

                        c.id,

                        c.servico_id,

                        c.empresa_email,

                        c.prestador_email,

                        c.criado_em,

                        c.atualizado_em,

                        c.ativo,

                        s.titulo
                            AS servico_titulo,

                        s.categoria
                            AS servico_categoria,

                        s.local
                            AS servico_local,

                        s.empresa_nome,

                        s.prestador_nome,

                        (
                            SELECT
                                m.mensagem

                            FROM
                                mensagens_chat m

                            WHERE
                                m.conversa_id = c.id

                            ORDER BY
                                m.criado_em DESC,
                                m.id DESC

                            LIMIT 1
                        )
                        AS ultima_mensagem,

                        (
                            SELECT
                                m.criado_em

                            FROM
                                mensagens_chat m

                            WHERE
                                m.conversa_id = c.id

                            ORDER BY
                                m.criado_em DESC,
                                m.id DESC

                            LIMIT 1
                        )
                        AS ultima_mensagem_em,

                        (
                            SELECT
                                COUNT(*)::INTEGER

                            FROM
                                mensagens_chat m

                            WHERE
                                m.conversa_id = c.id

                            AND
                                LOWER(
                                    m.destinatario_email
                                )
                                =
                                LOWER($1)

                            AND
                                m.lida = FALSE
                        )
                        AS nao_lidas

                    FROM
                        conversas c

                    LEFT JOIN
                        servicos s

                    ON
                        s.id = c.servico_id

                    WHERE
                        (
                            LOWER(
                                c.empresa_email
                            )
                            =
                            LOWER($1)

                            OR

                            LOWER(
                                c.prestador_email
                            )
                            =
                            LOWER($1)
                        )

                    AND
                        c.ativo = TRUE

                    ORDER BY

                        COALESCE(

                            (
                                SELECT
                                    MAX(
                                        m.criado_em
                                    )

                                FROM
                                    mensagens_chat m

                                WHERE
                                    m.conversa_id =
                                    c.id
                            ),

                            c.atualizado_em,

                            c.criado_em
                        )

                        DESC
                    `,
                    [
                        email
                    ]
                );

            return res.json({
                sucesso: true,

                conversas:
                    resultado.rows
            });

        } catch (err) {

            console.error(
                'Erro ao listar conversas:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao carregar conversas.'
            });
        }
    }
);


// ============================================================
// CARREGAR MENSAGENS
// ============================================================

app.get(
    '/api/chat/:servicoId/mensagens',

    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.servicoId
                );

            const email =
                normalizarEmail(
                    req.query.email
                );

            const permissao =
                await usuarioPodeAcessarChat(
                    servicoId,
                    email
                );

            if (
                !permissao.autorizado
            ) {

                return res.status(403).json({
                    erro:
                        permissao.motivo
                });
            }

            const conversa =
                await obterOuCriarConversa(
                    servicoId
                );

            const mensagens =
                await pool.query(
                    `
                    SELECT *

                    FROM
                        mensagens_chat

                    WHERE
                        conversa_id = $1

                    ORDER BY
                        criado_em ASC,
                        id ASC
                    `,
                    [
                        conversa.id
                    ]
                );

            // ------------------------------------------------
            // MARCAR RECEBIDAS COMO LIDAS
            // ------------------------------------------------

            await pool.query(
                `
                UPDATE
                    mensagens_chat

                SET
                    lida = TRUE

                WHERE
                    conversa_id = $1

                AND
                    LOWER(
                        destinatario_email
                    )
                    =
                    LOWER($2)

                AND
                    lida = FALSE
                `,
                [
                    conversa.id,
                    email
                ]
            );

            return res.json({

                sucesso: true,

                conversa: {

                    id:
                        conversa.id,

                    servicoId,

                    empresaEmail:
                        conversa.empresa_email,

                    prestadorEmail:
                        conversa.prestador_email,

                    servicoTitulo:
                        permissao
                            .servico
                            ?.titulo
                        ||
                        'Serviço',

                    empresaNome:
                        permissao
                            .servico
                            ?.empresa_nome
                        ||
                        permissao
                            .empresaEmail,

                    prestadorNome:
                        permissao
                            .servico
                            ?.prestador_nome
                        ||
                        permissao
                            .prestadorEmail
                },

                mensagens:
                    mensagens.rows
            });

        } catch (err) {

            console.error(
                'Erro ao buscar mensagens:',
                err
            );

            return res.status(500).json({
                erro:
                    err.message ||
                    'Erro ao carregar mensagens.'
            });
        }
    }
);


// ============================================================
// ENVIAR MENSAGEM
// ============================================================

app.post(
    '/api/chat/:servicoId/mensagens',

    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.servicoId
                );

            const remetenteEmail =
                normalizarEmail(
                    req.body?.remetenteEmail ||
                    req.body?.email
                );

            const mensagem =
                String(
                    req.body?.mensagem ||
                    ''
                )
                .trim();

            if (
                !mensagem
            ) {

                return res.status(400).json({
                    erro:
                        'Digite uma mensagem.'
                });
            }

            if (
                mensagem.length >
                5000
            ) {

                return res.status(400).json({
                    erro:
                        'A mensagem ultrapassa o limite permitido.'
                });
            }

            const permissao =
                await usuarioPodeAcessarChat(
                    servicoId,
                    remetenteEmail
                );

            if (
                !permissao.autorizado
            ) {

                return res.status(403).json({
                    erro:
                        permissao.motivo
                });
            }

            const conversa =
                await obterOuCriarConversa(
                    servicoId
                );

            const destinatarioEmail =
                remetenteEmail ===
                permissao.empresaEmail

                    ?
                    permissao.prestadorEmail

                    :
                    permissao.empresaEmail;

            if (
                !destinatarioEmail
            ) {

                return res.status(400).json({
                    erro:
                        'Não foi possível identificar o destinatário.'
                });
            }

            const resultado =
                await pool.query(
                    `
                    INSERT INTO
                        mensagens_chat (

                            conversa_id,
                            servico_id,
                            remetente_email,
                            destinatario_email,
                            mensagem,
                            tipo,
                            lida
                        )

                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        'texto',
                        FALSE
                    )

                    RETURNING *
                    `,
                    [
                        conversa.id,

                        servicoId,

                        remetenteEmail,

                        destinatarioEmail,

                        mensagem
                    ]
                );

            await pool.query(
                `
                UPDATE conversas

                SET
                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE
                    id = $1
                `,
                [
                    conversa.id
                ]
            );

            const novaMensagem =
                resultado.rows[0];

            io
                .to(
                    nomeSalaChat(
                        conversa.id
                    )
                )
                .emit(
                    'chat:nova-mensagem',
                    {

                        conversaId:
                            conversa.id,

                        servicoId,

                        mensagem:
                            novaMensagem
                    }
                );

            io.emit(
                'chat:conversas-atualizadas',
                {

                    conversaId:
                        conversa.id,

                    servicoId
                }
            );

            return res.json({
                sucesso: true,

                mensagem:
                    novaMensagem
            });

        } catch (err) {

            console.error(
                'Erro ao enviar mensagem:',
                err
            );

            return res.status(500).json({
                erro:
                    err.message ||
                    'Erro ao enviar mensagem.'
            });
        }
    }
);


// ============================================================
// MARCAR COMO LIDAS
// ============================================================

app.post(
    '/api/chat/:servicoId/marcar-lidas',

    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.servicoId
                );

            const email =
                normalizarEmail(
                    req.body?.email
                );

            const permissao =
                await usuarioPodeAcessarChat(
                    servicoId,
                    email
                );

            if (
                !permissao.autorizado
            ) {

                return res.status(403).json({
                    erro:
                        permissao.motivo
                });
            }

            const conversa =
                await obterOuCriarConversa(
                    servicoId
                );

            const resultado =
                await pool.query(
                    `
                    UPDATE
                        mensagens_chat

                    SET
                        lida = TRUE

                    WHERE
                        conversa_id = $1

                    AND
                        LOWER(
                            destinatario_email
                        )
                        =
                        LOWER($2)

                    AND
                        lida = FALSE

                    RETURNING id
                    `,
                    [
                        conversa.id,
                        email
                    ]
                );

            io
                .to(
                    nomeSalaChat(
                        conversa.id
                    )
                )
                .emit(
                    'chat:leitura-atualizada',
                    {

                        conversaId:
                            conversa.id,

                        servicoId,

                        leitorEmail:
                            email
                    }
                );

            io.emit(
                'chat:conversas-atualizadas',
                {

                    conversaId:
                        conversa.id,

                    servicoId
                }
            );

            return res.json({

                sucesso:
                    true,

                marcadas:
                    resultado.rowCount
            });

        } catch (err) {

            console.error(
                'Erro ao marcar mensagens:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao atualizar mensagens.'
            });
        }
    }
);


// ============================================================
// CONTADOR DE NÃO LIDAS
// ============================================================

app.get(
    '/api/chat/nao-lidas',

    async (req, res) => {

        try {

            const email =
                normalizarEmail(
                    req.query.email
                );

            if (!email) {

                return res.status(400).json({
                    erro:
                        'E-mail obrigatório.'
                });
            }

            const resultado =
                await pool.query(
                    `
                    SELECT
                        COUNT(*)::INTEGER
                        AS total

                    FROM
                        mensagens_chat

                    WHERE
                        LOWER(
                            destinatario_email
                        )
                        =
                        LOWER($1)

                    AND
                        lida = FALSE
                    `,
                    [
                        email
                    ]
                );

            return res.json({
                sucesso: true,

                total:
                    resultado
                        .rows[0]
                        ?.total
                    ||
                    0
            });

        } catch (err) {

            console.error(
                'Erro ao contar mensagens:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao contar mensagens.'
            });
        }
    }
);


// ============================================================
// COMPATIBILIDADE COM CHAT ANTIGO
// ============================================================

app.post(
    '/api/servicos/:id/chat',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const result =
                await pool.query(
                    `
                    SELECT mensagens

                    FROM servicos

                    WHERE id = $1
                    `,
                    [
                        servicoId
                    ]
                );

            if (
                !result.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false
                });
            }

            const mensagens =
                Array.isArray(
                    result.rows[0].mensagens
                )
                    ?
                    result.rows[0].mensagens
                    :
                    [];

            mensagens.push({

                remetente:
                    req.body?.remetente,

                texto:
                    req.body?.texto,

                data:
                    horaAtualRS()
            });

            await pool.query(
                `
                UPDATE servicos

                SET
                    mensagens = $1::jsonb

                WHERE id = $2
                `,
                [
                    JSON.stringify(
                        mensagens
                    ),

                    servicoId
                ]
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true
            });

        } catch (err) {

            console.error(
                'Erro no chat antigo:',
                err
            );

            return res.status(500).json({
                sucesso: false
            });
        }
    }
);


// ============================================================
// PROCESSAR STATUS / COMPATIBILIDADE ANTIGA
// ============================================================

app.post(
    '/api/servicos/:id/processar-status',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        const {
            acao,
            motivo
        } =
            req.body;

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            // ------------------------------------------------
            // AUSÊNCIA
            // ------------------------------------------------

            if (
                acao ===
                'verificar_ausencia'
            ) {

                if (
                    servico.status_checkin ===
                    'pendente'
                ) {

                    await pool.query(
                        `
                        UPDATE servicos

                        SET
                            status = $1,

                            motivo_cancelamento =
                                $2

                        WHERE id = $3
                        `,
                        [
                            'cancelado_ausencia_prestador',

                            motivo ||
                            'Prestador não compareceu no horário.',

                            servicoId
                        ]
                    );

                    await registrarLedger(
                        servicoId,

                        servico.empresa_email,

                        'REEMBOLSO_AUTOMATICO',

                        servico.valor_diaria
                    );

                    if (
                        servico.prestador_email
                    ) {

                        await pool.query(
                            `
                            UPDATE prestadores

                            SET
                                reputacao =
                                    GREATEST(
                                        reputacao - 0.5,
                                        0
                                    ),

                                advertencias =
                                    advertencias + 1

                            WHERE
                                LOWER(email)
                                =
                                LOWER($1)
                            `,
                            [
                                servico.prestador_email
                            ]
                        );
                    }

                    emitirAtualizacao(
                        servicoId
                    );

                    return res.json({
                        sucesso: true,
                        mensagem:
                            'Ausência registrada.'
                    });
                }

                return res.status(400).json({
                    erro:
                        'O prestador realizou o check-in.'
                });
            }

            // ------------------------------------------------
            // CONCLUIR
            // ------------------------------------------------

            if (
                acao ===
                'concluir'
            ) {

                if (
                    servico.status_checkin !==
                    'concluido'
                    &&
                    !servico.checkout_hora
                ) {

                    return res.status(400).json({
                        erro:
                            'O serviço precisa ter check-out válido.'
                    });
                }

                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        status =
                            'concluido_com_sucesso'

                    WHERE id = $1
                    `,
                    [
                        servicoId
                    ]
                );

                emitirAtualizacao(
                    servicoId
                );

                return res.json({
                    sucesso: true,
                    mensagem:
                        'Serviço concluído.'
                });
            }

            return res.status(400).json({
                erro:
                    'Ação inválida.'
            });

        } catch (err) {

            console.error(
                'Erro no processamento de status:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro interno ao processar fluxo.'
            });
        }
    }
);


// ============================================================
// APROVAÇÃO ANTIGA
// ============================================================

app.post(
    '/api/servicos/:id/aprovar',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    erro:
                        'Serviço não encontrado.'
                });
            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    status =
                        'aprovado'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );

            await registrarAuditoria(
                servico.empresa_email,

                'APROVAR_PAGAMENTO',

                `Serviço #${servicoId} aprovado.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true
            });

        } catch (err) {

            console.error(
                'Erro ao aprovar serviço:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao aprovar serviço.'
            });
        }
    }
);


// ============================================================
// SOCKET.IO
// APENAS UMA INICIALIZAÇÃO
// ============================================================

io.on(
    'connection',

    socket => {

        console.log(
            'Novo cliente conectado via WebSocket:',
            socket.id
        );


        // ====================================================
        // ENTRAR NO CHAT
        // ====================================================

        socket.on(
            'chat:entrar',

            async dados => {

                try {

                    const servicoId =
                        Number(
                            dados?.servicoId
                        );

                    const email =
                        normalizarEmail(
                            dados?.email
                        );

                    if (
                        !servicoId ||
                        !email
                    ) {

                        return;
                    }

                    const permissao =
                        await usuarioPodeAcessarChat(
                            servicoId,
                            email
                        );

                    if (
                        !permissao.autorizado
                    ) {

                        socket.emit(
                            'chat:erro',
                            {
                                mensagem:
                                    permissao.motivo
                            }
                        );

                        return;
                    }

                    const conversa =
                        await obterOuCriarConversa(
                            servicoId
                        );

                    socket.join(
                        nomeSalaChat(
                            conversa.id
                        )
                    );

                    socket.emit(
                        'chat:entrou',
                        {

                            conversaId:
                                conversa.id,

                            servicoId
                        }
                    );

                } catch (err) {

                    console.error(
                        'Erro Socket ao entrar no chat:',
                        err
                    );

                    socket.emit(
                        'chat:erro',
                        {
                            mensagem:
                                err.message ||
                                'Erro ao entrar no chat.'
                        }
                    );
                }
            }
        );


        // ====================================================
        // SAIR DO CHAT
        // ====================================================

        socket.on(
            'chat:sair',

            dados => {

                const conversaId =
                    Number(
                        dados?.conversaId
                    );

                if (
                    conversaId
                ) {

                    socket.leave(
                        nomeSalaChat(
                            conversaId
                        )
                    );
                }
            }
        );


        // ====================================================
        // MARCAR CHAT COMO LIDO
        // ====================================================

        socket.on(
            'chat:marcar-lidas',

            async dados => {

                try {

                    const servicoId =
                        Number(
                            dados?.servicoId
                        );

                    const email =
                        normalizarEmail(
                            dados?.email
                        );

                    if (
                        !servicoId ||
                        !email
                    ) {

                        return;
                    }

                    const permissao =
                        await usuarioPodeAcessarChat(
                            servicoId,
                            email
                        );

                    if (
                        !permissao.autorizado
                    ) {

                        return;
                    }

                    const conversa =
                        await obterOuCriarConversa(
                            servicoId
                        );

                    await pool.query(
                        `
                        UPDATE
                            mensagens_chat

                        SET
                            lida = TRUE

                        WHERE
                            conversa_id = $1

                        AND
                            LOWER(
                                destinatario_email
                            )
                            =
                            LOWER($2)

                        AND
                            lida = FALSE
                        `,
                        [
                            conversa.id,
                            email
                        ]
                    );

                    io
                        .to(
                            nomeSalaChat(
                                conversa.id
                            )
                        )
                        .emit(
                            'chat:leitura-atualizada',
                            {

                                conversaId:
                                    conversa.id,

                                servicoId,

                                leitorEmail:
                                    email
                            }
                        );

                    io.emit(
                        'chat:conversas-atualizadas',
                        {

                            conversaId:
                                conversa.id,

                            servicoId
                        }
                    );

                } catch (err) {

                    console.error(
                        'Erro ao marcar leitura via Socket:',
                        err
                    );
                }
            }
        );


        // ====================================================
        // ATUALIZAÇÃO MANUAL
        // ====================================================

        socket.on(
            'rs:solicitar-atualizacao',

            dados => {

                socket
                    .broadcast
                    .emit(
                        'atualizar_servicos',
                        {

                            servicoId:
                                dados?.servicoId ||
                                null,

                            atualizadoEm:
                                new Date()
                                    .toISOString()
                        }
                    );
            }
        );


        // ====================================================
        // DESCONECTAR
        // ====================================================

        socket.on(
            'disconnect',

            () => {

                console.log(
                    'Cliente desconectado:',
                    socket.id
                );
            }
        );
    }
);


// ============================================================
// STATUS DO BACKEND
// ============================================================

app.get(
    '/api/status',

    async (req, res) => {

        try {

            await pool.query(
                'SELECT NOW()'
            );

            return res.json({

                online:
                    true,

                sistema:
                    'RS CONNECT',

                banco:
                    'PostgreSQL conectado',

                socket:
                    'ativo',

                chat:
                    'ativo',

                data:
                    new Date()
                        .toISOString()
            });

        } catch (err) {

            return res.status(500).json({

                online:
                    false,

                sistema:
                    'RS CONNECT',

                banco:
                    'erro',

                erro:
                    err.message
            });
        }
    }
);


// ============================================================
// ABRIR INDEX.HTML
// ============================================================

app.get(
    '/',

    (req, res) => {

        res.status(200)
            .sendFile(
                path.join(
                    __dirname,
                    'index.html'
                )
            );
    }
);


// ============================================================
// TRATAMENTO DE ERROS
// DEIXAR DEPOIS DAS ROTAS
// ============================================================

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        console.error(
            'ERRO RS CONNECT:',
            err
        );

        if (
            res.headersSent
        ) {

            return next(
                err
            );
        }

        if (
            err instanceof
            multer.MulterError
        ) {

            return res.status(400).json({

                sucesso:
                    false,

                erro:
                    err.code ===
                    'LIMIT_FILE_SIZE'

                        ?
                        'O arquivo ultrapassa o limite de 10 MB.'

                        :
                        'Erro no envio do arquivo.'
            });
        }

        return res.status(500).json({

            sucesso:
                false,

            erro:
                'Erro interno do RS Connect.'
        });
    }
);


// ============================================================
// INICIAR SERVIDOR
// IMPORTANTE: ESTE É O ÚNICO server.listen()
// ============================================================

const PORT =
    process.env.PORT ||
    10000;


server.listen(
    PORT,

    '0.0.0.0',

    () => {

        console.log(
            '======================================'
        );

        console.log(
            '🚀 RS CONNECT ONLINE'
        );

        console.log(
            `🌐 Porta: ${PORT}`
        );

        console.log(
            '💾 PostgreSQL ativo'
        );

        console.log(
            '⚡ Socket.IO ativo'
        );

        console.log(
            '💬 Chat ativo'
        );

        console.log(
            '📁 Arquivo Digital ativo'
        );

        console.log(
            '☕ Intervalo / retorno ativo'
        );

        console.log(
            '💰 Financeiro ativo'
        );

        console.log(
            '======================================'
        );
    }
);


// ============================================================
// FIM DO SERVER.JS
// ============================================================
