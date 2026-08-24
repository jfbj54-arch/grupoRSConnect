const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const upload = multer({
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

app.use(express.json({
    limit: '50mb'
}));

app.use(express.urlencoded({
    limit: '50mb',
    extended: true
}));

app.use(
    express.static(
        path.join(__dirname)
    )
);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect((err, client, release) => {

    if (err) {

        console.error(
            'Erro ao conectar ao PostgreSQL:',
            err.stack
        );

    } else {

        console.log(
            'Conectado com sucesso ao banco PostgreSQL.'
        );

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
                reservas JSONB DEFAULT '[]'::jsonb,
                mensagens JSONB DEFAULT '[]'::jsonb,
                selfie_confirmacao TEXT,
                documento_comprovante TEXT,
                presenca_confirmada BOOLEAN DEFAULT FALSE,
                status_checkin TEXT DEFAULT 'pendente',
                checkin_hora TEXT,
                checkout_hora TEXT,
                comprovante_pagamento BOOLEAN DEFAULT FALSE,
                nota_oficial TEXT,
                empresa_nome TEXT,
                foto_checkin TEXT,
                foto_checkout TEXT,
                checkin_gps TEXT,
                checkout_gps TEXT,
                intervalo_inicio TEXT,
                intervalo_retorno TEXT,
                total_horas TEXT,
                validado_empresa BOOLEAN DEFAULT FALSE,
                validado_em TIMESTAMP,
                comprovante_pagamento_arquivo TEXT,
                comprovante_pagamento_nome TEXT,
                comprovante_pagamento_tipo TEXT,
                comprovante_pagamento_enviado_em TIMESTAMP,
                pagamento_recebido_confirmado BOOLEAN DEFAULT FALSE,
                pagamento_recebido_em TIMESTAMP,
                contrato_empresa_arquivo TEXT,
                contrato_empresa_nome TEXT,
                contrato_empresa_tipo TEXT,
                contrato_empresa_enviado_em TIMESTAMP
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

            CREATE TABLE IF NOT EXISTS recuperacao_senha (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                codigo_hash TEXT NOT NULL,
                expira_em TIMESTAMP NOT NULL,
                usado BOOLEAN DEFAULT FALSE,
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

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS data_aceite TIMESTAMPTZ;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkin TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkout TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_gps TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_gps TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_inicio TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_retorno TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS total_horas TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_empresa BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_arquivo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_tipo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_enviado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_recebido_confirmado BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_recebido_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_arquivo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_tipo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_enviado_em TIMESTAMP;"
        ];

        for (const sqlCol of colunasGarantir) {

            await pool
                .query(sqlCol)
                .catch(() => {});

        }

        await pool.query(`
            UPDATE servicos

            SET data_aceite =
                CURRENT_TIMESTAMP

            WHERE prestador_email
                IS NOT NULL

              AND data_aceite
                IS NULL
        `).catch(err => {

            console.error(
                'Erro ao preencher data_aceite antiga:',
                err
            );

        });

        console.log(
            'Tabelas e colunas verificadas/criadas com sucesso no PostgreSQL.'
        );

    } catch (err) {

        console.error(
            'Erro ao criar tabelas:',
            err
        );

    }
}


async function registrarLedger(
    servicoId,
    email,
    tipoMovimento,
    valor
) {

    try {

        await pool.query(
            `
            INSERT INTO ledger_transacoes
            (
                servico_id,
                usuario_email,
                tipo_movimento,
                valor
            )

            VALUES
            (
                $1,
                $2,
                $3,
                $4
            )
            `,
            [
                servicoId,
                email,
                tipoMovimento,
                valor
            ]
        );

    } catch (err) {

        console.error(
            'Erro ao registrar ledger:',
            err
        );

    }
}


async function registrarAuditoria(
    email,
    acao,
    detalhes
) {

    try {

        await pool.query(
            `
            INSERT INTO auditoria_sistema
            (
                usuario_email,
                acao,
                detalhes
            )

            VALUES
            (
                $1,
                $2,
                $3
            )
            `,
            [
                email || 'sistema',
                acao,
                detalhes
            ]
        );

    } catch (err) {

        console.error(
            'Erro ao registrar auditoria:',
            err
        );

    }
}


function hashCodigoRecuperacao(codigo) {

    return crypto
        .createHash('sha256')
        .update(
            String(codigo)
        )
        .digest('hex');

}


async function enviarEmailRecuperacao(
    email,
    codigo
) {

    const apiKey =
        process.env.RESEND_API_KEY;

    const remetente =
        process.env.RESET_EMAIL_FROM
        ||
        'RS Connect <onboarding@resend.dev>';

    if (!apiKey) {

        throw new Error(
            'RESEND_API_KEY não configurada no servidor.'
        );

    }

    const resposta =
        await fetch(
            'https://api.resend.com/emails',
            {
                method:
                    'POST',

                headers: {

                    'Authorization':
                        `Bearer ${apiKey}`,

                    'Content-Type':
                        'application/json'
                },

                body:
                    JSON.stringify({

                        from:
                            remetente,

                        to:
                            [email],

                        subject:
                            'Código para redefinir sua senha - RS Connect',

                        html: `
                            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0f172a;">

                                <div style="font-size:22px;font-weight:800;margin-bottom:12px;">
                                    RS Connect
                                </div>

                                <p>
                                    Recebemos uma solicitação para redefinir a senha da sua conta.
                                </p>

                                <p>
                                    Use este código:
                                </p>

                                <div style="font-size:32px;font-weight:900;letter-spacing:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px;text-align:center;color:#1d4ed8;">
                                    ${codigo}
                                </div>

                                <p style="margin-top:18px;">
                                    O código expira em
                                    <strong>15 minutos</strong>.
                                </p>

                                <p style="font-size:12px;color:#64748b;">
                                    Se você não solicitou a recuperação,
                                    ignore este e-mail.
                                </p>

                            </div>
                        `
                    })
            }
        );

    const texto =
        await resposta.text();

    if (!resposta.ok) {

        throw new Error(
            `Falha ao enviar e-mail de recuperação: ${texto}`
        );

    }
}


// =====================================================
// CADASTRO
// =====================================================

app.post(
    '/api/auth/registrar',
    async (req, res) => {

        const d =
            req.body;

        try {

            const query = `
                INSERT INTO usuarios
                (
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

                VALUES
                (
                    $1,$2,$3,$4,$5,
                    $6,$7,$8,$9,$10,
                    $11,$12,$13,$14,$15
                )

                RETURNING id
            `;

            const params = [

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

            ];

            const result =
                await pool.query(
                    query,
                    params
                );

            if (
                d.tipo ===
                'prestador'
            ) {

                await pool.query(
                    `
                    INSERT INTO prestadores
                    (
                        email
                    )

                    VALUES
                    (
                        $1
                    )

                    ON CONFLICT
                    (
                        email
                    )

                    DO NOTHING
                    `,
                    [
                        d.email
                    ]
                );

            }

            await registrarAuditoria(
                d.email,
                'CADASTRO_USUARIO',
                `Novo usuário tipo ${d.tipo} cadastrado.`
            );

            res.json({

                sucesso:
                    true,

                id:
                    result.rows[0].id

            });

        } catch (err) {

            res.json({

                sucesso:
                    false,

                erro:
                    'E-mail já cadastrado ou erro nos dados.'

            });

        }
    }
);


// =====================================================
// ESQUECI A SENHA
// =====================================================

app.post(
    '/api/auth/esqueci-senha',
    async (req, res) => {

        const email =
            String(
                req.body.email || ''
            )
                .trim()
                .toLowerCase();

        if (!email) {

            return res
                .status(400)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Informe o e-mail da conta.'

                });
        }

        try {

            const usuario =
                await pool.query(
                    `
                    SELECT
                        id,
                        email,
                        nome

                    FROM usuarios

                    WHERE LOWER(email) =
                        $1
                    `,
                    [
                        email
                    ]
                );

            if (
                !usuario.rows.length
            ) {

                return res.json({

                    sucesso:
                        true,

                    mensagem:
                        'Se este e-mail estiver cadastrado, enviaremos um código de recuperação.'

                });

            }

            const codigo =
                String(
                    crypto.randomInt(
                        100000,
                        1000000
                    )
                );

            const codigoHash =
                hashCodigoRecuperacao(
                    codigo
                );

            await pool.query(
                `
                UPDATE recuperacao_senha

                SET usado =
                    TRUE

                WHERE LOWER(email) =
                    $1

                  AND usado =
                    FALSE
                `,
                [
                    email
                ]
            );

            await pool.query(
                `
                INSERT INTO recuperacao_senha
                (
                    email,
                    codigo_hash,
                    expira_em
                )

                VALUES
                (
                    $1,
                    $2,
                    CURRENT_TIMESTAMP
                    +
                    INTERVAL '15 minutes'
                )
                `,
                [
                    email,
                    codigoHash
                ]
            );

            await enviarEmailRecuperacao(
                email,
                codigo
            );

            await registrarAuditoria(
                email,
                'SOLICITAR_RECUPERACAO_SENHA',
                'Código de recuperação de senha enviado.'
            );

            res.json({

                sucesso:
                    true,

                mensagem:
                    'Código enviado para seu e-mail. Ele expira em 15 minutos.'

            });

        } catch (err) {

            console.error(
                'Erro na recuperação de senha:',
                err
            );

            res.status(500).json({

                sucesso:
                    false,

                erro:
                    'Não foi possível enviar o código de recuperação.'

            });
        }
    }
);


// =====================================================
// REDEFINIR SENHA
// =====================================================

app.post(
    '/api/auth/redefinir-senha',
    async (req, res) => {

        const email =
            String(
                req.body.email || ''
            )
                .trim()
                .toLowerCase();

        const codigo =
            String(
                req.body.codigo || ''
            )
                .trim();

        const novaSenha =
            String(
                req.body.novaSenha || ''
            );

        if (
            !email ||
            !codigo ||
            !novaSenha
        ) {

            return res
                .status(400)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Preencha e-mail, código e nova senha.'

                });
        }

        if (
            novaSenha.length <
            6
        ) {

            return res
                .status(400)
                .json({

                    sucesso:
                        false,

                    erro:
                        'A nova senha deve ter pelo menos 6 caracteres.'

                });
        }

        try {

            const codigoHash =
                hashCodigoRecuperacao(
                    codigo
                );

            const token =
                await pool.query(
                    `
                    SELECT *

                    FROM recuperacao_senha

                    WHERE LOWER(email) =
                        $1

                      AND codigo_hash =
                        $2

                      AND usado =
                        FALSE

                      AND expira_em >
                        CURRENT_TIMESTAMP

                    ORDER BY id DESC

                    LIMIT 1
                    `,
                    [
                        email,
                        codigoHash
                    ]
                );

            if (
                !token.rows.length
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Código inválido ou expirado.'

                    });
            }

            const usuario =
                await pool.query(
                    `
                    UPDATE usuarios

                    SET senha =
                        $1

                    WHERE LOWER(email) =
                        $2

                    RETURNING id
                    `,
                    [
                        novaSenha,
                        email
                    ]
                );

            if (
                !usuario.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Conta não encontrada.'

                    });
            }

            await pool.query(
                `
                UPDATE recuperacao_senha

                SET usado =
                    TRUE

                WHERE id =
                    $1
                `,
                [
                    token.rows[0].id
                ]
            );

            await registrarAuditoria(
                email,
                'REDEFINIR_SENHA',
                'Senha redefinida através do código de recuperação.'
            );

            res.json({

                sucesso:
                    true,

                mensagem:
                    'Senha redefinida com sucesso. Você já pode entrar.'

            });

        } catch (err) {

            console.error(
                'Erro ao redefinir senha:',
                err
            );

            res.status(500).json({

                sucesso:
                    false,

                erro:
                    'Erro interno ao redefinir a senha.'

            });
        }
    }
);


