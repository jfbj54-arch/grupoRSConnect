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
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});


// =====================================================
// CONFIGURAÇÕES GERAIS
// =====================================================

app.use(
    express.json({
        limit: '50mb'
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '50mb'
    })
);

app.use(
    express.static(
        __dirname
    )
);


// =====================================================
// MULTER
// ARQUIVOS EM MEMÓRIA
// =====================================================

const upload = multer({
    storage:
        multer.memoryStorage(),

    limits: {
        fileSize:
            50 * 1024 * 1024
    }
});


// =====================================================
// POSTGRESQL
// =====================================================

const pool = new Pool({
    connectionString:
        process.env.DATABASE_URL,

    ssl:
        process.env.NODE_ENV === 'production'
            ? {
                rejectUnauthorized: false
            }
            : false
});


// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function normalizarEmail(email) {

    return String(
        email || ''
    )
        .trim()
        .toLowerCase();
}


function arrayJson(valor) {

    if (
        Array.isArray(valor)
    ) {
        return valor;
    }

    if (!valor) {
        return [];
    }

    try {

        const resultado =
            typeof valor === 'string'
                ? JSON.parse(valor)
                : valor;

        return Array.isArray(resultado)
            ? resultado
            : [];

    } catch (_) {

        return [];
    }
}


function numeroBR(valor) {

    if (
        typeof valor === 'number'
    ) {
        return valor;
    }

    let texto =
        String(
            valor || '0'
        )
            .replace(
                /R\$/gi,
                ''
            )
            .trim();

    if (
        texto.includes(',')
    ) {

        texto =
            texto
                .replace(
                    /\./g,
                    ''
                )
                .replace(
                    ',',
                    '.'
                );
    }

    texto =
        texto.replace(
            /[^0-9.-]/g,
            ''
        );

    const numero =
        Number(texto);

    return Number.isFinite(numero)
        ? numero
        : 0;
}


function hashCodigoRecuperacao(codigo) {

    return crypto
        .createHash('sha256')
        .update(
            String(codigo)
        )
        .digest('hex');
}


// =====================================================
// E-MAIL DE RECUPERAÇÃO
// =====================================================

async function enviarEmailRecuperacao(
    email,
    codigo
) {

    console.log(
        `Código de recuperação para ${email}: ${codigo}`
    );

    /*
       Aqui pode ser integrado posteriormente:
       Resend
       SendGrid
       Nodemailer
       SMTP
    */

    return true;
}


// =====================================================
// AUDITORIA
// =====================================================

async function registrarAuditoria(
    usuarioEmail,
    acao,
    detalhes
) {

    try {

        await pool.query(
            `
            INSERT INTO auditoria
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
                normalizarEmail(
                    usuarioEmail
                ),

                acao || '',

                detalhes || ''
            ]
        );

    } catch (err) {

        console.error(
            'Erro ao registrar auditoria:',
            err.message
        );
    }
}


// =====================================================
// LEDGER / MOVIMENTAÇÕES
// =====================================================

async function registrarLedger(
    servicoId,
    usuarioEmail,
    tipo,
    valor
) {

    try {

        await pool.query(
            `
            INSERT INTO ledger
            (
                servico_id,
                usuario_email,
                tipo,
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

                normalizarEmail(
                    usuarioEmail
                ),

                tipo || '',

                Number(valor) || 0
            ]
        );

    } catch (err) {

        console.error(
            'Erro ao registrar ledger:',
            err.message
        );
    }
}


