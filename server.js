// ============================================================
// CADASTRO + LOGIN + ALTERAÇÃO DE SENHA
// ============================================================


// ------------------------------------------------------------
// CADASTRO
// ------------------------------------------------------------

async function cadastrarUsuarioRS(req, res) {
    const d = req.body || {};

    const email = normalizarEmail(d.email);
    const senha = String(d.senha || '');

    if (!email || !senha || !d.nome) {
        return res.status(400).json({
            sucesso: false,
            erro: 'Nome, e-mail e senha são obrigatórios.'
        });
    }

    if (senha.length < 6) {
        return res.status(400).json({
            sucesso: false,
            erro: 'A senha precisa ter pelo menos 6 caracteres.'
        });
    }

    try {
        const result = await pool.query(
            `
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
                $1,$2,$3,$4,
                $5,$6,$7,$8,
                $9,$10,$11,$12,
                $13,$14,$15,$16
            )

            RETURNING *
            `,
            [
                d.tipo || 'prestador',
                d.nome,
                d.doc || '',
                d.responsavel || '',
                email,
                senha,
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
            ]
        );

        if (
            String(d.tipo || '')
                .toLowerCase() === 'prestador'
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
            `Usuário ${d.nome} cadastrado.`
        );

        const usuario = {
            ...result.rows[0]
        };

        delete usuario.senha;

        return res.json({
            sucesso: true,
            usuario
        });

    } catch (err) {
        console.error(
            'Erro no cadastro:',
            err
        );

        if (err.code === '23505') {
            return res.status(409).json({
                sucesso: false,
                erro: 'Este e-mail já está cadastrado.'
            });
        }

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao criar cadastro.'
        });
    }
}


// Compatibilidade com todas as versões
app.post(
    '/api/cadastro',
    cadastrarUsuarioRS
);

app.post(
    '/api/auth/cadastro',
    cadastrarUsuarioRS
);

app.post(
    '/api/auth/registrar',
    cadastrarUsuarioRS
);


// ------------------------------------------------------------
// LOGIN
// ------------------------------------------------------------

async function loginUsuarioRS(req, res) {
    const email =
        normalizarEmail(
            req.body?.email
        );

    const senha =
        String(
            req.body?.senha ??
            req.body?.password ??
            ''
        );

    if (!email || !senha) {
        return res.status(400).json({
            sucesso: false,
            erro: 'Informe e-mail e senha.'
        });
    }

    try {
        // Primeiro verifica se o usuário realmente existe.
        const usuarioResult =
            await pool.query(
                `
                SELECT *
                FROM usuarios

                WHERE
                    LOWER(TRIM(email))
                    =
                    LOWER(TRIM($1))

                LIMIT 1
                `,
                [email]
            );

        if (!usuarioResult.rows.length) {
            console.log(
                `⚠️ LOGIN: usuário não encontrado: ${email}`
            );

            return res.status(401).json({
                sucesso: false,
                erro: 'E-mail ou senha incorretos.'
            });
        }

        const usuarioBanco =
            usuarioResult.rows[0];

        const senhaBanco =
            String(
                usuarioBanco.senha ?? ''
            );

        // Comparação exata da senha.
        if (senha !== senhaBanco) {
            console.log(
                `⚠️ LOGIN: senha incorreta para ${email}`
            );

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

        const usuario = {
            ...usuarioBanco
        };

        // Nunca devolver a senha ao navegador.
        delete usuario.senha;

        console.log(
            `✅ LOGIN realizado: ${email}`
        );

        return res.json({
            sucesso: true,
            usuario
        });

    } catch (err) {
        console.error(
            '❌ Erro no login:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro interno ao realizar login.'
        });
    }
}


// O INDEX atual usa esta:
app.post(
    '/api/login',
    loginUsuarioRS
);


// Compatibilidade:
app.post(
    '/api/auth/login',
    loginUsuarioRS
);


// ------------------------------------------------------------
// ALTERAR SENHA
//
// Requer:
// email
// senhaAtual
// novaSenha
// ------------------------------------------------------------

async function alterarSenhaRS(req, res) {
    const email =
        normalizarEmail(
            req.body?.email
        );

    const senhaAtual =
        String(
            req.body?.senhaAtual ||
            req.body?.senha_atual ||
            ''
        );

    const novaSenha =
        String(
            req.body?.novaSenha ||
            req.body?.nova_senha ||
            ''
        );

    if (
        !email ||
        !senhaAtual ||
        !novaSenha
    ) {
        return res.status(400).json({
            sucesso: false,
            erro:
                'E-mail, senha atual e nova senha são obrigatórios.'
        });
    }

    if (novaSenha.length < 6) {
        return res.status(400).json({
            sucesso: false,
            erro:
                'A nova senha precisa ter pelo menos 6 caracteres.'
        });
    }

    try {
        const usuarioResult =
            await pool.query(
                `
                SELECT id, senha
                FROM usuarios

                WHERE
                    LOWER(TRIM(email))
                    =
                    LOWER(TRIM($1))

                LIMIT 1
                `,
                [email]
            );

        if (!usuarioResult.rows.length) {
            return res.status(404).json({
                sucesso: false,
                erro:
                    'Usuário não encontrado.'
            });
        }

        const senhaBanco =
            String(
                usuarioResult.rows[0].senha ||
                ''
            );

        if (
            senhaAtual !==
            senhaBanco
        ) {
            return res.status(401).json({
                sucesso: false,
                erro:
                    'A senha atual está incorreta.'
            });
        }

        await pool.query(
            `
            UPDATE usuarios

            SET senha = $1

            WHERE
                LOWER(TRIM(email))
                =
                LOWER(TRIM($2))
            `,
            [
                novaSenha,
                email
            ]
        );

        await registrarAuditoria(
            email,
            'ALTERAR_SENHA',
            'Senha alterada pelo próprio usuário.'
        );

        console.log(
            `✅ Senha alterada: ${email}`
        );

        return res.json({
            sucesso: true,
            mensagem:
                'Senha alterada com sucesso.'
        });

    } catch (err) {
        console.error(
            'Erro ao alterar senha:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                'Não foi possível alterar a senha.'
        });
    }
}


app.post(
    '/api/alterar-senha',
    alterarSenhaRS
);

app.post(
    '/api/auth/alterar-senha',
    alterarSenhaRS
);


// ============================================================
// FIM DA AUTENTICAÇÃO
// A PARTIR DAQUI CONTINUA:
// // LISTAR SERVIÇOS
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// PARTE 2 DE 4
// SAIR DA VAGA + PRESENÇA + CHECK-IN + INTERVALO + CHECK-OUT
// ============================================================


// ============================================================
// SAIR DA VAGA
// ============================================================

app.post(
    '/api/servicos/:id/sair-vaga',

    async (req, res) => {
        const servicoId =
            Number(
                req.params.id
            );

        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.prestadorEmail ||
                req.body?.prestador_email
            );


        if (
            !servicoId ||
            !email
        ) {
            return res
                .status(400)
                .json({
                    sucesso: false,
                    erro:
                        'Serviço ou prestador não informado.'
                });
        }


        try {
            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            let reservas =
                parseReservas(
                    servico.reservas
                );


            const ehTitular =
                normalizarEmail(
                    servico.prestador_email
                )
                ===
                email;


            const indiceReserva =
                reservas.findIndex(
                    reserva => {
                        const reservaEmail =
                            normalizarEmail(
                                typeof reserva ===
                                'string'
                                    ?
                                    reserva
                                    :
                                    reserva.email ||
                                    reserva.prestadorEmail ||
                                    reserva.prestador_email
                            );


                        return (
                            reservaEmail ===
                            email
                        );
                    }
                );


            if (
                !ehTitular &&
                indiceReserva === -1
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Você não está vinculado a esta vaga.'
                    });
            }


            // =================================================
            // TITULAR SAINDO
            // =================================================

            if (ehTitular) {
                if (
                    servico.presenca_confirmada ||
                    servico.checkin_hora ||
                    servico.intervalo_inicio ||
                    servico.checkout_hora
                ) {
                    return res
                        .status(409)
                        .json({
                            sucesso: false,
                            erro:
                                'Não é possível sair da vaga porque a jornada já foi iniciada.'
                        });
                }


                let novoTitular =
                    null;


                if (
                    reservas.length >
                    0
                ) {
                    novoTitular =
                        reservas.shift();
                }


                if (novoTitular) {
                    const novoEmail =
                        normalizarEmail(
                            typeof novoTitular ===
                            'string'
                                ?
                                novoTitular
                                :
                                novoTitular.email ||
                                novoTitular.prestadorEmail ||
                                novoTitular.prestador_email
                        );


                    const novoNome =
                        typeof novoTitular ===
                        'string'
                            ?
                            novoTitular
                            :
                            novoTitular.nome ||
                            novoTitular.prestadorNome ||
                            novoTitular.prestador_nome ||
                            novoEmail;


                    const novoPix =
                        typeof novoTitular ===
                        'string'
                            ?
                            ''
                            :
                            novoTitular.pix ||
                            novoTitular.prestadorPix ||
                            novoTitular.prestador_pix ||
                            '';


                    const novoWhatsapp =
                        typeof novoTitular ===
                        'string'
                            ?
                            ''
                            :
                            novoTitular.whatsapp ||
                            novoTitular.prestadorWhatsapp ||
                            novoTitular.prestador_whatsapp ||
                            '';


                    await pool.query(
                        `
                        UPDATE servicos
                        SET
                            prestador_email =
                                $1,

                            prestador_nome =
                                $2,

                            prestador_pix =
                                $3,

                            prestador_whatsapp =
                                $4,

                            prestador_id = (
                                SELECT id
                                FROM usuarios

                                WHERE
                                    LOWER(email)
                                    =
                                    LOWER($1)

                                LIMIT 1
                            ),

                            reservas =
                                $5::jsonb,

                            status =
                                'aguardando_confirmacao',

                            presenca_confirmada =
                                FALSE,

                            presenca_hora =
                                NULL,

                            presenca_latitude =
                                NULL,

                            presenca_longitude =
                                NULL,

                            presenca_precisao =
                                NULL,

                            selfie_confirmacao =
                                NULL,

                            status_checkin =
                                'pendente',

                            checkin_hora =
                                NULL,

                            checkin_foto =
                                NULL,

                            checkin_latitude =
                                NULL,

                            checkin_longitude =
                                NULL,

                            intervalo_inicio =
                                NULL,

                            intervalo_fim =
                                NULL,

                            intervalo_retorno =
                                NULL,

                            em_intervalo =
                                FALSE,

                            checkout_hora =
                                NULL,

                            checkout_foto =
                                NULL,

                            checkout_latitude =
                                NULL,

                            checkout_longitude =
                                NULL

                        WHERE id = $6
                        `,
                        [
                            novoEmail,
                            novoNome,
                            novoPix,
                            novoWhatsapp,
                            JSON.stringify(
                                reservas
                            ),
                            servicoId
                        ]
                    );


                    await registrarAuditoria(
                        email,
                        'SAIR_VAGA_TITULAR',
                        `Titular saiu do serviço #${servicoId}. Reserva promovida automaticamente.`
                    );


                    await registrarAuditoria(
                        novoEmail,
                        'PROMOVIDO_TITULAR',
                        `Reserva promovida para Titular do serviço #${servicoId}.`
                    );

                } else {
                    await pool.query(
                        `
                        UPDATE servicos
                        SET
                            prestador_email =
                                NULL,

                            prestador_nome =
                                NULL,

                            prestador_pix =
                                NULL,

                            prestador_whatsapp =
                                NULL,

                            prestador_id =
                                NULL,

                            reservas =
                                '[]'::jsonb,

                            status =
                                'ativo',

                            presenca_confirmada =
                                FALSE,

                            presenca_hora =
                                NULL,

                            presenca_latitude =
                                NULL,

                            presenca_longitude =
                                NULL,

                            presenca_precisao =
                                NULL,

                            selfie_confirmacao =
                                NULL,

                            status_checkin =
                                'pendente',

                            checkin_hora =
                                NULL,

                            checkin_foto =
                                NULL,

                            checkin_latitude =
                                NULL,

                            checkin_longitude =
                                NULL,

                            intervalo_inicio =
                                NULL,

                            intervalo_fim =
                                NULL,

                            intervalo_retorno =
                                NULL,

                            em_intervalo =
                                FALSE,

                            checkout_hora =
                                NULL,

                            checkout_foto =
                                NULL,

                            checkout_latitude =
                                NULL,

                            checkout_longitude =
                                NULL

                        WHERE id = $1
                        `,
                        [
                            servicoId
                        ]
                    );


                    await registrarAuditoria(
                        email,
                        'SAIR_VAGA_TITULAR',
                        `Titular saiu do serviço #${servicoId}. A vaga voltou ao Radar.`
                    );
                }


                emitirAtualizacao(
                    servicoId
                );


                return res.json({
                    sucesso: true,

                    mensagem:
                        novoTitular
                            ?
                            'Você saiu da vaga. A primeira reserva virou Titular.'
                            :
                            'Você saiu da vaga. A vaga voltou ao Radar.'
                });
            }


            // =================================================
            // RESERVA SAINDO
            // =================================================

            reservas.splice(
                indiceReserva,
                1
            );


            await pool.query(
                `
                UPDATE servicos
                SET
                    reservas =
                        $1::jsonb

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
                email,
                'SAIR_RESERVA',
                `Prestador saiu da reserva do serviço #${servicoId}.`
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Você saiu da reserva.'
            });

        } catch (err) {
            console.error(
                'Erro ao sair da vaga:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao sair da vaga: ' +
                        err.message
                });
        }
    }
);