// =====================================================
// LOGIN
// =====================================================

app.post(
    '/api/auth/login',
    async (req, res) => {

        const {
            email,
            senha
        } =
            req.body;

        try {

            const result =
                await pool.query(
                    `
                    SELECT *

                    FROM usuarios

                    WHERE email =
                        $1

                      AND senha =
                        $2
                    `,
                    [
                        email,
                        senha
                    ]
                );

            if (
                result.rows.length ===
                0
            ) {

                return res.json({

                    sucesso:
                        false,

                    erro:
                        'E-mail ou senha incorretos.'

                });
            }

            await registrarAuditoria(
                email,
                'LOGIN',
                'Login realizado com sucesso.'
            );

            res.json({

                sucesso:
                    true,

                usuario:
                    result.rows[0]

            });

        } catch (err) {

            res.status(500).json({

                sucesso:
                    false,

                erro:
                    'Erro no servidor.'

            });
        }
    }
);
// =====================================================
// BUSCAR USUÁRIO
// =====================================================

app.get('/api/usuarios/:email', async (req, res) => {
    const email = req.params.email;

    try {
        const result = await pool.query(
            `
            SELECT
                id,
                tipo,
                nome,
                doc,
                responsavel,
                email,
                whatsapp,
                endereco,
                rg_cnh,
                profissao,
                tipo_chave_pix,
                pix,
                banco,
                conta,
                experiencia
            FROM usuarios
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [email]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Usuário não encontrado.'
            });
        }

        return res.json({
            sucesso: true,
            usuario: result.rows[0]
        });

    } catch (err) {
        console.error('Erro ao buscar usuário:', err);

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao buscar usuário.'
        });
    }
});


// =====================================================
// ATUALIZAR PERFIL DO USUÁRIO
// =====================================================

app.put('/api/usuarios/:email', async (req, res) => {
    const emailAtual = req.params.email;
    const d = req.body;

    try {
        const result = await pool.query(
            `
            UPDATE usuarios
            SET
                nome = COALESCE($1, nome),
                doc = COALESCE($2, doc),
                responsavel = COALESCE($3, responsavel),
                whatsapp = COALESCE($4, whatsapp),
                endereco = COALESCE($5, endereco),
                rg_cnh = COALESCE($6, rg_cnh),
                profissao = COALESCE($7, profissao),
                tipo_chave_pix = COALESCE($8, tipo_chave_pix),
                pix = COALESCE($9, pix),
                banco = COALESCE($10, banco),
                conta = COALESCE($11, conta),
                experiencia = COALESCE($12, experiencia)
            WHERE LOWER(email) = LOWER($13)
            RETURNING *
            `,
            [
                d.nome ?? null,
                d.doc ?? null,
                d.responsavel ?? null,
                d.whatsapp ?? null,
                d.endereco ?? null,
                d.rgCnh ?? d.rg_cnh ?? null,
                d.profissao ?? null,
                d.tipoChavePix ?? d.tipo_chave_pix ?? null,
                d.pix ?? null,
                d.banco ?? null,
                d.conta ?? null,
                d.experiencia ?? null,
                emailAtual
            ]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Usuário não encontrado.'
            });
        }

        await registrarAuditoria(
            emailAtual,
            'ATUALIZAR_PERFIL',
            'Dados do perfil atualizados.'
        );

        return res.json({
            sucesso: true,
            usuario: result.rows[0]
        });

    } catch (err) {
        console.error('Erro ao atualizar perfil:', err);

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao atualizar perfil.'
        });
    }
});


// =====================================================
// FUNÇÃO PARA MENSAGEM AUTOMÁTICA DO SISTEMA
// =====================================================

async function adicionarMensagemSistema(servicoId, texto) {
    try {
        const result = await pool.query(
            `
            SELECT mensagens
            FROM servicos
            WHERE id = $1
            `,
            [servicoId]
        );

        if (!result.rows.length) {
            return;
        }

        let mensagens = result.rows[0].mensagens;

        if (!Array.isArray(mensagens)) {
            mensagens = [];
        }

        mensagens.push({
            remetente: 'Sistema',
            remetenteNome: 'Sistema',
            remetenteEmail: 'sistema',
            texto: texto,
            mensagem: texto,
            sistema: true,
            data: new Date().toISOString(),
            criado_em: new Date().toISOString()
        });

        await pool.query(
            `
            UPDATE servicos
            SET mensagens = $1::jsonb
            WHERE id = $2
            `,
            [
                JSON.stringify(mensagens),
                servicoId
            ]
        );

    } catch (err) {
        console.error(
            'Erro ao adicionar mensagem automática:',
            err
        );
    }
}


// =====================================================
// LISTAR TODOS OS SERVIÇOS
// =====================================================

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

        const servicos = result.rows.map(s => ({
            ...s,

            empresaEmail:
                s.empresa_email,

            empresaNome:
                s.empresa_nome_resolvido ||
                s.empresa_nome ||
                '',

            empresaWhatsapp:
                s.empresa_whatsapp || '',

            dataHorario:
                s.data_horario,

            formaPagamento:
                s.forma_pgto,

            forma_pagamento:
                s.forma_pgto,

            prestadorEmail:
                s.prestador_email,

            prestadorNome:
                s.prestador_nome,

            prestadorWhatsapp:
                s.prestador_whatsapp,

            prestadorPix:
                s.prestador_pix,

            dataAceite:
                s.data_aceite,

            presencaConfirmada:
                !!s.presenca_confirmada,

            selfieConfirmacao:
                s.selfie_confirmacao || null,

            documentoComprovante:
                s.documento_comprovante || null,

            statusCheckin:
                s.status_checkin,

            checkinHora:
                s.checkin_hora,

            checkoutHora:
                s.checkout_hora,

            fotoCheckin:
                s.foto_checkin ||
                s.foto_ponto ||
                null,

            fotoCheckout:
                s.foto_checkout ||
                null,

            checkinGps:
                s.checkin_gps || null,

            checkoutGps:
                s.checkout_gps || null,

            intervaloInicio:
                s.intervalo_inicio || null,

            intervaloRetorno:
                s.intervalo_retorno || null,

            totalHoras:
                s.total_horas || null,

            validadoEmpresa:
                !!s.validado_empresa,

            validadoEm:
                s.validado_em || null,

            nota_fiscal_oficial:
                s.nota_oficial || null,

            nota_fiscal_remetente:
                s.nota_remetente || null,

            nota_nome:
                s.nota_nome || null,

            nota_tipo:
                s.nota_tipo || null,

            comprovantePagamentoArquivo:
                s.comprovante_pagamento_arquivo ||
                null,

            comprovantePagamentoNome:
                s.comprovante_pagamento_nome ||
                null,

            comprovantePagamentoTipo:
                s.comprovante_pagamento_tipo ||
                null,

            pagamentoRecebidoConfirmado:
                !!s.pagamento_recebido_confirmado,

            pagamentoRecebidoEm:
                s.pagamento_recebido_em || null,

            contratoEmpresaArquivo:
                s.contrato_empresa_arquivo ||
                null,

            contratoEmpresaNome:
                s.contrato_empresa_nome ||
                null,

            contratoEmpresaTipo:
                s.contrato_empresa_tipo ||
                null,

            reservas:
                Array.isArray(s.reservas)
                    ? s.reservas
                    : [],

            mensagens:
                Array.isArray(s.mensagens)
                    ? s.mensagens
                    : []
        }));

        return res.json(servicos);

    } catch (err) {
        console.error(
            'Erro ao buscar serviços:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao buscar serviços.'
        });
    }
});


// =====================================================
// BUSCAR UM SERVIÇO
// =====================================================

app.get('/api/servicos/:id', async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query(
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

        return res.json({
            sucesso: true,
            servico: result.rows[0]
        });

    } catch (err) {
        console.error(
            'Erro ao buscar serviço:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao buscar serviço.'
        });
    }
});


// =====================================================
// PUBLICAR NOVO SERVIÇO
// =====================================================

app.post('/api/servicos', async (req, res) => {
    const s = req.body;

    try {
        const valorUnitario =
            parseFloat(
                String(
                    s.valor || 0
                )
                    .replace(/\./g, '')
                    .replace(',', '.')
            ) || 0;

        const tipoRecorrencia =
            s.recorrencia ||
            'unico';

        let valorTotalGarantia =
            valorUnitario;

        if (
            tipoRecorrencia ===
            'semanal'
        ) {
            valorTotalGarantia =
                valorUnitario * 4;
        }

        if (
            tipoRecorrencia ===
            'quinzenal'
        ) {
            valorTotalGarantia =
                valorUnitario * 2;
        }

        if (
            tipoRecorrencia ===
            'mensal'
        ) {
            valorTotalGarantia =
                valorUnitario;
        }

        const taxaPlataforma =
            valorTotalGarantia * 0.10;

        const valorLiquido =
            valorTotalGarantia -
            taxaPlataforma;

        const result =
            await pool.query(
                `
                INSERT INTO servicos
                (
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
                    status,
                    reservas,
                    mensagens,
                    presenca_confirmada,
                    status_checkin,
                    validado_empresa
                )

                VALUES
                (
                    $1,$2,$3,$4,$5,
                    $6,$7,$8,$9,$10,
                    $11,$12,$13,$14,$15,
                    $16,'ativo',
                    '[]'::jsonb,
                    '[]'::jsonb,
                    FALSE,
                    'pendente',
                    FALSE
                )

                RETURNING *
                `,
                [
                    s.titulo,
                    s.categoria || 'Geral',
                    s.local || '',
                    s.endereco || '',
                    String(s.valor || valorUnitario),
                    valorUnitario,
                    valorLiquido,
                    s.dataHorario ||
                        s.data_horario ||
                        'A combinar',
                    s.formaPgto ||
                        s.forma_pgto ||
                        'Pix',
                    s.descricao || '',
                    s.contratoTexto ||
                        s.contrato_texto ||
                        '',
                    s.empresaEmail ||
                        s.empresa_email ||
                        '',
                    s.empresaWhatsapp ||
                        s.empresa_whatsapp ||
                        '',
                    tipoRecorrencia,
                    valorTotalGarantia,
                    s.empresaNome ||
                        s.empresa_nome ||
                        ''
                ]
            );

        const servico =
            result.rows[0];

        await registrarLedger(
            servico.id,
            servico.empresa_email,
            'RETENCAO_GARANTIA',
            valorTotalGarantia
        );

        await registrarAuditoria(
            servico.empresa_email,
            'PUBLICAR_SERVICO',
            `Serviço #${servico.id} publicado.`
        );

        io.emit(
            'atualizar_servicos'
        );

        return res.json({
            sucesso: true,
            id: servico.id,
            servico: servico
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


// =====================================================
// ENTRAR NA FILA
//
// REGRA:
// SEM TITULAR = ATÉ 3 NA FILA
// COM TITULAR = ATÉ 2 RESERVAS
// =====================================================

app.post('/api/servicos/:id/fila', async (req, res) => {
    const id = req.params.id;

    const {
        prestadorEmail,
        prestadorNome,
        prestadorWhatsapp,
        prestadorPix,
        rgCnh
    } = req.body;

    const client =
        await pool.connect();

    try {
        await client.query('BEGIN');

        const result =
            await client.query(
                `
                SELECT *
                FROM servicos
                WHERE id = $1
                FOR UPDATE
                `,
                [id]
            );

        if (!result.rows.length) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico =
            result.rows[0];

        const status =
            String(
                servico.status || ''
            ).toLowerCase();

        const encerrados = [
            'concluido',
            'concluido_com_sucesso',
            'aguardando_validacao',
            'validado',
            'aprovado',
            'pago',
            'cancelado',
            'cancelado_ausencia_prestador'
        ];

        if (
            servico.checkout_hora ||
            servico.validado_empresa ||
            encerrados.includes(status)
        ) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(409).json({
                sucesso: false,
                erro:
                    'Esta vaga já foi encerrada. Novos candidatos não podem entrar.'
            });
        }

        const email =
            String(
                prestadorEmail || ''
            )
                .trim()
                .toLowerCase();

        if (!email) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(400).json({
                sucesso: false,
                erro:
                    'E-mail do prestador não informado.'
            });
        }

        if (
            String(
                servico.empresa_email || ''
            )
                .trim()
                .toLowerCase()
            === email
        ) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(400).json({
                sucesso: false,
                erro:
                    'A empresa não pode entrar na própria vaga.'
            });
        }

        if (
            String(
                servico.prestador_email || ''
            )
                .trim()
                .toLowerCase()
            === email
        ) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Você já é o titular desta vaga.'
            });
        }

        let fila =
            Array.isArray(
                servico.reservas
            )
                ? servico.reservas
                : [];

        if (
            fila.some(
                pessoa =>
                    String(
                        pessoa.email || ''
                    )
                        .trim()
                        .toLowerCase()
                    === email
            )
        ) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Você já está na fila desta vaga.'
            });
        }

        const temTitular =
            !!servico.prestador_email;

        const limite =
            temTitular
                ? 2
                : 3;

        if (
            fila.length >= limite
        ) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(409).json({
                sucesso: false,
                erro:
                    temTitular
                        ? 'As 2 vagas de Reserva de Emergência já foram preenchidas.'
                        : 'A fila desta vaga já possui 3 candidatos.'
            });
        }

        const candidato = {
            email:
                prestadorEmail,

            nome:
                prestadorNome || '',

            whatsapp:
                prestadorWhatsapp || '',

            pix:
                prestadorPix || '',

            rgCnh:
                rgCnh || '',

            entrouEm:
                new Date().toISOString()
        };

        fila.push(
            candidato
        );

        await client.query(
            `
            UPDATE servicos
            SET reservas = $1::jsonb
            WHERE id = $2
            `,
            [
                JSON.stringify(fila),
                id
            ]
        );

        await client.query(
            'COMMIT'
        );

        await registrarAuditoria(
            prestadorEmail,
            temTitular
                ? 'ENTRAR_RESERVA'
                : 'ENTRAR_FILA',
            `Prestador entrou no serviço #${id}, posição ${fila.length}.`
        );

        io.emit(
            'atualizar_servicos'
        );

        return res.json({
            sucesso: true,

            mensagem:
                temTitular
                    ? `Você entrou como Reserva de Emergência ${fila.length}.`
                    : `Você entrou na fila na posição ${fila.length}.`,

            posicao:
                fila.length,

            tipoEntrada:
                temTitular
                    ? 'reserva'
                    : 'fila',

            reservas:
                fila
        });

    } catch (err) {
        try {
            await client.query(
                'ROLLBACK'
            );
        } catch (_) {}

        console.error(
            'Erro ao entrar na fila:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                'Erro ao entrar na fila: ' +
                err.message
        });

    } finally {
        client.release();
    }
});


