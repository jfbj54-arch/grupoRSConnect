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

const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Erro ao conectar ao PostgreSQL:', err.stack);
    } else {
        console.log('Conectado com sucesso ao banco PostgreSQL.');
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

        for (let sqlCol of colunasGarantir) {
            await pool.query(sqlCol).catch(() => {});
        }

        await pool.query(`
            UPDATE servicos
            SET data_aceite = CURRENT_TIMESTAMP
            WHERE prestador_email IS NOT NULL
              AND data_aceite IS NULL
        `).catch(err =>
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
            `INSERT INTO ledger_transacoes
             (servico_id, usuario_email, tipo_movimento, valor)
             VALUES ($1, $2, $3, $4)`,
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
            `INSERT INTO auditoria_sistema
             (usuario_email, acao, detalhes)
             VALUES ($1, $2, $3)`,
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
        .update(String(codigo))
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


// =====================================================
// RECUPERAÇÃO DE SENHA
// =====================================================

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
            erro: 'Não foi possível enviar o código de recuperação. Verifique a configuração de e-mail do servidor.'
        });
    }
});


// =====================================================
// REDEFINIR SENHA
// =====================================================

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


// =====================================================
// LOGIN
// =====================================================

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
// LISTAR SERVIÇOS
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

        res.json(
            result.rows.map(s => ({
                ...s,

                empresaEmail:
                    s.empresa_email,

                empresaNome:
                    s.empresa_nome_resolvido
                    ||
                    s.empresa_nome,

                forma_pagamento:
                    s.forma_pgto,

                formaPagamento:
                    s.forma_pgto,

                nota_fiscal_oficial:
                    s.nota_oficial
                    ||
                    null,

                nota_fiscal_remetente:
                    s.nota_remetente
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

                foto_checkin:
                    s.foto_checkin
                    ||
                    s.foto_ponto
                    ||
                    null,

                fotoCheckin:
                    s.foto_checkin
                    ||
                    s.foto_ponto
                    ||
                    null,

                foto_checkout:
                    s.foto_checkout
                    ||
                    s.documento_comprovante
                    ||
                    null,

                fotoCheckout:
                    s.foto_checkout
                    ||
                    s.documento_comprovante
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
                    null
            }))
        );

    } catch (err) {
        console.error(
            'Erro ao buscar serviços:',
            err
        );

        res.status(500).json({
            erro: 'Erro ao buscar serviços.'
        });
    }
});


// =====================================================
// PUBLICAR SERVIÇO
// =====================================================

