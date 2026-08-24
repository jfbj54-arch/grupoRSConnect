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

app.use(
    express.json({
        limit: '50mb'
    })
);

app.use(
    express.urlencoded({
        limit: '50mb',
        extended: true
    })
);

app.use(
    express.static(
        path.join(__dirname)
    )
);


// =====================================================
// POSTGRESQL
// =====================================================

const pool = new Pool({
    connectionString:
        process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    }
});


pool.connect(
    (
        err,
        client,
        release
    ) => {

        if (err) {

            console.error(
                'Erro ao conectar ao PostgreSQL:',
                err.stack
            );

            return;
        }

        console.log(
            'Conectado com sucesso ao PostgreSQL.'
        );

        release();

        criarTabelas();

    }
);


// =====================================================
// CRIAR / ATUALIZAR TABELAS
// =====================================================

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

                valor_diaria
                    NUMERIC(10,2)
                    DEFAULT 0,

                valor_liquido
                    NUMERIC(10,2)
                    DEFAULT 0,

                data_horario TEXT,

                forma_pgto TEXT,

                descricao TEXT,

                contrato_texto TEXT,

                empresa_email TEXT,

                empresa_whatsapp TEXT,

                empresa_nome TEXT,

                recorrencia TEXT
                    DEFAULT 'unico',

                valor_total
                    NUMERIC(10,2)
                    DEFAULT 0,

                status TEXT
                    DEFAULT 'ativo',

                motivo_cancelamento TEXT,


                prestador_email TEXT,

                prestador_id INTEGER,

                prestador_nome TEXT,

                prestador_pix TEXT,

                prestador_whatsapp TEXT,

                data_aceite TIMESTAMPTZ,


                reservas JSONB
                    DEFAULT '[]'::jsonb,

                mensagens JSONB
                    DEFAULT '[]'::jsonb,


                selfie_confirmacao TEXT,

                documento_comprovante TEXT,

                presenca_confirmada BOOLEAN
                    DEFAULT FALSE,


                status_checkin TEXT
                    DEFAULT 'pendente',

                checkin_hora TEXT,

                checkout_hora TEXT,

                foto_ponto TEXT,

                foto_checkin TEXT,

                foto_checkout TEXT,

                checkin_gps TEXT,

                checkout_gps TEXT,

                intervalo_inicio TEXT,

                intervalo_retorno TEXT,

                total_horas TEXT,


                validado_empresa BOOLEAN
                    DEFAULT FALSE,

                validado_em TIMESTAMP,


                nota_oficial TEXT,

                nota_nome TEXT,

                nota_tipo TEXT,

                nota_remetente TEXT,

                nota_enviada_em TIMESTAMP,


                comprovante_pagamento BOOLEAN
                    DEFAULT FALSE,

                comprovante_pagamento_arquivo TEXT,

                comprovante_pagamento_nome TEXT,

                comprovante_pagamento_tipo TEXT,

                comprovante_pagamento_enviado_em TIMESTAMP,


                pagamento_recebido_confirmado BOOLEAN
                    DEFAULT FALSE,

                pagamento_recebido_em TIMESTAMP,


                contrato_empresa_arquivo TEXT,

                contrato_empresa_nome TEXT,

                contrato_empresa_tipo TEXT,

                contrato_empresa_enviado_em TIMESTAMP,


                pagamento_autorizado BOOLEAN
                    DEFAULT FALSE,

                autorizacao_pagamento_arquivo TEXT,

                autorizacao_pagamento_nome TEXT,

                autorizacao_pagamento_em TIMESTAMP,

                autorizacao_pagamento_por TEXT
            );


            CREATE TABLE IF NOT EXISTS ledger_transacoes (
                id SERIAL PRIMARY KEY,

                servico_id INTEGER,

                usuario_email TEXT,

                usuario_id INTEGER,

                tipo TEXT,

                tipo_movimento TEXT,

                valor NUMERIC(10,2)
                    NOT NULL,

                status TEXT
                    NOT NULL
                    DEFAULT 'PROCESSADO',

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS auditoria_sistema (
                id SERIAL PRIMARY KEY,

                usuario_email TEXT,

                acao TEXT NOT NULL,

                detalhes TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS recuperacao_senha (
                id SERIAL PRIMARY KEY,

                email TEXT NOT NULL,

                codigo_hash TEXT NOT NULL,

                expira_em TIMESTAMP NOT NULL,

                usado BOOLEAN
                    DEFAULT FALSE,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // =====================================================
        // GARANTE COLUNAS EM BANCOS ANTIGOS
        // =====================================================

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

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;",


            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_email TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_id INTEGER;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_pix TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_whatsapp TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS data_aceite TIMESTAMPTZ;",


            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS mensagens JSONB DEFAULT '[]'::jsonb;",


            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS documento_comprovante TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN DEFAULT FALSE;",


            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status_checkin TEXT DEFAULT 'pendente';",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_hora TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_hora TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_ponto TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkin TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkout TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_gps TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_gps TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_inicio TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_retorno TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS total_horas TEXT;",


            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_empresa BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP;",


            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_oficial TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_tipo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_remetente TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_enviada_em TIMESTAMP;",


            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_arquivo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_tipo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_enviado_em TIMESTAMP;",


            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_recebido_confirmado BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_recebido_em TIMESTAMP;",


            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_arquivo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_tipo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_enviado_em TIMESTAMP;",


            // =================================================
            // NOVO - AUTORIZAÇÃO DE PAGAMENTO
            // =================================================

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_autorizado BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS autorizacao_pagamento_arquivo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS autorizacao_pagamento_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS autorizacao_pagamento_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS autorizacao_pagamento_por TEXT;"
        ];


        for (
            const sql
            of colunasGarantir
        ) {

            try {

                await pool.query(
                    sql
                );

            } catch (err) {

                console.error(
                    'Erro verificando coluna:',
                    err.message
                );

            }

        }


        // =====================================================
        // SERVIÇOS ANTIGOS QUE JÁ TINHAM TITULAR
        //
        // Isso garante data_aceite persistente.
        // O contador do INDEX não volta mais para 30 minutos
        // quando a empresa fecha e abre o navegador.
        // =====================================================

        await pool.query(`
            UPDATE servicos

            SET data_aceite =
                CURRENT_TIMESTAMP

            WHERE prestador_email
                IS NOT NULL

            AND data_aceite
                IS NULL
        `);


        console.log(
            'Tabelas e colunas do RS Connect verificadas com sucesso.'
        );

    } catch (err) {

        console.error(
            'Erro ao preparar banco de dados:',
            err
        );

    }

}


// =====================================================
// LEDGER
// =====================================================

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
                Number(valor || 0)
            ]
        );

    } catch (err) {

        console.error(
            'Erro ao registrar ledger:',
            err
        );

    }

}


// =====================================================
// AUDITORIA
// =====================================================

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


