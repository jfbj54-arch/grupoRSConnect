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
        `).catch(err => console.error('Erro ao preencher data_aceite antiga:', err));

        console.log('Tabelas e colunas verificadas/criadas com sucesso no PostgreSQL.');
    } catch (err) {
        console.error('Erro ao criar tabelas:', err);
    }
}

async function registrarLedger(servicoId, email, tipoMovimento, valor) {
    try {
        await pool.query(
            `INSERT INTO ledger_transacoes (servico_id, usuario_email, tipo_movimento, valor) VALUES ($1, $2, $3, $4)`,
            [servicoId, email, tipoMovimento, valor]
        );
    } catch (err) {
        console.error('Erro ao registrar ledger:', err);
    }
}

async function registrarAuditoria(email, acao, detalhes) {
    try {
        await pool.query(
            `INSERT INTO auditoria_sistema (usuario_email, acao, detalhes) VALUES ($1, $2, $3)`,
            [email || 'sistema', acao, detalhes]
        );
    } catch (err) {
        console.error('Erro ao registrar auditoria:', err);
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
        const query = `INSERT INTO usuarios (tipo, nome, doc, responsavel, email, senha, whatsapp, endereco, rg_cnh, profissao, tipo_chave_pix, pix, banco, conta, experiencia) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`;

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
                `INSERT INTO prestadores (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
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
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
        return res.status(400).json({
            sucesso: false,
            erro: 'Informe o e-mail da conta.'
        });
    }

    try {
        const usuario = await pool.query(
            `SELECT id, email, nome FROM usuarios WHERE LOWER(email) = $1`,
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

        const codigoHash = hashCodigoRecuperacao(codigo);

        await pool.query(
            `UPDATE recuperacao_senha
             SET usado = TRUE
             WHERE LOWER(email) = $1
               AND usado = FALSE`,
            [email]
        );

        await pool.query(
            `INSERT INTO recuperacao_senha
             (email, codigo_hash, expira_em)
             VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '15 minutes')`,
            [email, codigoHash]
        );

        await enviarEmailRecuperacao(email, codigo);

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
        console.error('Erro na recuperação de senha:', err);

        res.status(500).json({
            sucesso: false,
            erro: 'Não foi possível enviar o código de recuperação. Verifique a configuração de e-mail do servidor.'
        });
    }
});