app.post('/api/servicos', async (req, res) => {
    const s = req.body;

    try {
        const valorUnitario =
            parseFloat(
                String(s.valor)
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

        if (tipoRecorrencia === 'semanal') {
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
            valorTotalGarantia * 0.10;

        const valorLiquido =
            valorTotalGarantia -
            taxaPlataforma;

        const query = `
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
                $1, $2, $3, $4,
                $5, $6, $7, $8,
                $9, $10, $11, $12,
                $13, $14, $15, $16,
                'ativo'
            )
            RETURNING id
        `;

        const params = [
            s.titulo,
            s.categoria || 'Geral',
            s.local,
            s.endereco,
            String(s.valor),
            valorUnitario,
            valorLiquido,
            s.dataHorario || 'A combinar',
            s.formaPgto || 'Pix',
            s.descricao,
            s.contratoTexto || '',
            s.empresaEmail || '',
            s.empresaWhatsapp || '',
            tipoRecorrencia,
            valorTotalGarantia,
            s.empresaNome
                ||
                s.empresa_nome
                ||
                ''
        ];

        const result =
            await pool.query(
                query,
                params
            );

        const servicoId =
            result.rows[0].id;

        await registrarLedger(
            servicoId,
            s.empresaEmail,
            'RETENCAO_GARANTIA',
            valorTotalGarantia
        );

        await registrarAuditoria(
            s.empresaEmail,
            'PUBLICAR_SERVICO',
            `Serviço #${servicoId} (${tipoRecorrencia}) publicado com garantia de R$ ${valorTotalGarantia}`
        );

        io.emit(
            'atualizar_servicos'
        );

        res.json({
            sucesso: true,
            id: servicoId
        });

    } catch (err) {
        console.error(
            'Erro detalhado ao publicar serviço:',
            err
        );

        res.json({
            sucesso: false,
            erro:
                'Erro ao publicar serviço: '
                +
                err.message
        });
    }
});


// =====================================================
// ENTRAR NA FILA
// REGRA: 1 TITULAR + 2 RESERVAS
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

        const servico =
            result.rows[0];

        const fila =
            Array.isArray(servico.reservas)
                ? servico.reservas
                : [];

        const statusServico =
            String(servico.status || '')
                .toLowerCase();

        const statusEncerrados = [
            'concluido',
            'concluido_com_sucesso',
            'aguardando_validacao',
            'validado',
            'aprovado',
            'pago',
            'cancelado',
            'cancelado_ausencia_prestador'
        ];

        const vagaEncerrada =
            Boolean(servico.checkout_hora)
            ||
            Boolean(servico.validado_empresa)
            ||
            Boolean(servico.comprovante_pagamento)
            ||
            statusEncerrados.includes(
                statusServico
            );

        if (vagaEncerrada) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Esta vaga já foi encerrada. Novas candidaturas estão bloqueadas.'
            });
        }

        if (
            servico.prestador_email ===
            prestadorEmail
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Você já é o titular deste serviço.'
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
                erro: 'Você já está na fila desta vaga.'
            });
        }

        // Capacidade total:
        // 1 titular + 2 reservas.
        //
        // Antes de existir titular,
        // até 3 pessoas podem entrar.
        //
        // Depois que existe titular,
        // ficam até 2 reservas.

        const limiteFila =
            servico.prestador_email
                ? 2
                : 3;

        if (
            fila.length >=
            limiteFila
        ) {
            return res.status(400).json({
                sucesso: false,

                erro:
                    servico.prestador_email
                        ? 'As 2 vagas de reserva de emergência já foram preenchidas.'
                        : 'A fila desta vaga já possui 3 candidatos.'
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

        await registrarAuditoria(
            prestadorEmail,
            'ENTRAR_FILA',
            `Prestador entrou na fila do serviço #${id} na posição ${fila.length}`
        );

        io.emit(
            'atualizar_servicos'
        );

        res.json({
            sucesso: true,

            mensagem:
                servico.prestador_email
                    ? `Você entrou como Reserva de Emergência ${fila.length}.`
                    : `Você entrou na fila na posição ${fila.length}.`,

            posicao:
                fila.length,

            tipoEntrada:
                servico.prestador_email
                    ? 'reserva'
                    : 'fila'
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


// =====================================================
// ACEITAR SERVIÇO
// SOMENTE QUEM ESTÁ NA FILA PODE ASSUMIR
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

    try {
        const resultServico =
            await pool.query(
                `
                SELECT *
                FROM servicos
                WHERE id = $1
                `,
                [id]
            );

        if (!resultServico.rows.length) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico =
            resultServico.rows[0];

        const fila =
            Array.isArray(servico.reservas)
                ? servico.reservas
                : [];

        const indiceFila =
            fila.findIndex(
                p =>
                    p.email ===
                    prestadorEmail
            );

        const statusServico =
            String(servico.status || '')
                .toLowerCase();

        const statusEncerrados = [
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
            servico.comprovante_pagamento
            ||
            statusEncerrados.includes(
                statusServico
            )
        ) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Esta vaga já foi encerrada e não pode ser assumida.'
            });
        }

        if (indiceFila === -1) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Você não está na fila desta vaga. Não é permitido aceitar o serviço.'
            });
        }

        if (servico.prestador_email) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Esta vaga já possui um titular. Aguarde sua posição na fila.'
            });
        }

        if (indiceFila !== 0) {
            return res.status(403).json({
                sucesso: false,
                erro:
                    `Você está na posição ${indiceFila + 1}. Apenas o primeiro da fila pode assumir esta vaga agora.`,
                posicao:
                    indiceFila + 1
            });
        }

        const prestadorRes =
            await pool.query(
                `
                SELECT id
                FROM usuarios
                WHERE email = $1
                `,
                [prestadorEmail]
            );

        const prestadorId =
            prestadorRes.rows[0]?.id
            ||
            null;

        const dadosFila =
            fila[indiceFila];

        // Ao assumir como titular,
        // ele sai automaticamente da fila.
        const novaFila =
            fila.filter(
                p =>
                    p.email !==
                    prestadorEmail
            );

        const aceiteResult =
            await pool.query(
                `
                UPDATE servicos

                SET
                    status = 'em_andamento',

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

                    prestadorNome
                    ||
                    dadosFila.nome,

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

        await adicionarMensagemSistema(
            id,
            `${prestadorNome || dadosFila.nome} assumiu a vaga titular e foi removido automaticamente da fila.`
        );

        await registrarAuditoria(
            prestadorEmail,
            'ACEITAR_SERVICO_DA_FILA',
            `Prestador assumiu a vaga titular do serviço #${id} e saiu da fila.`
        );

        io.emit(
            'atualizar_servicos'
        );

        return res.json({
            sucesso: true,

            mensagem:
                'Você assumiu a vaga titular e foi removido da fila!',

            data_aceite:
                aceiteResult.rows[0]
                    ?.data_aceite
                ||
                null,

            fila_restante:
                novaFila
        });

    } catch (err) {
        console.error(
            'Erro ao aceitar serviço pela fila:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao aceitar serviço.'
        });
    }
});