// =====================================================
// MENSAGEM AUTOMÁTICA
// =====================================================

async function adicionarMensagemSistema(
    servicoId,
    texto
) {

    try {

        const resultado =
            await pool.query(
                `
                SELECT mensagens
                FROM servicos
                WHERE id = $1
                `,
                [servicoId]
            );

        if (
            !resultado.rows.length
        ) {
            return;
        }

        let mensagens =
            resultado.rows[0]
                .mensagens;

        if (
            !Array.isArray(
                mensagens
            )
        ) {

            mensagens = [];

        }

        mensagens.push({
            remetente:
                'SISTEMA',

            texto:
                texto,

            data:
                new Date()
                    .toISOString()
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
                servicoId
            ]
        );

    } catch (err) {

        console.error(
            'Erro ao adicionar mensagem do sistema:',
            err
        );

    }

}


// =====================================================
// RECUPERAÇÃO DE SENHA
// =====================================================

function hashCodigoRecuperacao(
    codigo
) {

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
            'RESEND_API_KEY não configurada.'
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
                            <div style="
                                font-family:Arial,sans-serif;
                                max-width:520px;
                                margin:auto;
                                padding:24px;
                            ">

                                <h2>
                                    RS Connect
                                </h2>

                                <p>
                                    Código para redefinição de senha:
                                </p>

                                <div style="
                                    font-size:32px;
                                    font-weight:bold;
                                    text-align:center;
                                    padding:20px;
                                    background:#eff6ff;
                                    border-radius:10px;
                                ">
                                    ${codigo}
                                </div>

                                <p>
                                    Este código expira em 15 minutos.
                                </p>

                            </div>
                        `
                    })
            }
        );


    const respostaTexto =
        await resposta.text();


    if (!resposta.ok) {

        throw new Error(
            respostaTexto
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

            const resultado =
                await pool.query(
                    `
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
                `Usuário ${d.tipo} cadastrado.`
            );


            return res.json({
                sucesso:
                    true,

                id:
                    resultado.rows[0].id
            });

        } catch (err) {

            console.error(
                'Erro no cadastro:',
                err
            );

            return res.json({
                sucesso:
                    false,

                erro:
                    'E-mail já cadastrado ou erro nos dados.'
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

            const resultado =
                await pool.query(
                    `
                    SELECT *

                    FROM usuarios

                    WHERE LOWER(email) =
                        LOWER($1)

                    AND senha =
                        $2

                    LIMIT 1
                    `,
                    [
                        email,
                        senha
                    ]
                );


            if (
                !resultado.rows.length
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


            return res.json({
                sucesso:
                    true,

                usuario:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                'Erro no login:',
                err
            );

            return res.status(500).json({
                sucesso:
                    false,

                erro:
                    'Erro no servidor.'
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

            return res.status(400).json({
                sucesso: false,
                erro: 'Informe o e-mail da conta.'
            });

        }

        try {

            const usuario =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        email

                    FROM usuarios

                    WHERE LOWER(email) = $1

                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );

            if (!usuario.rows.length) {

                return res.json({
                    sucesso: true,
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

                SET usado = TRUE

                WHERE LOWER(email) = $1

                AND usado = FALSE
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
                'Código de recuperação enviado.'
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Código enviado para seu e-mail. Ele expira em 15 minutos.'
            });

        } catch (err) {

            console.error(
                'Erro ao solicitar recuperação:',
                err
            );

            return res.status(500).json({
                sucesso: false,
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
            !email
            ||
            !codigo
            ||
            !novaSenha
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Preencha e-mail, código e nova senha.'
            });

        }


        if (
            novaSenha.length < 6
        ) {

            return res.status(400).json({
                sucesso: false,
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

                    WHERE LOWER(email) = $1

                    AND codigo_hash = $2

                    AND usado = FALSE

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


            if (!token.rows.length) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Código inválido ou expirado.'
                });

            }


            const usuario =
                await pool.query(
                    `
                    UPDATE usuarios

                    SET senha = $1

                    WHERE LOWER(email) = $2

                    RETURNING id
                    `,
                    [
                        novaSenha,
                        email
                    ]
                );


            if (!usuario.rows.length) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Conta não encontrada.'
                });

            }


            await pool.query(
                `
                UPDATE recuperacao_senha

                SET usado = TRUE

                WHERE id = $1
                `,
                [
                    token.rows[0].id
                ]
            );


            await registrarAuditoria(
                email,
                'REDEFINIR_SENHA',
                'Senha redefinida com sucesso.'
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Senha redefinida com sucesso.'
            });

        } catch (err) {

            console.error(
                'Erro ao redefinir senha:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro interno ao redefinir a senha.'
            });

        }

    }
);


// =====================================================
// LISTAR SERVIÇOS
// =====================================================