// ============================================================
// CONFIRMAR PRESENÇA
// ============================================================

async function confirmarPresencaRS(
    req,
    res
) {
    const servicoId =
        Number(
            req.params.id
        );


    const email =
        normalizarEmail(
            req.body?.email ||
            req.body?.prestadorEmail ||
            req.body?.prestador_email
        );


    try {
        const servico =
            await buscarServico(
                servicoId
            );


        if (!servico) {
            return res
                .status(404)
                .json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
        }


        if (
            !prestadorEhTitular(
                servico,
                email
            )
        ) {
            return res
                .status(403)
                .json({
                    sucesso: false,
                    erro:
                        'Somente o Titular pode confirmar presença.'
                });
        }


        if (
            servico.checkout_hora
        ) {
            return res
                .status(409)
                .json({
                    sucesso: false,
                    erro:
                        'Este serviço já foi finalizado.'
                });
        }


        if (
            servico.presenca_confirmada
        ) {
            return res.json({
                sucesso: true,
                mensagem:
                    'Presença já confirmada.',
                servico
            });
        }


        const latitude =
            req.body?.latitude ??
            req.body?.lat ??
            '';


        const longitude =
            req.body?.longitude ??
            req.body?.lng ??
            '';


        const precisao =
            req.body?.precisao ??
            req.body?.accuracy ??
            '';


        const selfie =
            req.body?.selfie ||
            req.body?.foto ||
            req.body?.imagem ||
            '';


        if (!selfie) {
            return res
                .status(400)
                .json({
                    sucesso: false,
                    erro:
                        'É obrigatório tirar uma foto para confirmar presença.'
                });
        }


        if (
            latitude === '' ||
            longitude === ''
        ) {
            return res
                .status(400)
                .json({
                    sucesso: false,
                    erro:
                        'A localização GPS é obrigatória.'
                });
        }


        const hora =
            horaAtualRS();


        const result =
            await pool.query(
                `
                UPDATE servicos

                SET
                    presenca_confirmada =
                        TRUE,

                    presenca_hora =
                        COALESCE(
                            presenca_hora,
                            $1
                        ),

                    presenca_latitude =
                        $2,

                    presenca_longitude =
                        $3,

                    presenca_precisao =
                        $4,

                    selfie_confirmacao =
                        $5,

                    status =
                        CASE

                            WHEN status IN (
                                'ativo',
                                'aguardando_confirmacao'
                            )
                            THEN
                                'confirmado'

                            ELSE
                                status

                        END

                WHERE id = $6

                RETURNING *
                `,
                [
                    hora,
                    String(
                        latitude
                    ),
                    String(
                        longitude
                    ),
                    String(
                        precisao ||
                        ''
                    ),
                    selfie,
                    servicoId
                ]
            );


        await registrarAuditoria(
            email,
            'CONFIRMAR_PRESENCA',
            `Presença confirmada no serviço #${servicoId} às ${hora}.`
        );


        emitirAtualizacao(
            servicoId
        );


        return res.json({
            sucesso: true,
            mensagem:
                'Presença confirmada.',
            servico:
                result.rows[0]
        });

    } catch (err) {
        console.error(
            'Erro ao confirmar presença:',
            err
        );


        return res
            .status(500)
            .json({
                sucesso: false,
                erro:
                    'Não foi possível confirmar presença: ' +
                    err.message
            });
    }
}


// Rotas antigas e novas
app.post(
    '/api/servicos/:id/confirmar-presenca',
    confirmarPresencaRS
);

app.post(
    '/api/servicos/:id/presenca',
    confirmarPresencaRS
);


// ============================================================
// CHECK-IN
// ============================================================

app.post(
    '/api/servicos/:id/checkin',

    async (req, res) => {
        const servicoId =
            Number(
                req.params.id
            );


        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.prestadorEmail ||
                req.body?.prestador_email
            );


        try {
            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente o Titular pode registrar a entrada.'
                    });
            }


            if (
                servico.checkout_hora
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'CHECK-OUT FINALIZADO. Esta jornada já foi encerrada.'
                    });
            }


            if (
                !servico.presenca_confirmada
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Confirme sua presença antes do check-in.'
                    });
            }


            if (
                servico.checkin_hora
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            `CHECK-IN FINALIZADO às ${servico.checkin_hora}.`
                    });
            }


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                req.body?.imagem ||
                '';


            const latitude =
                req.body?.latitude ??
                req.body?.lat ??
                '';


            const longitude =
                req.body?.longitude ??
                req.body?.lng ??
                '';


            if (!foto) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'É obrigatório tirar a foto de entrada.'
                    });
            }


            if (
                latitude === '' ||
                longitude === ''
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A localização é obrigatória para registrar a entrada.'
                    });
            }


            const hora =
                horaAtualRS();


            const result =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        checkin_hora =
                            $1,

                        checkin_foto =
                            $2,

                        checkin_latitude =
                            $3,

                        checkin_longitude =
                            $4,

                        status_checkin =
                            'realizado',

                        status =
                            'em_andamento',

                        em_intervalo =
                            FALSE

                    WHERE id = $5

                    RETURNING *
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
                email,
                'CHECKIN',
                `Entrada registrada no serviço #${servicoId} às ${hora}.`
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Entrada registrada com sucesso.',
                hora,
                servico:
                    result.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro no check-in:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Não foi possível fazer o check-in: ' +
                        err.message
                });
        }
    }
);


// ============================================================
// INICIAR INTERVALO
// ============================================================

async function iniciarIntervaloRS(
    req,
    res
) {
    const servicoId =
        Number(
            req.params.id
        );


    const email =
        normalizarEmail(
            req.body?.email ||
            req.body?.prestadorEmail ||
            req.body?.prestador_email
        );


    try {
        const servico =
            await buscarServico(
                servicoId
            );


        if (!servico) {
            return res
                .status(404)
                .json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
        }


        if (
            !prestadorEhTitular(
                servico,
                email
            )
        ) {
            return res
                .status(403)
                .json({
                    sucesso: false,
                    erro:
                        'Somente o Titular pode iniciar o intervalo.'
                });
        }


        if (
            !servico.checkin_hora
        ) {
            return res
                .status(409)
                .json({
                    sucesso: false,
                    erro:
                        'Registre a entrada antes de iniciar o intervalo.'
                });
        }


        if (
            servico.checkout_hora
        ) {
            return res
                .status(409)
                .json({
                    sucesso: false,
                    erro:
                        'Esta jornada já foi finalizada.'
                });
        }


        if (
            servico.em_intervalo
        ) {
            return res
                .status(409)
                .json({
                    sucesso: false,
                    erro:
                        'O intervalo já está em andamento.'
                });
        }


        if (
            servico.intervalo_inicio
        ) {
            return res
                .status(409)
                .json({
                    sucesso: false,
                    erro:
                        'O intervalo desta jornada já foi utilizado.'
                });
        }


        const hora =
            horaAtualRS();


        const result =
            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_inicio =
                        $1,

                    intervalo_fim =
                        NULL,

                    intervalo_retorno =
                        NULL,

                    em_intervalo =
                        TRUE,

                    status =
                        'em_intervalo'

                WHERE id = $2

                RETURNING *
                `,
                [
                    hora,
                    servicoId
                ]
            );


        await registrarAuditoria(
            email,
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
            hora,
            servico:
                result.rows[0]
        });

    } catch (err) {
        console.error(
            'Erro ao iniciar intervalo:',
            err
        );


        return res
            .status(500)
            .json({
                sucesso: false,
                erro:
                    'Não foi possível iniciar o intervalo: ' +
                    err.message
            });
    }
}


app.post(
    '/api/servicos/:id/intervalo/iniciar',
    iniciarIntervaloRS
);

app.post(
    '/api/servicos/:id/iniciar-intervalo',
    iniciarIntervaloRS
);


// ============================================================
// VOLTAR DO INTERVALO
// ============================================================

async function voltarIntervaloRS(
    req,
    res
) {
    const servicoId =
        Number(
            req.params.id
        );


    const email =
        normalizarEmail(
            req.body?.email ||
            req.body?.prestadorEmail ||
            req.body?.prestador_email
        );


    try {
        const servico =
            await buscarServico(
                servicoId
            );


        if (!servico) {
            return res
                .status(404)
                .json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
        }


        if (
            !prestadorEhTitular(
                servico,
                email
            )
        ) {
            return res
                .status(403)
                .json({
                    sucesso: false,
                    erro:
                        'Somente o Titular pode retornar do intervalo.'
                });
        }


        if (
            !servico.intervalo_inicio
        ) {
            return res
                .status(409)
                .json({
                    sucesso: false,
                    erro:
                        'O intervalo ainda não foi iniciado.'
                });
        }


        if (
            !servico.em_intervalo
        ) {
            return res
                .status(409)
                .json({
                    sucesso: false,
                    erro:
                        'O retorno do intervalo já foi registrado.'
                });
        }


        if (
            servico.checkout_hora
        ) {
            return res
                .status(409)
                .json({
                    sucesso: false,
                    erro:
                        'Esta jornada já foi finalizada.'
                });
        }


        const hora =
            horaAtualRS();


        const result =
            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_fim =
                        $1,

                    intervalo_retorno =
                        $1,

                    em_intervalo =
                        FALSE,

                    status =
                        'em_andamento'

                WHERE id = $2

                RETURNING *
                `,
                [
                    hora,
                    servicoId
                ]
            );


        await registrarAuditoria(
            email,
            'VOLTAR_INTERVALO',
            `Retorno do intervalo no serviço #${servicoId} às ${hora}.`
        );


        emitirAtualizacao(
            servicoId
        );


        return res.json({
            sucesso: true,
            mensagem:
                'Retorno do intervalo registrado.',
            hora,
            servico:
                result.rows[0]
        });

    } catch (err) {
        console.error(
            'Erro ao voltar do intervalo:',
            err
        );


        return res
            .status(500)
            .json({
                sucesso: false,
                erro:
                    'Não foi possível registrar o retorno: ' +
                    err.message
            });
    }
}


