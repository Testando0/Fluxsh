export default async function handler(req, res) {
  // Impede que outros métodos acessem a rota
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'O prompt é obrigatório' });
  }

  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
      {
        headers: {
          "Authorization": `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            guidance_scale: 3.5, // Aumenta a fidelidade ao prompt
            num_inference_steps: 4, // Otimizado para o modelo Schnell
            width: 1024,
            height: 1024
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: "Hugging Face Error", details: errorText });
    }

    // Converte a resposta em buffer para enviar como imagem
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.send(buffer);

  } catch (error) {
    return res.status(500).json({ error: 'Erro interno no servidor', message: error.message });
  }
}