app.get(
    '/api/servicos',
    async (req, res) => {

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT
                        s.*,

                        COALESCE(
                            NULLIF(
                                s.empresa_nome,
                                ''
                            ),
                            u.nome
                        ) AS empresa_nome_resolvido

                    FROM servicos s

                    LEFT JOIN usuarios u
                        ON LOWER(u.email)
                        =
                        LOWER(s.empresa_email)

                    ORDER BY s.id DESC
                    `
                );


            const servicos =
                resultado.rows.map(
                    s => ({
                        ...s,

                        empresaEmail:
                            s.empresa_email,

                        empresaNome:
                            s.empresa_nome_resolvido
                            ||
                            s.empresa_nome
                            ||
                            '',

                        empresaWhatsapp:
                            s.empresa_whatsapp
                            ||
                            '',

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
                            s.selfie_confirmacao
                            ||
                            null,

                        checkinHora:
                            s.checkin_hora,

                        checkoutHora:
                            s.checkout_hora,

                        fotoCheckin:
                            s.foto_checkin
                            ||
                            s.foto_ponto
                            ||
                            null,

                        fotoCheckout:
                            s.foto_checkout
                            ||
                            null,

                        checkinGps:
                            s.checkin_gps
                            ||
                            null,

                        checkoutGps:
                            s.checkout_gps
                            ||
                            null,

                        intervaloInicio:
                            s.intervalo_inicio
                            ||
                            null,

                        intervaloRetorno:
                            s.intervalo_retorno
                            ||
                            null,

                        totalHoras:
                            s.total_horas
                            ||
                            null,

                        validadoEmpresa:
                            !!s.validado_empresa,

                        pagamentoAutorizado:
                            !!s.pagamento_autorizado,

                        autorizacaoPagamentoArquivo:
                            s.autorizacao_pagamento_arquivo
                            ||
                            null,

                        autorizacaoPagamentoNome:
                            s.autorizacao_pagamento_nome
                            ||
                            null,

                        autorizacaoPagamentoEm:
                            s.autorizacao_pagamento_em
                            ||
                            null,

                        autorizacaoPagamentoPor:
                            s.autorizacao_pagamento_por
                            ||
                            null,

                        comprovantePagamentoArquivo:
                            s.comprovante_pagamento_arquivo
                            ||
                            null,

                        comprovantePagamentoNome:
                            s.comprovante_pagamento_nome
                            ||
                            null,

                        pagamentoRecebidoConfirmado:
                            !!s.pagamento_recebido_confirmado,

                        contratoEmpresaArquivo:
                            s.contrato_empresa_arquivo
                            ||
                            null,

                        reservas:
                            Array.isArray(
                                s.reservas
                            )
                                ?
                                s.reservas
                                :
                                [],

                        mensagens:
                            Array.isArray(
                                s.mensagens
                            )
                                ?
                                s.mensagens
                                :
                                []
                    })
                );


            return res.json(
                servicos
            );

        } catch (err) {

            console.error(
                'Erro ao listar serviços:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao buscar serviços.'
            });

        }

    }
);


// =====================================================
// BUSCAR SERVIÇO POR ID
// =====================================================

app.get(
    '/api/servicos/:id',
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [
                        id
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }


            return res.json({
                sucesso: true,
                servico:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                'Erro ao buscar serviço:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao buscar serviço.'
            });

        }

    }
);


// =====================================================
// PUBLICAR SERVIÇO
// =====================================================

app.post(
    '/api/servicos',
    async (req, res) => {

        const s =
            req.body;

        try {

            const valorUnitario =
                parseFloat(
                    String(
                        s.valor || 0
                    )
                        .replace(',', '.')
                )
                ||
                0;


            const recorrencia =
                s.recorrencia
                ||
                'unico';


            let valorTotal =
                valorUnitario;


            if (
                recorrencia ===
                'semanal'
            ) {

                valorTotal =
                    valorUnitario * 4;

            }


            if (
                recorrencia ===
                'quinzenal'
            ) {

                valorTotal =
                    valorUnitario * 2;

            }


            const taxa =
                valorTotal *
                0.10;


            const valorLiquido =
                valorTotal -
                taxa;


            const resultado =
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
                        empresa_nome,
                        recorrencia,
                        valor_total,
                        status,
                        reservas,
                        mensagens,
                        pagamento_autorizado
                    )

                    VALUES
                    (
                        $1,$2,$3,$4,$5,
                        $6,$7,$8,$9,$10,
                        $11,$12,$13,$14,$15,
                        $16,
                        'ativo',
                        '[]'::jsonb,
                        '[]'::jsonb,
                        FALSE
                    )

                    RETURNING *
                    `,
                    [
                        s.titulo,

                        s.categoria
                        ||
                        'Geral',

                        s.local
                        ||
                        '',

                        s.endereco
                        ||
                        '',

                        String(
                            s.valor || ''
                        ),

                        valorUnitario,

                        valorLiquido,

                        s.horario
                        ||
                        s.dataHorario
                        ||
                        s.data_horario
                        ||
                        'A combinar',

                        s.pagamento
                        ||
                        s.formaPgto
                        ||
                        s.forma_pgto
                        ||
                        'Pix',

                        s.descricao
                        ||
                        '',

                        s.contrato
                        ||
                        s.contratoTexto
                        ||
                        '',

                        s.empresaEmail
                        ||
                        s.empresa_email
                        ||
                        '',

                        s.empresaWhatsapp
                        ||
                        s.empresa_whatsapp
                        ||
                        '',

                        s.empresaNome
                        ||
                        s.empresa_nome
                        ||
                        '',

                        recorrencia,

                        valorTotal
                    ]
                );


            const servico =
                resultado.rows[0];


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
                id:
                    servico.id,
                servico:
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
                    'Erro ao publicar serviço: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// ENTRAR NA FILA
// =====================================================

app.post(
    '/api/servicos/:id/fila',
    async (req, res) => {

        const id =
            req.params.id;


        const {
            prestadorEmail,
            prestadorNome,
            prestadorWhatsapp,
            prestadorPix,
            rgCnh
        } =
            req.body;


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
                    [
                        id
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }


            const servico =
                resultado.rows[0];


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


            const status =
                String(
                    servico.status || ''
                )
                    .trim()
                    .toLowerCase();


            const encerrados = [
                'aguardando_validacao',
                'validado',
                'aprovado',
                'pago',
                'concluido',
                'concluido_com_sucesso',
                'cancelado',
                'cancelado_ausencia_prestador'
            ];


            if (
                encerrados.includes(
                    status
                )
                ||
                servico.checkout_hora
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Esta vaga já foi encerrada.'
                });

            }


            if (
                String(
                    servico.prestador_email || ''
                )
                    .trim()
                    .toLowerCase()
                ===
                email
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Você já é o Titular desta vaga.'
                });

            }


            let fila =
                Array.isArray(
                    servico.reservas
                )
                    ?
                    servico.reservas
                    :
                    [];


            const jaExiste =
                fila.some(
                    pessoa =>
                        String(
                            pessoa.email || ''
                        )
                            .trim()
                            .toLowerCase()
                        ===
                        email
                );


            if (jaExiste) {

                await client.query(
                    'ROLLBACK'
                );


                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Você já está nesta fila.'
                });

            }


            const temTitular =
                !!servico.prestador_email;


            const limite =
                temTitular
                    ?
                    2
                    :
                    3;


            if (
                fila.length >=
                limite
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.status(409).json({
                    sucesso: false,
                    erro:
                        temTitular
                            ?
                            'As duas vagas de reserva já foram preenchidas.'
                            :
                            'A fila já possui três candidatos.'
                });

            }


            fila.push({
                email:
                    prestadorEmail,

                nome:
                    prestadorNome
                    ||
                    '',

                whatsapp:
                    prestadorWhatsapp
                    ||
                    '',

                pix:
                    prestadorPix
                    ||
                    '',

                rgCnh:
                    rgCnh
                    ||
                    '',

                entrouEm:
                    new Date()
                        .toISOString()
            });


            await client.query(
                `
                UPDATE servicos

                SET reservas =
                    $1::jsonb

                WHERE id =
                    $2
                `,
                [
                    JSON.stringify(
                        fila
                    ),
                    id
                ]
            );


            await client.query(
                'COMMIT'
            );


            await registrarAuditoria(
                prestadorEmail,
                temTitular
                    ?
                    'ENTRAR_RESERVA'
                    :
                    'ENTRAR_FILA',
                `Prestador entrou no serviço #${id}.`
            );


            io.emit(
                'atualizar_servicos'
            );


            return res.json({
                sucesso: true,

                mensagem:
                    temTitular
                        ?
                        `Você entrou como Reserva ${fila.length}.`
                        :
                        `Você entrou na fila na posição ${fila.length}.`,

                posicao:
                    fila.length,

                tipoEntrada:
                    temTitular
                        ?
                        'reserva'
                        :
                        'fila'
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
                    'Erro ao entrar na fila.'
            });

        } finally {

            client.release();

        }

    }
);


