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

        // 2. Configurações - ATUALIZADO: Utilizando o modelo FLUX.2 [klein] 9B
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model = "@cf/black-forest-labs/flux-2-klein-9b";

        // Prompt de Elite: O Flux tem uma compreensão de linguagem natural muito superior ao SDXL.
        // Mantive os gatilhos de realismo para garantir a textura e iluminação que você quer.
        const finalPrompt = `Hyper-realistic RAW photo, ${translatedPrompt}, detailed skin pores, cinematic lighting, 8k, masterpiece, shot on 35mm lens.`;

        // O FLUX.2 na Cloudflare EXIGE que o payload seja enviado como multipart/form-data
        const formData = new FormData();
        formData.append("prompt", finalPrompt);

        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                    // IMPORTANTE: Nunca defina o "Content-Type" manualmente quando usar FormData no fetch.
                    // O próprio fetch se encarrega de colocar 'multipart/form-data' com o boundary (fronteira) correto.
                },
                body: formData,
            }
        );

        // 3. Verificação Crítica de Erro
        if (!cfResponse.ok) {
            const errorData = await cfResponse.text();
            console.error("Erro CF:", errorData);
            return res.status(cfResponse.status).json({ error: "Cloudflare recusou", detalhes: errorData });
        }

        // 4. Tratamento de Saída para o Vercel
        const arrayBuffer = await cfResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) {
            throw new Error("A imagem retornada está vazia.");
        }

        // Retorna a imagem
        res.setHeader('Content-Type', 'image/jpeg'); // Flux geralmente retorna JPEG
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);

    } catch (error) {
        console.error("ERRO VERCEL:", error.message);
        return res.status(500).json({ error: "Falha no Servidor", mensagem: error.message });
    }
}
