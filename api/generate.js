export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Use POST');

    try {
        const { prompt: q } = req.body;
        if (!q) return res.status(400).json({ error: "Insira um texto" });

        // 1. Tradução Automática (Igual à sua case)
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(q)}`;
        const transRes = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedPrompt = transJson[0][0][0];

        // 2. Configurações da Cloudflare (Dados Exatos da sua Case)
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model = "@cf/leonardo/phoenix-1.0"; // O MODELO DA CASE

        const finalPrompt = `${translatedPrompt}, high quality, detailed, 8k`;
        const negativePrompt = "deformed, mutated, ugly, disfigured, bad anatomy, extra limbs, blurry, watermark, text, crossbreed";

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
                    num_steps: 20, // OS PASSOS DA CASE
                    guidance: 7.5  // O GUIDANCE DA CASE
                }),
            }
        );

        if (!cfResponse.ok) {
            const errorText = await cfResponse.text();
            return res.status(cfResponse.status).json({ error: "Erro CF", details: errorText });
        }

        // 3. Tratamento Híbrido de Resposta (Cloudflare -> Buffer)
        const contentType = cfResponse.headers.get("content-type");
        
        if (contentType && contentType.includes("application/json")) {
            const json = await cfResponse.json();
            const base64 = json.result?.image || json.image;
            if (!base64) throw new Error("Imagem não encontrada no JSON");
            
            const buffer = Buffer.from(base64, 'base64');
            res.setHeader('Content-Type', 'image/png');
            return res.send(buffer);
        } else {
            const arrayBuffer = await cfResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            res.setHeader('Content-Type', 'image/png');
            return res.send(buffer);
        }

    } catch (error) {
        console.error("ERRO BUNIX:", error.message);
        return res.status(500).json({ error: "Falha na Geração", message: error.message });
    }
}