// =====================================================
// ACEITAR VAGA COMO TITULAR
// =====================================================

app.post(
    '/api/servicos/:id/aceitar',
    async (req, res) => {

        const id =
            req.params.id;


        const {
            prestadorEmail,
            prestadorNome,
            prestadorPix,
            prestadorWhatsapp
        } =
            req.body;


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
                    [
                        id
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }


            const servico =
                resultado.rows[0];


            if (
                servico.prestador_email
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Esta vaga já possui Titular.'
                });

            }


            let fila =
                Array.isArray(
                    servico.reservas
                )
                    ?
                    servico.reservas
                    :
                    [];


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
                        ===
                        email
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
                        `Você está na posição ${indice + 1}. Apenas o primeiro da fila pode assumir a vaga.`
                });

            }


            const candidato =
                fila[indice];


            fila =
                fila.filter(
                    (_, i) =>
                        i !== indice
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
                        prestadorEmail
                    ]
                );


            const prestadorId =
                usuario.rows[0]?.id
                ||
                null;


            const atualizado =
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

                        pagamento_autorizado =
                            FALSE,

                        autorizacao_pagamento_arquivo =
                            NULL,

                        autorizacao_pagamento_nome =
                            NULL,

                        autorizacao_pagamento_em =
                            NULL,

                        autorizacao_pagamento_por =
                            NULL,

                        status =
                            'em_andamento'

                    WHERE id =
                        $7

                    RETURNING *
                    `,
                    [
                        prestadorEmail,

                        prestadorId,

                        prestadorNome
                        ||
                        candidato.nome
                        ||
                        '',

                        prestadorPix
                        ||
                        candidato.pix
                        ||
                        '',

                        prestadorWhatsapp
                        ||
                        candidato.whatsapp
                        ||
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
                `${prestadorNome || candidato.nome || prestadorEmail} assumiu a vaga como Titular.`
            );


            await registrarAuditoria(
                prestadorEmail,
                'ACEITAR_SERVICO',
                `Prestador assumiu o serviço #${id}.`
            );


            io.emit(
                'atualizar_servicos'
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Você agora é o Titular desta vaga!',

                data_aceite:
                    atualizado.rows[0]
                        .data_aceite,

                servico:
                    atualizado.rows[0]
            });

        } catch (err) {

            try {

                await client.query(
                    'ROLLBACK'
                );

            } catch (_) {}


            console.error(
                'Erro ao aceitar vaga:',
                err
            );


            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao aceitar a vaga.'
            });

        } finally {

            client.release();

        }

    }
);


// =====================================================
// CONFIRMAR PRESENÇA
// =====================================================

app.post(
    '/api/servicos/:id/confirmar-presenca',
    async (req, res) => {

        const id =
            req.params.id;


        const selfie =
            req.body.selfie
            ||
            req.body.selfie_confirmacao
            ||
            null;


        const prestadorEmail =
            req.body.prestadorEmail
            ||
            req.body.prestador_email
            ||
            '';


        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [
                        id
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }


            const servico =
                resultado.rows[0];


            if (!selfie) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A selfie de confirmação é obrigatória.'
                });

            }


            if (
                prestadorEmail
                &&
                String(
                    servico.prestador_email || ''
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
                        'Somente o Titular pode confirmar presença.'
                });

            }


            await pool.query(
                `
                UPDATE servicos

                SET
                    selfie_confirmacao =
                        $1,

                    presenca_confirmada =
                        TRUE

                WHERE id =
                    $2
                `,
                [
                    selfie,
                    id
                ]
            );


            await adicionarMensagemSistema(
                id,
                `${servico.prestador_nome || 'O prestador'} confirmou presença.`
            );


            await registrarAuditoria(
                prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'CONFIRMAR_PRESENCA',

                `Presença confirmada no serviço #${id}.`
            );


            io.emit(
                'atualizar_servicos'
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Presença confirmada com sucesso!',
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
                    'Erro interno ao confirmar presença.'
            });

        }

    }
);


// =====================================================
// CHECK-IN
// =====================================================

app.post(
    '/api/servicos/:id/checkin',
    async (req, res) => {

        const id =
            req.params.id;


        const foto =
            req.body.foto
            ||
            req.body.fotoCheckin
            ||
            req.body.foto_checkin
            ||
            null;


        const hora =
            req.body.hora
            ||
            req.body.checkin_hora
            ||
            new Date()
                .toLocaleTimeString(
                    'pt-BR'
                );


        const gps =
            req.body.gps
            ||
            req.body.checkin_gps
            ||
            null;


        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [
                        id
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }


            const servico =
                resultado.rows[0];


            if (
                servico.checkin_hora
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        `Check-in já realizado às ${servico.checkin_hora}.`
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
                    foto_ponto =
                        $1,

                    foto_checkin =
                        $1,

                    checkin_hora =
                        $2,

                    checkin_gps =
                        $3,

                    status_checkin =
                        'realizado',

                    status =
                        'em_andamento'

                WHERE id =
                    $4
                `,
                [
                    foto,
                    hora,
                    gps,
                    id
                ]
            );


            await adicionarMensagemSistema(
                id,
                `Check-in realizado às ${hora}.`
            );


            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'CHECKIN',

                `Check-in realizado no serviço #${id}.`
            );


            io.emit(
                'atualizar_servicos'
            );


            return res.json({
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
                'Erro no check-in:',
                err
            );


            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao registrar check-in.'
            });

        }

    }
);
// =====================================================
// INICIAR INTERVALO
// =====================================================

app.post(
    '/api/servicos/:id/intervalo/iniciar',
    async (req, res) => {

        const id =
            req.params.id;

        const hora =
            req.body.hora
            ||
            new Date()
                .toLocaleTimeString(
                    'pt-BR'
                );

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.checkin_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Faça o check-in antes de iniciar o intervalo.'
                });

            }

            if (
                servico.checkout_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Este serviço já foi finalizado.'
                });

            }

            if (
                servico.intervalo_inicio
                &&
                !servico.intervalo_retorno
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O intervalo já está em andamento.'
                });

            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_inicio =
                        $1,

                    intervalo_retorno =
                        NULL

                WHERE id =
                    $2
                `,
                [
                    hora,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `Intervalo iniciado às ${hora}.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'INICIAR_INTERVALO',

                `Intervalo iniciado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Intervalo iniciado com sucesso!',
                intervalo_inicio:
                    hora
            });

        } catch (err) {

            console.error(
                'Erro ao iniciar intervalo:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao iniciar intervalo.'
            });

        }

    }
);


// =====================================================
// RETORNAR DO INTERVALO
// =====================================================

app.post(
    '/api/servicos/:id/intervalo/retornar',
    async (req, res) => {

        const id =
            req.params.id;

        const hora =
            req.body.hora
            ||
            new Date()
                .toLocaleTimeString(
                    'pt-BR'
                );

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.intervalo_inicio
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhum intervalo foi iniciado.'
                });

            }

            if (
                servico.intervalo_retorno
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O retorno do intervalo já foi registrado.'
                });

            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_retorno =
                        $1

                WHERE id =
                    $2
                `,
                [
                    hora,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `Retorno do intervalo registrado às ${hora}.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'RETORNO_INTERVALO',

                `Retorno do intervalo registrado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Retorno do intervalo registrado!',
                intervalo_retorno:
                    hora
            });

        } catch (err) {

            console.error(
                'Erro ao retornar do intervalo:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao registrar retorno do intervalo.'
            });

        }

    }
);