// =====================================================
// ACEITAR SERVIÇO PELA FILA
//
// SOMENTE O PRIMEIRO DA FILA PODE VIRAR TITULAR
// =====================================================

app.post('/api/servicos/:id/aceitar', async (req, res) => {
    const id =
        req.params.id;

    const {
        prestadorEmail,
        prestadorNome,
        prestadorPix,
        prestadorWhatsapp
    } = req.body;

    const client =
        await pool.connect();

    try {
        await client.query(
            'BEGIN'
        );

        const result =
            await client.query(
                `
                SELECT *
                FROM servicos
                WHERE id = $1
                FOR UPDATE
                `,
                [id]
            );

        if (!result.rows.length) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico =
            result.rows[0];

        if (
            servico.prestador_email
        ) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(409).json({
                sucesso: false,
                erro:
                    'Esta vaga já possui um titular.'
            });
        }

        const fila =
            Array.isArray(
                servico.reservas
            )
                ? servico.reservas
                : [];

        const email =
            String(
                prestadorEmail || ''
            )
                .trim()
                .toLowerCase();

        const indice =
            fila.findIndex(
                pessoa =>
                    String(
                        pessoa.email || ''
                    )
                        .trim()
                        .toLowerCase()
                    === email
            );

        if (
            indice === -1
        ) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(403).json({
                sucesso: false,
                erro:
                    'Você não está na fila desta vaga.'
            });
        }

        if (
            indice !== 0
        ) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(403).json({
                sucesso: false,

                erro:
                    `Você está na posição ${indice + 1}. Apenas o primeiro da fila pode assumir a vaga.`,

                posicao:
                    indice + 1
            });
        }

        const dadosFila =
            fila[indice];

        const novaFila =
            fila.filter(
                (_, index) =>
                    index !== indice
            );

        const usuario =
            await client.query(
                `
                SELECT id
                FROM usuarios
                WHERE LOWER(email) =
                    LOWER($1)
                LIMIT 1
                `,
                [prestadorEmail]
            );

        const prestadorId =
            usuario.rows[0]?.id ||
            null;

        const aceite =
            await client.query(
                `
                UPDATE servicos

                SET
                    status =
                        'em_andamento',

                    prestador_email =
                        $1,

                    prestador_id =
                        $2,

                    prestador_nome =
                        $3,

                    prestador_pix =
                        $4,

                    prestador_whatsapp =
                        $5,

                    reservas =
                        $6::jsonb,

                    data_aceite =
                        CURRENT_TIMESTAMP,

                    presenca_confirmada =
                        FALSE,

                    selfie_confirmacao =
                        NULL,

                    status_checkin =
                        'pendente'

                WHERE id =
                    $7

                RETURNING *
                `,
                [
                    prestadorEmail,
                    prestadorId,

                    prestadorNome ||
                        dadosFila.nome ||
                        '',

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

        await client.query(
            'COMMIT'
        );

        await adicionarMensagemSistema(
            id,
            `${prestadorNome || dadosFila.nome || prestadorEmail} assumiu a vaga como Titular.`
        );

        await registrarAuditoria(
            prestadorEmail,
            'ACEITAR_SERVICO',
            `Prestador assumiu como titular do serviço #${id}.`
        );

        io.emit(
            'atualizar_servicos'
        );

        return res.json({
            sucesso: true,

            mensagem:
                'Você agora é o Titular desta vaga!',

            data_aceite:
                aceite.rows[0]
                    ?.data_aceite ||
                null,

            servico:
                aceite.rows[0],

            fila_restante:
                novaFila
        });

    } catch (err) {
        try {
            await client.query(
                'ROLLBACK'
            );
        } catch (_) {}

        console.error(
            'Erro ao aceitar serviço:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                'Erro ao aceitar serviço: ' +
                err.message
        });

    } finally {
        client.release();
    }
});