// =====================================================
// PROCESSAR STATUS
// =====================================================

app.post('/api/servicos/:id/processar-status', async (req, res) => {
    const servicoId =
        req.params.id;

    const {
        acao,
        motivo
    } = req.body;

    try {
        const servicoQuery =
            await pool.query(
                `
                SELECT *
                FROM servicos
                WHERE id = $1
                `,
                [servicoId]
            );

        if (
            servicoQuery.rows.length ===
            0
        ) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }
                const servico =
            servicoQuery.rows[0];

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
                        motivo_cancelamento = $2

                    WHERE id = $3
                    `,
                    [
                        'cancelado_ausencia_prestador',

                        motivo
                        ||
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

                        WHERE email = $1
                        `,
                        [
                            servico.prestador_email
                        ]
                    );
                }

                await registrarAuditoria(
                    'sistema',
                    'REEMBOLSO_AUTOMATICO_EXECUTADO',
                    `Serviço #${servicoId} cancelado por ausência.`
                );

                io.emit(
                    'atualizar_servicos'
                );

                return res.json({
                    sucesso: true,
                    mensagem: 'Ausência registrada. Reembolso automático processado.'
                });

            } else {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'O prestador realizou o check-in.'
                });

            }
        }

        if (
            acao ===
            'concluir'
        ) {

            if (
                servico.status_checkin !==
                'concluido'
                &&
                servico.status !==
                'concluido'
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'O serviço precisa estar com check-in e check-out válidos.'
                });

            }

            await registrarLedger(
                servicoId,
                servico.prestador_email,
                'REPASSE_PRESTADOR',
                servico.valor_liquido
            );

            await pool.query(
                `
                UPDATE servicos

                SET status =
                    'concluido_com_sucesso'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );

            await registrarAuditoria(
                'sistema',
                'REPASSE_PRESTADOR_LIBERADO',
                `Serviço #${servicoId} concluído.`
            );

            io.emit(
                'atualizar_servicos'
            );

            return res.json({
                sucesso: true,
                mensagem: 'Serviço concluído e repasse liberado.'
            });
        }

        res.status(400).json({
            sucesso: false,
            erro: 'Ação inválida.'
        });

    } catch (err) {

        console.error(
            'Erro no fluxo:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro interno ao processar fluxo.'
        });

    }
});