// =====================================================
// CHECK-OUT
// FOTO + GPS
// =====================================================

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
                req.body.fotoCheckout
                ||
                req.body.foto_checkout
                ||
                req.body.foto
                ||
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        :
                        null
                );

            const hora =
                req.body.hora
                ||
                req.body.checkout_hora
                ||
                new Date()
                    .toLocaleTimeString(
                        'pt-BR'
                    );

            const gps =
                req.body.gps
                ||
                req.body.checkout_gps
                ||
                null;

            const totalHoras =
                req.body.totalHoras
                ||
                req.body.total_horas
                ||
                '';

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.checkin_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Não é possível realizar check-out antes do check-in.'
                });

            }

            if (
                servico.checkout_hora
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        `Check-out já realizado às ${servico.checkout_hora}.`
                });

            }

            if (
                servico.intervalo_inicio
                &&
                !servico.intervalo_retorno
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Retorne do intervalo antes de realizar o check-out.'
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
                    checkout_hora =
                        $1,

                    foto_checkout =
                        $2,

                    documento_comprovante =
                        $2,

                    checkout_gps =
                        $3,

                    total_horas =
                        $4,

                    status_checkin =
                        'concluido',

                    validado_empresa =
                        FALSE,

                    validado_em =
                        NULL,

                    pagamento_autorizado =
                        FALSE,

                    autorizacao_pagamento_arquivo =
                        NULL,

                    autorizacao_pagamento_nome =
                        NULL,

                    autorizacao_pagamento_em =
                        NULL,

                    autorizacao_pagamento_por =
                        NULL,

                    status =
                        'aguardando_validacao'

                WHERE id =
                    $5
                `,
                [
                    hora,
                    foto,
                    gps,
                    totalHoras,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `Check-out realizado às ${hora}. O serviço está aguardando validação da empresa.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'CHECKOUT',

                `Check-out realizado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Check-out realizado com sucesso! O serviço foi enviado para validação da empresa.',

                checkout_hora:
                    hora,

                checkout_gps:
                    gps,

                total_horas:
                    totalHoras
            });

        } catch (err) {

            console.error(
                'Erro no check-out:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao realizar check-out: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// EMPRESA VALIDA O SERVIÇO
// =====================================================

app.post(
    '/api/servicos/:id/validar',
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.checkout_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O prestador ainda não realizou o check-out.'
                });

            }

            if (
                servico.validado_empresa
            ) {

                return res.json({
                    sucesso: true,
                    mensagem:
                        'Este serviço já foi validado.',
                    validado_empresa:
                        true
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

                WHERE id =
                    $1
                `,
                [id]
            );

            await adicionarMensagemSistema(
                id,
                'A empresa validou a realização do serviço. O pagamento já pode ser autorizado.'
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

                mensagem:
                    'Serviço validado! Agora a empresa pode autorizar o pagamento.',

                validado_empresa:
                    true
            });

        } catch (err) {

            console.error(
                'Erro ao validar serviço:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao validar serviço.'
            });

        }

    }
);


// =====================================================
// NOVO FLUXO:
// EMPRESA AUTORIZA PAGAMENTO
//
// O INDEX ENVIA:
// {
//   empresaEmail,
//   empresaNome,
//   autorizacaoPagamento: true,
//   relatorioPdf: "data:application/pdf;base64,...",
//   relatorioNome: "autorizacao-pagamento-servico-7.pdf"
// }
// =====================================================