// =====================================================
// CONFIRMAR PRESENÇA DO TITULAR
//
// ESSA É A ROTA QUE CORRIGE O ERRO:
// "Erro de conexão ao confirmar presença."
//
// O INDEX PODE ENVIAR:
// selfie
// selfie_confirmacao
// documentoComprovante
// documento_comprovante
// prestadorEmail
// =====================================================

app.post(
    '/api/servicos/:id/confirmar-presenca',
    async (req, res) => {

        const id =
            req.params.id;

        const selfie =
            req.body.selfie ||
            req.body.selfie_confirmacao ||
            null;

        const documentoComprovante =
            req.body.documentoComprovante ||
            req.body.documento_comprovante ||
            null;

        const prestadorEmail =
            req.body.prestadorEmail ||
            req.body.prestador_email ||
            '';

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
                !servico.prestador_email
            ) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Esta vaga ainda não possui um Titular.'
                });
            }

            if (
                prestadorEmail &&
                String(
                    servico.prestador_email
                )
                    .trim()
                    .toLowerCase()
                !==
                String(
                    prestadorEmail
                )
                    .trim()
                    .toLowerCase()
            ) {
                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Somente o Titular desta vaga pode confirmar presença.'
                });
            }

            if (
                servico.presenca_confirmada
            ) {
                return res.json({
                    sucesso: true,
                    mensagem:
                        'Sua presença já está confirmada.',
                    presenca_confirmada:
                        true
                });
            }

            if (!selfie) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A selfie de confirmação é obrigatória.'
                });
            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    selfie_confirmacao =
                        $1,

                    documento_comprovante =
                        COALESCE(
                            $2,
                            documento_comprovante
                        ),

                    presenca_confirmada =
                        TRUE

                WHERE id =
                    $3
                `,
                [
                    selfie,
                    documentoComprovante,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `${servico.prestador_nome || 'O prestador'} confirmou presença como Titular.`
            );

            await registrarAuditoria(
                prestadorEmail ||
                    servico.prestador_email,

                'CONFIRMAR_PRESENCA',

                `Presença confirmada para o serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Presença confirmada como Titular com sucesso!',

                presenca_confirmada:
                    true
            });

        } catch (err) {
            console.error(
                'Erro ao confirmar presença:',
                err
            );

            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro interno ao confirmar presença.',

                detalhes:
                    err.message
            });
        }
    }
);
app.post(
    '/api/servicos/:id/confirmar-recebimento',
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
                    erro: 'Serviço não encontrado.'
                });
            }

            const servico =
                result.rows[0];

            if (
                !servico
                    .comprovante_pagamento_arquivo
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'A empresa ainda não enviou o comprovante de pagamento.'
                });
            }

            if (
                servico
                    .pagamento_recebido_confirmado
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro: 'O recebimento deste pagamento já foi confirmado.'
                });
            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    pagamento_recebido_confirmado = TRUE,

                    pagamento_recebido_em =
                        CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [id]
            );

            await adicionarMensagemSistema(
                id,
                `${req.body.prestadorNome || servico.prestador_nome || 'O prestador'} confirmou o recebimento do pagamento.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'CONFIRMAR_RECEBIMENTO_PAGAMENTO',

                `Prestador confirmou recebimento do pagamento do serviço #${id}`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem: 'Recebimento confirmado com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro ao confirmar recebimento:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro: 'Erro ao confirmar recebimento.'
            });
        }
    }
);