app.post('/api/auth/redefinir-senha', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const codigo = String(req.body.codigo || '').trim();
    const novaSenha = String(req.body.novaSenha || '');

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
        const codigoHash = hashCodigoRecuperacao(codigo);

        const token = await pool.query(
            `SELECT *
             FROM recuperacao_senha
             WHERE LOWER(email) = $1
               AND codigo_hash = $2
               AND usado = FALSE
               AND expira_em > CURRENT_TIMESTAMP
             ORDER BY id DESC
             LIMIT 1`,
            [email, codigoHash]
        );

        if (!token.rows.length) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Código inválido ou expirado.'
            });
        }

        const usuario = await pool.query(
            `UPDATE usuarios
             SET senha = $1
             WHERE LOWER(email) = $2
             RETURNING id`,
            [novaSenha, email]
        );

        if (!usuario.rows.length) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Conta não encontrada.'
            });
        }

        await pool.query(
            `UPDATE recuperacao_senha
             SET usado = TRUE
             WHERE id = $1`,
            [token.rows[0].id]
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
        console.error('Erro ao redefinir senha:', err);

        res.status(500).json({
            sucesso: false,
            erro: 'Erro interno ao redefinir a senha.'
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        const result = await pool.query(
            `SELECT * FROM usuarios WHERE email = $1 AND senha = $2`,
            [email, senha]
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
app.get('/api/servicos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.*,
                COALESCE(NULLIF(s.empresa_nome, ''), u.nome) AS empresa_nome_resolvido
            FROM servicos s
            LEFT JOIN usuarios u
                ON LOWER(u.email) = LOWER(s.empresa_email)
            ORDER BY s.id DESC
        `);

        res.json(result.rows.map(s => ({
            ...s,
            empresaEmail: s.empresa_email,
            empresaNome: s.empresa_nome_resolvido || s.empresa_nome,
            forma_pagamento: s.forma_pgto,
            formaPagamento: s.forma_pgto,
            nota_fiscal_oficial: s.nota_oficial || null,
            nota_fiscal_remetente: s.nota_remetente || null,
            nota_nome: s.nota_nome || null,
            nota_tipo: s.nota_tipo || null,
            foto_checkin: s.foto_checkin || s.foto_ponto || null,
            fotoCheckin: s.foto_checkin || s.foto_ponto || null,
            foto_checkout: s.foto_checkout || s.documento_comprovante || null,
            fotoCheckout: s.foto_checkout || s.documento_comprovante || null,
            intervaloInicio: s.intervalo_inicio || null,
            intervaloRetorno: s.intervalo_retorno || null,
            totalHoras: s.total_horas || null,
            validadoEmpresa: !!s.validado_empresa,
            comprovantePagamentoArquivo: s.comprovante_pagamento_arquivo || null,
            comprovantePagamentoNome: s.comprovante_pagamento_nome || null,
            pagamentoRecebidoConfirmado: !!s.pagamento_recebido_confirmado,
            pagamentoRecebidoEm: s.pagamento_recebido_em || null,
            contratoEmpresaArquivo: s.contrato_empresa_arquivo || null,
            contratoEmpresaNome: s.contrato_empresa_nome || null
        })));

    } catch (err) {
        console.error('Erro ao buscar serviços:', err);

        res.status(500).json({
            erro: 'Erro ao buscar serviços.'
        });
    }
});

app.post('/api/servicos', async (req, res) => {
    const s = req.body;

    try {
        const valorUnitario =
            parseFloat(String(s.valor).replace(',', '.')) || 0;

        const tipoRecorrencia =
            s.recorrencia || 'unico';

        let valorTotalGarantia = valorUnitario;

        if (tipoRecorrencia === 'semanal') {
            valorTotalGarantia = valorUnitario * 4;
        } else if (tipoRecorrencia === 'quinzenal') {
            valorTotalGarantia = valorUnitario * 2;
        } else if (tipoRecorrencia === 'mensal') {
            valorTotalGarantia = valorUnitario;
        }

        const taxaPlataforma =
            valorTotalGarantia * 0.10;

        const valorLiquido =
            valorTotalGarantia - taxaPlataforma;

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
                $1,$2,$3,$4,$5,$6,$7,$8,$9,
                $10,$11,$12,$13,$14,$15,$16,'ativo'
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
            s.empresaNome || s.empresa_nome || ''
        ];

        const result =
            await pool.query(query, params);

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

        io.emit('atualizar_servicos');

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
            erro: 'Erro ao publicar serviço: ' + err.message
        });
    }
});

// =====================================================
// ENTRAR NA FILA
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

        const fila =
            Array.isArray(servico.reservas)
                ? servico.reservas
                : [];

        const statusServico =
            String(servico.status || '').toLowerCase();

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
            Boolean(servico.checkout_hora) ||
            Boolean(servico.validado_empresa) ||
            Boolean(servico.comprovante_pagamento) ||
            statusEncerrados.includes(statusServico);

        if (vagaEncerrada) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Esta vaga já foi encerrada. Novas candidaturas estão bloqueadas.'
            });
        }

        if (servico.prestador_email === prestadorEmail) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Você já é o titular deste serviço.'
            });
        }

        if (fila.some(p => p.email === prestadorEmail)) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Você já está na fila desta vaga.'
            });
        }

        const limiteFila =
            servico.prestador_email ? 2 : 3;

        if (fila.length >= limiteFila) {
            return res.status(400).json({
                sucesso: false,
                erro: servico.prestador_email
                    ? 'As 2 vagas de reserva de emergência já foram preenchidas.'
                    : 'A fila desta vaga já possui 3 candidatos.'
            });
        }

        fila.push({
            email: prestadorEmail,
            nome: prestadorNome,
            whatsapp: prestadorWhatsapp || '',
            pix: prestadorPix || '',
            rgCnh: rgCnh || '',
            entrouEm: new Date().toISOString()
        });

        await pool.query(
            `UPDATE servicos
             SET reservas = $1
             WHERE id = $2`,
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

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: servico.prestador_email
                ? `Você entrou como Reserva de Emergência ${fila.length}.`
                : `Você entrou na fila na posição ${fila.length}.`,
            posicao: fila.length,
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
// =====================================================

app.post('/api/servicos/:id/aceitar', async (req, res) => {
    const id = req.params.id;

    const {
        prestadorEmail,
        prestadorNome,
        prestadorPix,
        prestadorWhatsapp
    } = req.body;

    try {
        const resultServico = await pool.query(
            `SELECT * FROM servicos WHERE id = $1`,
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
                p => p.email === prestadorEmail
            );

        const statusServico =
            String(servico.status || '').toLowerCase();

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
            servico.checkout_hora ||
            servico.validado_empresa ||
            servico.comprovante_pagamento ||
            statusEncerrados.includes(statusServico)
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
                erro: `Você está na posição ${indiceFila + 1}. Apenas o primeiro da fila pode assumir esta vaga agora.`,
                posicao: indiceFila + 1
            });
        }

        const prestadorRes =
            await pool.query(
                `SELECT id
                 FROM usuarios
                 WHERE email = $1`,
                [prestadorEmail]
            );

        const prestadorId =
            prestadorRes.rows[0]?.id || null;

        const dadosFila =
            fila[indiceFila];

        const novaFila =
            fila.filter(
                p => p.email !== prestadorEmail
            );

        const aceiteResult =
            await pool.query(
                `UPDATE servicos
                 SET status = 'em_andamento',
                     prestador_email = $1,
                     prestador_id = $2,
                     prestador_nome = $3,
                     prestador_pix = $4,
                     prestador_whatsapp = $5,
                     reservas = $6,
                     data_aceite = CURRENT_TIMESTAMP
                 WHERE id = $7
                 RETURNING data_aceite`,
                [
                    prestadorEmail,
                    prestadorId,
                    prestadorNome || dadosFila.nome,
                    prestadorPix || dadosFila.pix || '',
                    prestadorWhatsapp || dadosFila.whatsapp || '',
                    JSON.stringify(novaFila),
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

        io.emit('atualizar_servicos');

        return res.json({
            sucesso: true,
            mensagem: 'Você assumiu a vaga titular e foi removido da fila!',
            data_aceite:
                aceiteResult.rows[0]?.data_aceite || null,
            fila_restante: novaFila
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
                'SELECT * FROM servicos WHERE id = $1',
                [servicoId]
            );

        if (servicoQuery.rows.length === 0) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico =
            servicoQuery.rows[0];

        if (acao === 'verificar_ausencia') {
            if (servico.status_checkin === 'pendente') {
                await pool.query(
                    'UPDATE servicos SET status = $1, motivo_cancelamento = $2 WHERE id = $3',
                    [
                        'cancelado_ausencia_prestador',
                        motivo || 'Prestador não compareceu no horário.',
                        servicoId
                    ]
                );

                await registrarLedger(
                    servicoId,
                    servico.empresa_email,
                    'REEMBOLSO_AUTOMATICO',
                    servico.valor_diaria
                );

                if (servico.prestador_email) {
                    await pool.query(
                        `UPDATE prestadores
                         SET reputacao = GREATEST(reputacao - 0.5, 0),
                             advertencias = advertencias + 1
                         WHERE email = $1`,
                        [servico.prestador_email]
                    );
                }

                await registrarAuditoria(
                    'sistema',
                    'REEMBOLSO_AUTOMATICO_EXECUTADO',
                    `Serviço #${servicoId} cancelado por ausência.`
                );

                io.emit('atualizar_servicos');

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

        if (acao === 'concluir') {
            if (
                servico.status_checkin !== 'concluido' &&
                servico.status !== 'concluido'
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
                'UPDATE servicos SET status = $1 WHERE id = $2',
                [
                    'concluido_com_sucesso',
                    servicoId
                ]
            );

            await registrarAuditoria(
                'sistema',
                'REPASSE_PRESTADOR_LIBERADO',
                `Serviço #${servicoId} concluído.`
            );

            io.emit('atualizar_servicos');

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
// CHECK-IN DO PRESTADOR
// =====================================================

app.post('/api/servicos/:id/checkin', async (req, res) => {
    const id = req.params.id;

    const {
        prestadorEmail,
        foto,
        latitude,
        longitude
    } = req.body;

    try {
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

        if (
            !servico.prestador_email ||
            String(servico.prestador_email).toLowerCase() !==
            String(prestadorEmail || '').toLowerCase()
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente o titular desta vaga pode realizar o check-in.'
            });
        }

        if (servico.checkin_hora) {
            return res.status(400).json({
                sucesso: false,
                erro: 'O check-in deste serviço já foi realizado.'
            });
        }

        const agora = new Date();

        await pool.query(
            `UPDATE servicos
             SET checkin_hora = $1,
                 status_checkin = 'realizado',
                 foto_checkin = $2,
                 foto_ponto = $2,
                 checkin_latitude = $3,
                 checkin_longitude = $4,
                 status = 'em_andamento'
             WHERE id = $5`,
            [
                agora,
                foto || null,
                latitude || null,
                longitude || null,
                id
            ]
        );

        await adicionarMensagemSistema(
            id,
            `Check-in realizado pelo titular em ${agora.toLocaleString('pt-BR')}.`
        );

        await registrarAuditoria(
            prestadorEmail,
            'CHECKIN',
            `Check-in realizado no serviço #${id}.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Check-in realizado com sucesso!',
            checkinHora: agora
        });

    } catch (err) {
        console.error('Erro no check-in:', err);

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao realizar check-in.'
        });
    }
});


// =====================================================
// INÍCIO DO INTERVALO
// =====================================================

app.post('/api/servicos/:id/intervalo/iniciar', async (req, res) => {
    const id = req.params.id;

    const {
        prestadorEmail
    } = req.body;

    try {
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

        if (
            String(servico.prestador_email || '').toLowerCase() !==
            String(prestadorEmail || '').toLowerCase()
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente o titular pode iniciar o intervalo.'
            });
        }

        if (!servico.checkin_hora) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Realize o check-in antes de iniciar o intervalo.'
            });
        }

        if (servico.checkout_hora) {
            return res.status(400).json({
                sucesso: false,
                erro: 'O serviço já possui check-out.'
            });
        }

        if (servico.intervalo_inicio && !servico.intervalo_retorno) {
            return res.status(400).json({
                sucesso: false,
                erro: 'O intervalo já está em andamento.'
            });
        }

        const agora = new Date();

        await pool.query(
            `UPDATE servicos
             SET intervalo_inicio = $1,
                 intervalo_retorno = NULL
             WHERE id = $2`,
            [
                agora,
                id
            ]
        );

        await adicionarMensagemSistema(
            id,
            `Intervalo iniciado em ${agora.toLocaleString('pt-BR')}.`
        );

        await registrarAuditoria(
            prestadorEmail,
            'INICIO_INTERVALO',
            `Intervalo iniciado no serviço #${id}.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Intervalo iniciado.',
            intervaloInicio: agora
        });

    } catch (err) {
        console.error(
            'Erro ao iniciar intervalo:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao iniciar intervalo.'
        });
    }
});


// =====================================================
// RETORNO DO INTERVALO
// =====================================================

app.post('/api/servicos/:id/intervalo/retornar', async (req, res) => {
    const id = req.params.id;

    const {
        prestadorEmail
    } = req.body;

    try {
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

        if (
            String(servico.prestador_email || '').toLowerCase() !==
            String(prestadorEmail || '').toLowerCase()
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente o titular pode registrar o retorno.'
            });
        }

        if (!servico.intervalo_inicio) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Nenhum intervalo foi iniciado.'
            });
        }

        if (servico.intervalo_retorno) {
            return res.status(400).json({
                sucesso: false,
                erro: 'O retorno do intervalo já foi registrado.'
            });
        }

        const agora = new Date();

        await pool.query(
            `UPDATE servicos
             SET intervalo_retorno = $1
             WHERE id = $2`,
            [
                agora,
                id
            ]
        );

        await adicionarMensagemSistema(
            id,
            `Retorno do intervalo registrado em ${agora.toLocaleString('pt-BR')}.`
        );

        await registrarAuditoria(
            prestadorEmail,
            'RETORNO_INTERVALO',
            `Retorno do intervalo registrado no serviço #${id}.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Retorno registrado com sucesso.',
            intervaloRetorno: agora
        });

    } catch (err) {
        console.error(
            'Erro ao retornar do intervalo:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao registrar retorno.'
        });
    }
});


// =====================================================
// CHECK-OUT
// =====================================================

app.post('/api/servicos/:id/checkout', async (req, res) => {
    const id = req.params.id;

    const {
        prestadorEmail,
        foto,
        latitude,
        longitude
    } = req.body;

    try {
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

        if (
            String(servico.prestador_email || '').toLowerCase() !==
            String(prestadorEmail || '').toLowerCase()
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente o titular pode realizar o check-out.'
            });
        }

        if (!servico.checkin_hora) {
            return res.status(400).json({
                sucesso: false,
                erro: 'O check-in ainda não foi realizado.'
            });
        }

        if (servico.checkout_hora) {
            return res.status(400).json({
                sucesso: false,
                erro: 'O check-out já foi realizado.'
            });
        }

        if (
            servico.intervalo_inicio &&
            !servico.intervalo_retorno
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Registre o retorno do intervalo antes do check-out.'
            });
        }

        const agora = new Date();

        const inicio =
            new Date(servico.checkin_hora);

        let milissegundosTrabalhados =
            agora.getTime() - inicio.getTime();

        if (
            servico.intervalo_inicio &&
            servico.intervalo_retorno
        ) {
            const inicioIntervalo =
                new Date(servico.intervalo_inicio);

            const retornoIntervalo =
                new Date(servico.intervalo_retorno);

            const tempoIntervalo =
                retornoIntervalo.getTime() -
                inicioIntervalo.getTime();

            milissegundosTrabalhados -=
                Math.max(0, tempoIntervalo);
        }

        const totalHoras =
            Math.max(
                0,
                milissegundosTrabalhados / 3600000
            );

        await pool.query(
            `UPDATE servicos
             SET checkout_hora = $1,
                 foto_checkout = $2,
                 documento_comprovante = $2,
                 checkout_latitude = $3,
                 checkout_longitude = $4,
                 total_horas = $5,
                 status_checkin = 'concluido',
                 status = 'aguardando_validacao'
             WHERE id = $6`,
            [
                agora,
                foto || null,
                latitude || null,
                longitude || null,
                totalHoras.toFixed(2),
                id
            ]
        );

        await adicionarMensagemSistema(
            id,
            `Check-out realizado. Jornada registrada: ${totalHoras.toFixed(2)} hora(s). Aguardando validação da empresa.`
        );

        await registrarAuditoria(
            prestadorEmail,
            'CHECKOUT',
            `Check-out realizado no serviço #${id}. Total: ${totalHoras.toFixed(2)} horas.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Check-out realizado com sucesso!',
            checkoutHora: agora,
            totalHoras:
                Number(totalHoras.toFixed(2))
        });

    } catch (err) {
        console.error(
            'Erro no check-out:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao realizar check-out.'
        });
    }
});


