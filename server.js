const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuração de Limites e Arquivos Estáticos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Rota raiz para servir explicitamente o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

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

            CREATE TABLE IF NOT EXISTS servicos (
                id SERIAL PRIMARY KEY,
                titulo TEXT,
                local TEXT,
                endereco TEXT,
                valor TEXT,
                valor_prestador TEXT,
                data_horario TEXT,
                forma_pgto TEXT,
                descricao TEXT,
                contrato_texto TEXT,
                empresa_email TEXT,
                empresa_whatsapp TEXT,
                status TEXT DEFAULT 'ativo',
                prestador_email TEXT,
                prestador_nome TEXT,
                prestador_pix TEXT,
                prestador_whatsapp TEXT,
                foto_ponto TEXT,
                reservas JSONB DEFAULT '[]'::jsonb,
                mensagens JSONB DEFAULT '[]'::jsonb,
                selfie_confirmacao TEXT,
                documento_comprovante TEXT,
                presenca_confirmada BOOLEAN DEFAULT FALSE,
                checkin_hora TEXT,
                checkout_hora TEXT,
                comprovante_pagamento BOOLEAN DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ledger_transacoes (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER,
                usuario_email TEXT NOT NULL,
                tipo_movimento TEXT NOT NULL, 
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
        `);

        // Garantir colunas essenciais e a nova coluna de valor do prestador caso a tabela já exista
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_prestador TEXT;`);
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb;`);
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS mensagens JSONB DEFAULT '[]'::jsonb;`);
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT;`);
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS documento_comprovante TEXT;`);
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN DEFAULT FALSE;`);
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_hora TEXT;`);
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_hora TEXT;`);
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN DEFAULT FALSE;`);
        await pool.query(`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);

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
            [email, acao, detalhes]
        );
    } catch (err) {
        console.error('Erro ao registrar auditoria:', err);
    }
}

// Rotas de Autenticação
app.post('/api/auth/registrar', async (req, res) => {
    const d = req.body;
    try {
        const query = `INSERT INTO usuarios (tipo, nome, doc, responsavel, email, senha, whatsapp, endereco, rg_cnh, profissao, tipo_chave_pix, pix, banco, conta, experiencia) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`;
        const params = [d.tipo, d.nome, d.doc, d.responsavel, d.email, d.senha, d.whatsapp, d.endereco, d.rgCnh, d.profissao, d.tipoChavePix, d.pix, d.banco, d.conta, d.experiencia];
        
        const result = await pool.query(query, params);
        await registrarAuditoria(d.email, 'CADASTRO_USUARIO', `Novo usuário tipo ${d.tipo} cadastrado.`);
        res.json({ sucesso: true, id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.json({ sucesso: false, erro: 'E-mail já cadastrado ou erro nos dados.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const result = await pool.query(`SELECT * FROM usuarios WHERE email = $1 AND senha = $2`, [email, senha]);
        if (result.rows.length === 0) {
            return res.json({ sucesso: false, erro: 'E-mail ou senha incorretos.' });
        }
        await registrarAuditoria(email, 'LOGIN', 'Login realizado com sucesso.');
        res.json({ sucesso: true, usuario: result.rows[0] });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: 'Erro no servidor.' });
    }
});

// Rotas de Serviços
app.get('/api/servicos', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM servicos ORDER BY id DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar serviços.' });
    }
});

app.post('/api/servicos', async (req, res) => {
    const s = req.body;
    try {
        const valorPrestador = s.valorPrestador || s.valor;
        const query = `INSERT INTO servicos (titulo, local, endereco, valor, valor_prestador, data_horario, forma_pgto, descricao, contrato_texto, empresa_email, empresa_whatsapp, status, criado_em) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ativo', NOW()) RETURNING id`;
        const params = [s.titulo, s.local, s.endereco, s.valor, valorPrestador, s.dataHorario || s.local, s.formaPgto || s.pagamento, s.descricao, s.contratoTexto || s.contrato, s.empresaEmail, s.empresaWhatsapp];

        const result = await pool.query(query, params);
        const servicoId = result.rows[0].id;
        
        const valorNumerico = parseFloat(s.valor.replace(',', '.')) || 0;
        await registrarLedger(servicoId, s.empresaEmail, 'RETENCAO_GARANTIA', valorNumerico);
        await registrarAuditoria(s.empresaEmail, 'PUBLICAR_SERVICO', `Serviço #${servicoId} publicado com valor R$ ${s.valor}`);

        io.emit('atualizar_servicos');
        res.json({ sucesso: true, id: servicoId });
    } catch (err) {
        console.error(err);
        res.json({ sucesso: false, erro: 'Erro ao publicar serviço.' });
    }
});