// =====================================================
// NOTA FISCAL
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
                    erro: 'Nenhum arquivo de Nota Fiscal foi recebido pelo servidor.'
                });

            }

            const existe =
                await pool.query(
                    `
                    SELECT id
                    FROM servicos
                    WHERE id = $1
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
                    erro: 'Serviço não encontrado.'
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
                (
                    String(dadosNota)
                        .startsWith(
                            'data:application/pdf'
                        )
                        ? 'application/pdf'
                        : 'arquivo'
                );

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
                    nota_oficial = $1,
                    nota_nome = $2,
                    nota_tipo = $3,
                    nota_remetente = $4,
                    nota_enviada_em =
                        CURRENT_TIMESTAMP

                WHERE id = $5
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
                req.body.usuarioEmail
                ||
                'sistema',

                'ENVIO_NOTA_FISCAL',

                `Nota Fiscal ${nomeArquivo} enviada para o serviço #${id}`
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                mensagem: 'Nota Fiscal enviada com sucesso!',
                nota_nome: nomeArquivo,
                nota_tipo: tipoArquivo,
                nota_remetente: remetente,
                nota_fiscal_oficial: dadosNota
            });

        } catch (err) {

            console.error(
                'Erro ao enviar Nota Fiscal:',
                err
            );

            res.status(500).json({
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
// CONFIRMAR PRESENÇA
// =====================================================

app.post(
    '/api/servicos/:id/confirmar-presenca',

    async (req, res) => {

        const id =
            req.params.id;

        const {
            selfie,
            documentoComprovante
        } = req.body;

        try {

            await pool.query(
                `
                UPDATE servicos

                SET
                    selfie_confirmacao =
                        COALESCE(
                            $1,
                            selfie_confirmacao
                        ),

                    documento_comprovante =
                        COALESCE(
                            $2,
                            documento_comprovante
                        ),

                    presenca_confirmada =
                        TRUE

                WHERE id = $3
                `,
                [
                    selfie,
                    documentoComprovante,
                    id
                ]
            );

            await registrarAuditoria(
                'sistema',
                'CONFIRMAR_PRESENCA',
                `Presença confirmada para o serviço #${id}`
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                mensagem: 'Presença confirmada com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro ao confirmar presença:',
                err
            );

            res.json({
                sucesso: false,
                erro: 'Erro ao confirmar presença.'
            });

        }
    }
);


// =====================================================
// MENSAGENS AUTOMÁTICAS
// =====================================================

async function adicionarMensagemSistema(
    servicoId,
    texto
) {

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
        result.rows[0].mensagens
        ||
        [];

    mensagens.push({
        remetente: 'SISTEMA',
        texto,
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

            servicoId
        ]
    );
}


// =====================================================
// COMPATIBILIDADE COM PONTO ANTIGO
// =====================================================

app.post(
    '/api/servicos/:id/ponto',

    async (req, res) => {

        const {
            foto,
            hora,
            gps
        } = req.body;

        try {

            await pool.query(
                `
                UPDATE servicos

                SET
                    foto_ponto = $1,
                    foto_checkin = $1,
                    checkin_hora = $2,
                    checkin_gps = $3,
                    status_checkin = 'realizado',
                    status = 'em_andamento'

                WHERE id = $4
                `,
                [
                    foto,

                    hora
                    ||
                    new Date()
                        .toLocaleTimeString(),

                    gps
                    ||
                    null,

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
                sucesso: false,
                erro: 'Erro ao registrar ponto.'
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
            req.body.fotoCheckin;

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
                        checkin_hora,
                        checkout_hora

                    FROM servicos

                    WHERE id = $1
                    `,
                    [
                        id
                    ]
                );

            if (
                !atual.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });

            }

            if (
                atual.rows[0]
                    .checkin_hora
            ) {

                return res.status(409).json({
                    sucesso: false,

                    erro:
                        `Check-in já finalizado às ${atual.rows[0].checkin_hora}. Não é permitido registrar novamente.`,

                    checkin_finalizado:
                        true,

                    checkin_hora:
                        atual.rows[0]
                            .checkin_hora
                });

            }

            if (!foto) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'A foto do check-in é obrigatória.'
                });

            }

            const result =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        foto_ponto = $1,
                        foto_checkin = $1,
                        checkin_hora = $2,
                        checkin_gps = $3,
                        status_checkin = 'realizado',
                        status = 'em_andamento'

                    WHERE id = $4

                    RETURNING id
                    `,
                    [
                        foto,
                        hora,
                        gps,
                        id
                    ]
                );

            if (
                !result.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });

            }

            await adicionarMensagemSistema(
                id,
                `Check-in realizado às ${hora}. Foto e localização registradas.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                ||
                'sistema',

                'CHECKIN',

                `Serviço #${id} - GPS: ${gps || 'não informado'}`
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
                'Erro no check-in:',
                err
            );

            res.status(500).json({
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

        const hora =
            req.body.hora
            ||
            new Date()
                .toLocaleTimeString();

        try {

            const r =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [
                        req.params.id
                    ]
                );

            if (
                !r.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });

            }

            if (
                !r.rows[0]
                    .checkin_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'Faça o check-in primeiro.'
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
                    req.params.id
                ]
            );

            await adicionarMensagemSistema(
                req.params.id,
                `Intervalo iniciado às ${hora}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                intervalo_inicio: hora
            });

        } catch (err) {

            res.status(500).json({
                sucesso: false,
                erro: 'Erro ao iniciar intervalo.'
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

        const hora =
            req.body.hora
            ||
            new Date()
                .toLocaleTimeString();

        try {

            const r =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,
                    [
                        req.params.id
                    ]
                );

            if (
                !r.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });

            }

            if (
                !r.rows[0]
                    .intervalo_inicio
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'Nenhum intervalo foi iniciado.'
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
                    req.params.id
                ]
            );

            await adicionarMensagemSistema(
                req.params.id,
                `Retorno do intervalo às ${hora}.`
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                intervalo_retorno: hora
            });

        } catch (err) {

            res.status(500).json({
                sucesso: false,
                erro: 'Erro ao retornar do intervalo.'
            });

        }
    }
);


// =====================================================
// CHECK-OUT
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
                req.body.fotoCheckout
                ||
                req.body.foto_checkout
                ||
                req.body.foto
                ||
                (
                    arquivo
                        ? `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`
                        : null
                );

            const hora =
                req.body.hora
                ||
                req.body.checkout_hora
                ||
                new Date()
                    .toLocaleTimeString();

            const gps =
                req.body.gps
                ||
                req.body.checkout_gps
                ||
                req.body.gps_checkout
                ||
                null;

            const total =
                req.body.total_horas
                ||
                req.body.totalHoras
                ||
                '';

            const pix =
                req.body.prestador_pix
                ||
                req.body.prestadorPix
                ||
                null;

            const forma =
                req.body.forma_pagamento
                ||
                req.body.formaPagamento
                ||
                null;

            if (!foto) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'A foto do check-out é obrigatória.'
                });

            }

            const r =
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
                !r.rows.length
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });

            }

            if (
                !r.rows[0]
                    .checkin_hora
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro: 'Não é possível fazer check-out antes do check-in.'
                });

            }

            if (
                r.rows[0]
                    .checkout_hora
            ) {

                return res.status(409).json({
                    sucesso: false,

                    erro:
                        `Check-out já finalizado às ${r.rows[0].checkout_hora}. Não é permitido registrar novamente.`,

                    checkout_finalizado:
                        true,

                    checkout_hora:
                        r.rows[0]
                            .checkout_hora
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
                    total,
                    pix,
                    forma,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `Serviço finalizado às ${hora}. Foto, GPS e dados para pagamento enviados à empresa.`
            );

            await registrarAuditoria(
                r.rows[0].prestador_email
                ||
                'sistema',

                'CHECKOUT',

                `Serviço #${id} finalizado.`
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
                    total,

                prestador_pix:
                    pix
                    ||
                    r.rows[0]
                        .prestador_pix,

                forma_pagamento:
                    forma
                    ||
                    r.rows[0]
                        .forma_pgto
            });

        } catch (err) {

            console.error(
                'Erro no checkout:',
                err
            );

            res.status(500).json({
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
// EMPRESA ENVIA COMPROVANTE DE PAGAMENTO
// =====================================================

app.post(
    '/api/servicos/:id/comprovante-pagamento',

    upload.single(
        'comprovantePagamento'
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
                req.body.comprovantePagamento
                ||
                req.body.comprovante_pagamento_arquivo
                ||
                null;
                        if (!dadosArquivo) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'Nenhum comprovante de pagamento foi enviado.'
                });
            }

            const result = await pool.query(
                `SELECT * FROM servicos WHERE id = $1`,
                [id]
            );

            if (!result.rows.length) {
                return res.status(404).json({
                    sucesso: false,
                    erro: 'Serviço não encontrado.'
                });
            }

            const servico = result.rows[0];

            if (!servico.prestador_email) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'Este serviço ainda não possui prestador titular.'
                });
            }

            const nomeArquivo =
                arquivo?.originalname
                || req.body.comprovanteNome
                || 'comprovante-pagamento';

            const tipoArquivo =
                arquivo?.mimetype
                || req.body.comprovanteTipo
                || 'arquivo';

            await pool.query(
                `UPDATE servicos
                 SET comprovante_pagamento = TRUE,
                     comprovante_pagamento_arquivo = $1,
                     comprovante_pagamento_nome = $2,
                     comprovante_pagamento_tipo = $3,
                     comprovante_pagamento_enviado_em = CURRENT_TIMESTAMP,
                     pagamento_recebido_confirmado = FALSE,
                     pagamento_recebido_em = NULL,
                     status = 'pago'
                 WHERE id = $4`,
                [
                    dadosArquivo,
                    nomeArquivo,
                    tipoArquivo,
                    id
                ]
            );

            await adicionarMensagemSistema(
                id,
                `A empresa enviou o comprovante de pagamento "${nomeArquivo}". Aguardando confirmação de recebimento do prestador.`
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                || servico.empresa_email
                || 'empresa',

                'ENVIO_COMPROVANTE_PAGAMENTO',

                `Comprovante de pagamento enviado no serviço #${id}`
            );

            io.emit('atualizar_servicos');

            res.json({
                sucesso: true,
                mensagem: 'Comprovante enviado ao prestador com sucesso!',
                comprovante_nome: nomeArquivo
            });

        } catch (err) {

            console.error(
                'Erro ao enviar comprovante de pagamento:',
                err
            );

            res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar comprovante de pagamento: '
                    + err.message
            });
        }
    }
);