// =====================================================
// VALIDAR SERVIÇO PELA EMPRESA
// =====================================================

app.post('/api/servicos/:id/validar', async (req, res) => {
    const id = req.params.id;

    const {
        empresaEmail
    } = req.body;

    try {
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

        if (
            empresaEmail &&
            servico.empresa_email &&
            String(servico.empresa_email).toLowerCase() !==
            String(empresaEmail).toLowerCase()
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente a empresa responsável pode validar este serviço.'
            });
        }

        if (!servico.checkout_hora) {
            return res.status(400).json({
                sucesso: false,
                erro: 'O prestador ainda não realizou o check-out.'
            });
        }

        if (servico.validado_empresa) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Este serviço já foi validado.'
            });
        }

        const agora = new Date();

        await pool.query(
            `UPDATE servicos
             SET validado_empresa = TRUE,
                 validado_em = $1,
                 status = 'validado'
             WHERE id = $2`,
            [
                agora,
                id
            ]
        );

        await adicionarMensagemSistema(
            id,
            'A empresa validou a execução do serviço.'
        );

        await registrarAuditoria(
            empresaEmail || servico.empresa_email,
            'VALIDAR_SERVICO',
            `Serviço #${id} validado pela empresa.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Serviço validado com sucesso!'
        });

    } catch (err) {
        console.error(
            'Erro ao validar serviço:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao validar serviço.'
        });
    }
});


// =====================================================
// ENVIAR NOTA FISCAL
// =====================================================

app.post('/api/servicos/:id/nota-fiscal', async (req, res) => {
    const id = req.params.id;

    const {
        arquivo,
        nome,
        tipo,
        remetente
    } = req.body;

    try {
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

        if (!arquivo) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Nenhum arquivo de nota fiscal foi enviado.'
            });
        }

        await pool.query(
            `UPDATE servicos
             SET nota_oficial = $1,
                 nota_nome = $2,
                 nota_tipo = $3,
                 nota_remetente = $4
             WHERE id = $5`,
            [
                arquivo,
                nome || 'nota-fiscal',
                tipo || '',
                remetente || '',
                id
            ]
        );

        await registrarAuditoria(
            remetente || 'sistema',
            'ENVIO_NOTA_FISCAL',
            `Nota fiscal enviada para o serviço #${id}.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Nota fiscal enviada com sucesso!'
        });

    } catch (err) {
        console.error(
            'Erro ao enviar nota fiscal:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao enviar nota fiscal.'
        });
    }
});