// =====================================================
// EMPRESA ENVIA CONTRATO EM PDF/IMAGEM
// =====================================================

app.post(
    '/api/servicos/:id/contrato-empresa',

    upload.single(
        'contratoEmpresa'
    ),

    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const dadosArquivo =
                (
                    arquivo
                        ? `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        : null
                )
                ||
                req.body.contratoEmpresa
                ||
                req.body.contrato_empresa_arquivo
                ||
                null;

            if (!dadosArquivo) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'Nenhum contrato foi enviado.'
                });
            }

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

            const nomeArquivo =
                arquivo?.originalname
                ||
                req.body.contratoNome
                ||
                'contrato-empresa';

            const tipoArquivo =
                arquivo?.mimetype
                ||
                req.body.contratoTipo
                ||
                'arquivo';

            await pool.query(
                `
                UPDATE servicos

                SET
                    contrato_empresa_arquivo = $1,

                    contrato_empresa_nome = $2,

                    contrato_empresa_tipo = $3,

                    contrato_empresa_enviado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $4
                `,
                [
                    dadosArquivo,
                    nomeArquivo,
                    tipoArquivo,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `A empresa anexou o contrato "${nomeArquivo}" ao serviço.`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'ENVIO_CONTRATO_EMPRESA',

                `Contrato da empresa enviado no serviço #${id}`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem: 'Contrato enviado ao prestador com sucesso!',
                contrato_nome: nomeArquivo
            });

        } catch (err) {

            console.error(
                'Erro ao enviar contrato da empresa:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar contrato da empresa: '
                    +
                    err.message
            });
        }
    }
);