app.post(
    '/api/servicos/:id/intervalo/voltar',
    voltarIntervaloRS
);

app.post(
    '/api/servicos/:id/voltar-intervalo',
    voltarIntervaloRS
);


// ============================================================
// CÁLCULO DE TEMPO
// ============================================================

function horarioParaSegundos(
    horario
) {
    if (!horario) {
        return null;
    }


    const partes =
        String(
            horario
        )
            .split(':')
            .map(Number);


    if (
        partes.length <
        2
    ) {
        return null;
    }


    const horas =
        partes[0] ||
        0;


    const minutos =
        partes[1] ||
        0;


    const segundos =
        partes[2] ||
        0;


    return (
        horas * 3600
        +
        minutos * 60
        +
        segundos
    );
}


function calcularTempoTrabalhado(
    servico,
    checkoutHora
) {
    const entrada =
        horarioParaSegundos(
            servico.checkin_hora
        );


    const saida =
        horarioParaSegundos(
            checkoutHora ||
            servico.checkout_hora
        );


    if (
        entrada === null ||
        saida === null
    ) {
        return {
            segundos: 0,
            minutos: 0,
            horasDecimal: 0,
            texto:
                '0h 00min'
        };
    }


    let total =
        saida -
        entrada;


    if (
        total <
        0
    ) {
        total +=
            24 * 3600;
    }


    const inicioIntervalo =
        horarioParaSegundos(
            servico.intervalo_inicio
        );


    const fimIntervalo =
        horarioParaSegundos(
            servico.intervalo_fim ||
            servico.intervalo_retorno
        );


    if (
        inicioIntervalo !== null &&
        fimIntervalo !== null
    ) {
        let duracaoIntervalo =
            fimIntervalo -
            inicioIntervalo;


        if (
            duracaoIntervalo <
            0
        ) {
            duracaoIntervalo +=
                24 * 3600;
        }


        total -=
            duracaoIntervalo;
    }


    total =
        Math.max(
            0,
            total
        );


    const horas =
        Math.floor(
            total /
            3600
        );


    const minutos =
        Math.floor(
            (
                total %
                3600
            )
            /
            60
        );


    return {
        segundos:
            total,

        minutos:
            Math.floor(
                total /
                60
            ),

        horasDecimal:
            Number(
                (
                    total /
                    3600
                )
                    .toFixed(2)
            ),

        texto:
            `${horas}h ${
                String(
                    minutos
                )
                    .padStart(
                        2,
                        '0'
                    )
            }min`
    };
}


// ============================================================
// CHECK-OUT
// ============================================================

app.post(
    '/api/servicos/:id/checkout',

    async (req, res) => {
        const servicoId =
            Number(
                req.params.id
            );


        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.prestadorEmail ||
                req.body?.prestador_email
            );


        try {
            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente o Titular pode registrar a saída.'
                    });
            }


            if (
                !servico.checkin_hora
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Não é possível registrar saída sem check-in.'
                    });
            }


            if (
                servico.checkout_hora
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            `CHECK-OUT FINALIZADO às ${servico.checkout_hora}.`
                    });
            }


            if (
                servico.em_intervalo
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Registre o retorno do intervalo antes do check-out.'
                    });
            }


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                req.body?.imagem ||
                '';


            const latitude =
                req.body?.latitude ??
                req.body?.lat ??
                '';


            const longitude =
                req.body?.longitude ??
                req.body?.lng ??
                '';


            if (!foto) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'É obrigatório tirar a foto de saída.'
                    });
            }


            if (
                latitude === '' ||
                longitude === ''
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A localização é obrigatória para registrar a saída.'
                    });
            }


            const hora =
                horaAtualRS();


            const tempo =
                calcularTempoTrabalhado(
                    servico,
                    hora
                );


            const valorServico =
                numeroRS(
                    servico.valor_liquido ||
                    servico.valor_diaria ||
                    servico.valor
                );


            const result =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        checkout_hora =
                            $1,

                        checkout_foto =
                            $2,

                        checkout_latitude =
                            $3,

                        checkout_longitude =
                            $4,

                        status_checkin =
                            'finalizado',

                        status =
                            'finalizado',

                        em_intervalo =
                            FALSE

                    WHERE id = $5

                    RETURNING *
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


            await registrarLedger(
                servicoId,
                email,
                'SERVICO_FINALIZADO',
                valorServico
            );


            await registrarAuditoria(
                email,
                'CHECKOUT',
                `Saída registrada no serviço #${servicoId}. Total: ${tempo.texto}.`
            );


            emitirAtualizacao(
                servicoId
            );


            io.emit(
                'servico_finalizado',
                {
                    servicoId,
                    prestadorEmail:
                        email,
                    checkoutHora:
                        hora,
                    totalTrabalhado:
                        tempo.texto,
                    valor:
                        valorServico
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Serviço finalizado com sucesso.',

                hora,

                totalTrabalhado:
                    tempo.texto,

                minutosTrabalhados:
                    tempo.minutos,

                horasTrabalhadas:
                    tempo.horasDecimal,

                valor:
                    valorServico,

                servico:
                    result.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro no check-out:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Não foi possível fazer o check-out: ' +
                        err.message
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


        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.empresaEmail ||
                req.body?.empresa_email
            );


        try {
            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                servico.empresa_email &&
                !empresaEhResponsavel(
                    servico,
                    email
                )
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente a empresa responsável pode validar este serviço.'
                    });
            }


            if (
                !servico.checkout_hora
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'O prestador ainda não realizou o check-out.'
                    });
            }


            const result =
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

                    WHERE id = $1

                    RETURNING *
                    `,
                    [
                        servicoId
                    ]
                );


            await registrarAuditoria(
                email,
                'VALIDAR_SERVICO',
                `Empresa validou o serviço #${servicoId}.`
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Serviço validado pela empresa.',
                servico:
                    result.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro ao validar serviço:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao validar serviço: ' +
                        err.message
                });
        }
    }
);


// ============================================================
// FIM DA PARTE 2
// A PARTE 3 DEVE SER COLADA IMEDIATAMENTE ABAIXO
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// PARTE 3 DE 4
// PAGAMENTOS + DOCUMENTOS + CONTRATOS + HISTÓRICO + CHAT
// ============================================================


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

        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.empresaEmail ||
                req.body?.empresa_email
            );

        try {
            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }

            if (
                servico.empresa_email &&
                !empresaEhResponsavel(
                    servico,
                    email
                )
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente a empresa responsável pode autorizar o pagamento.'
                    });
            }

            if (
                !servico.checkout_hora
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'O serviço precisa estar finalizado antes do pagamento.'
                    });
            }

            if (
                servico.pagamento_autorizado
            ) {
                return res.json({
                    sucesso: true,
                    mensagem:
                        'Pagamento já autorizado.',
                    servico
                });
            }

            const valor =
                numeroRS(
                    servico.valor_liquido ||
                    servico.valor_diaria ||
                    servico.valor
                );

            const result =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        pagamento_autorizado =
                            TRUE,

                        pagamento_autorizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $1

                    RETURNING *
                    `,
                    [
                        servicoId
                    ]
                );

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
                    $1,$2,$3,$4,$5,
                    'AUTORIZADO',
                    CURRENT_TIMESTAMP
                )
                `,
                [
                    servicoId,
                    servico.empresa_email ||
                    email,
                    servico.prestador_email,
                    valor,
                    servico.forma_pgto ||
                    'Pix'
                ]
            );

            await registrarLedger(
                servicoId,
                email,
                'PAGAMENTO_AUTORIZADO',
                valor
            );

            await registrarAuditoria(
                email,
                'AUTORIZAR_PAGAMENTO',
                `Pagamento do serviço #${servicoId} autorizado.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Pagamento autorizado.',
                valor,
                servico:
                    result.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro ao autorizar pagamento:',
                err
            );

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao autorizar pagamento: ' +
                        err.message
                });
        }
    }
);


// ============================================================
// REGISTRAR PAGAMENTO
// ============================================================

app.post(
    '/api/servicos/:id/pagamento',

    async (req, res) => {
        const servicoId =
            Number(
                req.params.id
            );

        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.empresaEmail ||
                req.body?.empresa_email
            );

        try {
            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }

            const valor =
                numeroRS(
                    req.body?.valor ||
                    servico.valor_liquido ||
                    servico.valor_diaria ||
                    servico.valor
                );

            const comprovante =
                String(
                    req.body?.comprovante ||
                    req.body?.arquivo ||
                    ''
                );

            const formaPagamento =
                req.body?.formaPagamento ||
                req.body?.forma_pagamento ||
                servico.forma_pgto ||
                'Pix';

            const result =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        pagamento_realizado =
                            TRUE,

                        pagamento_realizado_em =
                            CURRENT_TIMESTAMP,

                        comprovante_pagamento =
                            CASE
                                WHEN $1 <> ''
                                THEN TRUE
                                ELSE comprovante_pagamento
                            END,

                        comprovante_pagamento_arquivo =
                            CASE
                                WHEN $1 <> ''
                                THEN $1
                                ELSE comprovante_pagamento_arquivo
                            END,

                        status =
                            'pago'

                    WHERE id = $2

                    RETURNING *
                    `,
                    [
                        comprovante,
                        servicoId
                    ]
                );

            await pool.query(
                `
                INSERT INTO pagamentos (
                    servico_id,
                    empresa_email,
                    prestador_email,
                    valor,
                    forma_pagamento,
                    status,
                    comprovante,
                    pago_em
                )

                VALUES (
                    $1,$2,$3,$4,$5,
                    'PAGO',
                    $6,
                    CURRENT_TIMESTAMP
                )
                `,
                [
                    servicoId,
                    servico.empresa_email ||
                    email,
                    servico.prestador_email,
                    valor,
                    formaPagamento,
                    comprovante
                ]
            );

            await registrarLedger(
                servicoId,
                email,
                'PAGAMENTO_REALIZADO',
                valor
            );

            await registrarAuditoria(
                email,
                'REGISTRAR_PAGAMENTO',
                `Pagamento do serviço #${servicoId} registrado.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Pagamento registrado com sucesso.',
                valor,
                servico:
                    result.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro ao registrar pagamento:',
                err
            );

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao registrar pagamento: ' +
                        err.message
                });
        }
    }
);


// ============================================================
// COMPROVANTE DE PAGAMENTO
// ============================================================

app.post(
    '/api/servicos/:id/comprovante-pagamento',

    upload.single('arquivo'),

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
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }

            const empresaEmail =
                normalizarEmail(
                    req.body?.empresaEmail ||
                    req.body?.empresa_email ||
                    req.body?.email
                );

            if (
                servico.empresa_email &&
                !empresaEhResponsavel(
                    servico,
                    empresaEmail
                )
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente a empresa pode enviar o comprovante.'
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
                        req.file.buffer
                            .toString(
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
                        req.body?.comprovante ||
                        ''
                    );

                nomeArquivo =
                    String(
                        req.body?.nomeArquivo ||
                        req.body?.nome_arquivo ||
                        nomeArquivo
                    );
            }

            if (!arquivo) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
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
                        'pago'

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
                    $1,$2,$3,
                    'COMPROVANTE',
                    $4,$5
                )
                `,
                [
                    servicoId,
                    servico.empresa_email ||
                    empresaEmail,
                    servico.prestador_email,
                    nomeArquivo,
                    arquivo
                ]
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
                    'Comprovante registrado com sucesso.'
            });

        } catch (err) {
            console.error(
                'Erro no comprovante:',
                err
            );

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao registrar comprovante.'
                });
        }
    }
);


