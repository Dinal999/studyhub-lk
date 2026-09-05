# StudyFlow AI Chatbot Setup

The existing chatbot UI is unchanged. Gemini has been removed from the chatbot and the API key is no longer stored in `app.js`.

This version uses OpenRouter's free-model router through a Cloudflare Worker proxy. The OpenRouter key stays on the Worker instead of being exposed in GitHub Pages.

## 1. Create an OpenRouter key

Create an OpenRouter account and API key. Use the free model router (`openrouter/free`). Free model usage is subject to OpenRouter's current rate limits.

## 2. Create a Cloudflare Worker

1. Sign in to Cloudflare.
2. Go to **Workers & Pages** → **Create** → **Create Worker**.
3. Create a Worker and open its code editor.
4. Replace the Worker code with the contents of `ai-worker.js` from this project.
5. Deploy it.

## 3. Add the OpenRouter key as a secret

In the Worker, open **Settings → Variables and Secrets**.

Add a secret:

- Name: `OPENROUTER_API_KEY`
- Value: your OpenRouter API key

Do NOT put the key inside `app.js`, `index.html`, or GitHub.

## 4. Connect StudyFlow to the Worker

Copy your deployed Worker URL. It will look similar to:

`https://studyflow-ai-proxy.your-subdomain.workers.dev`

Open `app.js` and find:

`const AI_PROXY_URL = "PASTE_YOUR_CLOUDFLARE_WORKER_URL_HERE";`

Replace only the placeholder with your Worker URL.

Example:

`const AI_PROXY_URL = "https://studyflow-ai-proxy.example.workers.dev";`

Save and push the project to GitHub Pages.

## 5. Test

Open the StudyFlow AI English Chat Assistant and send:

`Explain Python loops in simple English.`

The chatbot should respond without using Gemini.

## Important

The free OpenRouter pool and rate limits can change. This project uses `openrouter/free`, which automatically selects an available free model. The current OpenRouter pricing page lists free models and the applicable free-tier limits.