// =====================================================
// PRESTADOR CONFIRMA QUE RECEBEU O PAGAMENTO
// =====================================================

app.post(
    '/api/servicos/:id/confirmar-recebimento',
    async (req, res) => {

        const id =
            req.params.id;

        try {

            const result =
                await pool.query(
                    `SELECT *
                     FROM servicos
                     WHERE id = $1`,
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
                    erro:
                        'A empresa ainda não enviou o comprovante de pagamento.'
                });
            }

            if (
                servico
                    .pagamento_recebido_confirmado
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O recebimento deste pagamento já foi confirmado.'
                });
            }

            await pool.query(
                `UPDATE servicos
                 SET pagamento_recebido_confirmado = TRUE,
                     pagamento_recebido_em = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [id]
            );

            await adicionarMensagemSistema(
                id,
                `${req.body.prestadorNome || servico.prestador_nome || 'O prestador'} confirmou o recebimento do pagamento.`
            );

            await registrarAuditoria(
                req.body.prestadorEmail
                || servico.prestador_email
                || 'prestador',

                'CONFIRMAR_RECEBIMENTO_PAGAMENTO',

                `Prestador confirmou recebimento do pagamento do serviço #${id}`
            );

            io.emit('atualizar_servicos');

            res.json({
                sucesso: true,
                mensagem:
                    'Recebimento confirmado com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro ao confirmar recebimento:',
                err
            );

            res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao confirmar recebimento.'
            });
        }
    }
);


