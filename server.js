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

        } else {

            console.log(
                'Conectado com sucesso ao banco PostgreSQL.'
            );

            release();

            criarTabelas();

        }

    }
);

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
                valor NUMERIC(10, 2) NOT NULL,
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

        for (
            let sqlCol
            of colunasGarantir
        ) {

            await pool
                .query(sqlCol)
                .catch(() => {});

        }

        await pool.query(`
            UPDATE servicos
            SET data_aceite = CURRENT_TIMESTAMP
            WHERE prestador_email IS NOT NULL
              AND data_aceite IS NULL
        `).catch(
            err =>
                console.error(
                    'Erro ao preencher data_aceite antiga:',
                    err
                )
        );

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

async function enviarEmailRecuperacao(email, codigo) {
    const apiKey = process.env.RESEND_API_KEY;
    const remetente = process.env.RESET_EMAIL_FROM || 'RS Connect <onboarding@resend.dev>';

    if (!apiKey) {
        throw new Error('RESEND_API_KEY não configurada no servidor.');
    }

    const resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: remetente,
            to: [email],
            subject: 'Código para redefinir sua senha - RS Connect',
            html: `
                <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0f172a;">
                    <div style="font-size:22px;font-weight:800;margin-bottom:12px;">RS Connect</div>
                    <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
                    <p>Use este código:</p>
                    <div style="font-size:32px;font-weight:900;letter-spacing:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px;text-align:center;color:#1d4ed8;">
                        ${codigo}
                    </div>
                    <p style="margin-top:18px;">O código expira em <strong>15 minutos</strong>.</p>
                    <p style="font-size:12px;color:#64748b;">Se você não solicitou a recuperação, ignore este e-mail.</p>
                </div>
            `
        })
    });

    const texto = await resposta.text();

    if (!resposta.ok) {
        throw new Error(`Falha ao enviar e-mail de recuperação: ${texto}`);
    }
}

app.post('/api/auth/registrar', async (req, res) => {
    const d = req.body;

    try {
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
                experiencia
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15
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

        const result = await pool.query(query, params);

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

        await registrarAuditoria(
            d.email,
            'CADASTRO_USUARIO',
            `Novo usuário tipo ${d.tipo} cadastrado.`
        );

        res.json({
            sucesso: true,
            id: result.rows[0].id
        });

    } catch (err) {
        res.json({
            sucesso: false,
            erro: 'E-mail já cadastrado ou erro nos dados.'
        });
    }
});

app.post('/api/auth/esqueci-senha', async (req, res) => {
    const email = String(req.body.email || '')
        .trim()
        .toLowerCase();

    if (!email) {
        return res.status(400).json({
            sucesso: false,
            erro: 'Informe o e-mail da conta.'
        });
    }

    try {
        const usuario = await pool.query(
            `
            SELECT id, email, nome
            FROM usuarios
            WHERE LOWER(email) = $1
            `,
            [email]
        );

        if (!usuario.rows.length) {
            return res.json({
                sucesso: true,
                mensagem: 'Se este e-mail estiver cadastrado, enviaremos um código de recuperação.'
            });
        }

        const codigo = String(
            crypto.randomInt(100000, 1000000)
        );

        const codigoHash =
            hashCodigoRecuperacao(codigo);

        await pool.query(
            `
            UPDATE recuperacao_senha
            SET usado = TRUE
            WHERE LOWER(email) = $1
              AND usado = FALSE
            `,
            [email]
        );

        await pool.query(
            `
            INSERT INTO recuperacao_senha
            (
                email,
                codigo_hash,
                expira_em
            )
            VALUES (
                $1,
                $2,
                CURRENT_TIMESTAMP + INTERVAL '15 minutes'
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
            sucesso: true,
            mensagem: 'Código enviado para seu e-mail. Ele expira em 15 minutos.'
        });

    } catch (err) {
        console.error(
            'Erro na recuperação de senha:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Não foi possível enviar o código de recuperação.'
        });
    }
});

app.post('/api/auth/redefinir-senha', async (req, res) => {
    const email = String(req.body.email || '')
        .trim()
        .toLowerCase();

    const codigo = String(req.body.codigo || '')
        .trim();

    const novaSenha =
        String(req.body.novaSenha || '');

    if (!email || !codigo || !novaSenha) {
        return res.status(400).json({
            sucesso: false,
            erro: 'Preencha e-mail, código e nova senha.'
        });
    }

    if (novaSenha.length < 6) {
        return res.status(400).json({
            sucesso: false,
            erro: 'A nova senha deve ter pelo menos 6 caracteres.'
        });
    }

    try {
        const codigoHash =
            hashCodigoRecuperacao(codigo);

        const token = await pool.query(
            `
            SELECT *
            FROM recuperacao_senha
            WHERE LOWER(email) = $1
              AND codigo_hash = $2
              AND usado = FALSE
              AND expira_em > CURRENT_TIMESTAMP
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
                erro: 'Código inválido ou expirado.'
            });
        }

        const usuario = await pool.query(
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
                erro: 'Conta não encontrada.'
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
            'Senha redefinida através do código de recuperação.'
        );

        res.json({
            sucesso: true,
            mensagem: 'Senha redefinida com sucesso. Você já pode entrar.'
        });

    } catch (err) {
        console.error(
            'Erro ao redefinir senha:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro interno ao redefinir a senha.'
        });
    }
});

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
            [
                email,
                senha
            ]
        );

        if (result.rows.length === 0) {
            return res.json({
                sucesso: false,
                erro: 'E-mail ou senha incorretos.'
            });
        }

        await registrarAuditoria(
            email,
            'LOGIN',
            'Login realizado com sucesso.'
        );

        res.json({
            sucesso: true,
            usuario: result.rows[0]
        });

    } catch (err) {
        res.status(500).json({
            sucesso: false,
            erro: 'Erro no servidor.'
        });
    }
});
// =====================================================
// MENSAGENS AUTOMÁTICAS DO SISTEMA
// =====================================================