// ============================================================
// PAGAMENTOS DO PRESTADOR
// ============================================================

app.get(
    '/api/prestador/:email/pagamentos',

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

            const pagamentos =
                resultado.rows;

            const totalPago =
                pagamentos
                    .filter(
                        item =>
                            String(
                                item.status ||
                                ''
                            )
                                .toUpperCase()
                            ===
                            'PAGO'
                    )
                    .reduce(
                        (
                            total,
                            item
                        ) =>
                            total +
                            numeroRS(
                                item.valor
                            ),
                        0
                    );

            const totalPendente =
                pagamentos
                    .filter(
                        item =>
                            String(
                                item.status ||
                                ''
                            )
                                .toUpperCase()
                            !==
                            'PAGO'
                    )
                    .reduce(
                        (
                            total,
                            item
                        ) =>
                            total +
                            numeroRS(
                                item.valor
                            ),
                        0
                    );

            return res.json({
                sucesso: true,
                pagamentos,

                resumo: {
                    totalPago,
                    totalPendente
                }
            });

        } catch (err) {
            console.error(
                'Erro pagamentos prestador:',
                err
            );

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar pagamentos.'
                });
        }
    }
);


// Compatibilidade
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
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar pagamentos.'
                });
        }
    }
);


// ============================================================
// DOCUMENTOS DO SERVIÇO
// ============================================================

app.post(
    '/api/servicos/:id/documentos',

    upload.single('arquivo'),

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
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }

            let arquivo =
                '';

            let nome =
                '';

            const categoria =
                String(
                    req.body?.categoria ||
                    'DOCUMENTO'
                )
                    .toUpperCase();

            if (
                req.file
            ) {
                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;

                nome =
                    req.file.originalname ||
                    'documento';

            } else {
                arquivo =
                    String(
                        req.body?.arquivo ||
                        ''
                    );

                nome =
                    String(
                        req.body?.nome ||
                        'documento'
                    );
            }

            if (!arquivo) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Selecione um documento.'
                    });
            }

            const resultado =
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
                        $1,$2,$3,$4,$5,$6
                    )

                    RETURNING *
                    `,
                    [
                        servicoId,
                        servico.empresa_email,
                        servico.prestador_email,
                        categoria,
                        nome,
                        arquivo
                    ]
                );

            await registrarAuditoria(
                normalizarEmail(
                    req.body?.email
                )
                ||
                servico.empresa_email
                ||
                'sistema',

                'DOCUMENTO_SERVICO',

                `Documento ${nome} vinculado ao serviço #${servicoId}.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Documento arquivado.',
                documento:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro documento serviço:',
                err
            );

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao arquivar documento.'
                });
        }
    }
);


app.get(
    '/api/servicos/:id/documentos',

    async (req, res) => {
        try {
            const servicoId =
                Number(
                    req.params.id
                );

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM documentos_rs

                    WHERE
                        servico_id = $1

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        servicoId
                    ]
                );

            return res.json({
                sucesso: true,
                documentos:
                    resultado.rows
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar documentos.'
                });
        }
    }
);


// ============================================================
// CONTRATO ASSINADO
// ============================================================

app.post(
    '/api/servicos/:id/contrato-assinado',

    upload.single('arquivo'),

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
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }

            let arquivo =
                '';

            if (
                req.file
            ) {
                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;

            } else {
                arquivo =
                    String(
                        req.body?.arquivo ||
                        ''
                    );
            }

            if (!arquivo) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Envie o contrato assinado.'
                    });
            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    contrato_assinado =
                        $1,

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
                    $1,$2,$3,
                    'CONTRATO_ASSINADO',
                    'Contrato assinado',
                    $4
                )
                `,
                [
                    servicoId,
                    servico.empresa_email,
                    servico.prestador_email,
                    arquivo
                ]
            );

            await registrarAuditoria(
                servico.prestador_email ||
                'sistema',
                'CONTRATO_ASSINADO',
                `Contrato do serviço #${servicoId} arquivado.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Contrato assinado arquivado com sucesso.'
            });

        } catch (err) {
            console.error(
                'Erro contrato assinado:',
                err
            );

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao arquivar contrato assinado.'
                });
        }
    }
);


// ============================================================
// NOTA FISCAL
// ============================================================

app.post(
    '/api/servicos/:id/nota-oficial',

    upload.single('notaFiscal'),

    async (req, res) => {
        const servicoId =
            Number(
                req.params.id
            );

        try {
            let arquivo =
                '';

            if (
                req.file
            ) {
                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;

            } else {
                arquivo =
                    String(
                        req.body?.notaFiscal ||
                        req.body?.arquivo ||
                        ''
                    );
            }

            if (!arquivo) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Nenhuma nota fiscal enviada.'
                    });
            }

            await pool.query(
                `
                UPDATE servicos

                SET
                    nota_oficial =
                        $1

                WHERE id = $2
                `,
                [
                    arquivo,
                    servicoId
                ]
            );

            await registrarAuditoria(
                normalizarEmail(
                    req.body?.email
                )
                ||
                'sistema',
                'NOTA_FISCAL',
                `Nota fiscal vinculada ao serviço #${servicoId}.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Nota fiscal enviada com sucesso.'
            });

        } catch (err) {
            console.error(
                'Erro nota fiscal:',
                err
            );

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao enviar nota fiscal.'
                });
        }
    }
);


// ============================================================
// HISTÓRICO DO PRESTADOR
// ============================================================

app.get(
    '/api/prestador/:email/historico',

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
                    FROM servicos

                    WHERE
                        LOWER(
                            prestador_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        id DESC
                    `,
                    [
                        email
                    ]
                );

            return res.json({
                sucesso: true,
                servicos:
                    resultado.rows
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar histórico.'
                });
        }
    }
);


// ============================================================
// SERVIÇO INDIVIDUAL
// ============================================================

app.get(
    '/api/servicos/:id',

    async (req, res) => {
        try {
            const servico =
                await buscarServico(
                    Number(
                        req.params.id
                    )
                );

            if (!servico) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }

            return res.json({
                sucesso: true,
                servico
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao buscar serviço.'
                });
        }
    }
);


// ============================================================
// CANCELAR SERVIÇO
// ============================================================

app.patch(
    '/api/servicos/:id/cancelar',

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
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }

            const empresaEmail =
                normalizarEmail(
                    req.body?.empresa_email ||
                    req.body?.empresaEmail ||
                    req.body?.email
                );

            if (
                servico.empresa_email &&
                !empresaEhResponsavel(
                    servico,
                    empresaEmail
                )
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente a empresa responsável pode cancelar o serviço.'
                    });
            }

            if (
                servico.checkout_hora
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Não é possível cancelar um serviço já finalizado.'
                    });
            }

            const motivo =
                String(
                    req.body?.motivo ||
                    'Cancelado pela empresa'
                );

            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        status =
                            'cancelado',

                        motivo_cancelamento =
                            $1

                    WHERE id = $2

                    RETURNING *
                    `,
                    [
                        motivo,
                        servicoId
                    ]
                );

            await registrarAuditoria(
                empresaEmail,
                'CANCELAR_SERVICO',
                `Serviço #${servicoId} cancelado. Motivo: ${motivo}`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Serviço cancelado.',
                servico:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro ao cancelar serviço:',
                err
            );

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao cancelar serviço.'
                });
        }
    }
);


// ============================================================
// CHAT — GARANTIR CONVERSA
// ============================================================

async function garantirConversaServico(
    servico
) {
    if (
        !servico ||
        !servico.id ||
        !servico.empresa_email ||
        !servico.prestador_email
    ) {
        return null;
    }

    const empresaEmail =
        normalizarEmail(
            servico.empresa_email
        );

    const prestadorEmail =
        normalizarEmail(
            servico.prestador_email
        );

    const existente =
        await pool.query(
            `
            SELECT *
            FROM conversas

            WHERE
                servico_id = $1

            AND
                LOWER(
                    empresa_email
                )
                =
                LOWER($2)

            AND
                LOWER(
                    prestador_email
                )
                =
                LOWER($3)

            LIMIT 1
            `,
            [
                servico.id,
                empresaEmail,
                prestadorEmail
            ]
        );

    if (
        existente.rows.length
    ) {
        return existente.rows[0];
    }

    const criada =
        await pool.query(
            `
            INSERT INTO conversas (
                servico_id,
                empresa_email,
                prestador_email,
                ativo
            )

            VALUES (
                $1,$2,$3,TRUE
            )

            ON CONFLICT (
                servico_id,
                empresa_email,
                prestador_email
            )

            DO UPDATE SET
                ativo =
                    TRUE,

                atualizado_em =
                    CURRENT_TIMESTAMP

            RETURNING *
            `,
            [
                servico.id,
                empresaEmail,
                prestadorEmail
            ]
        );

    return criada.rows[0];
}


// ============================================================
// ABRIR CONVERSA
// ============================================================

app.get(
    '/api/servicos/:id/conversa',

    async (req, res) => {
        try {
            const servicoId =
                Number(
                    req.params.id
                );

            const email =
                normalizarEmail(
                    req.query?.email
                );

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }

            if (
                !servico.prestador_email
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Este serviço ainda não possui Titular.'
                    });
            }

            const autorizado =
                normalizarEmail(
                    servico.empresa_email
                )
                ===
                email
                ||
                normalizarEmail(
                    servico.prestador_email
                )
                ===
                email;

            if (
                email &&
                !autorizado
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Você não participa desta conversa.'
                    });
            }

            const conversa =
                await garantirConversaServico(
                    servico
                );

            return res.json({
                sucesso: true,

                conversa: {
                    ...conversa,

                    empresa_nome:
                        servico.empresa_nome,

                    prestador_nome:
                        servico.prestador_nome,

                    servico_titulo:
                        servico.titulo ||
                        servico.categoria
                }
            });

        } catch (err) {
            console.error(
                'Erro ao abrir conversa:',
                err
            );

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao abrir conversa.'
                });
        }
    }
);


// ============================================================
// LISTAR CONVERSAS
// ============================================================

app.get(
    '/api/chat/conversas/:email',

    async (req, res) => {
        try {
            const email =
                normalizarEmail(
                    req.params.email
                );

            const resultado =
                await pool.query(
                    `
                    SELECT
                        c.*,

                        s.titulo
                            AS servico_titulo,

                        s.empresa_nome,

                        s.prestador_nome,

                        (
                            SELECT
                                m.mensagem

                            FROM
                                mensagens_chat m

                            WHERE
                                m.conversa_id =
                                c.id

                            ORDER BY
                                m.criado_em DESC,
                                m.id DESC

                            LIMIT 1
                        )
                        AS ultima_mensagem,

                        (
                            SELECT
                                COUNT(*)::int

                            FROM
                                mensagens_chat m

                            WHERE
                                m.conversa_id =
                                c.id

                            AND
                                LOWER(
                                    m.destinatario_email
                                )
                                =
                                LOWER($1)

                            AND
                                m.lida =
                                FALSE
                        )
                        AS nao_lidas

                    FROM
                        conversas c

                    LEFT JOIN
                        servicos s

                    ON
                        s.id =
                        c.servico_id

                    WHERE
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

                    ORDER BY
                        c.atualizado_em DESC,
                        c.id DESC
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

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar conversas.'
                });
        }
    }
);


// ============================================================
// MENSAGENS DA CONVERSA
// ============================================================

app.get(
    '/api/chat/conversas/:id/mensagens',

    async (req, res) => {
        try {
            const conversaId =
                Number(
                    req.params.id
                );

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM mensagens_chat

                    WHERE
                        conversa_id = $1

                    ORDER BY
                        criado_em ASC,
                        id ASC
                    `,
                    [
                        conversaId
                    ]
                );

            return res.json({
                sucesso: true,
                mensagens:
                    resultado.rows
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar mensagens.'
                });
        }
    }
);


