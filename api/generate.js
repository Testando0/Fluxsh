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

        // 2. Configurações - MANDATÓRIO: Use o SDXL para realismo, o Flux Schnell na Cloudflare é capado.
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

        // Prompt de Elite: Força o realismo e evita o aspecto de "lixo"
        const finalPrompt = `Hyper-realistic RAW photo, ${translatedPrompt}, detailed skin pores, cinematic lighting, 8k, masterpiece, shot on 35mm lens.`;
        const negativePrompt = "cartoon, anime, 3d, plastic, deformed, bad anatomy, blurry, low quality, text, watermark";

        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    negative_prompt: negativePrompt,
                    num_steps: 30, // SDXL precisa de passos para não ficar borrado
                    guidance: 7.5
                }),
            }
        );

        // 3. Verificação Crítica de Erro
        if (!cfResponse.ok) {
            const errorData = await cfResponse.text();
            console.error("Erro CF:", errorData);
            return res.status(cfResponse.status).json({ error: "Cloudflare recusou", detalhes: errorData });
        }

        // 4. Tratamento de Saída para o Vercel
        // Vamos pegar o ArrayBuffer e converter para Buffer (Node.js)
        const arrayBuffer = await cfResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Se o buffer estiver vazio, a IA não gerou nada
        if (buffer.length === 0) {
            throw new Error("A imagem retornada está vazia.");
        }

        // Envia a imagem de volta com os headers corretos
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);

    } catch (error) {
        console.error("ERRO VERCEL:", error.message);
        return res.status(500).json({ error: "Falha no Servidor", mensagem: error.message });
    }
}
