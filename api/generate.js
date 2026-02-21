export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

    try {
        const { prompt: userPrompt } = req.body;
        if (!userPrompt) return res.status(400).json({ error: "Prompt vazio" });

        // 1. TRADUÇÃO E REFINAMENTO AGRESSIVO PARA REALISMO
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(userPrompt)}`;
        const transRes = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedText = transJson[0][0][0];

        // Prompt moldado para forçar o SDXL a sair do modo "desenho"
        const finalPrompt = `Extreme photorealism, RAW cinematic photo of ${translatedText}, highly detailed skin pores, 8k resolution, shot on Agfa Vista 400, soft natural lighting, masterpiece, sharp focus, hyper-detailed.`;
        const negative = "plastic, blur, anime, cartoon, (deformed eyes, nose, ears, fingers), bad anatomy, drawing, illustration, 3d render, watermarks";

        // 2. CREDENCIAIS (IMPORTANTE: Se der erro, verifique se o Token ainda vale!)
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

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
                    negative_prompt: negative,
                    num_steps: 25, // Equilíbrio perfeito para não estourar a cota e manter a nitidez
                    guidance: 8.5  // Aumenta a fidelidade ao que você escreveu
                }),
            }
        );

        // 3. SE A CLOUDFLARE FALHAR, O CÓDIGO TE DIZ O PORQUÊ
        if (!cfResponse.ok) {
            const errorMsg = await cfResponse.text();
            return res.status(cfResponse.status).json({ error: "Erro na Cloudflare", detalhes: errorMsg });
        }

        // 4. TRATAMENTO DE IMAGEM SEM USAR 'BUFFER' (Evita erro de imagem quebrada)
        const arrayBuffer = await cfResponse.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        res.setHeader('Content-Type', 'image/png');
        return res.send(uint8Array);

    } catch (error) {
        // Isso vai te mostrar no console EXATAMENTE o que quebrou
        console.error("DEBUG:", error.message);
        return res.status(500).json({ error: "Erro Interno", message: error.message });
    }
}
