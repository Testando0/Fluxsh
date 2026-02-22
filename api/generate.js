export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const { prompt: q } = req.body;
        if (!q) return res.status(400).json({ error: "O prompt é obrigatório" });

        // 1. Tradução (Google Translate)
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(q)}`;
        const transRes = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedPrompt = transJson[0][0][0];

        // 2. Configurações
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN  = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model      = "@cf/black-forest-labs/flux-2-klein-9b";

        const finalPrompt = `Hyper-realistic RAW photo, ${translatedPrompt}, detailed skin pores, cinematic lighting, 8k, masterpiece, shot on 35mm lens.`;

        // 3. OBRIGATÓRIO: flux-2-klein-9b SÓ aceita multipart/form-data — nunca JSON
        const formData = new FormData();
        formData.append("prompt", finalPrompt);
        // IMPORTANTE: NÃO defina Content-Type manualmente.
        // O fetch adiciona o boundary correto automaticamente quando o body é FormData.

        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                },
                body: formData,
            }
        );

        // 4. Verificação de erro HTTP
        if (!cfResponse.ok) {
            const errorText = await cfResponse.text();
            console.error("Erro CF:", errorText);
            return res.status(cfResponse.status).json({
                error: "Cloudflare recusou",
                detalhes: errorText
            });
        }

        // 5. flux-2-klein-9b retorna JSON com { result: { image: "<base64>" } }
        const json = await cfResponse.json();

        // Localiza o base64 na estrutura retornada pela CF
        const base64Image =
            json?.result?.image ||   // caminho padrão Cloudflare Workers AI
            json?.image         ||   // fallback direto
            null;

        if (!base64Image) {
            console.error("JSON inesperado da CF:", JSON.stringify(json));
            return res.status(500).json({ error: "Imagem não encontrada na resposta da Cloudflare." });
        }

        // 6. Converte base64 → buffer e envia como JPEG
        const buffer = Buffer.from(base64Image, "base64");

        if (buffer.length === 0) {
            return res.status(500).json({ error: "A imagem decodificada está vazia." });
        }

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "no-cache");
        return res.send(buffer);

    } catch (error) {
        console.error("ERRO VERCEL:", error.message);
        return res.status(500).json({ error: "Falha no Servidor", mensagem: error.message });
    }
                }
