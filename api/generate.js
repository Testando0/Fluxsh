export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const { prompt: q } = req.body;
        if (!q) return res.status(400).json({ error: "O prompt é obrigatório" });

        // 1. Tradução (Google Translate)
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(q)}`;
        const transRes = await fetch(translateUrl);
        const transJson = await transRes.json();

        // Une todos os fragmentos da tradução corretamente
        const translatedPrompt = transJson[0].map(s => s[0]).join("");

        // 2. Prompt fiel ao texto:
        //    - O sujeito do usuário vem PRIMEIRO (o Flux prioriza o início)
        //    - Descrição em linguagem natural fluida, sem tags soltas
        //    - Sem palavras de estilo que sobrepõem o conteúdo ("masterpiece", "RAW photo", "8k")
        const finalPrompt = `${translatedPrompt}. The image must depict exactly and only what was described, with accurate colors, correct number of subjects, faithful scene composition, vivid details and cinematic lighting.`;

        console.log("Prompt enviado ao Flux:", finalPrompt);

        // 3. Cloudflare Workers AI — flux-2-klein-9b obriga multipart/form-data
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN  = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model      = "@cf/black-forest-labs/flux-2-klein-9b";

        const formData = new FormData();
        formData.append("prompt", finalPrompt);

        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: { "Authorization": `Bearer ${API_TOKEN}` },
                // SEM Content-Type — fetch define o boundary do FormData automaticamente
                body: formData,
            }
        );

        if (!cfResponse.ok) {
            const errorText = await cfResponse.text();
            console.error("Erro CF:", errorText);
            return res.status(cfResponse.status).json({ error: "Cloudflare recusou", detalhes: errorText });
        }

        // 4. Processar resposta
        const cfContentType = cfResponse.headers.get("content-type") || "";

        // Caso A: Bytes de imagem diretos
        if (cfContentType.includes("image/")) {
            const buffer = Buffer.from(await cfResponse.arrayBuffer());
            if (buffer.length === 0) throw new Error("Imagem retornada está vazia.");
            res.setHeader("Content-Type", cfContentType);
            res.setHeader("Content-Length", buffer.length);
            res.setHeader("Cache-Control", "no-cache");
            return res.send(buffer);
        }

        // Caso B: JSON com base64 { result: { image: "..." } }
        const json = await cfResponse.json();
        const base64Image = json?.result?.image || json?.image || null;

        if (!base64Image) {
            console.error("JSON inesperado da CF:", JSON.stringify(json));
            return res.status(500).json({ error: "Imagem não encontrada na resposta da Cloudflare." });
        }

        const buffer = Buffer.from(base64Image, "base64");
        if (buffer.length === 0) throw new Error("Imagem base64 decodificada está vazia.");

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "no-cache");
        return res.send(buffer);

    } catch (error) {
        console.error("ERRO VERCEL:", error.message);
        return res.status(500).json({ error: "Falha no Servidor", mensagem: error.message });
    }
                }