// ============================================================
// ENVIAR MENSAGEM
// ============================================================

app.post(
    '/api/chat/conversas/:id/mensagens',

    async (req, res) => {
        try {
            const conversaId =
                Number(
                    req.params.id
                );

            const remetente =
                normalizarEmail(
                    req.body?.remetente_email ||
                    req.body?.email
                );

            const mensagem =
                String(
                    req.body?.mensagem ||
                    ''
                )
                    .trim();

            if (
                !remetente ||
                !mensagem
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Remetente e mensagem são obrigatórios.'
                    });
            }

            const conversaRes =
                await pool.query(
                    `
                    SELECT *
                    FROM conversas
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [
                        conversaId
                    ]
                );

            const conversa =
                conversaRes.rows[0];

            if (!conversa) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Conversa não encontrada.'
                    });
            }

            const empresaEmail =
                normalizarEmail(
                    conversa.empresa_email
                );

            const prestadorEmail =
                normalizarEmail(
                    conversa.prestador_email
                );

            if (
                remetente !==
                empresaEmail
                &&
                remetente !==
                prestadorEmail
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Você não participa desta conversa.'
                    });
            }

            const destinatario =
                remetente ===
                empresaEmail
                    ?
                    prestadorEmail
                    :
                    empresaEmail;

            const resultado =
                await pool.query(
                    `
                    INSERT INTO mensagens_chat (
                        conversa_id,
                        servico_id,
                        remetente_email,
                        destinatario_email,
                        mensagem,
                        tipo,
                        lida
                    )

                    VALUES (
                        $1,$2,$3,$4,$5,
                        'texto',
                        FALSE
                    )

                    RETURNING *
                    `,
                    [
                        conversaId,
                        conversa.servico_id,
                        remetente,
                        destinatario,
                        mensagem
                    ]
                );

            await pool.query(
                `
                UPDATE conversas

                SET
                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [
                    conversaId
                ]
            );

            const novaMensagem =
                resultado.rows[0];

            io.to(
                `conversa_${conversaId}`
            )
                .emit(
                    'nova_mensagem',
                    novaMensagem
                );

            io.to(
                `usuario_${destinatario}`
            )
                .emit(
                    'mensagem_recebida',
                    {
                        conversaId,

                        servicoId:
                            conversa.servico_id
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

            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao enviar mensagem.'
                });
        }
    }
);


// ============================================================
// MARCAR MENSAGENS COMO LIDAS
// ============================================================

app.post(
    '/api/chat/conversas/:id/lida',

    async (req, res) => {
        try {
            const conversaId =
                Number(
                    req.params.id
                );

            const email =
                normalizarEmail(
                    req.body?.email
                );

            await pool.query(
                `
                UPDATE mensagens_chat

                SET
                    lida =
                        TRUE

                WHERE
                    conversa_id = $1

                AND
                    LOWER(
                        destinatario_email
                    )
                    =
                    LOWER($2)
                `,
                [
                    conversaId,
                    email
                ]
            );

            return res.json({
                sucesso: true
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao marcar mensagens como lidas.'
                });
        }
    }
);


// ============================================================
// MENSAGENS NÃO LIDAS
// ============================================================

app.get(
    '/api/chat/nao-lidas/:email',

    async (req, res) => {
        try {
            const email =
                normalizarEmail(
                    req.params.email
                );

            const resultado =
                await pool.query(
                    `
                    SELECT
                        COUNT(*)::int
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
                        lida =
                        FALSE
                    `,
                    [
                        email
                    ]
                );

            return res.json({
                sucesso: true,
                total:
                    Number(
                        resultado
                            .rows[0]
                            ?.total
                        ||
                        0
                    )
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao consultar mensagens.'
                });
        }
    }
);


// ============================================================
// FIM DA PARTE 3
// A PARTE 4 DEVE SER COLADA IMEDIATAMENTE ABAIXO
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// PARTE 4 DE 4
// CLIENTES FIXOS + JORNADA + DOCUMENTOS + SOCKET + RENDER
// ============================================================


// ============================================================
// DATA ATUAL — FUSO BRASIL
// ============================================================

function dataAtualRS() {
    return new Intl.DateTimeFormat(
        'en-CA',
        {
            timeZone:
                'America/Sao_Paulo',

            year:
                'numeric',

            month:
                '2-digit',

            day:
                '2-digit'
        }
    )
        .format(
            new Date()
        );
}


// ============================================================
// TABELAS DA JORNADA DOS CLIENTES FIXOS
// ============================================================

async function criarTabelasJornadaClientes() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes_rs (
                id SERIAL PRIMARY KEY,

                nome TEXT NOT NULL,

                cnpj TEXT,

                responsavel_nome TEXT,

                responsavel_email TEXT,

                responsavel_whatsapp TEXT,

                endereco TEXT,

                cidade TEXT,

                uf TEXT,

                latitude TEXT,

                longitude TEXT,

                ativo BOOLEAN
                    DEFAULT TRUE,

                criado_por TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS clientes_rs_colaboradores (
                id SERIAL PRIMARY KEY,

                cliente_id INTEGER
                    NOT NULL
                    REFERENCES clientes_rs(id)
                    ON DELETE CASCADE,

                colaborador_email TEXT
                    NOT NULL,

                colaborador_nome TEXT
                    NOT NULL,

                funcao TEXT,

                valor_tipo TEXT
                    DEFAULT 'dia',

                valor_base NUMERIC(12,2)
                    DEFAULT 0,

                horario_previsto TEXT,

                ativo BOOLEAN
                    DEFAULT TRUE,

                criado_por TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                UNIQUE (
                    cliente_id,
                    colaborador_email
                )
            );


            CREATE TABLE IF NOT EXISTS jornadas_clientes (
                id SERIAL PRIMARY KEY,

                cliente_id INTEGER
                    NOT NULL
                    REFERENCES clientes_rs(id)
                    ON DELETE CASCADE,

                colaborador_vinculo_id INTEGER
                    REFERENCES clientes_rs_colaboradores(id)
                    ON DELETE SET NULL,

                colaborador_email TEXT
                    NOT NULL,

                colaborador_nome TEXT
                    NOT NULL,

                funcao TEXT,

                data DATE
                    NOT NULL,

                horario_previsto TEXT,

                status TEXT
                    DEFAULT 'AUSENTE',

                entrada_em TIMESTAMPTZ,

                entrada_foto TEXT,

                entrada_latitude TEXT,

                entrada_longitude TEXT,

                entrada_precisao TEXT,

                entrada_validada BOOLEAN
                    DEFAULT FALSE,

                entrada_validada_por TEXT,

                entrada_validada_em TIMESTAMPTZ,

                intervalo_inicio_em TIMESTAMPTZ,

                intervalo_retorno_em TIMESTAMPTZ,

                saida_em TIMESTAMPTZ,

                saida_foto TEXT,

                saida_latitude TEXT,

                saida_longitude TEXT,

                saida_precisao TEXT,

                saida_validada BOOLEAN
                    DEFAULT FALSE,

                saida_validada_por TEXT,

                saida_validada_em TIMESTAMPTZ,

                total_minutos INTEGER
                    DEFAULT 0,

                total_horas NUMERIC(10,2)
                    DEFAULT 0,

                valor_tipo TEXT
                    DEFAULT 'dia',

                valor_base NUMERIC(12,2)
                    DEFAULT 0,

                valor_gerado NUMERIC(12,2)
                    DEFAULT 0,

                fechada BOOLEAN
                    DEFAULT FALSE,

                fechada_por TEXT,

                fechada_em TIMESTAMPTZ,

                observacoes TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                UNIQUE (
                    cliente_id,
                    colaborador_email,
                    data
                )
            );


            CREATE TABLE IF NOT EXISTS jornadas_clientes_documentos (
                id SERIAL PRIMARY KEY,

                jornada_id INTEGER
                    NOT NULL
                    REFERENCES jornadas_clientes(id)
                    ON DELETE CASCADE,

                tipo TEXT
                    DEFAULT 'DOCUMENTO',

                nome TEXT
                    NOT NULL,

                mime TEXT
                    DEFAULT 'application/pdf',

                arquivo BYTEA
                    NOT NULL,

                assinatura_status TEXT
                    DEFAULT 'NAO_ASSINADO',

                assinado_por TEXT,

                assinado_em TIMESTAMPTZ,

                criado_por TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS fechamentos_clientes (
                id SERIAL PRIMARY KEY,

                cliente_id INTEGER
                    NOT NULL
                    REFERENCES clientes_rs(id)
                    ON DELETE CASCADE,

                data DATE
                    NOT NULL,

                confirmado BOOLEAN
                    DEFAULT TRUE,

                confirmado_por TEXT,

                confirmado_em TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP,

                observacoes TEXT,

                UNIQUE (
                    cliente_id,
                    data
                )
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_clientes_rs_nome
            ON clientes_rs(nome);
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_clientes_rs_colaborador
            ON clientes_rs_colaboradores(
                LOWER(colaborador_email)
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_jornada_cliente_data
            ON jornadas_clientes(
                cliente_id,
                data
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_jornada_colaborador_data
            ON jornadas_clientes(
                LOWER(colaborador_email),
                data
            );
        `);


        console.log(
            '✅ Gestão de Jornada dos Clientes verificada.'
        );

    } catch (err) {
        console.error(
            '❌ Erro ao preparar Jornada dos Clientes:',
            err
        );

        throw err;
    }
}


// ============================================================
// GARANTIR JORNADAS DO DIA
// ============================================================

async function garantirJornadasDiaCliente(
    clienteId,
    data = dataAtualRS()
) {
    await pool.query(
        `
        INSERT INTO jornadas_clientes (
            cliente_id,
            colaborador_vinculo_id,
            colaborador_email,
            colaborador_nome,
            funcao,
            data,
            horario_previsto,
            valor_tipo,
            valor_base
        )

        SELECT
            v.cliente_id,
            v.id,
            LOWER(v.colaborador_email),
            v.colaborador_nome,
            v.funcao,
            $2::date,
            v.horario_previsto,
            v.valor_tipo,
            v.valor_base

        FROM
            clientes_rs_colaboradores v

        WHERE
            v.cliente_id = $1

        AND
            v.ativo = TRUE

        ON CONFLICT (
            cliente_id,
            colaborador_email,
            data
        )

        DO UPDATE SET
            colaborador_nome =
                EXCLUDED.colaborador_nome,

            funcao =
                EXCLUDED.funcao,

            horario_previsto =
                EXCLUDED.horario_previsto,

            valor_tipo =
                EXCLUDED.valor_tipo,

            valor_base =
                EXCLUDED.valor_base,

            atualizado_em =
                CURRENT_TIMESTAMP
        `,
        [
            clienteId,
            data
        ]
    );
}


// ============================================================
// BUSCAR JORNADA
// ============================================================

async function buscarJornadaCliente(
    jornadaId
) {
    const resultado =
        await pool.query(
            `
            SELECT
                j.*,

                c.nome
                    AS cliente_nome,

                c.endereco
                    AS cliente_endereco,

                c.cidade
                    AS cliente_cidade,

                c.uf
                    AS cliente_uf,

                c.latitude
                    AS cliente_latitude,

                c.longitude
                    AS cliente_longitude,

                c.responsavel_nome,

                c.responsavel_email

            FROM
                jornadas_clientes j

            JOIN
                clientes_rs c

            ON
                c.id =
                j.cliente_id

            WHERE
                j.id = $1

            LIMIT 1
            `,
            [
                jornadaId
            ]
        );

    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// RECALCULAR HORAS E VALOR
// ============================================================

async function recalcularJornadaCliente(
    jornadaId
) {
    const jornada =
        await buscarJornadaCliente(
            jornadaId
        );

    if (!jornada) {
        return null;
    }


    let totalMinutos =
        0;


    if (
        jornada.entrada_em &&
        jornada.saida_em
    ) {
        totalMinutos =
            Math.max(
                0,

                Math.round(
                    (
                        new Date(
                            jornada.saida_em
                        )
                        -
                        new Date(
                            jornada.entrada_em
                        )
                    )
                    /
                    60000
                )
            );


        if (
            jornada.intervalo_inicio_em &&
            jornada.intervalo_retorno_em
        ) {
            const intervalo =
                Math.max(
                    0,

                    Math.round(
                        (
                            new Date(
                                jornada.intervalo_retorno_em
                            )
                            -
                            new Date(
                                jornada.intervalo_inicio_em
                            )
                        )
                        /
                        60000
                    )
                );


            totalMinutos =
                Math.max(
                    0,
                    totalMinutos -
                    intervalo
                );
        }
    }


    const totalHoras =
        Number(
            (
                totalMinutos /
                60
            )
                .toFixed(2)
        );


    const valorBase =
        numeroRS(
            jornada.valor_base
        );


    let valorGerado =
        0;


    if (
        jornada.saida_em
    ) {
        if (
            String(
                jornada.valor_tipo ||
                ''
            )
                .toLowerCase()
            ===
            'hora'
        ) {
            valorGerado =
                Number(
                    (
                        totalHoras *
                        valorBase
                    )
                        .toFixed(2)
                );

        } else {
            valorGerado =
                valorBase;
        }
    }


    const atualizado =
        await pool.query(
            `
            UPDATE jornadas_clientes

            SET
                total_minutos =
                    $1,

                total_horas =
                    $2,

                valor_gerado =
                    $3,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id = $4

            RETURNING *
            `,
            [
                totalMinutos,
                totalHoras,
                valorGerado,
                jornadaId
            ]
        );


    return atualizado.rows[0];
}


// ============================================================
// LISTAR CLIENTES FIXOS
// ============================================================

app.get(
    '/api/jornada-clientes',

    async (req, res) => {
        try {
            const resultado =
                await pool.query(
                    `
                    SELECT
                        c.*,

                        COUNT(v.id)
                        FILTER (
                            WHERE
                                v.ativo = TRUE
                        )::int
                        AS colaboradores_ativos

                    FROM
                        clientes_rs c

                    LEFT JOIN
                        clientes_rs_colaboradores v

                    ON
                        v.cliente_id =
                        c.id

                    WHERE
                        c.ativo = TRUE

                    GROUP BY
                        c.id

                    ORDER BY
                        c.nome
                    `
                );


            return res.json({
                sucesso: true,
                clientes:
                    resultado.rows
            });

        } catch (err) {
            console.error(
                'Erro clientes fixos:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar clientes.'
                });
        }
    }
);


// ============================================================
// CADASTRAR CLIENTE FIXO
// ============================================================

app.post(
    '/api/jornada-clientes',

    async (req, res) => {
        try {
            const d =
                req.body ||
                {};


            const nome =
                String(
                    d.nome ||
                    ''
                )
                    .trim();


            if (!nome) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Informe o nome da empresa cliente.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO clientes_rs (
                        nome,
                        cnpj,
                        responsavel_nome,
                        responsavel_email,
                        responsavel_whatsapp,
                        endereco,
                        cidade,
                        uf,
                        latitude,
                        longitude,
                        criado_por
                    )

                    VALUES (
                        $1,$2,$3,$4,$5,
                        $6,$7,$8,$9,$10,
                        $11
                    )

                    RETURNING *
                    `,
                    [
                        nome,

                        d.cnpj ||
                        null,

                        d.responsavel_nome ||
                        null,

                        normalizarEmail(
                            d.responsavel_email
                        )
                        ||
                        null,

                        d.responsavel_whatsapp ||
                        null,

                        d.endereco ||
                        null,

                        d.cidade ||
                        null,

                        d.uf ||
                        null,

                        d.latitude ||
                        null,

                        d.longitude ||
                        null,

                        normalizarEmail(
                            d.criado_por
                        )
                        ||
                        'sistema'
                    ]
                );


            const cliente =
                resultado.rows[0];


            await registrarAuditoria(
                normalizarEmail(
                    d.criado_por
                )
                ||
                'sistema',

                'CLIENTE_FIXO_CADASTRADO',

                `Cliente ${nome} cadastrado na Jornada.`
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        cliente.id
                }
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Cliente cadastrado com sucesso.',
                cliente
            });

        } catch (err) {
            console.error(
                'Erro cadastro cliente fixo:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao cadastrar cliente.'
                });
        }
    }
);


