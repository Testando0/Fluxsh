export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

    try {
        const { prompt: inputPrompt } = req.body;
        if (!inputPrompt) return res.status(400).json({ error: "Prompt vazio" });

        // 1. TRADUÇÃO PROFISSIONAL
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(inputPrompt)}`;
        const transRes = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedText = transJson[0][0][0];

        // 2. REFINAMENTO DE REALISMO (NÍVEL NANO BANANA)
        // O Flux odeia "tags" soltas. Ele ama descrições de fotografia real.
        const ultraRealisticPrompt = `A high-end cinematic photo of ${translatedText}. Shot on 35mm lens, f/1.8, realistic skin textures, natural lighting, global illumination, 8k resolution, highly detailed, photorealistic, no distortion.`;

        // 3. CREDENCIAIS (SEGURANÇA: REGENERE SEU TOKEN NO PAINEL)
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model = "@cf/black-forest-labs/flux-1-schnell"; 

        // 4. CHAMADA DE ALTA PRECISÃO
        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: ultraRealisticPrompt,
                    num_steps: 4, // O "NÚMERO MÁGICO" DO FLUX SCHNELL. Nem mais, nem menos.
                    height: 1024,
                    width: 1024
                }),
            }
        );

        if (!cfResponse.ok) {
            const errorData = await cfResponse.json();
            return res.status(cfResponse.status).json({ error: "Erro CF", details: errorData });
        }

        // 5. RESPOSTA DIRETA EM BUFFER (QUALIDADE MÁXIMA)
        const arrayBuffer = await cfResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('X-Generator', 'Cloudflare-Flux-Elite');
        return res.send(buffer);

    } catch (error) {
        console.error("ERRO CRÍTICO:", error.message);
        return res.status(500).json({ error: "Falha na Geração", message: error.message });
    }
}