// =====================================================
// MENSAGEM AUTOMÁTICA DO SISTEMA
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
                [
                    servicoId
                ]
            );

        if (
            !result.rows.length
        ) {
            return;
        }

        const mensagens =
            arrayJson(
                result.rows[0]
                    .mensagens
            );

        mensagens.push({
            remetente:
                'Sistema',

            texto:
                texto,

            sistema:
                true,

            data:
                new Date()
                    .toISOString()
        });

        await pool.query(
            `
            UPDATE servicos
            SET mensagens = $1::jsonb
            WHERE id = $2
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
            err.message
        );
    }
}


// =====================================================
// CRIAÇÃO / ATUALIZAÇÃO DAS TABELAS
// =====================================================

async function prepararBanco() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios
            (
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
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        await pool.query(`
            CREATE TABLE IF NOT EXISTS prestadores
            (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        await pool.query(`
            CREATE TABLE IF NOT EXISTS servicos
            (
                id SERIAL PRIMARY KEY,

                titulo TEXT,
                categoria TEXT,
                local TEXT,
                endereco TEXT,

                valor TEXT,
                valor_diaria NUMERIC DEFAULT 0,
                valor_liquido NUMERIC DEFAULT 0,
                valor_total NUMERIC DEFAULT 0,

                data_horario TEXT,
                forma_pgto TEXT,
                descricao TEXT,
                contrato_texto TEXT,

                empresa_email TEXT,
                empresa_whatsapp TEXT,
                empresa_nome TEXT,

                recorrencia TEXT DEFAULT 'unico',

                status TEXT DEFAULT 'ativo',

                prestador_id INTEGER,
                prestador_email TEXT,
                prestador_nome TEXT,
                prestador_pix TEXT,
                prestador_whatsapp TEXT,
                prestador_rg_cnh TEXT,

                data_aceite TIMESTAMP,

                reservas JSONB DEFAULT '[]'::jsonb,
                mensagens JSONB DEFAULT '[]'::jsonb,

                presenca_confirmada BOOLEAN DEFAULT FALSE,
                selfie_confirmacao TEXT,
                documento_comprovante TEXT,

                status_checkin TEXT DEFAULT 'pendente',

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

                validado_empresa BOOLEAN DEFAULT FALSE,
                validado_em TIMESTAMP,

                pagamento_autorizado BOOLEAN DEFAULT FALSE,

                autorizacao_pagamento_arquivo TEXT,
                autorizacao_pagamento_nome TEXT,
                autorizacao_pagamento_em TIMESTAMP,
                autorizacao_pagamento_por TEXT,

                contrato_empresa_arquivo TEXT,
                contrato_empresa_nome TEXT,
                contrato_empresa_tipo TEXT,
                contrato_empresa_enviado_em TIMESTAMP,

                nota_oficial TEXT,
                nota_nome TEXT,
                nota_tipo TEXT,
                nota_remetente TEXT,
                nota_enviada_em TIMESTAMP,

                comprovante_pagamento BOOLEAN DEFAULT FALSE,
                comprovante_pagamento_arquivo TEXT,
                comprovante_pagamento_nome TEXT,
                comprovante_pagamento_tipo TEXT,
                comprovante_pagamento_enviado_em TIMESTAMP,

                pagamento_recebido_confirmado BOOLEAN DEFAULT FALSE,
                pagamento_recebido_em TIMESTAMP,

                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        await pool.query(`
            CREATE TABLE IF NOT EXISTS auditoria
            (
                id SERIAL PRIMARY KEY,
                usuario_email TEXT,
                acao TEXT,
                detalhes TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        await pool.query(`
            CREATE TABLE IF NOT EXISTS ledger
            (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER,
                usuario_email TEXT,
                tipo TEXT,
                valor NUMERIC DEFAULT 0,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        await pool.query(`
            CREATE TABLE IF NOT EXISTS recuperacao_senha
            (
                id SERIAL PRIMARY KEY,
                email TEXT,
                codigo_hash TEXT,
                usado BOOLEAN DEFAULT FALSE,
                expira_em TIMESTAMP,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // =================================================
        // GARANTE COLUNAS EM BANCOS ANTIGOS
        // =================================================

        const colunas = [

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_nome TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_whatsapp TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS recorrencia TEXT DEFAULT 'unico'`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_total NUMERIC DEFAULT 0`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC DEFAULT 0`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC DEFAULT 0`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_id INTEGER`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_nome TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_pix TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_whatsapp TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_rg_cnh TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS data_aceite TIMESTAMP`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS mensagens JSONB DEFAULT '[]'::jsonb`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN DEFAULT FALSE`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS documento_comprovante TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status_checkin TEXT DEFAULT 'pendente'`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_hora TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_hora TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_ponto TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkin TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkout TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_gps TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_gps TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_inicio TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_retorno TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS total_horas TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_empresa BOOLEAN DEFAULT FALSE`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_autorizado BOOLEAN DEFAULT FALSE`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS autorizacao_pagamento_arquivo TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS autorizacao_pagamento_nome TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS autorizacao_pagamento_em TIMESTAMP`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS autorizacao_pagamento_por TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_arquivo TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_nome TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_tipo TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_empresa_enviado_em TIMESTAMP`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_oficial TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_nome TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_tipo TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_remetente TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_enviada_em TIMESTAMP`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN DEFAULT FALSE`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_arquivo TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_nome TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_tipo TEXT`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_enviado_em TIMESTAMP`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_recebido_confirmado BOOLEAN DEFAULT FALSE`,

            `ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_recebido_em TIMESTAMP`
        ];


        for (
            const sql of colunas
        ) {

            await pool.query(
                sql
            );
        }


        console.log(
            'Tabelas e colunas do RS Connect verificadas com sucesso.'
        );

    } catch (err) {

        console.error(
            'Erro ao preparar PostgreSQL:',
            err
        );

        throw err;
    }
}


// =====================================================
// INICIAR SERVIDOR
// IMPORTANTE PARA O RENDER
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
            `Ambiente: ${process.env.NODE_ENV || 'development'}`
        );

        console.log(
            '=========================================='
        );
    }
);


// =====================================================
// CONECTAR E PREPARAR POSTGRESQL
// =====================================================

(async () => {

    try {

        await pool.query(
            'SELECT NOW()'
        );

        console.log(
            'Conectado com sucesso ao PostgreSQL.'
        );

        await prepararBanco();

    } catch (err) {

        console.error(
            'Falha ao inicializar banco:',
            err
        );
    }

})();
// =====================================================
// PARTE 2 - AUTENTICAÇÃO, USUÁRIOS E SERVIÇOS
// =====================================================


// =====================================================
// CADASTRAR USUÁRIO
// =====================================================

app.post(
    '/api/auth/registrar',
    async (req, res) => {

        const d =
            req.body || {};

        try {

            const result =
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
                        d.tipo || '',

                        d.nome || '',

                        d.doc || '',

                        d.responsavel || '',

                        normalizarEmail(
                            d.email
                        ),

                        d.senha || '',

                        d.whatsapp || '',

                        d.endereco || '',

                        d.rgCnh
                        ||
                        d.rg_cnh
                        ||
                        '',

                        d.profissao || '',

                        d.tipoChavePix
                        ||
                        d.tipo_chave_pix
                        ||
                        '',

                        d.pix || '',

                        d.banco || '',

                        d.conta || '',

                        d.experiencia || ''
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

                    ON CONFLICT (email)
                    DO NOTHING
                    `,
                    [
                        normalizarEmail(
                            d.email
                        )
                    ]
                );
            }


            await registrarAuditoria(
                d.email,

                'CADASTRO_USUARIO',

                `Novo usuário tipo ${d.tipo || 'não informado'} cadastrado.`
            );


            return res.json({
                sucesso: true,

                id:
                    result.rows[0].id
            });


        } catch (err) {

            console.error(
                'Erro no cadastro:',
                err
            );


            return res.status(400).json({
                sucesso: false,

                erro:
                    err.code === '23505'
                        ? 'E-mail já cadastrado.'
                        : 'Erro ao cadastrar usuário.'
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

        const email =
            normalizarEmail(
                req.body?.email
            );


        const senha =
            String(
                req.body?.senha
                ||
                ''
            );


        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM usuarios

                    WHERE LOWER(email) =
                        $1

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
                !result.rows.length
            ) {

                return res.status(401).json({
                    sucesso: false,

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
                sucesso: true,

                usuario:
                    result.rows[0]
            });


        } catch (err) {

            console.error(
                'Erro no login:',
                err
            );


            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro no servidor.'
            });
        }
    }
);


// =====================================================
// ESQUECI MINHA SENHA
// =====================================================

app.post(
    '/api/auth/esqueci-senha',
    async (req, res) => {

        const email =
            normalizarEmail(
                req.body?.email
            );


        if (!email) {

            return res.status(400).json({
                sucesso: false,

                erro:
                    'Informe o e-mail da conta.'
            });
        }


        try {

            const usuario =
                await pool.query(
                    `
                    SELECT id
                    FROM usuarios

                    WHERE LOWER(email) =
                        $1

                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            if (
                !usuario.rows.length
            ) {

                return res.json({
                    sucesso: true,

                    mensagem:
                        'Se o e-mail estiver cadastrado, enviaremos um código.'
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

                'Código de recuperação enviado.'
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Código enviado. Ele expira em 15 minutos.'
            });


        } catch (err) {

            console.error(
                'Erro na recuperação de senha:',
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
            normalizarEmail(
                req.body?.email
            );


        const codigo =
            String(
                req.body?.codigo
                ||
                ''
            ).trim();


        const novaSenha =
            String(
                req.body?.novaSenha
                ||
                ''
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

                        hashCodigoRecuperacao(
                            codigo
                        )
                    ]
                );


            if (
                !token.rows.length
            ) {

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

                return res.status(404).json({
                    sucesso: false,

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

                'Senha redefinida com código de recuperação.'
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
                    'Erro interno ao redefinir senha.'
            });
        }
    }
);


// =====================================================
// BUSCAR USUÁRIO
// =====================================================

app.get(
    '/api/usuarios/:email',
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM usuarios

                    WHERE LOWER(email) =
                        $1

                    LIMIT 1
                    `,
                    [
                        normalizarEmail(
                            req.params.email
                        )
                    ]
                );


            if (
                !result.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,

                    erro:
                        'Usuário não encontrado.'
                });
            }


            return res.json({
                sucesso: true,

                usuario:
                    result.rows[0]
            });


        } catch (err) {

            console.error(
                'Erro ao buscar usuário:',
                err
            );


            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro ao buscar usuário.'
            });
        }
    }
);


// =====================================================
// ATUALIZAR USUÁRIO
// =====================================================

app.put(
    '/api/usuarios/:email',
    async (req, res) => {

        const d =
            req.body || {};


        try {

            const result =
                await pool.query(
                    `
                    UPDATE usuarios

                    SET
                        nome =
                            COALESCE(
                                $1,
                                nome
                            ),

                        doc =
                            COALESCE(
                                $2,
                                doc
                            ),

                        responsavel =
                            COALESCE(
                                $3,
                                responsavel
                            ),

                        whatsapp =
                            COALESCE(
                                $4,
                                whatsapp
                            ),

                        endereco =
                            COALESCE(
                                $5,
                                endereco
                            ),

                        rg_cnh =
                            COALESCE(
                                $6,
                                rg_cnh
                            ),

                        profissao =
                            COALESCE(
                                $7,
                                profissao
                            ),

                        tipo_chave_pix =
                            COALESCE(
                                $8,
                                tipo_chave_pix
                            ),

                        pix =
                            COALESCE(
                                $9,
                                pix
                            ),

                        banco =
                            COALESCE(
                                $10,
                                banco
                            ),

                        conta =
                            COALESCE(
                                $11,
                                conta
                            ),

                        experiencia =
                            COALESCE(
                                $12,
                                experiencia
                            )

                    WHERE LOWER(email) =
                        $13

                    RETURNING *
                    `,
                    [
                        d.nome ?? null,

                        d.doc ?? null,

                        d.responsavel ?? null,

                        d.whatsapp ?? null,

                        d.endereco ?? null,

                        d.rgCnh
                        ??
                        d.rg_cnh
                        ??
                        null,

                        d.profissao ?? null,

                        d.tipoChavePix
                        ??
                        d.tipo_chave_pix
                        ??
                        null,

                        d.pix ?? null,

                        d.banco ?? null,

                        d.conta ?? null,

                        d.experiencia ?? null,

                        normalizarEmail(
                            req.params.email
                        )
                    ]
                );


            if (
                !result.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,

                    erro:
                        'Usuário não encontrado.'
                });
            }


            await registrarAuditoria(
                req.params.email,

                'ATUALIZAR_PERFIL',

                'Perfil atualizado.'
            );


            return res.json({
                sucesso: true,

                usuario:
                    result.rows[0]
            });


        } catch (err) {

            console.error(
                'Erro ao atualizar usuário:',
                err
            );


            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro ao atualizar usuário.'
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

            const result =
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
                        )
                        AS empresa_nome_resolvido

                    FROM servicos s

                    LEFT JOIN usuarios u
                        ON LOWER(u.email)
                        =
                        LOWER(s.empresa_email)

                    ORDER BY s.id DESC
                    `
                );


            const servicos =
                result.rows.map(
                    s => ({

                        ...s,

                        empresa_nome:
                            s.empresa_nome_resolvido
                            ||
                            s.empresa_nome
                            ||
                            '',

                        empresaNome:
                            s.empresa_nome_resolvido
                            ||
                            s.empresa_nome
                            ||
                            '',

                        empresaEmail:
                            s.empresa_email,

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

                        reservas:
                            arrayJson(
                                s.reservas
                            ),

                        mensagens:
                            arrayJson(
                                s.mensagens
                            )
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
// BUSCAR UM SERVIÇO
// =====================================================

app.get(
    '/api/servicos/:id',
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE id =
                        $1
                    `,
                    [
                        req.params.id
                    ]
                );


            if (
                !result.rows.length
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
            req.body || {};


        try {

            const valorUnitario =
                numeroBR(
                    s.valor
                );


            const recorrencia =
                String(
                    s.recorrencia
                    ||
                    'unico'
                )
                    .trim()
                    .toLowerCase();


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


            const taxaPlataforma =
                valorTotal * 0.10;


            const valorLiquido =
                valorTotal
                -
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
                        s.titulo
                        ||
                        '',

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
                        s.contrato_texto
                        ||
                        '',

                        normalizarEmail(
                            s.empresaEmail
                            ||
                            s.empresa_email
                        ),

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
                result.rows[0];


            await registrarLedger(
                servico.id,

                servico.empresa_email,

                'RETENCAO_GARANTIA',

                valorTotal
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

                id:
                    servico.id,

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
// CHAT DO SERVIÇO
// =====================================================

app.post(
    '/api/servicos/:id/chat',
    async (req, res) => {

        const id =
            req.params.id;


        const remetente =
            req.body?.remetente
            ||
            req.body?.remetenteNome
            ||
            req.body?.email
            ||
            'Usuário';


        const texto =
            String(
                req.body?.texto
                ||
                req.body?.mensagem
                ||
                ''
            ).trim();


        if (!texto) {

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

                    WHERE id =
                        $1
                    `,
                    [
                        id
                    ]
                );


            if (
                !result.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,

                    erro:
                        'Serviço não encontrado.'
                });
            }


            const mensagens =
                arrayJson(
                    result.rows[0]
                        .mensagens
                );


            const novaMensagem = {

                remetente,

                texto,

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
                'nova_mensagem',
                {
                    servicoId:
                        id,

                    mensagem:
                        novaMensagem
                }
            );


            io.emit(
                'atualizar_servicos'
            );


            return res.json({
                sucesso: true,

                mensagem:
                    novaMensagem,

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
// NOTA FISCAL OFICIAL
// =====================================================

app.post(
    '/api/servicos/:id/nota-oficial',

    upload.single(
        'notaFiscal'
    ),

    async (req, res) => {

        const id =
            req.params.id;


        try {

            const arquivo =
                req.file;


            const dadosNota =
                (
                    arquivo

                        ? `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`

                        : null
                )

                ||

                req.body?.notaFiscal

                ||

                req.body?.nota_fiscal_oficial

                ||

                req.body?.nota_oficial

                ||

                null;


            if (!dadosNota) {

                return res.status(400).json({
                    sucesso: false,

                    erro:
                        'Nenhuma Nota Fiscal foi enviada.'
                });
            }


            const existe =
                await pool.query(
                    `
                    SELECT id
                    FROM servicos

                    WHERE id =
                        $1
                    `,
                    [
                        id
                    ]
                );


            if (
                !existe.rows.length
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

                req.body?.notaNome

                ||

                req.body?.nota_nome

                ||

                'nota-fiscal';


            const tipoArquivo =
                arquivo?.mimetype

                ||

                req.body?.notaTipo

                ||

                req.body?.nota_tipo

                ||

                (
                    String(
                        dadosNota
                    )
                        .startsWith(
                            'data:application/pdf'
                        )

                        ? 'application/pdf'

                        : 'arquivo'
                );


            const remetente =
                req.body?.notaFiscalRemetente

                ||

                req.body?.nota_fiscal_remetente

                ||

                req.body?.usuarioNome

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

                `Nota Fiscal Oficial "${nomeArquivo}" enviada por ${remetente}.`
            );


            await registrarAuditoria(
                req.body?.usuarioEmail
                ||
                'sistema',

                'ENVIO_NOTA_FISCAL',

                `Nota Fiscal ${nomeArquivo} enviada para o serviço #${id}`
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
                    remetente,

                nota_fiscal_oficial:
                    dadosNota
            });


        } catch (err) {

            console.error(
                'Erro ao enviar Nota Fiscal:',
                err
            );


            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro interno ao processar a Nota Fiscal: '
                    +
                    err.message
            });
        }
    }
);
// =====================================================
// PARTE 3 - FILA, TITULAR, PRESENÇA, CHECK-IN E CHECK-OUT
// =====================================================


// =====================================================
// ENTRAR NA FILA / RESERVA
// =====================================================

app.post(
    '/api/servicos/:id/fila',
    async (req, res) => {

        const id =
            req.params.id;

        const prestadorEmail =
            normalizarEmail(
                req.body?.prestadorEmail
                ||
                req.body?.prestador_email
            );

        const prestadorNome =
            req.body?.prestadorNome
            ||
            req.body?.prestador_nome
            ||
            '';

        const prestadorWhatsapp =
            req.body?.prestadorWhatsapp
            ||
            req.body?.prestador_whatsapp
            ||
            '';

        const prestadorPix =
            req.body?.prestadorPix
            ||
            req.body?.prestador_pix
            ||
            '';

        const rgCnh =
            req.body?.rgCnh
            ||
            req.body?.rg_cnh
            ||
            '';

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

            const status =
                String(
                    servico.status
                    ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            const encerrados = [
                'aguardando_validacao',
                'validado',
                'pagamento_autorizado',
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

            const empresaEmail =
                normalizarEmail(
                    servico.empresa_email
                );

            if (
                empresaEmail &&
                empresaEmail === prestadorEmail
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

            const titularEmail =
                normalizarEmail(
                    servico.prestador_email
                );

            if (
                titularEmail &&
                titularEmail === prestadorEmail
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
                arrayJson(
                    servico.reservas
                );

            const jaEstaNaFila =
                fila.some(
                    pessoa =>
                        normalizarEmail(
                            pessoa.email
                        )
                        ===
                        prestadorEmail
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
                            ? 'As 2 vagas de Reserva de Emergência já foram preenchidas.'
                            : 'A fila desta vaga já possui 3 candidatos.'
                });
            }

            fila.push({
                email:
                    prestadorEmail,

                nome:
                    prestadorNome,

                whatsapp:
                    prestadorWhatsapp,

                pix:
                    prestadorPix,

                rgCnh:
                    rgCnh,

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
                    ? 'ENTRAR_RESERVA'
                    : 'ENTRAR_FILA',

                `Prestador entrou no serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    temTitular
                        ? `Você entrou como Reserva ${fila.length}.`
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
                    'Erro ao entrar na fila.'
            });

        } finally {

            client.release();
        }
    }
);


// =====================================================
// ACEITAR VAGA COMO TITULAR
//
// REGRA CORRIGIDA:
// - Se a vaga não possui titular, o primeiro prestador
//   pode assumir DIRETAMENTE.
// - Não precisa estar previamente na fila.
// =====================================================

app.post(
    '/api/servicos/:id/aceitar',
    async (req, res) => {

        const id =
            req.params.id;

        const prestadorEmail =
            normalizarEmail(
                req.body?.prestadorEmail
                ||
                req.body?.prestador_email
            );

        const prestadorNome =
            req.body?.prestadorNome
            ||
            req.body?.prestador_nome
            ||
            '';

        const prestadorPix =
            req.body?.prestadorPix
            ||
            req.body?.prestador_pix
            ||
            '';

        const prestadorWhatsapp =
            req.body?.prestadorWhatsapp
            ||
            req.body?.prestador_whatsapp
            ||
            '';

        const rgCnh =
            req.body?.rgCnh
            ||
            req.body?.rg_cnh
            ||
            '';

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

            if (
                servico.prestador_email
            ) {

                await client.query(
                    'ROLLBACK'
                );

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Esta vaga já possui um Titular. Você pode entrar somente como Reserva de Emergência.'
                });
            }

            const empresaEmail =
                normalizarEmail(
                    servico.empresa_email
                );

            if (
                empresaEmail &&
                empresaEmail === prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A empresa não pode assumir a própria vaga.'
                });
            }

            let fila =
                arrayJson(
                    servico.reservas
                );

            fila =
                fila.filter(
                    pessoa =>
                        normalizarEmail(
                            pessoa.email
                        )
                        !==
                        prestadorEmail
                );

            const usuario =
                await client.query(
                    `
                    SELECT
                        id,
                        nome,
                        whatsapp,
                        pix,
                        rg_cnh

                    FROM usuarios

                    WHERE LOWER(email) =
                        LOWER($1)

                    LIMIT 1
                    `,
                    [
                        prestadorEmail
                    ]
                );

            const dadosUsuario =
                usuario.rows[0]
                ||
                {};

            const prestadorId =
                dadosUsuario.id
                ||
                null;

            const nomeFinal =
                prestadorNome
                ||
                dadosUsuario.nome
                ||
                prestadorEmail;

            const whatsappFinal =
                prestadorWhatsapp
                ||
                dadosUsuario.whatsapp
                ||
                '';

            const pixFinal =
                prestadorPix
                ||
                dadosUsuario.pix
                ||
                '';

            const rgFinal =
                rgCnh
                ||
                dadosUsuario.rg_cnh
                ||
                '';

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

                        prestador_rg_cnh =
                            $6,

                        reservas =
                            $7::jsonb,

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
                        $8

                    RETURNING *
                    `,
                    [
                        prestadorEmail,
                        prestadorId,
                        nomeFinal,
                        pixFinal,
                        whatsappFinal,
                        rgFinal,

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
                `${nomeFinal} assumiu a vaga como Titular.`
            );

            await registrarAuditoria(
                prestadorEmail,

                'ACEITAR_SERVICO',

                `Prestador assumiu diretamente como Titular do serviço #${id}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,

                mensagem:
                    'Você assumiu a vaga como Titular!',

                data_aceite:
                    atualizado.rows[0]
                        .data_aceite,

                servico:
                    atualizado.rows[0],

                fila_restante:
                    fila
            });

        } catch (err) {

            try {

                await client.query(
                    'ROLLBACK'
                );

            } catch (_) {}

            console.error(
                'Erro ao assumir vaga:',
                err
            );

            return res.status(500).json({
                sucesso: false,

                erro:
                    'Erro ao assumir a vaga: '
                    +
                    err.message
            });

        } finally {

            client.release();
        }
    }
);


// =====================================================
// CONFIRMAR PRESENÇA
// FOTO ENVIADA PELO INDEX / CÂMERA AO VIVO
// =====================================================

app.post(
    '/api/servicos/:id/confirmar-presenca',
    async (req, res) => {

        const id =
            req.params.id;

        const selfie =
            req.body?.selfie
            ||
            req.body?.selfie_confirmacao
            ||
            null;

        const documentoComprovante =
            req.body?.documentoComprovante
            ||
            req.body?.documento_comprovante
            ||
            null;

        const prestadorEmail =
            normalizarEmail(
                req.body?.prestadorEmail
                ||
                req.body?.prestador_email
            );

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
                        'Esta vaga ainda não possui Titular.'
                });
            }

            if (
                prestadorEmail
                &&
                normalizarEmail(
                    servico.prestador_email
                )
                !==
                prestadorEmail
            ) {

                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Somente o Titular pode confirmar presença.'
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
// FOTO + GPS + HORÁRIO
// =====================================================

app.post(
    '/api/servicos/:id/checkin',
    async (req, res) => {

        const id =
            req.params.id;

        const foto =
            req.body?.foto
            ||
            req.body?.fotoCheckin
            ||
            req.body?.foto_checkin
            ||
            null;

        const hora =
            req.body?.hora
            ||
            req.body?.checkin_hora
            ||
            new Date()
                .toLocaleTimeString(
                    'pt-BR'
                );

        const gps =
            req.body?.gps
            ||
            req.body?.checkin_gps
            ||
            req.body?.gps_checkin
            ||
            null;

        const prestadorEmail =
            normalizarEmail(
                req.body?.prestadorEmail
                ||
                req.body?.prestador_email
            );

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
                prestadorEmail
                &&
                normalizarEmail(
                    servico.prestador_email
                )
                !==
                prestadorEmail
            ) {

                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Somente o Titular pode realizar o check-in.'
                });
            }

            if (
                !servico.presenca_confirmada
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Confirme sua presença antes de realizar o check-in.'
                });
            }

            if (
                servico.checkin_hora
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        `Check-in já realizado às ${servico.checkin_hora}.`,
                    checkin_finalizado:
                        true
                });
            }

            if (
                servico.checkout_hora
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Este serviço já possui check-out.'
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
                prestadorEmail
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
            req.body?.hora
            ||
            new Date()
                .toLocaleTimeString(
                    'pt-BR'
                );

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
            req.body?.hora
            ||
            new Date()
                .toLocaleTimeString(
                    'pt-BR'
                );

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

                SET intervalo_retorno =
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
                    'Erro ao registrar retorno.'
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

    upload.single(
        'fotoCheckout'
    ),

    async (req, res) => {

        const id =
            req.params.id;

        try {

            const arquivo =
                req.file;

            const foto =
                req.body?.fotoCheckout
                ||
                req.body?.foto_checkout
                ||
                req.body?.foto
                ||
                (
                    arquivo
                        ? `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        : null
                );

            const hora =
                req.body?.hora
                ||
                req.body?.checkout_hora
                ||
                new Date()
                    .toLocaleTimeString(
                        'pt-BR'
                    );

            const gps =
                req.body?.gps
                ||
                req.body?.checkout_gps
                ||
                req.body?.gps_checkout
                ||
                null;

            const totalHoras =
                req.body?.totalHoras
                ||
                req.body?.total_horas
                ||
                '';

            const prestadorEmail =
                normalizarEmail(
                    req.body?.prestadorEmail
                    ||
                    req.body?.prestador_email
                );

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
                prestadorEmail
                &&
                normalizarEmail(
                    servico.prestador_email
                )
                !==
                prestadorEmail
            ) {

                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Somente o Titular pode realizar o check-out.'
                });
            }

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
                        `Check-out já realizado às ${servico.checkout_hora}.`,
                    checkout_finalizado:
                        true
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
                `Check-out realizado às ${hora}. Serviço aguardando validação da empresa.`
            );

            await registrarAuditoria(
                prestadorEmail
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
                    'Check-out realizado com sucesso!',

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
                    'Erro ao realizar check-out.'
            });
        }
    }
);
// =====================================================
// PARTE 4 - VALIDAÇÃO, PAGAMENTO, PROMOÇÃO,
// SAÍDA DA VAGA, EXCLUSÃO, STATUS E SOCKET.IO
// =====================================================


// =====================================================
// EMPRESA VALIDA O SERVIÇO
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

            if (servico.validado_empresa) {

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
                'A empresa validou a execução do serviço.'
            );

            await registrarAuditoria(
                req.body?.empresaEmail
                ||
                req.body?.usuarioEmail
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
                    'Serviço validado com sucesso!',
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
// AUTORIZAR PAGAMENTO
// =====================================================

app.post(
    '/api/servicos/:id/autorizar-pagamento',
    async (req, res) => {

        const id =
            req.params.id;

        const empresaEmail =
            normalizarEmail(
                req.body?.empresaEmail
                ||
                req.body?.empresa_email
            );

        const empresaNome =
            req.body?.empresaNome
            ||
            req.body?.empresa_nome
            ||
            '';

        const relatorioPdf =
            req.body?.relatorioPdf
            ||
            req.body?.autorizacao_pagamento_arquivo
            ||
            null;

        const relatorioNome =
            req.body?.relatorioNome
            ||
            req.body?.autorizacao_pagamento_nome
            ||
            `autorizacao-pagamento-servico-${id}.pdf`;

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
                empresaEmail
                &&
                normalizarEmail(
                    servico.empresa_email
                )
                !==
                empresaEmail
            ) {

                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Somente a empresa responsável por esta vaga pode autorizar o pagamento.'
                });
            }

            if (!servico.checkout_hora) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O prestador ainda não realizou o check-out.'
                });
            }

            if (!servico.presenca_confirmada) {

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
                        'A foto de entrada não foi encontrada.'
                });
            }

            if (!servico.foto_checkout) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A foto de saída não foi encontrada.'
                });
            }

            if (servico.pagamento_autorizado) {

                return res.json({
                    sucesso: true,
                    mensagem:
                        'O pagamento deste serviço já foi autorizado.',
                    pagamento_autorizado:
                        true
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

                    RETURNING *
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
                'A empresa autorizou o pagamento deste serviço.'
            );

            await registrarAuditoria(
                empresaEmail
                ||
                servico.empresa_email
                ||
                'empresa',

                'AUTORIZAR_PAGAMENTO',

                `Pagamento autorizado no serviço #${id}.`
            );

            await registrarLedger(
                id,
                servico.prestador_email,
                'PAGAMENTO_AUTORIZADO',
                servico.valor_liquido
                ||
                servico.valor_diaria
                ||
                0
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Pagamento autorizado com sucesso!',
                pagamento_autorizado:
                    true,
                servico:
                    atualizado.rows[0]
            });

        } catch (err) {

            console.error(
                'Erro ao autorizar pagamento:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao autorizar pagamento.'
            });
        }
    }
);