// ============================================================
// COLABORADORES DO CLIENTE
// ============================================================

app.get(
    '/api/jornada-clientes/:id/colaboradores',

    async (req, res) => {
        try {
            const clienteId =
                Number(
                    req.params.id
                );


            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM
                        clientes_rs_colaboradores

                    WHERE
                        cliente_id = $1

                    AND
                        ativo = TRUE

                    ORDER BY
                        colaborador_nome
                    `,
                    [
                        clienteId
                    ]
                );


            return res.json({
                sucesso: true,
                colaboradores:
                    resultado.rows
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar colaboradores.'
                });
        }
    }
);


// ============================================================
// VINCULAR COLABORADOR
// ============================================================

app.post(
    '/api/jornada-clientes/:id/colaboradores',

    async (req, res) => {
        try {
            const clienteId =
                Number(
                    req.params.id
                );


            const d =
                req.body ||
                {};


            const colaboradorEmail =
                normalizarEmail(
                    d.colaborador_email
                );


            const colaboradorNome =
                String(
                    d.colaborador_nome ||
                    ''
                )
                    .trim();


            if (
                !colaboradorEmail ||
                !colaboradorNome
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Nome e e-mail do colaborador são obrigatórios.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO clientes_rs_colaboradores (
                        cliente_id,
                        colaborador_email,
                        colaborador_nome,
                        funcao,
                        valor_tipo,
                        valor_base,
                        horario_previsto,
                        ativo,
                        criado_por
                    )

                    VALUES (
                        $1,$2,$3,$4,
                        $5,$6,$7,
                        TRUE,
                        $8
                    )

                    ON CONFLICT (
                        cliente_id,
                        colaborador_email
                    )

                    DO UPDATE SET
                        colaborador_nome =
                            EXCLUDED.colaborador_nome,

                        funcao =
                            EXCLUDED.funcao,

                        valor_tipo =
                            EXCLUDED.valor_tipo,

                        valor_base =
                            EXCLUDED.valor_base,

                        horario_previsto =
                            EXCLUDED.horario_previsto,

                        ativo =
                            TRUE

                    RETURNING *
                    `,
                    [
                        clienteId,

                        colaboradorEmail,

                        colaboradorNome,

                        d.funcao ||
                        '',

                        String(
                            d.valor_tipo ||
                            'dia'
                        )
                            .toLowerCase(),

                        numeroRS(
                            d.valor_base
                        ),

                        d.horario_previsto ||
                        '',

                        normalizarEmail(
                            d.criado_por
                        )
                        ||
                        'sistema'
                    ]
                );


            await garantirJornadasDiaCliente(
                clienteId
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId
                }
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Colaborador vinculado ao cliente.',
                colaborador:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro ao vincular colaborador:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao vincular colaborador.'
                });
        }
    }
);


// ============================================================
// REMOVER COLABORADOR SEM APAGAR HISTÓRICO
// ============================================================

app.delete(
    '/api/jornada-clientes/:clienteId/colaboradores/:id',

    async (req, res) => {
        try {
            const clienteId =
                Number(
                    req.params.clienteId
                );


            const id =
                Number(
                    req.params.id
                );


            await pool.query(
                `
                UPDATE
                    clientes_rs_colaboradores

                SET
                    ativo = FALSE

                WHERE
                    id = $1

                AND
                    cliente_id = $2
                `,
                [
                    id,
                    clienteId
                ]
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId
                }
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Colaborador removido. O histórico foi mantido.'
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao remover colaborador.'
                });
        }
    }
);


// ============================================================
// JORNADAS DO CLIENTE POR DATA
// ============================================================

app.get(
    '/api/jornada-clientes/:id/jornadas',

    async (req, res) => {
        try {
            const clienteId =
                Number(
                    req.params.id
                );


            const data =
                String(
                    req.query?.data ||
                    dataAtualRS()
                )
                    .slice(
                        0,
                        10
                    );


            await garantirJornadasDiaCliente(
                clienteId,
                data
            );


            const jornadas =
                await pool.query(
                    `
                    SELECT *
                    FROM
                        jornadas_clientes

                    WHERE
                        cliente_id = $1

                    AND
                        data = $2::date

                    ORDER BY
                        colaborador_nome
                    `,
                    [
                        clienteId,
                        data
                    ]
                );


            const fechamento =
                await pool.query(
                    `
                    SELECT *
                    FROM
                        fechamentos_clientes

                    WHERE
                        cliente_id = $1

                    AND
                        data = $2::date

                    LIMIT 1
                    `,
                    [
                        clienteId,
                        data
                    ]
                );


            return res.json({
                sucesso: true,
                data,
                jornadas:
                    jornadas.rows,
                fechamento:
                    fechamento.rows[0]
                    ||
                    null
            });

        } catch (err) {
            console.error(
                'Erro jornadas cliente:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar jornadas.'
                });
        }
    }
);


// ============================================================
// HISTÓRICO CLIENTE
// ============================================================

app.get(
    '/api/jornada-clientes/:id/historico',

    async (req, res) => {
        try {
            const clienteId =
                Number(
                    req.params.id
                );


            const email =
                normalizarEmail(
                    req.query?.colaborador_email
                );


            const limite =
                Math.min(
                    Math.max(
                        Number(
                            req.query?.limite ||
                            180
                        ),
                        1
                    ),
                    500
                );


            let resultado;


            if (email) {
                resultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM
                            jornadas_clientes

                        WHERE
                            cliente_id = $1

                        AND
                            LOWER(
                                colaborador_email
                            )
                            =
                            LOWER($2)

                        ORDER BY
                            data DESC,
                            id DESC

                        LIMIT $3
                        `,
                        [
                            clienteId,
                            email,
                            limite
                        ]
                    );

            } else {
                resultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM
                            jornadas_clientes

                        WHERE
                            cliente_id = $1

                        ORDER BY
                            data DESC,
                            colaborador_nome

                        LIMIT $2
                        `,
                        [
                            clienteId,
                            limite
                        ]
                    );
            }


            return res.json({
                sucesso: true,
                jornadas:
                    resultado.rows
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar histórico.'
                });
        }
    }
);


// ============================================================
// JORNADA DO COLABORADOR — HOJE
// ============================================================