async function adicionarMensagemSistema(
    servicoId,
    texto
) {
    try {

        const result =
            await pool.query(
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

        let mensagens =
            result.rows[0].mensagens;

        if (!Array.isArray(mensagens)) {
            mensagens = [];
        }

        mensagens.push({
            remetente: 'SISTEMA',
            texto: texto,
            data: new Date().toISOString()
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
// LISTAR SERVIÇOS
// =====================================================

app.get(
    '/api/servicos',
    async (req, res) => {

        try {

            const result =
                await pool.query(`
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
                        ON LOWER(u.email) =
                           LOWER(s.empresa_email)

                    ORDER BY s.id DESC
                `);

            const servicos =
                result.rows.map(
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
                            s.selfie_confirmacao
                            ||
                            null,

                        documentoComprovante:
                            s.documento_comprovante
                            ||
                            null,

                        statusCheckin:
                            s.status_checkin,

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

                        validadoEm:
                            s.validado_em
                            ||
                            null,

                        nota_fiscal_oficial:
                            s.nota_oficial
                            ||
                            null,

                        nota_nome:
                            s.nota_nome
                            ||
                            null,

                        nota_tipo:
                            s.nota_tipo
                            ||
                            null,

                        nota_fiscal_remetente:
                            s.nota_remetente
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

                        comprovantePagamentoTipo:
                            s.comprovante_pagamento_tipo
                            ||
                            null,

                        pagamentoRecebidoConfirmado:
                            !!s.pagamento_recebido_confirmado,

                        pagamentoRecebidoEm:
                            s.pagamento_recebido_em
                            ||
                            null,

                        contratoEmpresaArquivo:
                            s.contrato_empresa_arquivo
                            ||
                            null,

                        contratoEmpresaNome:
                            s.contrato_empresa_nome
                            ||
                            null,

                        contratoEmpresaTipo:
                            s.contrato_empresa_tipo
                            ||
                            null,

                        reservas:
                            Array.isArray(
                                s.reservas
                            )
                                ? s.reservas
                                : [],

                        mensagens:
                            Array.isArray(
                                s.mensagens
                            )
                                ? s.mensagens
                                : []
                    })
                );

            return res.json(
                servicos
            );

        } catch (err) {

            console.error(
                'Erro ao buscar serviços:',
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

            return res.json({
                sucesso: true,
                servico:
                    result.rows[0]
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
                        s.valor
                        ||
                        0
                    )
                        .replace(',', '.')
                )
                ||
                0;

            const tipoRecorrencia =
                s.recorrencia
                ||
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

            else if (
                tipoRecorrencia ===
                'quinzenal'
            ) {

                valorTotalGarantia =
                    valorUnitario * 2;

            }

            else if (
                tipoRecorrencia ===
                'mensal'
            ) {

                valorTotalGarantia =
                    valorUnitario;

            }

            const taxaPlataforma =
                valorTotalGarantia *
                0.10;

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
                        mensagens
                    )

                    VALUES
                    (
                        $1,$2,$3,$4,$5,
                        $6,$7,$8,$9,$10,
                        $11,$12,$13,$14,$15,
                        $16,
                        'ativo',
                        '[]'::jsonb,
                        '[]'::jsonb
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
                            s.valor
                            ||
                            valorUnitario
                        ),

                        valorUnitario,

                        valorLiquido,

                        s.dataHorario
                        ||
                        s.data_horario
                        ||
                        'A combinar',

                        s.formaPgto
                        ||
                        s.forma_pgto
                        ||
                        'Pix',

                        s.descricao
                        ||
                        '',

                        s.contratoTexto
                        ||
                        s.contrato_texto
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

                        tipoRecorrencia,

                        valorTotalGarantia,

                        s.empresaNome
                        ||
                        s.empresa_nome
                        ||
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
                    'Erro ao publicar serviço: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// ENTRAR NA FILA
//
// REGRA:
// SEM TITULAR = ATÉ 3 NA FILA
// COM TITULAR = ATÉ 2 RESERVAS
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
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                result.rows[0];

            const status =
                String(
                    servico.status
                    ||
                    ''
                )
                    .trim()
                    .toLowerCase();

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
                servico.checkout_hora
                ||
                servico.validado_empresa
                ||
                encerrados.includes(
                    status
                )
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
                    prestadorEmail
                    ||
                    ''
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

            const emailEmpresa =
                String(
                    servico.empresa_email
                    ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            if (
                emailEmpresa ===
                email
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

            const emailTitular =
                String(
                    servico.prestador_email
                    ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            if (
                emailTitular ===
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
                    ? servico.reservas
                    : [];

            const jaEstaNaFila =
                fila.some(
                    pessoa =>
                        String(
                            pessoa.email
                            ||
                            ''
                        )
                            .trim()
                            .toLowerCase()
                        ===
                        email
                );

            if (jaEstaNaFila) {

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
                            'As 2 vagas de Reserva de Emergência já foram preenchidas.'
                            :
                            'A fila desta vaga já possui 3 candidatos.'
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

                `Prestador entrou no serviço #${id}, posição ${fila.length}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    temTitular
                        ?
                        `Você entrou como Reserva de Emergência ${fila.length}.`
                        :
                        `Você entrou na fila na posição ${fila.length}.`,

                posicao:
                    fila.length,

                tipoEntrada:
                    temTitular
                        ?
                        'reserva'
                        :
                        'fila',

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
                    'Erro ao entrar na fila: '
                    +
                    err.message
            });

        } finally {

            client.release();

        }

    }
);


// =====================================================
// ACEITAR SERVIÇO
//
// SOMENTE O PRIMEIRO DA FILA VIRA TITULAR
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
                    erro:
                        'Serviço não encontrado.'
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
                        'Esta vaga já possui um Titular.'
                });

            }

            const fila =
                Array.isArray(
                    servico.reservas
                )
                    ?
                    servico.reservas
                    :
                    [];

            const email =
                String(
                    prestadorEmail
                    ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            const indice =
                fila.findIndex(
                    pessoa =>
                        String(
                            pessoa.email
                            ||
                            ''
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
                        index !==
                        indice
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
                usuario.rows[0]?.id
                ||
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

                        documento_comprovante =
                            NULL,

                        status_checkin =
                            'pendente',

                        checkin_hora =
                            NULL,

                        checkout_hora =
                            NULL

                    WHERE id =
                        $7

                    RETURNING *
                    `,
                    [
                        prestadorEmail,

                        prestadorId,

                        prestadorNome
                        ||
                        dadosFila.nome
                        ||
                        '',

                        prestadorPix
                        ||
                        dadosFila.pix
                        ||
                        '',

                        prestadorWhatsapp
                        ||
                        dadosFila.whatsapp
                        ||
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
                `Prestador assumiu como Titular do serviço #${id}.`
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
                        ?.data_aceite
                    ||
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
                    'Erro ao aceitar serviço: '
                    +
                    err.message
            });

        } finally {

            client.release();

        }

    }
);


// =====================================================
// CONFIRMAR PRESENÇA DO TITULAR
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

        const documentoComprovante =
            req.body.documentoComprovante
            ||
            req.body.documento_comprovante
            ||
            null;

        const prestadorEmail =
            req.body.prestadorEmail
            ||
            req.body.prestador_email
            ||
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
                prestadorEmail
                &&
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
                prestadorEmail
                ||
                servico.prestador_email,

                'CONFIRMAR_PRESENCA',

                `Presença confirmada no serviço #${id}.`
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


// =====================================================
// CHECK-IN
// FOTO + GPS + HORÁRIO
// =====================================================

app.post(
    '/api/servicos/:id/checkin',
    async (req, res) => {

        const id =
            req.params.id;

        const foto =
            req.body.foto
            ||
            req.body.foto_checkin
            ||
            req.body.fotoCheckin
            ||
            null;

        const hora =
            req.body.hora
            ||
            req.body.checkin_hora
            ||
            new Date()
                .toLocaleTimeString();

        const gps =
            req.body.gps
            ||
            req.body.checkin_gps
            ||
            req.body.gps_checkin
            ||
            null;

        try {

            const atual =
                await pool.query(
                    `
                    SELECT
                        id,
                        prestador_email,
                        presenca_confirmada,
                        checkin_hora,
                        checkout_hora

                    FROM servicos

                    WHERE id =
                        $1
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

            const servico =
                atual.rows[0];

            if (
                servico.checkin_hora
            ) {

                return res.status(409).json({
                    sucesso: false,

                    erro:
                        `Check-in já finalizado às ${servico.checkin_hora}. Não é permitido registrar novamente.`,

                    checkin_finalizado:
                        true,

                    checkin_hora:
                        servico.checkin_hora
                });

            }

            if (
                servico.checkout_hora
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Este serviço já possui check-out finalizado.'
                });

            }

            if (!foto) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A foto do check-in é obrigatória.'
                });

            }

            const result =
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

                    RETURNING
                        id,
                        checkin_hora,
                        checkin_gps,
                        status_checkin
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
                `Check-in realizado às ${hora}. Foto e localização registradas.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                servico.prestador_email
                ||
                'prestador',

                'CHECKIN',

                `Check-in realizado no serviço #${id}. GPS: ${gps || 'não informado'}`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Check-in realizado com sucesso!',

                checkin_hora:
                    result.rows[0]
                        .checkin_hora,

                checkin_gps:
                    result.rows[0]
                        .checkin_gps,

                status_checkin:
                    result.rows[0]
                        .status_checkin
            });

        } catch (err) {

            console.error(
                'Erro ao realizar check-in:',
                err
            );

            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro ao registrar check-in: '
                    +
                    err.message
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
            new Date().toLocaleTimeString();

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

            if (!servico.checkin_hora) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Faça o check-in antes de iniciar o intervalo.'
                });

            }

            if (servico.checkout_hora) {

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
                    intervalo_inicio = $1,
                    intervalo_retorno = NULL

                WHERE id = $2
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

                `Intervalo iniciado no serviço #${id} às ${hora}.`
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
                    'Erro ao iniciar intervalo: '
                    +
                    err.message
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
            new Date().toLocaleTimeString();

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

            if (!servico.intervalo_inicio) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhum intervalo foi iniciado.'
                });

            }

            if (servico.intervalo_retorno) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O retorno do intervalo já foi registrado.'
                });

            }

            await pool.query(
                `
                UPDATE servicos

                SET intervalo_retorno = $1

                WHERE id = $2
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

                `Retorno do intervalo registrado no serviço #${id} às ${hora}.`
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
                    'Erro ao registrar retorno: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// CHECK-OUT
// FOTO + GPS + HORÁRIO
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
                new Date().toLocaleTimeString();

            const gps =
                req.body.gps
                ||
                req.body.checkout_gps
                ||
                req.body.gps_checkout
                ||
                null;

            const totalHoras =
                req.body.total_horas
                ||
                req.body.totalHoras
                ||
                '';

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

            if (!servico.checkin_hora) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Não é possível fazer check-out antes do check-in.'
                });

            }

            if (servico.checkout_hora) {

                return res.status(409).json({
                    sucesso: false,

                    erro:
                        `Check-out já finalizado às ${servico.checkout_hora}.`,

                    checkout_finalizado:
                        true,

                    checkout_hora:
                        servico.checkout_hora
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
                    status =
                        'aguardando_validacao',

                    status_checkin =
                        'concluido',

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

                    validado_empresa =
                        FALSE

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
                `Serviço finalizado às ${hora}. Check-out registrado e enviado para validação da empresa.`
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
                    'Check-out realizado com sucesso! Serviço enviado para validação.',

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
// NOTA FISCAL
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

            const servicoResult =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [id]
                );

            if (!servicoResult.rows.length) {

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
                req.body.remetente
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
                `Nota Fiscal "${nomeArquivo}" enviada por ${remetente}.`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                'sistema',

                'ENVIO_NOTA_FISCAL',

                `Nota Fiscal enviada para o serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Nota Fiscal enviada com sucesso!',

                nota_nome:
                    nomeArquivo,

                nota_tipo:
                    tipoArquivo,

                nota_remetente:
                    remetente
            });

        } catch (err) {

            console.error(
                'Erro ao enviar Nota Fiscal:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar Nota Fiscal: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// EMPRESA ENVIA CONTRATO
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

            const nomeArquivo =
                arquivo?.originalname
                ||
                req.body.contratoNome
                ||
                req.body.contrato_nome
                ||
                'contrato-empresa';

            const tipoArquivo =
                arquivo?.mimetype
                ||
                req.body.contratoTipo
                ||
                req.body.contrato_tipo
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
                `A empresa enviou o contrato "${nomeArquivo}" ao prestador.`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                req.body.empresaEmail
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
                    'Contrato enviado ao prestador com sucesso!',

                contrato_nome:
                    nomeArquivo,

                contrato_tipo:
                    tipoArquivo
            });

        } catch (err) {

            console.error(
                'Erro ao enviar contrato:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar contrato: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// EMPRESA ENVIA COMPROVANTE DE PAGAMENTO
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

            if (!servico.prestador_email) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Este serviço ainda não possui Titular.'
                });

            }

            const nomeArquivo =
                arquivo?.originalname
                ||
                req.body.comprovanteNome
                ||
                req.body.comprovante_nome
                ||
                'comprovante-pagamento';

            const tipoArquivo =
                arquivo?.mimetype
                ||
                req.body.comprovanteTipo
                ||
                req.body.comprovante_tipo
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
                `A empresa enviou o comprovante de pagamento "${nomeArquivo}". Aguardando confirmação do prestador.`
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

                `Comprovante enviado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Comprovante enviado ao prestador com sucesso!',

                comprovante_nome:
                    nomeArquivo
            });

        } catch (err) {

            console.error(
                'Erro ao enviar comprovante:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar comprovante: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// PRESTADOR CONFIRMA RECEBIMENTO DO PAGAMENTO
// =====================================================

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
                    erro:
                        'Serviço não encontrado.'
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
                    erro:
                        'A empresa ainda não enviou o comprovante de pagamento.'
                });

            }

            if (
                servico
                    .pagamento_recebido_confirmado
            ) {

                return res.json({
                    sucesso: true,

                    mensagem:
                        'O recebimento deste pagamento já foi confirmado.',

                    pagamento_recebido_confirmado:
                        true
                });

            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    pagamento_recebido_confirmado =
                        TRUE,

                    pagamento_recebido_em =
                        CURRENT_TIMESTAMP

                WHERE id =
                    $1
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

                `Recebimento confirmado no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Recebimento confirmado com sucesso!',

                pagamento_recebido_confirmado:
                    true
            });

        } catch (err) {

            console.error(
                'Erro ao confirmar recebimento:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao confirmar recebimento: '
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

        const remetente =
            req.body.remetente
            ||
            req.body.remetenteNome
            ||
            req.body.email
            ||
            'Usuário';

        const texto =
            req.body.texto
            ||
            req.body.mensagem
            ||
            '';

        if (
            !String(texto).trim()
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Digite uma mensagem.'
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

            if (!result.rows.length) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            let mensagens =
                result.rows[0]
                    .mensagens;

            if (
                !Array.isArray(
                    mensagens
                )
            ) {

                mensagens = [];

            }

            const novaMensagem = {

                remetente:
                    remetente,

                texto:
                    String(texto)
                        .trim(),

                data:
                    new Date()
                        .toISOString()

            };

            mensagens.push(
                novaMensagem
            );

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
                        id,

                    mensagem:
                        novaMensagem
                }
            );

            return res.json({
                sucesso: true,
                mensagem:
                    novaMensagem,
                mensagens:
                    mensagens
            });

        } catch (err) {

            console.error(
                'Erro no chat:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar mensagem.'
            });

        }

    }
);


// =====================================================
// EMPRESA VALIDA SERVIÇO
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
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                result.rows[0];

            if (!servico.checkout_hora) {

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
                'A empresa validou o serviço. Ele está pronto para o processo de pagamento.'
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
                    'Serviço validado pela empresa!',

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
                    'Erro ao validar serviço: '
                    +
                    err.message
            });

        }

    }
);// =====================================================
// APROVAR PAGAMENTO
// =====================================================

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
                    erro: 'Serviço não encontrado.'
                });

            }

            const servico =
                result.rows[0];

            if (!servico.validado_empresa) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A empresa precisa validar o serviço antes da aprovação.'
                });

            }

            await pool.query(
                `
                UPDATE servicos

                SET status = 'aprovado'

                WHERE id = $1
                `,
                [id]
            );

            await registrarLedger(
                id,
                servico.prestador_email,
                'REPASSE_PRESTADOR',
                Number(
                    servico.valor_liquido || 0
                )
            );

            const taxaPlataforma =
                Number(
                    servico.valor_total
                    ||
                    servico.valor_diaria
                    ||
                    0
                )
                -
                Number(
                    servico.valor_liquido
                    ||
                    0
                );

            if (taxaPlataforma > 0) {

                await registrarLedger(
                    id,
                    'admin@grupors.com',
                    'TAXA_PLATAFORMA',
                    taxaPlataforma
                );

            }

            await adicionarMensagemSistema(
                id,
                'O serviço foi aprovado para pagamento.'
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                ||
                req.body.empresaEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'APROVAR_PAGAMENTO',

                `Pagamento do serviço #${id} aprovado.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Pagamento aprovado com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro ao aprovar pagamento:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao aprovar pagamento: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// PROMOVER RESERVA PARA TITULAR
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
                req.body.reservaEmail
                ||
                ''
            )
                .trim()
                .toLowerCase();

        if (!emailReserva) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'E-mail do profissional reserva não informado.'
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

            if (!resultado.rows.length) {

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
                indiceReserva === -1
            ) {

                await client.query(
                    'ROLLBACK'
                );

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Este profissional não está mais na fila de reserva.'
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
                        index !== indiceReserva
                );

            const usuario =
                await client.query(
                    `
                    SELECT id
                    FROM usuarios
                    WHERE LOWER(email) = LOWER($1)
                    LIMIT 1
                    `,
                    [
                        novoTitular.email
                    ]
                );

            const novoPrestadorId =
                usuario.rows[0]?.id
                ||
                null;

            await client.query(
                `
                UPDATE servicos

                SET
                    prestador_email = $1,
                    prestador_id = $2,
                    prestador_nome = $3,
                    prestador_pix = $4,
                    prestador_whatsapp = $5,
                    reservas = $6::jsonb,
                    data_aceite = CURRENT_TIMESTAMP,
                    presenca_confirmada = FALSE,
                    selfie_confirmacao = NULL,
                    documento_comprovante = NULL,
                    status_checkin = 'pendente',
                    checkin_hora = NULL,
                    checkout_hora = NULL,
                    foto_ponto = NULL,
                    foto_checkin = NULL,
                    foto_checkout = NULL,
                    checkin_gps = NULL,
                    checkout_gps = NULL,
                    intervalo_inicio = NULL,
                    intervalo_retorno = NULL,
                    total_horas = NULL,
                    validado_empresa = FALSE,
                    validado_em = NULL,
                    comprovante_pagamento = FALSE,
                    comprovante_pagamento_arquivo = NULL,
                    comprovante_pagamento_nome = NULL,
                    comprovante_pagamento_tipo = NULL,
                    comprovante_pagamento_enviado_em = NULL,
                    pagamento_recebido_confirmado = FALSE,
                    pagamento_recebido_em = NULL,
                    status = 'em_andamento'

                WHERE id = $7
                `,
                [
                    novoTitular.email,
                    novoPrestadorId,
                    novoTitular.nome || '',
                    novoTitular.pix || '',
                    novoTitular.whatsapp || '',
                    JSON.stringify(fila),
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
                    `${novoTitular.nome || novoTitular.email} substituiu ${titularAnterior.nome || titularAnterior.email} como Titular do serviço #${id}.`
                    :
                    `${novoTitular.nome || novoTitular.email} foi promovido para Titular do serviço #${id}.`
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
                        novoTitular.nome
                        ||
                        '',

                    whatsapp:
                        novoTitular.whatsapp
                        ||
                        '',

                    pix:
                        novoTitular.pix
                        ||
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
// PRESTADOR SAI DA VAGA OU DA FILA
// =====================================================

app.post(
    '/api/servicos/:id/sair-vaga',
    async (req, res) => {

        const id =
            req.params.id;

        const prestadorEmail =
            String(
                req.body.prestadorEmail
                ||
                req.body.prestador_email
                ||
                ''
            )
                .trim()
                .toLowerCase();

        if (!prestadorEmail) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'E-mail do prestador não informado.'
            });

        }

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
                    erro:
                        'Serviço não encontrado.'
                });

            }

            const servico =
                result.rows[0];

            let fila =
                Array.isArray(
                    servico.reservas
                )
                    ? servico.reservas
                    : [];

            const emailTitular =
                String(
                    servico.prestador_email
                    ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            const indiceReserva =
                fila.findIndex(
                    pessoa =>
                        String(
                            pessoa.email
                            ||
                            ''
                        )
                            .trim()
                            .toLowerCase()
                        ===
                        prestadorEmail
                );

            // =============================================
            // É RESERVA: REMOVE APENAS DA FILA
            // =============================================

            if (
                indiceReserva !== -1
            ) {

                const reservaRemovido =
                    fila[indiceReserva];

                fila =
                    fila.filter(
                        (_, index) =>
                            index !== indiceReserva
                    );

                await client.query(
                    `
                    UPDATE servicos
                    SET reservas = $1::jsonb
                    WHERE id = $2
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

                await adicionarMensagemSistema(
                    id,
                    `${reservaRemovido.nome || reservaRemovido.email} saiu da fila de Reserva de Emergência.`
                );

                await registrarAuditoria(
                    prestadorEmail,
                    'SAIR_FILA_RESERVA',
                    `Prestador saiu da fila de reserva do serviço #${id}.`
                );

                io.emit(
                    'atualizar_servicos'
                );

                return res.json({
                    sucesso: true,
                    tipo: 'reserva',
                    mensagem:
                        'Você saiu da fila de reserva com sucesso.'
                });

            }

            // =============================================
            // É TITULAR
            // =============================================

            if (
                emailTitular ===
                prestadorEmail
            ) {

                // Se houver reserva, promove o primeiro
                if (
                    fila.length > 0
                ) {

                    const novoTitular =
                        fila[0];

                    const filaRestante =
                        fila.slice(1);

                    const usuario =
                        await client.query(
                            `
                            SELECT id
                            FROM usuarios
                            WHERE LOWER(email) = LOWER($1)
                            LIMIT 1
                            `,
                            [
                                novoTitular.email
                            ]
                        );

                    const novoPrestadorId =
                        usuario.rows[0]?.id
                        ||
                        null;

                    await client.query(
                        `
                        UPDATE servicos

                        SET
                            prestador_email = $1,
                            prestador_id = $2,
                            prestador_nome = $3,
                            prestador_pix = $4,
                            prestador_whatsapp = $5,
                            reservas = $6::jsonb,
                            data_aceite = CURRENT_TIMESTAMP,
                            presenca_confirmada = FALSE,
                            selfie_confirmacao = NULL,
                            documento_comprovante = NULL,
                            status_checkin = 'pendente',
                            checkin_hora = NULL,
                            checkout_hora = NULL,
                            foto_ponto = NULL,
                            foto_checkin = NULL,
                            foto_checkout = NULL,
                            checkin_gps = NULL,
                            checkout_gps = NULL,
                            intervalo_inicio = NULL,
                            intervalo_retorno = NULL,
                            total_horas = NULL,
                            validado_empresa = FALSE,
                            validado_em = NULL,
                            comprovante_pagamento = FALSE,
                            comprovante_pagamento_arquivo = NULL,
                            comprovante_pagamento_nome = NULL,
                            comprovante_pagamento_tipo = NULL,
                            comprovante_pagamento_enviado_em = NULL,
                            pagamento_recebido_confirmado = FALSE,
                            pagamento_recebido_em = NULL,
                            status = 'em_andamento'

                        WHERE id = $7
                        `,
                        [
                            novoTitular.email,
                            novoPrestadorId,
                            novoTitular.nome || '',
                            novoTitular.pix || '',
                            novoTitular.whatsapp || '',
                            JSON.stringify(
                                filaRestante
                            ),
                            id
                        ]
                    );

                    await client.query(
                        'COMMIT'
                    );

                    await adicionarMensagemSistema(
                        id,
                        `${servico.prestador_nome || prestadorEmail} desistiu da vaga. ${novoTitular.nome || novoTitular.email} foi promovido automaticamente para Titular.`
                    );

                    await registrarAuditoria(
                        prestadorEmail,
                        'DESISTIR_VAGA_TITULAR',
                        `Titular saiu do serviço #${id}. O primeiro reserva foi promovido automaticamente.`
                    );

                    io.emit(
                        'atualizar_servicos'
                    );

                    return res.json({
                        sucesso: true,

                        tipo:
                            'titular',

                        promovido:
                            true,

                        novoTitular: {
                            email:
                                novoTitular.email,

                            nome:
                                novoTitular.nome
                                ||
                                ''
                        },

                        mensagem:
                            `Você saiu da vaga. ${novoTitular.nome || 'O primeiro reserva'} foi promovido para Titular.`
                    });

                }

                // =============================================
                // TITULAR SAI E NÃO HÁ RESERVA
                // =============================================

                await client.query(
                    `
                    UPDATE servicos

                    SET
                        prestador_email = NULL,
                        prestador_id = NULL,
                        prestador_nome = NULL,
                        prestador_pix = NULL,
                        prestador_whatsapp = NULL,
                        data_aceite = NULL,
                        presenca_confirmada = FALSE,
                        selfie_confirmacao = NULL,
                        documento_comprovante = NULL,
                        status_checkin = 'pendente',
                        checkin_hora = NULL,
                        checkout_hora = NULL,
                        foto_ponto = NULL,
                        foto_checkin = NULL,
                        foto_checkout = NULL,
                        checkin_gps = NULL,
                        checkout_gps = NULL,
                        intervalo_inicio = NULL,
                        intervalo_retorno = NULL,
                        total_horas = NULL,
                        validado_empresa = FALSE,
                        validado_em = NULL,
                        comprovante_pagamento = FALSE,
                        comprovante_pagamento_arquivo = NULL,
                        comprovante_pagamento_nome = NULL,
                        comprovante_pagamento_tipo = NULL,
                        comprovante_pagamento_enviado_em = NULL,
                        pagamento_recebido_confirmado = FALSE,
                        pagamento_recebido_em = NULL,
                        status = 'ativo'

                    WHERE id = $1
                    `,
                    [id]
                );

                await client.query(
                    'COMMIT'
                );

                await adicionarMensagemSistema(
                    id,
                    `${servico.prestador_nome || prestadorEmail} desistiu da vaga. A vaga voltou a ficar disponível.`
                );

                await registrarAuditoria(
                    prestadorEmail,
                    'DESISTIR_VAGA_TITULAR',
                    `Titular saiu do serviço #${id}. Não havia reservas.`
                );

                io.emit(
                    'atualizar_servicos'
                );

                return res.json({
                    sucesso: true,

                    tipo:
                        'titular',

                    promovido:
                        false,

                    mensagem:
                        'Você saiu da vaga. Como não havia reservas, a vaga voltou a ficar disponível.'
                });

            }

            await client.query(
                'ROLLBACK'
            );

            return res.status(403).json({
                sucesso: false,

                erro:
                    'Você não está vinculado a esta vaga como Titular ou Reserva.'
            });

        } catch (err) {

            try {

                await client.query(
                    'ROLLBACK'
                );

            } catch (_) {}

            console.error(
                'Erro ao remover prestador da vaga:',
                err
            );

            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro ao sair da vaga.',

                detalhes:
                    err.message
            });

        } finally {

            client.release();

        }

    }
);