// =====================================================
// EMPRESA ENVIA CONTRATO PRÓPRIO
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
                || req.body.contratoEmpresa
                || req.body.contrato_empresa_arquivo
                || null;

            if (!dadosArquivo) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nenhum contrato foi enviado.'
                });
            }

            const result =
                await pool.query(
                    `SELECT *
                     FROM servicos
                     WHERE id = $1`,
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
                || req.body.contratoNome
                || 'contrato-empresa';

            const tipoArquivo =
                arquivo?.mimetype
                || req.body.contratoTipo
                || 'arquivo';

            await pool.query(
                `UPDATE servicos
                 SET contrato_empresa_arquivo = $1,
                     contrato_empresa_nome = $2,
                     contrato_empresa_tipo = $3,
                     contrato_empresa_enviado_em = CURRENT_TIMESTAMP
                 WHERE id = $4`,
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
                || servico.empresa_email
                || 'empresa',

                'ENVIO_CONTRATO_EMPRESA',

                `Contrato da empresa enviado no serviço #${id}`
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                mensagem:
                    'Contrato enviado ao prestador com sucesso!',
                contrato_nome:
                    nomeArquivo
            });

        } catch (err) {

            console.error(
                'Erro ao enviar contrato da empresa:',
                err
            );

            res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar contrato da empresa: '
                    + err.message
            });
        }
    }
);