// Rota para Excluir Serviço
app.delete('/api/servicos/:id', async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query(`DELETE FROM servicos WHERE id = $1`, [id]);
        await registrarAuditoria('sistema', 'EXCLUIR_SERVICO', `Serviço #${id} excluído.`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true, mensagem: 'Serviço excluído com sucesso!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false, erro: 'Erro ao excluir serviço.' });
    }
});

app.post('/api/servicos/:id/aceitar', async (req, res) => {
    const id = req.params.id;
    const { prestadorEmail, prestadorNome, prestadorPix, prestadorWhatsapp, rgCnh } = req.body;

    try {
        const resultServico = await pool.query(`SELECT * FROM servicos WHERE id = $1`, [id]);
        if (resultServico.rows.length === 0) {
            return res.json({ sucesso: false, erro: 'Serviço não encontrado.' });
        }
        const servico = resultServico.rows[0];
        let reservas = servico.reservas || [];

        if (!servico.prestador_email) {
            const query = `UPDATE servicos SET status = 'em_andamento', prestador_email = $1, prestador_nome = $2, prestador_pix = $3, prestador_whatsapp = $4, criado_em = NOW() WHERE id = $5`;
            await pool.query(query, [prestadorEmail, prestadorNome, prestadorPix, prestadorWhatsapp, id]);
            
            await registrarAuditoria(prestadorEmail, 'ACEITAR_SERVICO', `Prestador assumiu Vaga Titular #${id}`);
            io.emit('atualizar_servicos');
            return res.json({ sucesso: true, mensagem: 'Você assumiu a Vaga Titular!' });
        } else {
            if (servico.prestador_email === prestadorEmail || reservas.some(r => r.email === prestadorEmail)) {
                return res.json({ sucesso: false, erro: 'Você já está inscrito nesta vaga.' });
            }
            if (reservas.length >= 2) {
                return res.json({ sucesso: false, erro: 'A fila de reservas (máximo 2) já está lotada.' });
            }

            reservas.push({ email: prestadorEmail, nome: prestadorNome, whatsapp: prestadorWhatsapp, rgCnh, pix: prestadorPix });
            await pool.query(`UPDATE servicos SET reservas = $1 WHERE id = $2`, [JSON.stringify(reservas), id]);

            await registrarAuditoria(prestadorEmail, 'ENTRAR_RESERVA', `Prestador entrou na Fila de Reserva do serviço #${id}`);
            io.emit('atualizar_servicos');
            return res.json({ sucesso: true, mensagem: 'Você entrou na Fila de Reserva (Emergência)!' });
        }
    } catch (err) {
        res.json({ sucesso: false, erro: 'Erro ao aceitar contrato.' });
    }
});

app.post('/api/servicos/:id/promover', async (req, res) => {
    const id = req.params.id;
    const { emailReserva } = req.body;
    try {
        const resultServico = await pool.query(`SELECT * FROM servicos WHERE id = $1`, [id]);
        if (resultServico.rows.length === 0) return res.json({ sucesso: false, erro: 'Serviço não encontrado.' });
        
        const servico = resultServico.rows[0];
        let reservas = servico.reservas || [];
        const index = reservas.findIndex(r => r.email === emailReserva);

        if (index === -1) return res.json({ sucesso: false, erro: 'Candidato não encontrado na fila de reserva.' });

        const promovido = reservas.splice(index, 1)[0];
        
        await pool.query(`
            UPDATE servicos 
            SET prestador_email = $1, prestador_nome = $2, prestador_pix = $3, prestador_whatsapp = $4, 
                reservas = $5, criado_em = NOW(), presenca_confirmada = FALSE 
            WHERE id = $6
        `, [promovido.email, promovido.nome, promovido.pix, promovido.whatsapp, JSON.stringify(reservas), id]);

        await registrarAuditoria('sistema', 'PROMOCAO_MANUAL', `Empresa promoveu ${promovido.email} para titular da vaga #${id}.`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true });
    } catch (err) {
        res.json({ sucesso: false, erro: 'Erro ao promover profissional.' });
    }
});

app.post('/api/servicos/:id/confirmar-presenca', async (req, res) => {
    const id = req.params.id;
    const { selfie } = req.body;
    try {
        await pool.query(
            `UPDATE servicos SET selfie_confirmacao = COALESCE($1, selfie_confirmacao), presenca_confirmada = TRUE WHERE id = $2`,
            [selfie, id]
        );
        await registrarAuditoria('sistema', 'CONFIRMAR_PRESENCA', `Presença confirmada para o serviço #${id}`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true, mensagem: 'Presença confirmada com sucesso!' });
    } catch (err) {
        res.json({ sucesso: false, erro: 'Erro ao confirmar presença.' });
    }
});

