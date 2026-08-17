const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Configuração do Supabase (Usando a chave de serviço para operações administrativas e do sistema)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Servir arquivos estáticos do front-end
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ==========================================
// 1. MÓDULO DE AUTENTICAÇÃO E CADASTRO (ETAPA 1)
// ==========================================

// Cadastro unificado (Empresa ou Prestador com todos os campos exigidos)
app.post('/api/auth/registrar', async (req, res) => {
    const { 
        nome, email, senha, tipo, cnpj, razaoSocial, cpf, 
        rgCnh, endereco, telefone, chavePix, dadosBancarios, profissao, experiencia, curriculo 
    } = req.body;

    try {
        const hashSenha = await bcrypt.hash(senha, 10);
        
        const { data, error } = await supabase
            .from('usuarios')
            .insert([{ 
                nome, email, senha: hashSenha, tipo, cnpj, razaoSocial, cpf, 
                rgCnh, endereco, telefone, chavePix, dadosBancarios, profissao, experiencia, curriculo,
                statusAprovacao: 'pendente' // Administrador aprova depois
            }]);
            
        if (error) return res.status(400).json({ sucesso: false, erro: error.message });
        res.json({ sucesso: true, mensagem: "Cadastro realizado com sucesso! Aguardando aprovação." });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const { data: usuario, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !usuario) return res.status(401).json({ sucesso: false, erro: "Usuário não encontrado" });

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ sucesso: false, erro: "Senha incorreta" });

        res.json({ sucesso: true, usuario });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});


// ==========================================
// 2. MÓDULO DE SERVIÇOS E PUBLICAÇÃO (ETAPA 2)
// ==========================================

app.get('/api/servicos', async (req, res) => {
    const { data, error } = await supabase
        .from('servicos')
        .select('*')
        .order('id', { ascending: false });

    if (error) return res.status(500).json({ sucesso: false, erro: error.message });
    res.json(data);
});

// Empresa publica o chamado (Dinheiro retido na plataforma - Escrow)
app.post('/api/servicos', async (req, res) => {
    const { 
        titulo, local, endereco, valor, dataHorario, quantidadeProfissionais, 
        descricao, equipamentos, formaPgto, empresaEmail, empresaWhatsapp 
    } = req.body;
    
    const { data, error } = await supabase
        .from('servicos')
        .insert([{ 
            titulo, local, endereco, valor, dataHorario, quantidadeProfissionais, 
            descricao, equipamentos, formaPgto, empresaEmail, empresaWhatsapp, 
            status: 'pendente' // Disponível para prestadores
        }]);

    if (error) return res.status(500).json({ sucesso: false, erro: error.message });
    res.json({ sucesso: true, data });
});


// ==========================================
// 3. MÓDULO DE ACEITE E CONTRATO (ETAPAS 3 e 4)
// ==========================================

app.post('/api/servicos/:id/aceitar', async (req, res) => {
    const { id } = req.params;
    const { prestadorEmail, prestadorNome, prestadorPix, prestadorWhatsapp, selfieUrl } = req.body;

    const { data, error } = await supabase
        .from('servicos')
        .update({ 
            prestadorEmail, prestadorNome, prestadorPix, prestadorWhatsapp, 
            prestadorSelfie: selfieUrl,
            status: 'ativo' 
        })
        .eq('id', id);

    if (error) return res.status(500).json({ sucesso: false, erro: error.message });
    res.json({ sucesso: true, mensagem: "Serviço aceito e contrato gerado com sucesso!" });
});


// ==========================================
// 4. MÓDULO DE EXECUÇÃO: CHECK-IN E CHECK-OUT (ETAPAS 5, 6 e 7)
// ==========================================

// Check-in com foto, GPS e horário
app.post('/api/servicos/:id/checkin', async (req, res) => {
    const { id } = req.params;
    const { fotoUrl, gpsLat, gpsLng } = req.body;

    const { data, error } = await supabase
        .from('servicos')
        .update({ 
            fotoPontoCheckin: fotoUrl, 
            checkinLat: gpsLat,
            checkinLng: gpsLng,
            checkinHora: new Date().toISOString(),
            status: 'em_andamento' 
        })
        .eq('id', id);

    if (error) return res.status(500).json({ sucesso: false, erro: error.message });
    res.json({ sucesso: true, mensagem: "Check-in realizado com sucesso." });
});

// Check-out e solicitação de aprovação
app.post('/api/servicos/:id/checkout', async (req, res) => {
    const { id } = req.params;
    const { fotoCheckoutUrl } = req.body;

    const { data, error } = await supabase
        .from('servicos')
        .update({ 
            fotoCheckout: fotoCheckoutUrl,
            status: 'aguardando_aprovacao', 
            dataCheckout: new Date().toISOString() 
        })
        .eq('id', id);

    if (error) return res.status(500).json({ sucesso: false, erro: error.message });
    res.json({ sucesso: true, mensagem: "Check-out realizado. Aguardando aprovação do cliente." });
});


// ==========================================
// 5. MÓDULO DE PAGAMENTO E CONTESTAÇÃO (ETAPA 8)
// ==========================================

// Cliente aprova (Libera Pix e desconta taxa da plataforma)
app.post('/api/servicos/:id/aprovar', async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
        .from('servicos')
        .update({ status: 'concluido_aprovado' })
        .eq('id', id);

    if (error) return res.status(500).json({ sucesso: false, erro: error.message });
    res.json({ sucesso: true, mensagem: "Pagamento liberado com sucesso para o prestador!" });
});

// Cliente contesta (Bloqueia pagamento para análise do ADM)
app.post('/api/servicos/:id/contestar', async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;

    const { data, error } = await supabase
        .from('servicos')
        .update({ 
            status: 'contestado', 
            motivoContestacao: motivo 
        })
        .eq('id', id);

    if (error) return res.status(500).json({ sucesso: false, erro: error.message });
    res.json({ sucesso: true, mensagem: "Serviço contestado. O pagamento ficará retido para análise." });
});


// ==========================================
// 6. MÓDULO FISCAL E NOTAS (Planejamento / Integração)
// ==========================================

// Salvar dados da Nota Fiscal emitida
app.post('/api/servicos/:id/notafiscal', async (req, res) => {
    const { id } = req.params;
    const { numeroNota, pdfUrl, xmlUrl } = req.body;

    const { data, error } = await supabase
        .from('servicos')
        .update({ numeroNotaFiscal: numeroNota, notaPdfUrl: pdfUrl, notaXmlUrl: xmlUrl })
        .eq('id', id);

    if (error) return res.status(500).json({ sucesso: false, erro: error.message });
    res.json({ sucesso: true, mensagem: "Nota fiscal anexada com sucesso." });
});


// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`RS Connect rodando com sucesso na porta ${PORT}`);
});