// =====================================================
// CONTRATO DA EMPRESA
// =====================================================

app.post('/api/servicos/:id/contrato', async (req, res) => {
    const id = req.params.id;

    const {
        arquivo,
        nome,
        empresaEmail
    } = req.body;

    try {
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

        if (
            empresaEmail &&
            servico.empresa_email &&
            String(servico.empresa_email).toLowerCase() !==
            String(empresaEmail).toLowerCase()
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Você não possui permissão para enviar contrato para este serviço.'
            });
        }

        if (!arquivo) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Selecione o contrato antes de enviar.'
            });
        }

        await pool.query(
            `UPDATE servicos
             SET contrato_empresa_arquivo = $1,
                 contrato_empresa_nome = $2
             WHERE id = $3`,
            [
                arquivo,
                nome || 'contrato',
                id
            ]
        );

        await adicionarMensagemSistema(
            id,
            'Contrato da empresa disponibilizado para o profissional.'
        );

        await registrarAuditoria(
            empresaEmail || servico.empresa_email,
            'ENVIO_CONTRATO',
            `Contrato enviado no serviço #${id}.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Contrato enviado com sucesso!'
        });

    } catch (err) {
        console.error(
            'Erro ao enviar contrato:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao enviar contrato.'
        });
    }
});


// =====================================================
// COMPROVANTE DE PAGAMENTO
// =====================================================

app.post('/api/servicos/:id/comprovante-pagamento', async (req, res) => {
    const id = req.params.id;

    const {
        arquivo,
        nome,
        empresaEmail
    } = req.body;

    try {
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

        if (
            empresaEmail &&
            servico.empresa_email &&
            String(servico.empresa_email).toLowerCase() !==
            String(empresaEmail).toLowerCase()
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente a empresa responsável pode enviar o comprovante.'
            });
        }

        if (!arquivo) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Selecione o comprovante de pagamento.'
            });
        }

        await pool.query(
            `UPDATE servicos
             SET comprovante_pagamento = $1,
                 comprovante_pagamento_arquivo = $1,
                 comprovante_pagamento_nome = $2,
                 status = 'pago'
             WHERE id = $3`,
            [
                arquivo,
                nome || 'comprovante-pagamento',
                id
            ]
        );

        await adicionarMensagemSistema(
            id,
            'A empresa enviou o comprovante de pagamento.'
        );

        await registrarAuditoria(
            empresaEmail || servico.empresa_email,
            'ENVIO_COMPROVANTE_PAGAMENTO',
            `Comprovante de pagamento enviado no serviço #${id}.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Comprovante de pagamento enviado com sucesso!'
        });

    } catch (err) {
        console.error(
            'Erro ao enviar comprovante:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao enviar comprovante de pagamento.'
        });
    }
});