// =====================================================
// PROCESSAR STATUS / AUSÊNCIA
// =====================================================

app.post(
    '/api/servicos/:id/processar-status',
    async (req, res) => {

        const id =
            req.params.id;

        const {
            acao,
            motivo
        } =
            req.body;

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
                acao ===
                'verificar_ausencia'
            ) {

                if (
                    servico.status_checkin !==
                    'pendente'
                ) {

                    return res.status(400).json({
                        sucesso: false,
                        erro:
                            'O prestador já realizou o check-in.'
                    });

                }

                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        status =
                            'cancelado_ausencia_prestador',

                        motivo_cancelamento =
                            $1

                    WHERE id =
                        $2
                    `,
                    [
                        motivo
                        ||
                        'Prestador não compareceu no horário.',

                        id
                    ]
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

                        WHERE email =
                            $1
                        `,
                        [
                            servico.prestador_email
                        ]
                    );

                }

                await registrarLedger(
                    id,
                    servico.empresa_email,
                    'REEMBOLSO_AUTOMATICO',
                    Number(
                        servico.valor_diaria
                        ||
                        0
                    )
                );

                await adicionarMensagemSistema(
                    id,
                    'Serviço cancelado por ausência do prestador.'
                );

                await registrarAuditoria(
                    'sistema',
                    'AUSENCIA_PRESTADOR',
                    `Serviço #${id} cancelado por ausência.`
                );

                io.emit(
                    'atualizar_servicos'
                );

                return res.json({
                    sucesso: true,
                    mensagem:
                        'Ausência registrada e serviço cancelado.'
                });

            }

            if (
                acao ===
                'concluir'
            ) {

                if (
                    !servico.checkout_hora
                ) {

                    return res.status(400).json({
                        sucesso: false,
                        erro:
                            'O check-out ainda não foi realizado.'
                    });

                }

                await pool.query(
                    `
                    UPDATE servicos

                    SET status =
                        'concluido_com_sucesso'

                    WHERE id =
                        $1
                    `,
                    [id]
                );

                await adicionarMensagemSistema(
                    id,
                    'Serviço concluído com sucesso.'
                );

                await registrarAuditoria(
                    'sistema',
                    'CONCLUIR_SERVICO',
                    `Serviço #${id} concluído.`
                );

                io.emit(
                    'atualizar_servicos'
                );

                return res.json({
                    sucesso: true,
                    mensagem:
                        'Serviço concluído com sucesso.'
                });

            }

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Ação inválida.'
            });

        } catch (err) {

            console.error(
                'Erro ao processar status:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao processar status: '
                    +
                    err.message
            });

        }

    }
);