app.post(
    '/api/servicos/:id/autorizar-pagamento',
    async (req, res) => {

        const id =
            req.params.id;

        const empresaEmail =
            String(
                req.body.empresaEmail
                ||
                req.body.empresa_email
                ||
                ''
            )
                .trim()
                .toLowerCase();

        const empresaNome =
            String(
                req.body.empresaNome
                ||
                req.body.empresa_nome
                ||
                ''
            )
                .trim();

        const relatorioPdf =
            req.body.relatorioPdf
            ||
            req.body.autorizacao_pagamento_arquivo
            ||
            null;

        const relatorioNome =
            req.body.relatorioNome
            ||
            req.body.autorizacao_pagamento_nome
            ||
            `autorizacao-pagamento-servico-${id}.pdf`;

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            const empresaDoServico =
                String(
                    servico.empresa_email
                    ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            if (
                empresaEmail
                &&
                empresaDoServico
                &&
                empresaEmail !==
                empresaDoServico
            ) {

                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Somente a empresa responsável por esta vaga pode autorizar o pagamento.'
                });

            }

            if (
                !servico.checkout_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O prestador ainda não realizou o check-out.'
                });

            }

            if (
                !servico.presenca_confirmada
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A presença do prestador ainda não foi confirmada.'
                });

            }

            if (
                !servico.foto_checkin
                &&
                !servico.foto_ponto
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A foto de entrada/check-in não foi encontrada.'
                });

            }

            if (
                !servico.foto_checkout
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A foto de saída/check-out não foi encontrada.'
                });

            }

            if (!relatorioPdf) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O PDF da autorização de pagamento não foi recebido.'
                });

            }

            if (
                !String(
                    relatorioPdf
                )
                    .startsWith(
                        'data:application/pdf'
                    )
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O arquivo da autorização precisa ser um PDF válido.'
                });

            }

            if (
                servico.pagamento_autorizado
                &&
                servico.autorizacao_pagamento_arquivo
            ) {

                return res.json({
                    sucesso: true,

                    mensagem:
                        'O pagamento deste serviço já foi autorizado.',

                    pagamento_autorizado:
                        true,

                    autorizacao_pagamento_arquivo:
                        servico.autorizacao_pagamento_arquivo,

                    autorizacao_pagamento_nome:
                        servico.autorizacao_pagamento_nome
                });

            }

            const autorizadoPor =
                empresaNome
                ||
                servico.empresa_nome
                ||
                empresaEmail
                ||
                servico.empresa_email
                ||
                'Empresa';

            const atualizado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        pagamento_autorizado =
                            TRUE,

                        autorizacao_pagamento_arquivo =
                            $1,

                        autorizacao_pagamento_nome =
                            $2,

                        autorizacao_pagamento_em =
                            CURRENT_TIMESTAMP,

                        autorizacao_pagamento_por =
                            $3,

                        status =
                            'pagamento_autorizado'

                    WHERE id =
                        $4

                    RETURNING
                        pagamento_autorizado,
                        autorizacao_pagamento_arquivo,
                        autorizacao_pagamento_nome,
                        autorizacao_pagamento_em,
                        autorizacao_pagamento_por
                    `,
                    [
                        relatorioPdf,
                        relatorioNome,
                        autorizadoPor,
                        id
                    ]
                );

            await adicionarMensagemSistema(
                id,
                `A empresa autorizou o pagamento do serviço. O relatório PDF "${relatorioNome}" foi liberado para o prestador.`
            );

            await registrarAuditoria(
                empresaEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'AUTORIZAR_PAGAMENTO',

                `Pagamento autorizado no serviço #${id}. PDF: ${relatorioNome}`
            );

            await registrarLedger(
                id,
                servico.prestador_email,
                'PAGAMENTO_AUTORIZADO',
                Number(
                    servico.valor_liquido
                    ||
                    servico.valor_diaria
                    ||
                    0
                )
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Pagamento autorizado com sucesso! O PDF foi liberado para o prestador.',

                pagamento_autorizado:
                    true,

                autorizacao_pagamento_arquivo:
                    atualizado.rows[0]
                        .autorizacao_pagamento_arquivo,

                autorizacao_pagamento_nome:
                    atualizado.rows[0]
                        .autorizacao_pagamento_nome,

                autorizacao_pagamento_em:
                    atualizado.rows[0]
                        .autorizacao_pagamento_em
            });

        } catch (err) {

            console.error(
                'Erro ao autorizar pagamento:',
                err
            );

            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro ao autorizar pagamento: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// NOTA FISCAL OFICIAL
// =====================================================

app.post(
    '/api/servicos/:id/nota-oficial',
    upload.single('notaFiscal'),
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const dadosNota =
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        :
                        null
                )
                ||
                req.body.notaFiscal
                ||
                req.body.nota_fiscal_oficial
                ||
                req.body.nota_oficial
                ||
                null;

            if (!dadosNota) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhuma Nota Fiscal foi enviada.'
                });

            }

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const nomeArquivo =
                arquivo?.originalname
                ||
                req.body.notaNome
                ||
                req.body.nota_nome
                ||
                'nota-fiscal';

            const tipoArquivo =
                arquivo?.mimetype
                ||
                req.body.notaTipo
                ||
                req.body.nota_tipo
                ||
                'arquivo';

            const remetente =
                req.body.notaFiscalRemetente
                ||
                req.body.nota_fiscal_remetente
                ||
                req.body.usuarioNome
                ||
                'Usuário';

            await pool.query(
                `
                UPDATE servicos

                SET
                    nota_oficial =
                        $1,

                    nota_nome =
                        $2,

                    nota_tipo =
                        $3,

                    nota_remetente =
                        $4,

                    nota_enviada_em =
                        CURRENT_TIMESTAMP

                WHERE id =
                    $5
                `,
                [
                    dadosNota,
                    nomeArquivo,
                    tipoArquivo,
                    remetente,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `Nota Fiscal "${nomeArquivo}" enviada.`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                'sistema',

                'ENVIO_NOTA_FISCAL',

                `Nota Fiscal enviada no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Nota Fiscal enviada com sucesso!',
                nota_nome:
                    nomeArquivo
            });

        } catch (err) {

            console.error(
                'Erro ao enviar Nota Fiscal:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar Nota Fiscal.'
            });

        }

    }
);


// =====================================================
// CONTRATO DA EMPRESA
// =====================================================

app.post(
    '/api/servicos/:id/contrato-empresa',
    upload.single('contratoEmpresa'),
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const dadosArquivo =
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        :
                        null
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
                    erro:
                        'Nenhum contrato foi enviado.'
                });

            }

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

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
                    contrato_empresa_arquivo =
                        $1,

                    contrato_empresa_nome =
                        $2,

                    contrato_empresa_tipo =
                        $3,

                    contrato_empresa_enviado_em =
                        CURRENT_TIMESTAMP

                WHERE id =
                    $4
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
                `A empresa anexou o contrato "${nomeArquivo}".`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'ENVIO_CONTRATO_EMPRESA',

                `Contrato enviado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Contrato enviado com sucesso!',
                contrato_nome:
                    nomeArquivo
            });

        } catch (err) {

            console.error(
                'Erro ao enviar contrato:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar contrato.'
            });

        }

    }
);


// =====================================================
// COMPROVANTE DE PAGAMENTO
// =====================================================

app.post(
    '/api/servicos/:id/comprovante-pagamento',
    upload.single('comprovantePagamento'),
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const dadosArquivo =
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        :
                        null
                )
                ||
                req.body.comprovantePagamento
                ||
                req.body.comprovante_pagamento_arquivo
                ||
                null;

            if (!dadosArquivo) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhum comprovante de pagamento foi enviado.'
                });

            }

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.pagamento_autorizado
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O pagamento ainda não foi autorizado pela empresa.'
                });

            }

            const nomeArquivo =
                arquivo?.originalname
                ||
                req.body.comprovanteNome
                ||
                'comprovante-pagamento';

            const tipoArquivo =
                arquivo?.mimetype
                ||
                req.body.comprovanteTipo
                ||
                'arquivo';

            await pool.query(
                `
                UPDATE servicos

                SET
                    comprovante_pagamento =
                        TRUE,

                    comprovante_pagamento_arquivo =
                        $1,

                    comprovante_pagamento_nome =
                        $2,

                    comprovante_pagamento_tipo =
                        $3,

                    comprovante_pagamento_enviado_em =
                        CURRENT_TIMESTAMP,

                    pagamento_recebido_confirmado =
                        FALSE,

                    pagamento_recebido_em =
                        NULL,

                    status =
                        'pago'

                WHERE id =
                    $4
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
                `Comprovante de pagamento "${nomeArquivo}" enviado ao prestador.`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                req.body.empresaEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'ENVIO_COMPROVANTE_PAGAMENTO',

                `Comprovante de pagamento enviado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Comprovante enviado ao prestador com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro ao enviar comprovante:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar comprovante.'
            });

        }

    }
);
// =====================================================
// INICIAR INTERVALO
// =====================================================