// =====================================================
// CONFIRMAR RECEBIMENTO DO PAGAMENTO
// =====================================================

app.post('/api/servicos/:id/confirmar-pagamento', async (req, res) => {
    const id = req.params.id;

    const {
        prestadorEmail
    } = req.body;

    try {
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

        if (
            String(servico.prestador_email || '').toLowerCase() !==
            String(prestadorEmail || '').toLowerCase()
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente o titular pode confirmar o recebimento.'
            });
        }

        if (
            !servico.comprovante_pagamento &&
            !servico.comprovante_pagamento_arquivo
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: 'A empresa ainda não enviou o comprovante de pagamento.'
            });
        }

        if (servico.pagamento_recebido_confirmado) {
            return res.status(400).json({
                sucesso: false,
                erro: 'O recebimento deste pagamento já foi confirmado.'
            });
        }

        const agora = new Date();

        await pool.query(
            `UPDATE servicos
             SET pagamento_recebido_confirmado = TRUE,
                 pagamento_recebido_em = $1,
                 status = 'concluido_com_sucesso'
             WHERE id = $2`,
            [
                agora,
                id
            ]
        );

        await adicionarMensagemSistema(
            id,
            'O profissional confirmou o recebimento do pagamento.'
        );

        await registrarAuditoria(
            prestadorEmail,
            'CONFIRMAR_RECEBIMENTO',
            `Prestador confirmou recebimento do serviço #${id}.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Pagamento confirmado como recebido!'
        });

    } catch (err) {
        console.error(
            'Erro ao confirmar pagamento:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao confirmar recebimento.'
        });
    }
});


// =====================================================
// CHAT DO SERVIÇO
// =====================================================

app.get('/api/servicos/:id/chat', async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query(
            `SELECT *
             FROM mensagens_chat
             WHERE servico_id = $1
             ORDER BY criado_em ASC`,
            [id]
        );

        res.json(result.rows);

    } catch (err) {
        console.error(
            'Erro ao carregar chat:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao carregar mensagens.'
        });
    }
});


app.post('/api/servicos/:id/chat', async (req, res) => {
    const id = req.params.id;

    const {
        remetenteEmail,
        remetenteNome,
        mensagem
    } = req.body;

    try {
        if (!mensagem || !String(mensagem).trim()) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Digite uma mensagem.'
            });
        }

        const servicoResult = await pool.query(
            `SELECT *
             FROM servicos
             WHERE id = $1`,
            [id]
        );

        if (!servicoResult.rows.length) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico =
            servicoResult.rows[0];

        const email =
            String(remetenteEmail || '').toLowerCase();

        const empresa =
            String(servico.empresa_email || '').toLowerCase();

        const prestador =
            String(servico.prestador_email || '').toLowerCase();

        if (
            email !== empresa &&
            email !== prestador
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: 'O chat é privado entre a empresa e o profissional titular.'
            });
        }

        const result = await pool.query(
            `INSERT INTO mensagens_chat (
                servico_id,
                remetente_email,
                remetente_nome,
                mensagem,
                criado_em
             )
             VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)
             RETURNING *`,
            [
                id,
                remetenteEmail,
                remetenteNome || remetenteEmail,
                String(mensagem).trim()
            ]
        );

        io.emit(
            'nova_mensagem',
            {
                servicoId: id,
                mensagem: result.rows[0]
            }
        );

        res.json({
            sucesso: true,
            mensagem: result.rows[0]
        });

    } catch (err) {
        console.error(
            'Erro ao enviar mensagem:',
            err
        );

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao enviar mensagem.'
        });
    }
});


// =====================================================
// PROMOVER RESERVA PARA TITULAR
// =====================================================

app.post('/api/servicos/:id/promover-reserva', async (req, res) => {
    const id = req.params.id;

    const {
        empresaEmail,
        prestadorEmail
    } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `SELECT *
             FROM servicos
             WHERE id = $1
             FOR UPDATE`,
            [id]
        );

        if (!result.rows.length) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico =
            result.rows[0];

        if (
            empresaEmail &&
            servico.empresa_email &&
            String(servico.empresa_email).toLowerCase() !==
            String(empresaEmail).toLowerCase()
        ) {
            await client.query('ROLLBACK');

            return res.status(403).json({
                sucesso: false,
                erro: 'Somente a empresa responsável pode realizar a substituição.'
            });
        }

        const reservas =
            Array.isArray(servico.reservas)
                ? servico.reservas
                : [];

        if (!reservas.length) {
            await client.query('ROLLBACK');

            return res.status(400).json({
                sucesso: false,
                erro: 'Não existem reservas disponíveis.'
            });
        }

        let indiceReserva = 0;

        if (prestadorEmail) {
            indiceReserva =
                reservas.findIndex(
                    r =>
                        String(r.email || '').toLowerCase() ===
                        String(prestadorEmail).toLowerCase()
                );

            if (indiceReserva === -1) {
                await client.query('ROLLBACK');

                return res.status(404).json({
                    sucesso: false,
                    erro: 'O profissional selecionado não está na fila de reserva.'
                });
            }
        }

        const novoTitular =
            reservas[indiceReserva];

        const reservasRestantes =
            reservas.filter(
                (_, index) =>
                    index !== indiceReserva
            );

        const usuarioResult =
            await client.query(
                `SELECT id
                 FROM usuarios
                 WHERE LOWER(email) = LOWER($1)
                 LIMIT 1`,
                [novoTitular.email]
            );

        const novoPrestadorId =
            usuarioResult.rows[0]?.id || null;

        await client.query(
            `UPDATE servicos
             SET prestador_email = $1,
                 prestador_id = $2,
                 prestador_nome = $3,
                 prestador_whatsapp = $4,
                 prestador_pix = $5,
                 reservas = $6,
                 data_aceite = CURRENT_TIMESTAMP,
                 status = 'em_andamento',
                 status_checkin = 'pendente',
                 checkin_hora = NULL,
                 checkout_hora = NULL,
                 foto_checkin = NULL,
                 foto_checkout = NULL,
                 foto_ponto = NULL,
                 documento_comprovante = NULL,
                 intervalo_inicio = NULL,
                 intervalo_retorno = NULL,
                 total_horas = NULL
             WHERE id = $7`,
            [
                novoTitular.email,
                novoPrestadorId,
                novoTitular.nome || '',
                novoTitular.whatsapp || '',
                novoTitular.pix || '',
                JSON.stringify(reservasRestantes),
                id
            ]
        );

        await client.query('COMMIT');

        await adicionarMensagemSistema(
            id,
            `${novoTitular.nome || novoTitular.email} foi promovido da reserva para titular da vaga.`
        );

        await registrarAuditoria(
            empresaEmail || servico.empresa_email,
            'PROMOVER_RESERVA',
            `${novoTitular.email} foi promovido para titular do serviço #${id}.`
        );

        io.emit('atualizar_servicos');

        return res.json({
            sucesso: true,
            mensagem: `${novoTitular.nome || novoTitular.email} agora é o titular da vaga.`,
            titular: {
                email: novoTitular.email,
                nome: novoTitular.nome || '',
                whatsapp: novoTitular.whatsapp || '',
                pix: novoTitular.pix || ''
            },
            reservas: reservasRestantes
        });

    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}

        console.error(
            'Erro ao promover reserva:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro de conexão ao processar substituição.',
            detalhes: err.message
        });

    } finally {
        client.release();
    }
});
app.post('/api/servicos/:id/confirmar-recebimento', async (req, res) => {
    const id = req.params.id;

    try {
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

        if (!servico.comprovante_pagamento_arquivo) {
            return res.status(400).json({
                sucesso: false,
                erro: 'A empresa ainda não enviou o comprovante de pagamento.'
            });
        }

        if (servico.pagamento_recebido_confirmado) {
            return res.status(409).json({
                sucesso: false,
                erro: 'O recebimento deste pagamento já foi confirmado.'
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
            req.body.prestadorEmail || servico.prestador_email || 'prestador',
            'CONFIRMAR_RECEBIMENTO_PAGAMENTO',
            `Prestador confirmou recebimento do pagamento do serviço #${id}`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Recebimento confirmado com sucesso!'
        });

    } catch (err) {
        console.error('Erro ao confirmar recebimento:', err);

        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao confirmar recebimento.'
        });
    }
});