app.get(
    '/api/jornada-colaborador/:email/hoje',

    async (req, res) => {
        try {
            const email =
                normalizarEmail(
                    req.params.email
                );


            const data =
                dataAtualRS();


            const vinculos =
                await pool.query(
                    `
                    SELECT
                        cliente_id

                    FROM
                        clientes_rs_colaboradores

                    WHERE
                        LOWER(
                            colaborador_email
                        )
                        =
                        LOWER($1)

                    AND
                        ativo = TRUE
                    `,
                    [
                        email
                    ]
                );


            for (
                const vinculo
                of vinculos.rows
            ) {
                await garantirJornadasDiaCliente(
                    vinculo.cliente_id,
                    data
                );
            }


            const resultado =
                await pool.query(
                    `
                    SELECT
                        j.*,

                        c.nome
                            AS cliente_nome,

                        c.endereco
                            AS cliente_endereco,

                        c.cidade
                            AS cliente_cidade,

                        c.uf
                            AS cliente_uf,

                        c.latitude
                            AS cliente_latitude,

                        c.longitude
                            AS cliente_longitude,

                        c.responsavel_nome,

                        c.responsavel_email

                    FROM
                        jornadas_clientes j

                    JOIN
                        clientes_rs c

                    ON
                        c.id =
                        j.cliente_id

                    WHERE
                        LOWER(
                            j.colaborador_email
                        )
                        =
                        LOWER($1)

                    AND
                        j.data =
                        $2::date

                    ORDER BY
                        j.id
                    `,
                    [
                        email,
                        data
                    ]
                );


            return res.json({
                sucesso: true,
                data,
                jornadas:
                    resultado.rows
            });

        } catch (err) {
            console.error(
                'Erro jornada colaborador:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar sua jornada.'
                });
        }
    }
);


// ============================================================
// CHECK-IN CLIENTE FIXO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/checkin',

    async (req, res) => {
        try {
            const jornadaId =
                Number(
                    req.params.id
                );


            const email =
                normalizarEmail(
                    req.body?.colaborador_email ||
                    req.body?.prestador_email ||
                    req.body?.prestadorEmail ||
                    req.body?.email
                );


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                email &&
                normalizarEmail(
                    jornada.colaborador_email
                )
                !==
                email
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Esta jornada pertence a outro colaborador.'
                    });
            }


            if (
                jornada.fechada
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Esta jornada já foi fechada.'
                    });
            }


            if (
                jornada.entrada_em
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'A entrada já foi registrada.'
                    });
            }


            if (
                !req.body?.foto
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A foto de entrada é obrigatória.'
                    });
            }


            if (
                req.body?.latitude ===
                undefined
                ||
                req.body?.longitude ===
                undefined
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A localização GPS é obrigatória.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    UPDATE
                        jornadas_clientes

                    SET
                        status =
                            'PRESENTE',

                        entrada_em =
                            CURRENT_TIMESTAMP,

                        entrada_foto =
                            $1,

                        entrada_latitude =
                            $2,

                        entrada_longitude =
                            $3,

                        entrada_precisao =
                            $4,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $5

                    RETURNING *
                    `,
                    [
                        req.body.foto,

                        String(
                            req.body.latitude
                        ),

                        String(
                            req.body.longitude
                        ),

                        String(
                            req.body.precisao ??
                            ''
                        ),

                        jornadaId
                    ]
                );


            await registrarAuditoria(
                email ||
                jornada.colaborador_email,

                'CHECKIN_CLIENTE_FIXO',

                `Entrada da jornada #${jornadaId}.`
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Entrada registrada com foto e GPS.',
                jornada:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro check-in cliente fixo:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao registrar entrada.'
                });
        }
    }
);


// ============================================================
// INICIAR INTERVALO CLIENTE FIXO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/intervalo/iniciar',

    async (req, res) => {
        try {
            const jornadaId =
                Number(
                    req.params.id
                );


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                !jornada.entrada_em
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Registre a entrada primeiro.'
                    });
            }


            if (
                jornada.saida_em
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Esta jornada já foi encerrada.'
                    });
            }


            if (
                jornada.intervalo_inicio_em
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'O intervalo desta jornada já foi utilizado.'
                    });
            }


            await pool.query(
                `
                UPDATE
                    jornadas_clientes

                SET
                    status =
                        'EM_INTERVALO',

                    intervalo_inicio_em =
                        CURRENT_TIMESTAMP,

                    intervalo_retorno_em =
                        NULL,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [
                    jornadaId
                ]
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Intervalo iniciado.'
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao iniciar intervalo.'
                });
        }
    }
);


// ============================================================
// RETORNO DO INTERVALO CLIENTE FIXO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/intervalo/retornar',

    async (req, res) => {
        try {
            const jornadaId =
                Number(
                    req.params.id
                );


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                !jornada.intervalo_inicio_em
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'O intervalo ainda não foi iniciado.'
                    });
            }


            if (
                jornada.intervalo_retorno_em
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'O retorno já foi registrado.'
                    });
            }


            await pool.query(
                `
                UPDATE
                    jornadas_clientes

                SET
                    status =
                        'PRESENTE',

                    intervalo_retorno_em =
                        CURRENT_TIMESTAMP,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [
                    jornadaId
                ]
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Retorno do intervalo registrado.'
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao registrar retorno.'
                });
        }
    }
);


// ============================================================
// CHECK-OUT CLIENTE FIXO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/checkout',

    async (req, res) => {
        try {
            const jornadaId =
                Number(
                    req.params.id
                );


            const email =
                normalizarEmail(
                    req.body?.colaborador_email ||
                    req.body?.prestador_email ||
                    req.body?.prestadorEmail ||
                    req.body?.email
                );


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                email &&
                normalizarEmail(
                    jornada.colaborador_email
                )
                !==
                email
            ) {
                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Esta jornada pertence a outro colaborador.'
                    });
            }


            if (
                !jornada.entrada_em
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Registre a entrada primeiro.'
                    });
            }


            if (
                jornada.saida_em
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'A saída já foi registrada.'
                    });
            }


            if (
                jornada.intervalo_inicio_em &&
                !jornada.intervalo_retorno_em
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Registre o retorno do intervalo antes da saída.'
                    });
            }


            if (
                !req.body?.foto
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A foto de saída é obrigatória.'
                    });
            }


            if (
                req.body?.latitude ===
                undefined
                ||
                req.body?.longitude ===
                undefined
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A localização GPS é obrigatória.'
                    });
            }


            await pool.query(
                `
                UPDATE
                    jornadas_clientes

                SET
                    status =
                        'ENCERRADO',

                    saida_em =
                        CURRENT_TIMESTAMP,

                    saida_foto =
                        $1,

                    saida_latitude =
                        $2,

                    saida_longitude =
                        $3,

                    saida_precisao =
                        $4,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $5
                `,
                [
                    req.body.foto,

                    String(
                        req.body.latitude
                    ),

                    String(
                        req.body.longitude
                    ),

                    String(
                        req.body.precisao ??
                        ''
                    ),

                    jornadaId
                ]
            );


            const atualizada =
                await recalcularJornadaCliente(
                    jornadaId
                );


            await registrarAuditoria(
                email ||
                jornada.colaborador_email,

                'CHECKOUT_CLIENTE_FIXO',

                `Saída da jornada #${jornadaId}.`
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Saída registrada. Horas e valor calculados.',
                jornada:
                    atualizada
            });

        } catch (err) {
            console.error(
                'Erro checkout cliente fixo:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao registrar saída.'
                });
        }
    }
);


// ============================================================
// VALIDAR ENTRADA / SAÍDA
// ============================================================

app.post(
    '/api/jornada-fixa/:id/validar',

    async (req, res) => {
        try {
            const jornadaId =
                Number(
                    req.params.id
                );


            const tipo =
                String(
                    req.body?.tipo ||
                    ''
                )
                    .toLowerCase();


            const validador =
                normalizarEmail(
                    req.body?.validador_email ||
                    req.body?.email
                )
                ||
                'sistema';


            if (
                tipo !==
                'entrada'
                &&
                tipo !==
                'saida'
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Tipo de validação inválido.'
                    });
            }


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                tipo ===
                'entrada'
            ) {
                if (
                    !jornada.entrada_em
                ) {
                    return res
                        .status(409)
                        .json({
                            sucesso: false,
                            erro:
                                'Ainda não existe entrada para validar.'
                        });
                }


                await pool.query(
                    `
                    UPDATE
                        jornadas_clientes

                    SET
                        entrada_validada =
                            TRUE,

                        entrada_validada_por =
                            $1,

                        entrada_validada_em =
                            CURRENT_TIMESTAMP,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
                    [
                        validador,
                        jornadaId
                    ]
                );

            } else {
                if (
                    !jornada.saida_em
                ) {
                    return res
                        .status(409)
                        .json({
                            sucesso: false,
                            erro:
                                'Ainda não existe saída para validar.'
                        });
                }


                await pool.query(
                    `
                    UPDATE
                        jornadas_clientes

                    SET
                        saida_validada =
                            TRUE,

                        saida_validada_por =
                            $1,

                        saida_validada_em =
                            CURRENT_TIMESTAMP,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
                    [
                        validador,
                        jornadaId
                    ]
                );
            }


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    tipo ===
                    'entrada'
                        ?
                        'Entrada validada.'
                        :
                        'Saída validada.'
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao validar jornada.'
                });
        }
    }
);


// ============================================================
// FECHAMENTO DO DIA
// ============================================================