// =====================================================
// CHAT
// =====================================================

app.post(
    '/api/servicos/:id/chat',
    async (req, res) => {

        const id =
            req.params.id;

        const {
            remetente,
            texto
        } = req.body;

        try {

            const result =
                await pool.query(
                    `SELECT mensagens
                     FROM servicos
                     WHERE id = $1`,
                    [id]
                );

            if (
                result.rows.length ===
                0
            ) {
                return res.status(404).json({
                    sucesso: false
                });
            }

            let mensagens =
                result.rows[0].mensagens
                || [];

            mensagens.push({
                remetente,
                texto,
                data:
                    new Date()
                        .toLocaleTimeString()
            });

            await pool.query(
                `UPDATE servicos
                 SET mensagens = $1
                 WHERE id = $2`,
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


// =====================================================
// EMPRESA VALIDA SERVIÇO FINALIZADO
// =====================================================

app.post(
    '/api/servicos/:id/validar',
    async (req, res) => {

        try {

            const r =
                await pool.query(
                    `SELECT *
                     FROM servicos
                     WHERE id = $1`,
                    [
                        req.params.id
                    ]
                );

            if (!r.rows.length) {
                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            if (
                !r.rows[0]
                    .checkout_hora
            ) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'O prestador ainda não realizou o check-out.'
                });
            }

            await pool.query(
                `UPDATE servicos
                 SET validado_empresa = TRUE,
                     validado_em = CURRENT_TIMESTAMP,
                     status = 'validado'
                 WHERE id = $1`,
                [
                    req.params.id
                ]
            );

            await adicionarMensagemSistema(
                req.params.id,
                'A empresa validou o serviço. Pagamento liberado para processamento.'
            );

            await registrarAuditoria(
                req.body.usuarioEmail
                || r.rows[0].empresa_email
                || 'empresa',

                'VALIDAR_SERVICO',

                `Serviço #${req.params.id} validado.`
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                mensagem:
                    'Serviço validado pela empresa. Pronto para pagamento.'
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
                    `SELECT *
                     FROM servicos
                     WHERE id = $1`,
                    [id]
                );

            if (
                servicoRes.rows.length ===
                0
            ) {
                return res.json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            const servico =
                servicoRes.rows[0];

            await pool.query(
                `UPDATE servicos
                 SET status = 'aprovado'
                 WHERE id = $1`,
                [id]
            );

            await registrarLedger(
                id,
                servico.prestador_email,
                'REPASSE_PRESTADOR',
                servico.valor_liquido
            );

            await registrarLedger(
                id,
                'admin@grupors.com',
                'TAXA_PLATAFORMA',
                (
                    servico.valor_diaria
                    -
                    servico.valor_liquido
                )
            );

            await registrarAuditoria(
                servico.empresa_email,
                'APROVAR_PAGAMENTO',
                `Pagamento do serviço #${id} aprovado.`
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true
            });

        } catch (err) {

            res.json({
                sucesso: false,
                erro:
                    'Erro ao aprovar serviço.'
            });
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

            await pool.query(
                `DELETE FROM servicos
                 WHERE id = $1`,
                [id]
            );

            await registrarAuditoria(
                'sistema',
                'DELETAR_SERVICO',
                `Serviço #${id} foi removido.`
            );

            io.emit(
                'atualizar_servicos'
            );

            res.json({
                sucesso: true,
                mensagem:
                    'Serviço removido com sucesso!'
            });

        } catch (err) {

            res.json({
                sucesso: false,
                erro:
                    'Erro ao excluir serviço.'
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
    }
);


// =====================================================
// INDEX
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
// INICIAR SERVIDOR
// =====================================================

const PORT =
    process.env.PORT
    || 10000;

server.listen(
    PORT,
    () => {

        console.log(
            `Servidor rodando na porta ${PORT}`
        );
    }
);