// =====================================================
// EMPRESA ENVIA CONTRATO PRÓPRIO EM PDF/IMAGEM
// =====================================================

app.post(
    '/api/servicos/:id/contrato-empresa',
    upload.single('contratoEmpresa'),
    async (req, res) => {
        const id = req.params.id;

        try {
            const arquivo = req.file;

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
                    erro: 'Nenhum contrato foi enviado.'
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
                req.body.usuarioEmail || servico.empresa_email || 'empresa',
                'ENVIO_CONTRATO_EMPRESA',
                `Contrato da empresa enviado no serviço #${id}`
            );

            io.emit('atualizar_servicos');

            res.json({
                sucesso: true,
                mensagem: 'Contrato enviado ao prestador com sucesso!',
                contrato_nome: nomeArquivo
            });

        } catch (err) {
            console.error(
                'Erro ao enviar contrato da empresa:',
                err
            );

            res.status(500).json({
                sucesso: false,
                erro: 'Erro ao enviar contrato da empresa: ' + err.message
            });
        }
    }
);

// =====================================================
// CHAT
// =====================================================

app.post('/api/servicos/:id/chat', async (req, res) => {
    const id = req.params.id;

    const {
        remetente,
        texto
    } = req.body;

    try {
        const result = await pool.query(
            `SELECT mensagens
             FROM servicos
             WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                sucesso: false
            });
        }

        let mensagens =
            result.rows[0].mensagens || [];

        mensagens.push({
            remetente,
            texto,
            data: new Date().toLocaleTimeString()
        });

        await pool.query(
            `UPDATE servicos
             SET mensagens = $1
             WHERE id = $2`,
            [
                JSON.stringify(mensagens),
                id
            ]
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true
        });

    } catch (err) {
        res.status(500).json({
            sucesso: false
        });
    }
});

// =====================================================
// EMPRESA VALIDA SERVIÇO FINALIZADO
// =====================================================

app.post('/api/servicos/:id/validar', async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT *
             FROM servicos
             WHERE id = $1`,
            [req.params.id]
        );

        if (!r.rows.length) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (!r.rows[0].checkout_hora) {
            return res.status(400).json({
                sucesso: false,
                erro: 'O prestador ainda não realizou o check-out.'
            });
        }

        await pool.query(
            `UPDATE servicos
             SET validado_empresa = TRUE,
                 validado_em = CURRENT_TIMESTAMP,
                 status = 'validado'
             WHERE id = $1`,
            [req.params.id]
        );

        await adicionarMensagemSistema(
            req.params.id,
            'A empresa validou o serviço. Pagamento liberado para processamento.'
        );

        await registrarAuditoria(
            req.body.usuarioEmail || r.rows[0].empresa_email || 'empresa',
            'VALIDAR_SERVICO',
            `Serviço #${req.params.id} validado.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Serviço validado pela empresa. Pronto para pagamento.'
        });

    } catch (err) {
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao validar serviço.'
        });
    }
});

// =====================================================
// APROVAR PAGAMENTO
// =====================================================

app.post('/api/servicos/:id/aprovar', async (req, res) => {
    const id = req.params.id;

    try {
        const servicoRes = await pool.query(
            `SELECT *
             FROM servicos
             WHERE id = $1`,
            [id]
        );

        if (servicoRes.rows.length === 0) {
            return res.json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico = servicoRes.rows[0];

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
                servico.valor_diaria -
                servico.valor_liquido
            )
        );

        await registrarAuditoria(
            servico.empresa_email,
            'APROVAR_PAGAMENTO',
            `Pagamento do serviço #${id} aprovado.`
        );

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true
        });

    } catch (err) {
        res.json({
            sucesso: false,
            erro: 'Erro ao aprovar serviço.'
        });
    }
});