app.post('/api/servicos/:id/checkin', async (req, res) => {
    const id = req.params.id;
    const { foto, hora } = req.body;
    try {
        await pool.query(`UPDATE servicos SET foto_ponto = $1, checkin_hora = $2 WHERE id = $3`, [foto, hora || new Date().toLocaleTimeString(), id]);
        await registrarAuditoria('sistema', 'CHECKIN_PONTO', `Check-in realizado para o serviço #${id}`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true });
    } catch (err) {
        res.json({ sucesso: false, erro: 'Erro ao registrar ponto.' });
    }
});

app.post('/api/servicos/:id/ponto', async (req, res) => {
    const id = req.params.id;
    const { foto } = req.body;
    try {
        await pool.query(`UPDATE servicos SET foto_ponto = $1 WHERE id = $2`, [foto, id]);
        res.json({ sucesso: true });
    } catch (err) {
        res.json({ sucesso: false });
    }
});

app.post('/api/servicos/:id/checkout', async (req, res) => {
    const id = req.params.id;
    const { hora, foto } = req.body;
    try {
        const horaFinal = hora || new Date().toLocaleTimeString();
        await pool.query(
            `UPDATE servicos SET status = 'concluido', checkout_hora = $1, documento_comprovante = COALESCE($2, documento_comprovante), comprovante_pagamento = true WHERE id = $3`,
            [horaFinal, foto, id]
        );

        const resultMsg = await pool.query(`SELECT mensagens FROM servicos WHERE id = $1`, [id]);
        let mensagens = resultMsg.rows[0]?.mensagens || [];
        mensagens.push({ 
            remetente: 'SISTEMA', 
            texto: `Serviço finalizado pelo prestador às ${horaFinal}.`, 
            data: new Date().toLocaleTimeString() 
        });
        await pool.query(`UPDATE servicos SET mensagens = $1 WHERE id = $2`, [JSON.stringify(mensagens), id]);

        await registrarAuditoria('sistema', 'CHECKOUT', `Serviço #${id} marcado como concluído.`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true, mensagem: 'Serviço finalizado com sucesso!' });
    } catch (err) {
        res.json({ sucesso: false, erro: 'Erro ao realizar check-out.' });
    }
});

app.post('/api/servicos/:id/chat', async (req, res) => {
    const id = req.params.id;
    const { remetente, texto } = req.body;
    try {
        const result = await pool.query(`SELECT mensagens FROM servicos WHERE id = $1`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ sucesso: false });

        let mensagens = result.rows[0].mensagens || [];
        mensagens.push({ remetente, texto, data: new Date().toLocaleTimeString() });

        await pool.query(`UPDATE servicos SET mensagens = $1 WHERE id = $2`, [JSON.stringify(mensagens), id]);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false });
    }
});

// Rotina automática de 40 minutos
setInterval(async () => {
    try {
        const servicosPendentes = await pool.query(`
            SELECT * FROM servicos 
            WHERE status = 'em_andamento' 
              AND prestador_email IS NOT NULL 
              AND presenca_confirmada = FALSE 
              AND criado_em < NOW() - INTERVAL '40 minutes'
        `);

        for (let servico of servicosPendentes.rows) {
            let reservas = servico.reservas || [];
            
            if (reservas.length > 0) {
                let proximo = reservas.shift();
                await pool.query(`
                    UPDATE servicos 
                    SET prestador_email = $1, prestador_nome = $2, prestador_pix = $3, prestador_whatsapp = $4, 
                        reservas = $5, criado_em = NOW(), presenca_confirmada = FALSE 
                    WHERE id = $6
                `, [proximo.email, proximo.nome, proximo.pix, proximo.whatsapp, JSON.stringify(reservas), servico.id]);
                
                await registrarAuditoria('sistema', 'SUBSTITUICAO_AUTOMATICA', `Prestador anterior estourou 40min. Substituto ${proximo.email} assumiu a vaga #${servico.id}.`);
            } else {
                await pool.query(`
                    UPDATE servicos 
                    SET status = 'ativo', prestador_email = NULL, prestador_nome = NULL, prestador_pix = NULL, prestador_whatsapp = NULL, presenca_confirmada = FALSE 
                    WHERE id = $1
                `, [servico.id]);
                
                await registrarAuditoria('sistema', 'EXPIRAR_SEM_RESERVA', `Serviço #${servico.id} expirou após 40 min sem confirmação.`);
            }
        }

        if (servicosPendentes.rows.length > 0) {
            io.emit('atualizar_servicos');
        }
    } catch (err) {
        console.error('Erro na rotina de timeout de 40 minutos:', err);
    }
}, 60000);

io.on('connection', (socket) => {
    console.log('Novo cliente conectado via WebSocket:', socket.id);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