app.post(
    '/api/servicos/:id/intervalo/iniciar',
    async (req, res) => {

        const id =
            req.params.id;

        const hora =
            req.body.hora
            ||
            new Date()
                .toLocaleTimeString(
                    'pt-BR'
                );

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.checkin_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Faça o check-in antes de iniciar o intervalo.'
                });

            }

            if (
                servico.checkout_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Este serviço já foi finalizado.'
                });

            }

            if (
                servico.intervalo_inicio
                &&
                !servico.intervalo_retorno
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O intervalo já está em andamento.'
                });

            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_inicio =
                        $1,

                    intervalo_retorno =
                        NULL

                WHERE id =
                    $2
                `,
                [
                    hora,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `Intervalo iniciado às ${hora}.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'INICIAR_INTERVALO',

                `Intervalo iniciado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Intervalo iniciado com sucesso!',
                intervalo_inicio:
                    hora
            });

        } catch (err) {

            console.error(
                'Erro ao iniciar intervalo:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao iniciar intervalo.'
            });

        }

    }
);


// =====================================================
// RETORNAR DO INTERVALO
// =====================================================

app.post(
    '/api/servicos/:id/intervalo/retornar',
    async (req, res) => {

        const id =
            req.params.id;

        const hora =
            req.body.hora
            ||
            new Date()
                .toLocaleTimeString(
                    'pt-BR'
                );

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.intervalo_inicio
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhum intervalo foi iniciado.'
                });

            }

            if (
                servico.intervalo_retorno
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O retorno do intervalo já foi registrado.'
                });

            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_retorno =
                        $1

                WHERE id =
                    $2
                `,
                [
                    hora,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `Retorno do intervalo registrado às ${hora}.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'RETORNO_INTERVALO',

                `Retorno do intervalo registrado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Retorno do intervalo registrado!',
                intervalo_retorno:
                    hora
            });

        } catch (err) {

            console.error(
                'Erro ao retornar do intervalo:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao registrar retorno do intervalo.'
            });

        }

    }
);


// =====================================================
// CHECK-OUT
// FOTO + GPS
// =====================================================

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
                req.body.fotoCheckout
                ||
                req.body.foto_checkout
                ||
                req.body.foto
                ||
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        :
                        null
                );

            const hora =
                req.body.hora
                ||
                req.body.checkout_hora
                ||
                new Date()
                    .toLocaleTimeString(
                        'pt-BR'
                    );

            const gps =
                req.body.gps
                ||
                req.body.checkout_gps
                ||
                null;

            const totalHoras =
                req.body.totalHoras
                ||
                req.body.total_horas
                ||
                '';

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.checkin_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Não é possível realizar check-out antes do check-in.'
                });

            }

            if (
                servico.checkout_hora
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        `Check-out já realizado às ${servico.checkout_hora}.`
                });

            }

            if (
                servico.intervalo_inicio
                &&
                !servico.intervalo_retorno
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Retorne do intervalo antes de realizar o check-out.'
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
                    checkout_hora =
                        $1,

                    foto_checkout =
                        $2,

                    documento_comprovante =
                        $2,

                    checkout_gps =
                        $3,

                    total_horas =
                        $4,

                    status_checkin =
                        'concluido',

                    validado_empresa =
                        FALSE,

                    validado_em =
                        NULL,

                    pagamento_autorizado =
                        FALSE,

                    autorizacao_pagamento_arquivo =
                        NULL,

                    autorizacao_pagamento_nome =
                        NULL,

                    autorizacao_pagamento_em =
                        NULL,

                    autorizacao_pagamento_por =
                        NULL,

                    status =
                        'aguardando_validacao'

                WHERE id =
                    $5
                `,
                [
                    hora,
                    foto,
                    gps,
                    totalHoras,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `Check-out realizado às ${hora}. O serviço está aguardando validação da empresa.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'CHECKOUT',

                `Check-out realizado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Check-out realizado com sucesso! O serviço foi enviado para validação da empresa.',

                checkout_hora:
                    hora,

                checkout_gps:
                    gps,

                total_horas:
                    totalHoras
            });

        } catch (err) {

            console.error(
                'Erro no check-out:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao realizar check-out: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// EMPRESA VALIDA O SERVIÇO
// =====================================================

app.post(
    '/api/servicos/:id/validar',
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.checkout_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O prestador ainda não realizou o check-out.'
                });

            }

            if (
                servico.validado_empresa
            ) {

                return res.json({
                    sucesso: true,
                    mensagem:
                        'Este serviço já foi validado.',
                    validado_empresa:
                        true
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

                WHERE id =
                    $1
                `,
                [id]
            );

            await adicionarMensagemSistema(
                id,
                'A empresa validou a realização do serviço. O pagamento já pode ser autorizado.'
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

                mensagem:
                    'Serviço validado! Agora a empresa pode autorizar o pagamento.',

                validado_empresa:
                    true
            });

        } catch (err) {

            console.error(
                'Erro ao validar serviço:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao validar serviço.'
            });

        }

    }
);


// =====================================================
// NOVO FLUXO:
// EMPRESA AUTORIZA PAGAMENTO
//
// O INDEX ENVIA:
// {
//   empresaEmail,
//   empresaNome,
//   autorizacaoPagamento: true,
//   relatorioPdf: "data:application/pdf;base64,...",
//   relatorioNome: "autorizacao-pagamento-servico-7.pdf"
// }
// =====================================================