// =====================================================
// EXCLUIR SERVIÇO
// =====================================================

app.delete('/api/servicos/:id', async (req, res) => {
    const id = req.params.id;

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

        io.emit('atualizar_servicos');

        res.json({
            sucesso: true,
            mensagem: 'Serviço removido com sucesso!'
        });

    } catch (err) {
        res.json({
            sucesso: false,
            erro: 'Erro ao excluir serviço.'
        });
    }
});

// =====================================================
// PROMOVER RESERVA PARA TITULAR
//
// IMPORTANTE:
// O index.html chama:
//
// POST /api/servicos/:id/promover
//
// BODY:
// {
//     emailReserva: "email@prestador.com"
// }
// =====================================================

app.post('/api/servicos/:id/promover', async (req, res) => {
    const id = req.params.id;

    const emailReserva =
        String(
            req.body.emailReserva || ''
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
        await client.query('BEGIN');

        const resultado =
            await client.query(
                `SELECT *
                 FROM servicos
                 WHERE id = $1
                 FOR UPDATE`,
                [id]
            );

        if (!resultado.rows.length) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const servico =
            resultado.rows[0];

        const fila =
            Array.isArray(servico.reservas)
                ? servico.reservas
                : [];

        const indiceReserva =
            fila.findIndex(
                item =>
                    String(item.email || '')
                        .trim()
                        .toLowerCase()
                    === emailReserva
            );

        if (indiceReserva === -1) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                sucesso: false,
                erro: 'Este profissional não está mais na fila de reserva.'
            });
        }

        const novoTitular =
            fila[indiceReserva];

        const reservasRestantes =
            fila.filter(
                (_, idx) =>
                    idx !== indiceReserva
            );

        const usuario =
            await client.query(
                `SELECT id
                 FROM usuarios
                 WHERE LOWER(email) = LOWER($1)
                 LIMIT 1`,
                [novoTitular.email]
            );

        const novoPrestadorId =
            usuario.rows[0]?.id || null;

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

        await client.query(
            `UPDATE servicos
             SET prestador_email = $1,
                 prestador_id = $2,
                 prestador_nome = $3,
                 prestador_pix = $4,
                 prestador_whatsapp = $5,
                 reservas = $6,
                 data_aceite = CURRENT_TIMESTAMP,
                 presenca_confirmada = FALSE,
                 selfie_confirmacao = NULL,
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
                 status = 'em_andamento'
             WHERE id = $7`,
            [
                novoTitular.email,
                novoPrestadorId,
                novoTitular.nome || '',
                novoTitular.pix || '',
                novoTitular.whatsapp || '',
                JSON.stringify(
                    reservasRestantes
                ),
                id
            ]
        );

        await client.query('COMMIT');

        await adicionarMensagemSistema(
            id,
            `${novoTitular.nome || novoTitular.email} foi promovido de Reserva de Emergência para Titular da vaga.`
        );

        await registrarAuditoria(
            req.body.empresaEmail ||
                servico.empresa_email ||
                'empresa',

            'PROMOVER_RESERVA_TITULAR',

            titularAnterior
                ? `${novoTitular.nome || novoTitular.email} substituiu ${titularAnterior.nome || titularAnterior.email} como titular do serviço #${id}.`
                : `${novoTitular.nome || novoTitular.email} foi promovido para titular do serviço #${id}.`
        );

        io.emit('atualizar_servicos');

        return res.json({
            sucesso: true,

            mensagem:
                `${novoTitular.nome || novoTitular.email} agora é o titular da vaga.`,

            novoTitular: {
                email:
                    novoTitular.email,

                nome:
                    novoTitular.nome || '',

                whatsapp:
                    novoTitular.whatsapp || '',

                pix:
                    novoTitular.pix || ''
            },

            titularAnterior,

            reservasRestantes
        });

    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}

        console.error(
            'Erro ao promover reserva para titular:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro interno ao processar substituição.',
            detalhes: err.message
        });

    } finally {
        client.release();
    }
});

// =====================================================
// SOCKET.IO
// =====================================================

io.on('connection', (socket) => {
    console.log(
        'Novo cliente conectado via WebSocket:',
        socket.id
    );
});

// =====================================================
// INDEX.HTML
// =====================================================

app.get('/', (req, res) => {
    res.status(200).sendFile(
        path.join(
            __dirname,
            'index.html'
        )
    );
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT =
    process.env.PORT || 10000;

server.listen(PORT, () => {
    console.log(
        `Servidor rodando na porta ${PORT}`
    );
});
