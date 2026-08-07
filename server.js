const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname)); 

// Configuração do Banco de Dados PostgreSQL (Supabase / Render)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Erro ao conectar ao PostgreSQL', err.stack);
    }
    console.log('Conectado ao banco de dados PostgreSQL com sucesso.');
    release();
});

// Criação das tabelas automaticamente ao iniciar
const criarTabelas = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome TEXT,
                email TEXT UNIQUE,
                senha TEXT,
                tipo TEXT,
                whatsapp TEXT,
                rg TEXT,
                cpf TEXT,
                endereco TEXT,
                cidade TEXT
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS servicos (
                id SERIAL PRIMARY KEY,
                titulo TEXT,
                local TEXT,
                valor TEXT,
                forma_pgto TEXT,
                descricao TEXT,
                status TEXT DEFAULT 'Pendente',
                colaborador TEXT,
                foto_entrada TEXT,
                foto_saida TEXT,
                dados_pagamento TEXT
            )
        `);
        console.log('Tabelas verificadas/criadas com sucesso.');
    } catch (e) {
        console.error('Erro ao criar tabelas:', e.message);
    }
};

criarTabelas();

// ================= ROTAS DE AUTENTICAÇÃO =================

app.post('/api/auth/registrar', async (req, res) => {
    const { nome, email, senha, tipo, whatsapp, rg, cpf, endereco, cidade } = req.body;
    
    try {
        const hashSenha = await bcrypt.hash(senha, 10);
        const query = `INSERT INTO usuarios (nome, email, senha, tipo, whatsapp, rg, cpf, endereco, cidade) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`;
        const values = [nome, email, hashSenha, tipo, whatsapp || '', rg || '', cpf || '', endereco || '', cidade || ''];
        
        const result = await pool.query(query, values);
        res.json({
            sucesso: true,
            usuario: { id: result.rows[0].id, nome, email, tipo }
        });
    } catch (err) {
        console.error("Erro no SQL:", err.message); 
        res.json({ sucesso: false, erro: 'E-mail já cadastrado ou erro nos dados.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, senha, tipo } = req.body; 
    
    try {
        const query = `SELECT * FROM usuarios WHERE (email = $1 OR whatsapp = $2) AND tipo = $3`;
        const result = await pool.query(query, [email, email, tipo]);
        
        if (result.rows.length === 0) {
            return res.json({ sucesso: false, erro: 'Credenciais inválidas ou tipo incorreto.' });
        }

        const row = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, row.senha);
        if (!senhaValida) {
            return res.json({ sucesso: false, erro: 'Credenciais inválidas ou tipo incorreto.' });
        }

        res.json({
            sucesso: true,
            usuario: { id: row.id, nome: row.nome, email: row.email, tipo: row.tipo }
        });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// ================= ROTAS DE SERVIÇOS =================

app.get('/api/servicos', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM servicos ORDER BY id DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/api/servicos', async (req, res) => {
    const { titulo, local, valor, formaPgto, descricao } = req.body;
    const query = `INSERT INTO servicos (titulo, local, valor, forma_pgto, descricao, status) VALUES ($1, $2, $3, $4, $5, 'Pendente') RETURNING id`;
    
    try {
        const result = await pool.query(query, [titulo, local, valor, formaPgto, descricao]);
        const novoId = result.rows[0].id;
        
        const novoServico = {
            id: novoId,
            titulo,
            local,
            valor,
            forma_pgto: formaPgto,
            descricao,
            status: 'Pendente',
            colaborador: null,
            foto_entrada: null,
            foto_saida: null
        };

        io.emit('novo_servico', novoServico);
        res.json({ sucesso: true, id: novoId });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.put('/api/servicos/:id', async (req, res) => {
    const { id } = req.params;
    const { status, colaborador, fotoEntrada, fotoSaida, dadosPagamentoPrestador } = req.body;

    let campos = [];
    let valores = [];
    let contador = 1;

    if (status) { campos.push(`status = $${contador++}`); valores.push(status); }
    if (colaborador) { campos.push(`colaborador = $${contador++}`); valores.push(colaborador); }
    if (fotoEntrada) { campos.push(`foto_entrada = $${contador++}`); valores.push(fotoEntrada); }
    if (fotoSaida) { campos.push(`foto_saida = $${contador++}`); valores.push(fotoSaida); }
    if (dadosPagamentoPrestador) { campos.push(`dados_pagamento = $${contador++}`); valores.push(JSON.stringify(dadosPagamentoPrestador)); }

    if (campos.length === 0) {
        return res.json({ sucesso: false, erro: 'nenhum campo para atualizar' });
    }

    valores.push(id);
    const query = `UPDATE servicos SET ${campos.join(', ')} WHERE id = $${contador}`;

    try {
        await pool.query(query, valores);
        const result = await pool.query(`SELECT * FROM servicos WHERE id = $1`, [id]);
        if (result.rows.length > 0) {
            io.emit('atualizacao_servico', result.rows[0]);
        }
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.delete('/api/servicos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`DELETE FROM servicos WHERE id = $1`, [id]);
        io.emit('servico_excluido', { id: Number(id) });
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// ================= CONEXÃO SOCKET.IO =================
io.on('connection', (socket) => {
    console.log(`Novo cliente conectado via WebSocket: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`);
    });
});

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});