app.post(
    '/api/servicos/:id/autorizar-pagamento',
    async (req, res) => {

        const id =
            req.params.id;

        const empresaEmail =
            String(
                req.body.empresaEmail
                ||
                req.body.empresa_email
                ||
                ''
            )
                .trim()
                .toLowerCase();

        const empresaNome =
            String(
                req.body.empresaNome
                ||
                req.body.empresa_nome
                ||
                ''
            )
                .trim();

        const relatorioPdf =
            req.body.relatorioPdf
            ||
            req.body.autorizacao_pagamento_arquivo
            ||
            null;

        const relatorioNome =
            req.body.relatorioNome
            ||
            req.body.autorizacao_pagamento_nome
            ||
            `autorizacao-pagamento-servico-${id}.pdf`;

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            const empresaDoServico =
                String(
                    servico.empresa_email
                    ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            if (
                empresaEmail
                &&
                empresaDoServico
                &&
                empresaEmail !==
                empresaDoServico
            ) {

                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Somente a empresa responsável por esta vaga pode autorizar o pagamento.'
                });

            }

            if (
                !servico.checkout_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O prestador ainda não realizou o check-out.'
                });

            }

            if (
                !servico.presenca_confirmada
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A presença do prestador ainda não foi confirmada.'
                });

            }

            if (
                !servico.foto_checkin
                &&
                !servico.foto_ponto
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A foto de entrada/check-in não foi encontrada.'
                });

            }

            if (
                !servico.foto_checkout
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A foto de saída/check-out não foi encontrada.'
                });

            }

            if (!relatorioPdf) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O PDF da autorização de pagamento não foi recebido.'
                });

            }

            if (
                !String(
                    relatorioPdf
                )
                    .startsWith(
                        'data:application/pdf'
                    )
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O arquivo da autorização precisa ser um PDF válido.'
                });

            }

            if (
                servico.pagamento_autorizado
                &&
                servico.autorizacao_pagamento_arquivo
            ) {

                return res.json({
                    sucesso: true,

                    mensagem:
                        'O pagamento deste serviço já foi autorizado.',

                    pagamento_autorizado:
                        true,

                    autorizacao_pagamento_arquivo:
                        servico.autorizacao_pagamento_arquivo,

                    autorizacao_pagamento_nome:
                        servico.autorizacao_pagamento_nome
                });

            }

            const autorizadoPor =
                empresaNome
                ||
                servico.empresa_nome
                ||
                empresaEmail
                ||
                servico.empresa_email
                ||
                'Empresa';

            const atualizado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        pagamento_autorizado =
                            TRUE,

                        autorizacao_pagamento_arquivo =
                            $1,

                        autorizacao_pagamento_nome =
                            $2,

                        autorizacao_pagamento_em =
                            CURRENT_TIMESTAMP,

                        autorizacao_pagamento_por =
                            $3,

                        status =
                            'pagamento_autorizado'

                    WHERE id =
                        $4

                    RETURNING
                        pagamento_autorizado,
                        autorizacao_pagamento_arquivo,
                        autorizacao_pagamento_nome,
                        autorizacao_pagamento_em,
                        autorizacao_pagamento_por
                    `,
                    [
                        relatorioPdf,
                        relatorioNome,
                        autorizadoPor,
                        id
                    ]
                );

            await adicionarMensagemSistema(
                id,
                `A empresa autorizou o pagamento do serviço. O relatório PDF "${relatorioNome}" foi liberado para o prestador.`
            );

            await registrarAuditoria(
                empresaEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'AUTORIZAR_PAGAMENTO',

                `Pagamento autorizado no serviço #${id}. PDF: ${relatorioNome}`
            );

            await registrarLedger(
                id,
                servico.prestador_email,
                'PAGAMENTO_AUTORIZADO',
                Number(
                    servico.valor_liquido
                    ||
                    servico.valor_diaria
                    ||
                    0
                )
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Pagamento autorizado com sucesso! O PDF foi liberado para o prestador.',

                pagamento_autorizado:
                    true,

                autorizacao_pagamento_arquivo:
                    atualizado.rows[0]
                        .autorizacao_pagamento_arquivo,

                autorizacao_pagamento_nome:
                    atualizado.rows[0]
                        .autorizacao_pagamento_nome,

                autorizacao_pagamento_em:
                    atualizado.rows[0]
                        .autorizacao_pagamento_em
            });

        } catch (err) {

            console.error(
                'Erro ao autorizar pagamento:',
                err
            );

            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro ao autorizar pagamento: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// NOTA FISCAL OFICIAL
// =====================================================

app.post(
    '/api/servicos/:id/nota-oficial',
    upload.single('notaFiscal'),
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const dadosNota =
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        :
                        null
                )
                ||
                req.body.notaFiscal
                ||
                req.body.nota_fiscal_oficial
                ||
                req.body.nota_oficial
                ||
                null;

            if (!dadosNota) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhuma Nota Fiscal foi enviada.'
                });

            }

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const nomeArquivo =
                arquivo?.originalname
                ||
                req.body.notaNome
                ||
                req.body.nota_nome
                ||
                'nota-fiscal';

            const tipoArquivo =
                arquivo?.mimetype
                ||
                req.body.notaTipo
                ||
                req.body.nota_tipo
                ||
                'arquivo';

            const remetente =
                req.body.notaFiscalRemetente
                ||
                req.body.nota_fiscal_remetente
                ||
                req.body.usuarioNome
                ||
                'Usuário';

            await pool.query(
                `
                UPDATE servicos

                SET
                    nota_oficial =
                        $1,

                    nota_nome =
                        $2,

                    nota_tipo =
                        $3,

                    nota_remetente =
                        $4,

                    nota_enviada_em =
                        CURRENT_TIMESTAMP

                WHERE id =
                    $5
                `,
                [
                    dadosNota,
                    nomeArquivo,
                    tipoArquivo,
                    remetente,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `Nota Fiscal "${nomeArquivo}" enviada.`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                'sistema',

                'ENVIO_NOTA_FISCAL',

                `Nota Fiscal enviada no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Nota Fiscal enviada com sucesso!',
                nota_nome:
                    nomeArquivo
            });

        } catch (err) {

            console.error(
                'Erro ao enviar Nota Fiscal:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar Nota Fiscal.'
            });

        }

    }
);


// =====================================================
// CONTRATO DA EMPRESA
// =====================================================

app.post(
    '/api/servicos/:id/contrato-empresa',
    upload.single('contratoEmpresa'),
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const dadosArquivo =
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        :
                        null
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
                    erro:
                        'Nenhum contrato foi enviado.'
                });

            }

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

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
                    contrato_empresa_arquivo =
                        $1,

                    contrato_empresa_nome =
                        $2,

                    contrato_empresa_tipo =
                        $3,

                    contrato_empresa_enviado_em =
                        CURRENT_TIMESTAMP

                WHERE id =
                    $4
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
                `A empresa anexou o contrato "${nomeArquivo}".`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'ENVIO_CONTRATO_EMPRESA',

                `Contrato enviado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Contrato enviado com sucesso!',
                contrato_nome:
                    nomeArquivo
            });

        } catch (err) {

            console.error(
                'Erro ao enviar contrato:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar contrato.'
            });

        }

    }
);


// =====================================================
// COMPROVANTE DE PAGAMENTO
// =====================================================

app.post(
    '/api/servicos/:id/comprovante-pagamento',
    upload.single('comprovantePagamento'),
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const dadosArquivo =
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        :
                        null
                )
                ||
                req.body.comprovantePagamento
                ||
                req.body.comprovante_pagamento_arquivo
                ||
                null;

            if (!dadosArquivo) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhum comprovante de pagamento foi enviado.'
                });

            }

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                !resultado.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                resultado.rows[0];

            if (
                !servico.pagamento_autorizado
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O pagamento ainda não foi autorizado pela empresa.'
                });

            }

            const nomeArquivo =
                arquivo?.originalname
                ||
                req.body.comprovanteNome
                ||
                'comprovante-pagamento';

            const tipoArquivo =
                arquivo?.mimetype
                ||
                req.body.comprovanteTipo
                ||
                'arquivo';

            await pool.query(
                `
                UPDATE servicos

                SET
                    comprovante_pagamento =
                        TRUE,

                    comprovante_pagamento_arquivo =
                        $1,

                    comprovante_pagamento_nome =
                        $2,

                    comprovante_pagamento_tipo =
                        $3,

                    comprovante_pagamento_enviado_em =
                        CURRENT_TIMESTAMP,

                    pagamento_recebido_confirmado =
                        FALSE,

                    pagamento_recebido_em =
                        NULL,

                    status =
                        'pago'

                WHERE id =
                    $4
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
                `Comprovante de pagamento "${nomeArquivo}" enviado ao prestador.`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                req.body.empresaEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'ENVIO_COMPROVANTE_PAGAMENTO',

                `Comprovante de pagamento enviado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Comprovante enviado ao prestador com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro ao enviar comprovante:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar comprovante.'
            });

        }

    }
);
