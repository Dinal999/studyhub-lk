// StudyFlow AI Proxy - Cloudflare Worker
// Keeps the OpenRouter API key OFF the public GitHub Pages frontend.

const OPENROUTER_MODEL = "openrouter/free";

const SYSTEM_PROMPT = `You are StudyFlow AI Assistant.

You are an AI assistant designed for students.

Help students with:
- English
- Grammar
- Mathematics
- Programming
- Computer Science
- Academic subjects
- Study techniques
- Exam preparation
- General questions

Give accurate, clear and easy-to-understand answers.
Keep answers reasonably concise unless the student asks for detailed explanations.
Do not claim to be a human. If you are unsure, say so clearly.`;

function corsHeaders(request) {
    // For production, replace * with your GitHub Pages origin, e.g.
    // https://yourusername.github.io
    const origin = request.headers.get("Origin") || "*";

    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin"
    };
}

function jsonResponse(body, status, request) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders(request),
            "Content-Type": "application/json"
        }
    });
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders(request)
            });
        }

        if (request.method !== "POST") {
            return jsonResponse({ error: "Method not allowed" }, 405, request);
        }

        if (!env.OPENROUTER_API_KEY) {
            return jsonResponse({
                error: "Server AI key is not configured. Add OPENROUTER_API_KEY as a Worker secret."
            }, 500, request);
        }

        try {
            const body = await request.json();
            const userText = String(body?.message || "").trim();

            if (!userText) {
                return jsonResponse({ error: "Message is required." }, 400, request);
            }

            // Basic request-size protection.
            if (userText.length > 6000) {
                return jsonResponse({
                    error: "Message is too long. Please keep it under 6000 characters."
                }, 413, request);
            }

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": request.headers.get("Origin") || "https://studyflow.pages.dev",
                    "X-Title": "StudyFlow Student Productivity Hub"
                },
                body: JSON.stringify({
                    model: OPENROUTER_MODEL,
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: userText }
                    ],
                    temperature: 0.7,
                    max_tokens: 600
                })
            });

            const data = await response.json();

            if (!response.ok) {
                const message = data?.error?.message || `OpenRouter HTTP ${response.status}`;
                return jsonResponse({ error: message }, response.status, request);
            }

            const answer = data?.choices?.[0]?.message?.content?.trim();

            if (!answer) {
                return jsonResponse({ error: "The AI did not return a response." }, 502, request);
            }

            return jsonResponse({ answer }, 200, request);
        } catch (error) {
            return jsonResponse({
                error: error?.message || "Unexpected AI server error."
            }, 500, request);
        }
    }
};