// =====================================================
// EXCLUIR SERVIÇO
// SOMENTE USADO PELA EMPRESA
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

            if (!result.rows.length) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });

            }

            await registrarAuditoria(
                req.body?.usuarioEmail
                ||
                'sistema',

                'DELETAR_SERVICO',

                `Serviço #${id} removido.`
            );

            io.emit(
                'atualizar_servicos'
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
                sucesso: false,
                erro:
                    'Erro ao excluir serviço.'
            });

        }

    }
);


// =====================================================
// STATUS DO SERVIDOR
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
                servidor:
                    'online',
                banco:
                    'conectado',
                sistema:
                    'RS Connect'
            });

        } catch (err) {

            return res.status(500).json({
                sucesso: false,
                servidor:
                    'online',
                banco:
                    'erro',
                erro:
                    err.message
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
// INDEX.HTML
// =====================================================

app.get(
    '/',
    (req, res) => {

        return res
            .status(200)
            .sendFile(
                path.join(
                    __dirname,
                    'index.html'
                )
            );

    }
);


// =====================================================
// ROTAS DA API NÃO ENCONTRADAS
//
// TEM QUE FICAR DEPOIS DE TODAS AS ROTAS
// =====================================================

app.use(
    '/api',
    (req, res) => {

        return res.status(404).json({
            sucesso: false,
            erro:
                'Rota da API não encontrada.',
            rota:
                req.originalUrl,
            metodo:
                req.method
        });

    }
);


// =====================================================
// TRATAMENTO DE ERRO
// =====================================================

app.use(
    (err, req, res, next) => {

        console.error(
            'Erro não tratado no servidor:',
            err
        );

        if (
            err instanceof
            multer.MulterError
        ) {

            if (
                err.code ===
                'LIMIT_FILE_SIZE'
            ) {

                return res.status(413).json({
                    sucesso: false,
                    erro:
                        'O arquivo enviado é muito grande. Limite máximo: 50 MB.'
                });

            }

            return res.status(400).json({
                sucesso: false,
                erro:
                    'Erro no upload: '
                    +
                    err.message
            });

        }

        return res.status(500).json({
            sucesso: false,
            erro:
                'Erro interno do servidor.'
        });

    }
);


// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT =
    process.env.PORT
    ||
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