// =====================================================
// PROMOVER RESERVA
// =====================================================

app.post(
    '/api/servicos/:id/promover',
    async (req, res) => {

        const id =
            req.params.id;

        const emailReserva =
            normalizarEmail(
                req.body?.emailReserva
                ||
                req.body?.prestadorEmail
                ||
                req.body?.reservaEmail
            );

        if (!emailReserva) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    'E-mail do reserva não informado.'
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
                arrayJson(
                    servico.reservas
                );

            const indice =
                fila.findIndex(
                    pessoa =>
                        normalizarEmail(
                            pessoa.email
                        )
                        ===
                        emailReserva
                );

            if (indice === -1) {

                await client.query(
                    'ROLLBACK'
                );

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Este profissional não está mais na fila.'
                });
            }

            const novoTitular =
                fila[indice];

            fila =
                fila.filter(
                    (_, i) =>
                        i !== indice
                );

            await client.query(
                `
                UPDATE servicos

                SET
                    prestador_email =
                        $1,

                    prestador_nome =
                        $2,

                    prestador_whatsapp =
                        $3,

                    prestador_pix =
                        $4,

                    prestador_rg_cnh =
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

                    status =
                        'em_andamento'

                WHERE id =
                    $7
                `,
                [
                    novoTitular.email,
                    novoTitular.nome || '',
                    novoTitular.whatsapp || '',
                    novoTitular.pix || '',
                    novoTitular.rgCnh || '',
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
                `${novoTitular.nome || novoTitular.email} foi promovido para Titular.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    `${novoTitular.nome || novoTitular.email} agora é o Titular.`,
                novoTitular,
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
                'Erro ao promover reserva:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao promover reserva.'
            });

        } finally {

            client.release();
        }
    }
);


// =====================================================
// SUBSTITUIÇÃO AUTOMÁTICA DO TITULAR
// =====================================================

app.post(
    '/api/substituir-prestador',
    async (req, res) => {

        const titularAtualId =
            normalizarEmail(
                req.body?.titularAtualId
                ||
                req.body?.titularEmail
            );

        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE LOWER(prestador_email) =
                        LOWER($1)

                    ORDER BY data_aceite DESC
                    NULLS LAST

                    LIMIT 1
                    `,
                    [
                        titularAtualId
                    ]
                );

            if (!result.rows.length) {

                return res.status(404).json({
                    sucesso: false,
                    mensagem:
                        'Titular atual não encontrado.'
                });
            }

            const servico =
                result.rows[0];

            const fila =
                arrayJson(
                    servico.reservas
                );

            if (!fila.length) {

                return res.status(409).json({
                    sucesso: false,
                    mensagem:
                        'Não existe reserva disponível para promoção.'
                });
            }

            const novoTitular =
                fila[0];

            const novaFila =
                fila.slice(1);

            await pool.query(
                `
                UPDATE servicos

                SET
                    prestador_email =
                        $1,

                    prestador_nome =
                        $2,

                    prestador_whatsapp =
                        $3,

                    prestador_pix =
                        $4,

                    prestador_rg_cnh =
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

                    status =
                        'em_andamento'

                WHERE id =
                    $7
                `,
                [
                    novoTitular.email,
                    novoTitular.nome || '',
                    novoTitular.whatsapp || '',
                    novoTitular.pix || '',
                    novoTitular.rgCnh || '',
                    JSON.stringify(
                        novaFila
                    ),
                    servico.id
                ]
            );

            await adicionarMensagemSistema(
                servico.id,
                `${novoTitular.nome || novoTitular.email} foi promovido automaticamente após o prazo do titular anterior.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Reserva promovida automaticamente.',
                novoTitular
            });

        } catch (err) {

            console.error(
                'Erro na substituição automática:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                mensagem:
                    'Erro ao substituir prestador.'
            });
        }
    }
);


// =====================================================
// PRESTADOR SAI DA VAGA / FILA
// =====================================================

app.post(
    '/api/servicos/:id/sair-vaga',
    async (req, res) => {

        const id =
            req.params.id;

        const prestadorEmail =
            normalizarEmail(
                req.body?.prestadorEmail
                ||
                req.body?.prestador_email
            );

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

            if (
                servico.checkout_hora
                ||
                servico.pagamento_autorizado
            ) {

                await client.query(
                    'ROLLBACK'
                );

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Não é possível sair porque este serviço já foi realizado ou entrou em pagamento.'
                });
            }

            let fila =
                arrayJson(
                    servico.reservas
                );

            const indiceReserva =
                fila.findIndex(
                    pessoa =>
                        normalizarEmail(
                            pessoa.email
                        )
                        ===
                        prestadorEmail
                );

            // =============================================
            // É RESERVA
            // =============================================

            if (
                indiceReserva !== -1
            ) {

                const removido =
                    fila[indiceReserva];

                fila =
                    fila.filter(
                        (_, i) =>
                            i !== indiceReserva
                    );

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

                await adicionarMensagemSistema(
                    id,
                    `${removido.nome || removido.email} saiu da fila de reserva.`
                );

                io.emit(
                    'atualizar_servicos'
                );

                return res.json({
                    sucesso: true,
                    tipo:
                        'reserva',
                    mensagem:
                        'Você saiu da fila de reserva.'
                });
            }

            // =============================================
            // É TITULAR
            // =============================================

            if (
                normalizarEmail(
                    servico.prestador_email
                )
                ===
                prestadorEmail
            ) {

                if (
                    fila.length > 0
                ) {

                    const novoTitular =
                        fila[0];

                    const filaRestante =
                        fila.slice(1);

                    await client.query(
                        `
                        UPDATE servicos

                        SET
                            prestador_email =
                                $1,

                            prestador_nome =
                                $2,

                            prestador_whatsapp =
                                $3,

                            prestador_pix =
                                $4,

                            prestador_rg_cnh =
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

                            status =
                                'em_andamento'

                        WHERE id =
                            $7
                        `,
                        [
                            novoTitular.email,
                            novoTitular.nome || '',
                            novoTitular.whatsapp || '',
                            novoTitular.pix || '',
                            novoTitular.rgCnh || '',
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
                        `${servico.prestador_nome || prestadorEmail} desistiu. ${novoTitular.nome || novoTitular.email} foi promovido para Titular.`
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
                        novoTitular,
                        mensagem:
                            'Você saiu da vaga e o primeiro reserva foi promovido.'
                    });
                }

                await client.query(
                    `
                    UPDATE servicos

                    SET
                        prestador_id =
                            NULL,

                        prestador_email =
                            NULL,

                        prestador_nome =
                            NULL,

                        prestador_pix =
                            NULL,

                        prestador_whatsapp =
                            NULL,

                        prestador_rg_cnh =
                            NULL,

                        data_aceite =
                            NULL,

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

                        pagamento_autorizado =
                            FALSE,

                        status =
                            'ativo'

                    WHERE id =
                        $1
                    `,
                    [id]
                );

                await client.query(
                    'COMMIT'
                );

                await adicionarMensagemSistema(
                    id,
                    `${servico.prestador_nome || prestadorEmail} desistiu. A vaga voltou a ficar disponível.`
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
                        'Você saiu da vaga e ela voltou a ficar disponível.'
                });
            }

            await client.query(
                'ROLLBACK'
            );

            return res.status(403).json({
                sucesso: false,
                erro:
                    'Você não está vinculado a esta vaga.'
            });

        } catch (err) {

            try {
                await client.query(
                    'ROLLBACK'
                );
            } catch (_) {}

            console.error(
                'Erro ao sair da vaga:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao sair da vaga.'
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

                    WHERE id =
                        $1

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
// STATUS
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
    socket => {

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
// INDEX
// =====================================================

app.get(
    '/',
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                'index.html'
            )
        );
    }
);


// =====================================================
// API 404
// TEM QUE FICAR POR ÚLTIMO
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
// ERRO GLOBAL
// =====================================================

app.use(
    (err, req, res, next) => {

        console.error(
            'Erro não tratado:',
            err
        );

        if (
            err instanceof
            multer.MulterError
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
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