// =====================================================
// CHAT DO SERVIÇO
// =====================================================

app.post(
    '/api/servicos/:id/chat',
    async (req, res) => {

        const id =
            req.params.id;

        const {
            remetente,
            texto
        } =
            req.body;

        if (
            !texto ||
            !String(texto).trim()
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: 'Digite uma mensagem.'
            });
        }

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

            if (
                result.rows.length ===
                0
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });
            }

            let mensagens =
                result.rows[0].mensagens;

            if (
                !Array.isArray(
                    mensagens
                )
            ) {

                mensagens = [];
            }

            mensagens.push({

                remetente:
                    remetente || 'Usuário',

                texto:
                    String(texto).trim(),

                data:
                    new Date().toISOString()
            });

            await pool.query(
                `
                UPDATE servicos

                SET mensagens =
                    $1::jsonb

                WHERE id =
                    $2
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

            io.emit(
                'nova_mensagem',
                {
                    servicoId:
                        id
                }
            );

            return res.json({
                sucesso: true,
                mensagens: mensagens
            });

        } catch (err) {

            console.error(
                'Erro no chat:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro: 'Erro ao enviar mensagem.'
            });
        }
    }
);


// =====================================================
// EMPRESA VALIDA O SERVIÇO FINALIZADO
// =====================================================

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
                    erro: 'Serviço não encontrado.'
                });
            }

            const servico =
                result.rows[0];

            if (
                !servico.checkout_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'O prestador ainda não realizou o check-out.'
                });
            }

            if (
                servico.validado_empresa
            ) {

                return res.json({
                    sucesso: true,
                    mensagem: 'Este serviço já foi validado.',
                    validado_empresa: true
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
                        'validado'

                WHERE id = $1
                `,
                [id]
            );

            await adicionarMensagemSistema(
                id,
                'A empresa validou o serviço. Pagamento liberado para processamento.'
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                req.body.empresaEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'VALIDAR_SERVICO',

                `Serviço #${id} validado pela empresa.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem: 'Serviço validado pela empresa. Pronto para pagamento.',
                validado_empresa: true
            });

        } catch (err) {

            console.error(
                'Erro ao validar serviço:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro: 'Erro ao validar serviço.'
            });
        }
    }
);


// =====================================================
// APROVAR PAGAMENTO
// =====================================================

app.post(
    '/api/servicos/:id/aprovar',
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const servicoRes =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                servicoRes.rows.length ===
                0
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });
            }

            const servico =
                servicoRes.rows[0];

            if (
                !servico.validado_empresa
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'A empresa precisa validar o serviço antes da aprovação.'
                });
            }

            await pool.query(
                `
                UPDATE servicos

                SET status =
                    'aprovado'

                WHERE id =
                    $1
                `,
                [id]
            );

            await registrarLedger(
                id,
                servico.prestador_email,
                'REPASSE_PRESTADOR',
                servico.valor_liquido
            );

            const taxa =
                Number(
                    servico.valor_diaria ||
                    0
                )
                -
                Number(
                    servico.valor_liquido ||
                    0
                );

            if (
                taxa > 0
            ) {

                await registrarLedger(
                    id,
                    'admin@grupors.com',
                    'TAXA_PLATAFORMA',
                    taxa
                );
            }

            await registrarAuditoria(
                servico.empresa_email ||
                'empresa',

                'APROVAR_PAGAMENTO',

                `Pagamento do serviço #${id} aprovado.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem: 'Pagamento aprovado com sucesso.'
            });

        } catch (err) {

            console.error(
                'Erro ao aprovar pagamento:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro: 'Erro ao aprovar serviço.'
            });
        }
    }
);