app.post(
    '/api/jornada-clientes/:id/fechar-dia',

    async (req, res) => {
        try {
            const clienteId =
                Number(
                    req.params.id
                );


            const data =
                String(
                    req.body?.data ||
                    dataAtualRS()
                )
                    .slice(
                        0,
                        10
                    );


            const usuario =
                normalizarEmail(
                    req.body?.confirmado_por ||
                    req.body?.email
                )
                ||
                'sistema';


            const observacoes =
                String(
                    req.body?.observacoes ||
                    ''
                );


            const abertas =
                await pool.query(
                    `
                    SELECT
                        COUNT(*)::int
                        AS total

                    FROM
                        jornadas_clientes

                    WHERE
                        cliente_id = $1

                    AND
                        data = $2::date

                    AND
                        entrada_em
                        IS NOT NULL

                    AND
                        saida_em
                        IS NULL
                    `,
                    [
                        clienteId,
                        data
                    ]
                );


            if (
                Number(
                    abertas
                        .rows[0]
                        ?.total
                    ||
                    0
                ) >
                0
            ) {
                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Existem colaboradores com jornada aberta.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO fechamentos_clientes (
                        cliente_id,
                        data,
                        confirmado,
                        confirmado_por,
                        confirmado_em,
                        observacoes
                    )

                    VALUES (
                        $1,
                        $2::date,
                        TRUE,
                        $3,
                        CURRENT_TIMESTAMP,
                        $4
                    )

                    ON CONFLICT (
                        cliente_id,
                        data
                    )

                    DO UPDATE SET
                        confirmado =
                            TRUE,

                        confirmado_por =
                            EXCLUDED.confirmado_por,

                        confirmado_em =
                            CURRENT_TIMESTAMP,

                        observacoes =
                            EXCLUDED.observacoes

                    RETURNING *
                    `,
                    [
                        clienteId,
                        data,
                        usuario,
                        observacoes
                    ]
                );


            await pool.query(
                `
                UPDATE
                    jornadas_clientes

                SET
                    fechada =
                        TRUE,

                    fechada_por =
                        $1,

                    fechada_em =
                        CURRENT_TIMESTAMP,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE
                    cliente_id = $2

                AND
                    data = $3::date
                `,
                [
                    usuario,
                    clienteId,
                    data
                ]
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId,
                    data
                }
            );


            return res.json({
                sucesso: true,
                mensagem:
                    'Dia confirmado e arquivado.',
                fechamento:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro fechamento diário:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao fechar o dia.'
                });
        }
    }
);


// ============================================================
// DOCUMENTOS DA JORNADA
// ============================================================

app.get(
    '/api/jornada-fixa/:id/documentos',

    async (req, res) => {
        try {
            const jornadaId =
                Number(
                    req.params.id
                );


            const resultado =
                await pool.query(
                    `
                    SELECT
                        id,
                        jornada_id,
                        tipo,
                        nome,
                        mime,
                        assinatura_status,
                        assinado_por,
                        assinado_em,
                        criado_por,
                        criado_em

                    FROM
                        jornadas_clientes_documentos

                    WHERE
                        jornada_id = $1

                    ORDER BY
                        id DESC
                    `,
                    [
                        jornadaId
                    ]
                );


            return res.json({
                sucesso: true,
                documentos:
                    resultado.rows
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar documentos.'
                });
        }
    }
);


// ============================================================
// ENVIAR PDF PARA JORNADA
// ============================================================

app.post(
    '/api/jornada-fixa/:id/documentos',

    upload.single('arquivo'),

    async (req, res) => {
        try {
            const jornadaId =
                Number(
                    req.params.id
                );


            if (
                !req.file?.buffer
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Selecione o PDF.'
                    });
            }


            const nome =
                req.file.originalname ||
                `documento-${jornadaId}.pdf`;


            const mime =
                req.file.mimetype ||
                'application/pdf';


            if (
                mime !==
                'application/pdf'
                &&
                !String(
                    nome
                )
                    .toLowerCase()
                    .endsWith(
                        '.pdf'
                    )
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente PDF é permitido.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO jornadas_clientes_documentos (
                        jornada_id,
                        tipo,
                        nome,
                        mime,
                        arquivo,
                        assinatura_status,
                        criado_por
                    )

                    VALUES (
                        $1,$2,$3,$4,$5,
                        'NAO_ASSINADO',
                        $6
                    )

                    RETURNING
                        id,
                        jornada_id,
                        tipo,
                        nome,
                        assinatura_status,
                        criado_em
                    `,
                    [
                        jornadaId,

                        req.body?.tipo ||
                        'CONTRATO',

                        nome,

                        mime,

                        req.file.buffer,

                        normalizarEmail(
                            req.body?.criado_por
                        )
                        ||
                        'sistema'
                    ]
                );


            return res.json({
                sucesso: true,
                mensagem:
                    'Documento vinculado à jornada.',
                documento:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro documento jornada:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao salvar documento.'
                });
        }
    }
);


// ============================================================
// ENVIAR DOCUMENTO ASSINADO
// ============================================================

app.post(
    '/api/jornada-documentos/:id/assinado',

    upload.single('arquivo'),

    async (req, res) => {
        try {
            const documentoId =
                Number(
                    req.params.id
                );


            if (
                !req.file?.buffer
            ) {
                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Selecione o PDF assinado.'
                    });
            }


            const originalRes =
                await pool.query(
                    `
                    SELECT *
                    FROM
                        jornadas_clientes_documentos

                    WHERE
                        id = $1

                    LIMIT 1
                    `,
                    [
                        documentoId
                    ]
                );


            const original =
                originalRes.rows[0];


            if (!original) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Documento não encontrado.'
                    });
            }


            const usuario =
                normalizarEmail(
                    req.body?.assinado_por
                )
                ||
                'sistema';


            const resultado =
                await pool.query(
                    `
                    INSERT INTO jornadas_clientes_documentos (
                        jornada_id,
                        tipo,
                        nome,
                        mime,
                        arquivo,
                        assinatura_status,
                        assinado_por,
                        assinado_em,
                        criado_por
                    )

                    VALUES (
                        $1,$2,$3,$4,$5,
                        'ASSINADO',
                        $6,
                        CURRENT_TIMESTAMP,
                        $6
                    )

                    RETURNING
                        id,
                        jornada_id,
                        tipo,
                        nome,
                        assinatura_status,
                        assinado_em
                    `,
                    [
                        original.jornada_id,

                        `${original.tipo || 'DOCUMENTO'}_ASSINADO`,

                        req.file.originalname ||
                        `assinado-${original.nome}`,

                        req.file.mimetype ||
                        'application/pdf',

                        req.file.buffer,

                        usuario
                    ]
                );


            return res.json({
                sucesso: true,
                mensagem:
                    'Documento assinado arquivado.',
                documento:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Erro documento assinado:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao arquivar documento assinado.'
                });
        }
    }
);


// ============================================================
// ABRIR DOCUMENTO PDF
// ============================================================

app.get(
    '/api/jornada-documentos/:id/arquivo',

    async (req, res) => {
        try {
            const documentoId =
                Number(
                    req.params.id
                );


            const resultado =
                await pool.query(
                    `
                    SELECT
                        nome,
                        mime,
                        arquivo

                    FROM
                        jornadas_clientes_documentos

                    WHERE
                        id = $1

                    LIMIT 1
                    `,
                    [
                        documentoId
                    ]
                );


            const documento =
                resultado.rows[0];


            if (
                !documento?.arquivo
            ) {
                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Documento não encontrado.'
                    });
            }


            res.setHeader(
                'Content-Type',
                documento.mime ||
                'application/pdf'
            );


            res.setHeader(
                'Content-Disposition',

                `inline; filename*=UTF-8''${
                    encodeURIComponent(
                        documento.nome ||
                        'documento.pdf'
                    )
                }`
            );


            return res.send(
                documento.arquivo
            );

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao abrir documento.'
                });
        }
    }
);


// ============================================================
// STATUS
// ============================================================

app.get(
    '/api/status',

    async (req, res) => {
        try {
            await pool.query(
                'SELECT 1'
            );


            return res.json({
                sucesso: true,
                sistema:
                    'RS Connect',
                status:
                    'online',
                banco:
                    'online',
                websocket:
                    'online',
                horario:
                    horaAtualRS()
            });

        } catch (err) {
            return res
                .status(500)
                .json({
                    sucesso: false,
                    status:
                        'erro',
                    erro:
                        err.message
                });
        }
    }
);


// ============================================================
// WEBSOCKET
// ============================================================

io.on(
    'connection',

    socket => {
        console.log(
            'Novo cliente conectado via WebSocket:',
            socket.id
        );


        socket.on(
            'identificar_usuario',

            dados => {
                const email =
                    normalizarEmail(
                        typeof dados ===
                        'string'
                            ?
                            dados
                            :
                            dados?.email
                    );


                if (!email) {
                    return;
                }


                socket.data.email =
                    email;


                socket.join(
                    `usuario_${email}`
                );


                console.log(
                    `Socket ${socket.id} identificado como ${email}`
                );
            }
        );


        socket.on(
            'entrar_conversa',

            dados => {
                const conversaId =
                    Number(
                        dados?.conversaId ||
                        dados?.conversa_id
                    );


                if (!conversaId) {
                    return;
                }


                socket.join(
                    `conversa_${conversaId}`
                );
            }
        );


        socket.on(
            'sair_conversa',

            dados => {
                const conversaId =
                    Number(
                        dados?.conversaId ||
                        dados?.conversa_id
                    );


                if (!conversaId) {
                    return;
                }


                socket.leave(
                    `conversa_${conversaId}`
                );
            }
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


// ============================================================
// ERROS DE UPLOAD
// ============================================================

app.use(
    (
        err,
        req,
        res,
        next
    ) => {
        if (
            err instanceof
            multer.MulterError
        ) {
            if (
                err.code ===
                'LIMIT_FILE_SIZE'
            ) {
                return res
                    .status(413)
                    .json({
                        sucesso: false,
                        erro:
                            'Arquivo muito grande. Limite: 10 MB.'
                    });
            }


            return res
                .status(400)
                .json({
                    sucesso: false,
                    erro:
                        err.message
                });
        }


        return next(
            err
        );
    }
);


// ============================================================
// 404 DA API
// IMPORTANTE: TEM QUE FICAR DEPOIS DE TODAS AS ROTAS
// ============================================================

app.use(
    '/api',

    (req, res) => {
        return res
            .status(404)
            .json({
                sucesso: false,
                erro:
                    'Rota da API não encontrada.',
                metodo:
                    req.method,
                rota:
                    req.originalUrl
            });
    }
);


// ============================================================
// FRONT-END
// ============================================================

app.get(
    '*',

    (req, res) => {
        return res.sendFile(
            path.join(
                __dirname,
                'index.html'
            )
        );
    }
);


// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function iniciarRSConnect() {
    try {
        console.log(
            '======================================'
        );

        console.log(
            '🚀 INICIANDO RS CONNECT'
        );

        console.log(
            `🌐 Ambiente: ${
                process.env.NODE_ENV ||
                'development'
            }`
        );

        console.log(
            '🕒 Timezone: America/Sao_Paulo'
        );

        console.log(
            '======================================'
        );


        await pool.query(
            'SELECT NOW()'
        );


        console.log(
            '✅ PostgreSQL conectado.'
        );


        await criarTabelas();


        await criarTabelasJornadaClientes();


        console.log(
            '✅ Banco RS Connect preparado.'
        );


        const PORT =
            Number(
                process.env.PORT ||
                10000
            );


        server.listen(
            PORT,
            '0.0.0.0',

            () => {
                console.log(
                    '======================================'
                );

                console.log(
                    `✅ RS CONNECT ONLINE NA PORTA ${PORT}`
                );

                console.log(
                    '✅ API ONLINE'
                );

                console.log(
                    '✅ WEBSOCKET ONLINE'
                );

                console.log(
                    '✅ SERVIÇOS ONLINE'
                );

                console.log(
                    '✅ JORNADA ONLINE'
                );

                console.log(
                    '✅ CLIENTES FIXOS ONLINE'
                );

                console.log(
                    '✅ CHAT ONLINE'
                );

                console.log(
                    '✅ DOCUMENTOS ONLINE'
                );

                console.log(
                    '======================================'
                );
            }
        );

    } catch (err) {
        console.error(
            '❌ RS Connect não conseguiu iniciar:',
            err
        );


        process.exit(
            1
        );
    }
}


// ============================================================
// ERROS NÃO TRATADOS
// ============================================================

process.on(
    'unhandledRejection',

    err => {
        console.error(
            '❌ Promise não tratada:',
            err
        );
    }
);


process.on(
    'uncaughtException',

    err => {
        console.error(
            '❌ Erro não tratado:',
            err
        );
    }
);


// ============================================================
// ENCERRAMENTO SEGURO
// ============================================================

async function encerrarRSConnect(
    sinal
) {
    console.log(
        `🛑 Encerrando RS Connect: ${sinal}`
    );


    try {
        await pool.end();

    } catch (err) {
        console.error(
            'Erro ao fechar PostgreSQL:',
            err.message
        );
    }


    server.close(
        () => {
            console.log(
                '✅ RS Connect encerrado corretamente.'
            );


            process.exit(
                0
            );
        }
    );
}


process.on(
    'SIGTERM',

    () =>
        encerrarRSConnect(
            'SIGTERM'
        )
);


process.on(
    'SIGINT',

    () =>
        encerrarRSConnect(
            'SIGINT'
        )
);


// ============================================================
// INICIAR RS CONNECT
// ============================================================

iniciarRSConnect();


// ============================================================
// FIM DO SERVER.JS
// ============================================================
