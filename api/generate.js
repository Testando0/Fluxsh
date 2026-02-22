export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const { prompt: q } = req.body;
        if (!q) return res.status(400).json({ error: "O prompt é obrigatório" });

        // 1. Tradução PT → EN
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(q)}`;
        const transRes  = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedPrompt = transJson[0].map(s => s[0]).join("");

        console.log("Prompt traduzido:", translatedPrompt);

        // 2. Cloudflare Workers AI — flux-2-dev
        //    Modelo escolhido: @cf/black-forest-labs/flux-2-dev
        //    Motivo: maior fidelidade ao prompt, fotorrealismo superior, 32B parâmetros
        //
        //    Parâmetros de fidelidade máxima (doc oficial):
        //    - guidance: 7.5  → quanto mais alto, mais colado ao prompt (recomendado: 3–5, usamos mais alto para fidelidade)
        //    - steps: 40      → mais passos = mais qualidade e fidelidade (produção: 28–50)
        //    - width/height: 1024x1024 → resolução padrão alta
        //
        //    OBRIGATÓRIO: flux-2-dev só aceita multipart/form-data (nunca JSON direto)
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN  = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model      = "@cf/black-forest-labs/flux-2-dev";

        const formData = new FormData();
        formData.append("prompt",   translatedPrompt);
        formData.append("steps",    "40");   // mais passos = mais fidelidade
        formData.append("guidance", "7.5");  // alta aderência ao prompt
        formData.append("width",    "1024");
        formData.append("height",   "1024");

        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: { "Authorization": `Bearer ${API_TOKEN}` },
                // SEM Content-Type — o fetch define o boundary do FormData automaticamente
                body: formData,
            }
        );

        if (!cfResponse.ok) {
            const errorText = await cfResponse.text();
            console.error("Erro CF:", errorText);
            return res.status(cfResponse.status).json({ error: "Cloudflare recusou", detalhes: errorText });
        }

        // 3. Processar resposta
        //    flux-2-dev retorna JSON com { result: { image: "<base64>" } }
        const cfContentType = cfResponse.headers.get("content-type") || "";

        // Caso A: bytes de imagem direta (improvável no flux-2-dev, mas tratado por segurança)
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