// =====================================================
// PROMOVER RESERVA PARA TITULAR
//
// ESSA ROTA É A QUE O INDEX.HTML CHAMA:
// POST /api/servicos/:id/promover
//
// BODY:
// {
//     emailReserva: "email@prestador.com"
// }
// =====================================================

app.post(
    '/api/servicos/:id/promover',
    async (req, res) => {

        const id =
            req.params.id;

        const emailReserva =
            String(
                req.body.emailReserva
                ||
                req.body.prestadorEmail
                ||
                ''
            )
                .trim()
                .toLowerCase();

        if (!emailReserva) {

            return res.status(400).json({
                sucesso: false,
                erro: 'E-mail do profissional reserva não informado.'
            });
        }

        const client =
            await pool.connect();

        try {

            await client.query(
                'BEGIN'
            );

            const resultado =
                await client.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                await client.query(
                    'ROLLBACK'
                );

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });
            }

            const servico =
                resultado.rows[0];

            let fila =
                Array.isArray(
                    servico.reservas
                )
                    ? servico.reservas
                    : [];

            const indiceReserva =
                fila.findIndex(
                    pessoa =>
                        String(
                            pessoa.email || ''
                        )
                            .trim()
                            .toLowerCase()
                        ===
                        emailReserva
                );

            if (
                indiceReserva ===
                -1
            ) {

                await client.query(
                    'ROLLBACK'
                );

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Este profissional não está mais na fila de reserva.'
                });
            }

            const novoTitular =
                fila[indiceReserva];

            const titularAnterior =
                servico.prestador_email
                    ? {
                        email:
                            servico.prestador_email,

                        nome:
                            servico.prestador_nome,

                        whatsapp:
                            servico.prestador_whatsapp,

                        pix:
                            servico.prestador_pix
                    }
                    : null;

            fila =
                fila.filter(
                    (_, index) =>
                        index !==
                        indiceReserva
                );

            const usuario =
                await client.query(
                    `
                    SELECT id
                    FROM usuarios
                    WHERE LOWER(email) =
                        LOWER($1)
                    LIMIT 1
                    `,
                    [
                        novoTitular.email
                    ]
                );

            const novoPrestadorId =
                usuario.rows[0]?.id ||
                null;

            await client.query(
                `
                UPDATE servicos

                SET
                    prestador_email =
                        $1,

                    prestador_id =
                        $2,

                    prestador_nome =
                        $3,

                    prestador_pix =
                        $4,

                    prestador_whatsapp =
                        $5,

                    reservas =
                        $6::jsonb,

                    data_aceite =
                        CURRENT_TIMESTAMP,

                    presenca_confirmada =
                        FALSE,

                    selfie_confirmacao =
                        NULL,

                    status_checkin =
                        'pendente',

                    checkin_hora =
                        NULL,

                    checkout_hora =
                        NULL,

                    foto_ponto =
                        NULL,

                    foto_checkin =
                        NULL,

                    foto_checkout =
                        NULL,

                    checkin_gps =
                        NULL,

                    checkout_gps =
                        NULL,

                    intervalo_inicio =
                        NULL,

                    intervalo_retorno =
                        NULL,

                    total_horas =
                        NULL,

                    validado_empresa =
                        FALSE,

                    validado_em =
                        NULL,

                    comprovante_pagamento =
                        FALSE,

                    comprovante_pagamento_arquivo =
                        NULL,

                    comprovante_pagamento_nome =
                        NULL,

                    comprovante_pagamento_tipo =
                        NULL,

                    comprovante_pagamento_enviado_em =
                        NULL,

                    pagamento_recebido_confirmado =
                        FALSE,

                    pagamento_recebido_em =
                        NULL,

                    status =
                        'em_andamento'

                WHERE id =
                    $7
                `,
                [
                    novoTitular.email,

                    novoPrestadorId,

                    novoTitular.nome ||
                        '',

                    novoTitular.pix ||
                        '',

                    novoTitular.whatsapp ||
                        '',

                    JSON.stringify(
                        fila
                    ),

                    id
                ]
            );

            await client.query(
                'COMMIT'
            );

            await adicionarMensagemSistema(
                id,
                `${novoTitular.nome || novoTitular.email} foi promovido de Reserva de Emergência para Titular da vaga.`
            );

            await registrarAuditoria(
                req.body.empresaEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'PROMOVER_RESERVA_TITULAR',

                titularAnterior
                    ?
                    `${novoTitular.nome || novoTitular.email} substituiu ${titularAnterior.nome || titularAnterior.email} como titular do serviço #${id}.`
                    :
                    `${novoTitular.nome || novoTitular.email} foi promovido para titular do serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    `${novoTitular.nome || novoTitular.email} agora é o Titular da vaga.`,

                novoTitular: {
                    email:
                        novoTitular.email,

                    nome:
                        novoTitular.nome ||
                        '',

                    whatsapp:
                        novoTitular.whatsapp ||
                        '',

                    pix:
                        novoTitular.pix ||
                        ''
                },

                titularAnterior:
                    titularAnterior,

                reservasRestantes:
                    fila
            });

        } catch (err) {

            try {

                await client.query(
                    'ROLLBACK'
                );

            } catch (_) {}

            console.error(
                'Erro ao promover reserva para titular:',
                err
            );

            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro interno ao processar substituição.',

                detalhes:
                    err.message
            });

        } finally {

            client.release();

        }
    }
);


// =====================================================
// EXCLUIR SERVIÇO
// =====================================================

app.delete(
    '/api/servicos/:id',
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const result =
                await pool.query(
                    `
                    DELETE FROM servicos
                    WHERE id = $1
                    RETURNING id
                    `,
                    [id]
                );

            if (
                !result.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });
            }

            await registrarAuditoria(
                req.body?.usuarioEmail ||
                'sistema',

                'DELETAR_SERVICO',

                `Serviço #${id} foi removido.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem: 'Serviço removido com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro ao excluir serviço:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro: 'Erro ao excluir serviço.'
            });
        }
    }
);
// =====================================================
// SOCKET.IO
// =====================================================

io.on(
    'connection',
    (socket) => {

        console.log(
            'Novo cliente conectado via WebSocket:',
            socket.id
        );

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


// =====================================================
// ROTA PRINCIPAL
// =====================================================

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


// =====================================================
// ROTA DE TESTE DO SERVIDOR
// =====================================================

app.get(
    '/api/status',
    async (req, res) => {

        try {

            await pool.query(
                'SELECT 1'
            );

            return res.json({
                sucesso: true,
                servidor: 'online',
                banco: 'conectado',
                sistema: 'RS Connect'
            });

        } catch (err) {

            console.error(
                'Erro no teste de status:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                servidor: 'online',
                banco: 'erro',
                erro: err.message
            });

        }

    }
);


// =====================================================
// ROTA 404 PARA API
// =====================================================

app.use(
    '/api',
    (req, res) => {

        return res.status(404).json({
            sucesso: false,
            erro: 'Rota da API não encontrada.',
            rota: req.originalUrl
        });

    }
);


// =====================================================
// TRATAMENTO DE ERROS
// =====================================================

app.use(
    (err, req, res, next) => {

        console.error(
            'Erro não tratado no servidor:',
            err
        );

        if (
            err instanceof multer.MulterError
        ) {

            if (
                err.code === 'LIMIT_FILE_SIZE'
            ) {

                return res.status(413).json({
                    sucesso: false,
                    erro: 'O arquivo enviado é muito grande. Limite máximo: 50 MB.'
                });

            }

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Erro no upload do arquivo: ' +
                    err.message
            });

        }

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro interno do servidor.'
        });

    }
);


// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT =
    process.env.PORT ||
    10000;

server.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            '=========================================='
        );

        console.log(
            'RS CONNECT - SERVIDOR ONLINE'
        );

        console.log(
            `Porta: ${PORT}`
        );

        console.log(
            `Ambiente: ${process.env.NODE_ENV || 'production'}`
        );

        console.log(
            '=========================================='
        );

    }
);
