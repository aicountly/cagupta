<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\ClientChatConversationModel;

final class ClientAssistantBot
{
    private const BOT_NAME = 'CA Assistant';
    private const PROMPT_VERSION = 'client_assistant_v2_gemini';
    private const DEFAULT_MODEL = 'gemini-2.5-flash';

    /**
     * @param array<int, array{sender_kind: string, body_text: string}> $recentMessages
     * @return array{reply: string, escalate: bool, escalate_reason: string, metadata: array<string, mixed>}
     */
    public function reply(string $clientMessage, array $recentMessages): array
    {
        $apiKey = (string)(getenv('GEMINI_API_KEY') ?: '');
        $model = (string)(getenv('GEMINI_CLIENT_CHAT_MODEL') ?: self::DEFAULT_MODEL);

        if ($apiKey === '') {
            return [
                'reply' => 'The assistant is temporarily unavailable. Please ask to speak with our team and a CA will reply shortly.',
                'escalate' => true,
                'escalate_reason' => 'Gemini API key not configured',
                'metadata' => ['provider' => 'gemini', 'model' => $model, 'prompt_version' => self::PROMPT_VERSION, 'error' => 'missing_api_key'],
            ];
        }

        $convModel = new ClientChatConversationModel();
        $faqs = $convModel->listFaqs();
        $blogs = $convModel->listPublishedBlogExcerpts(8);

        $faqBlock = '';
        foreach ($faqs as $faq) {
            $faqBlock .= 'Q: ' . ($faq['question'] ?? '') . "\nA: " . ($faq['answer'] ?? '') . "\n\n";
        }

        $blogBlock = '';
        foreach ($blogs as $blog) {
            $blogBlock .= '- ' . ($blog['title'] ?? '') . ': ' . mb_substr((string)($blog['excerpt'] ?? ''), 0, 200) . "\n";
        }

        $system = <<<PROMPT
You are the CA Assistant for CA Rahul Gupta, an Indian chartered accountancy firm.

Rules:
- Answer ONLY using the FAQs and blog excerpts below. Do not rely on outside knowledge.
- If the answer is not clearly supported by the knowledge base, set escalate to true and say our team will follow up.
- Provide general educational information about Indian tax, GST, compliance, and firm services only.
- Do NOT give personalised legal or tax advice. Include a brief disclaimer when answering tax questions.
- Do NOT use or infer any private client data.
- If the user asks to speak to a human, talk to their CA, wants a callback, or you cannot answer confidently, set escalate to true.
- Keep replies concise (under 400 words).

Knowledge base — FAQs:
{$faqBlock}

Published blog excerpts:
{$blogBlock}

Respond ONLY with valid JSON (no markdown fences):
{"reply":"your message to the client","escalate":false,"escalate_reason":""}
PROMPT;

        $contents = [];
        foreach (array_slice($recentMessages, -12) as $msg) {
            $kind = (string)($msg['sender_kind'] ?? 'client');
            $role = $kind === 'client' ? 'user' : 'model';
            $contents[] = [
                'role' => $role,
                'parts' => [['text' => (string)($msg['body_text'] ?? '')]],
            ];
        }
        $contents[] = [
            'role' => 'user',
            'parts' => [['text' => $clientMessage]],
        ];

        $raw = $this->geminiGenerateContent($apiKey, $model, $system, $contents, 1200);
        if ($raw === null) {
            return [
                'reply' => 'I could not process that right now. Would you like our team to follow up with you here?',
                'escalate' => true,
                'escalate_reason' => 'Gemini request failed',
                'metadata' => ['provider' => 'gemini', 'model' => $model, 'prompt_version' => self::PROMPT_VERSION, 'error' => 'gemini_failed'],
            ];
        }

        $parsed = json_decode($raw, true);
        if (!is_array($parsed) || !isset($parsed['reply'])) {
            $parsed = json_decode($this->stripJsonFence($raw), true);
        }
        if (!is_array($parsed) || !isset($parsed['reply'])) {
            return [
                'reply' => 'I had trouble understanding that. Our team can help — just ask to speak with your CA.',
                'escalate' => true,
                'escalate_reason' => 'Invalid JSON from model',
                'metadata' => ['provider' => 'gemini', 'model' => $model, 'prompt_version' => self::PROMPT_VERSION, 'error' => 'invalid_json'],
            ];
        }

        $reply = trim((string)$parsed['reply']);
        $escalate = (bool)($parsed['escalate'] ?? false);
        $escalateReason = trim((string)($parsed['escalate_reason'] ?? ''));

        if ($this->detectHumanRequest($clientMessage)) {
            $escalate = true;
            if ($escalateReason === '') {
                $escalateReason = 'Client requested human assistance';
            }
        }

        if ($reply === '') {
            $reply = 'Please ask your question again, or request to speak with our team for personalised help.';
            $escalate = true;
        }

        return [
            'reply' => $reply,
            'escalate' => $escalate,
            'escalate_reason' => $escalateReason,
            'metadata' => [
                'provider' => 'gemini',
                'model' => $model,
                'prompt_version' => self::PROMPT_VERSION,
                'escalate' => $escalate,
            ],
        ];
    }

    public static function botDisplayName(): string
    {
        return self::BOT_NAME;
    }

    private function detectHumanRequest(string $text): bool
    {
        $lower = mb_strtolower($text);
        $patterns = [
            'speak to', 'talk to', 'human', 'real person', 'call me', 'phone me',
            'my ca', 'chartered accountant', 'team member', 'someone from',
        ];
        foreach ($patterns as $p) {
            if (str_contains($lower, $p)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param array<int, array{role: string, parts: array<int, array{text: string}>}> $contents
     */
    private function geminiGenerateContent(
        string $apiKey,
        string $model,
        string $systemInstruction,
        array $contents,
        int $maxOutputTokens
    ): ?string {
        $modelPath = rawurlencode($model);
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$modelPath}:generateContent?key=" . rawurlencode($apiKey);

        $body = [
            'systemInstruction' => [
                'parts' => [['text' => $systemInstruction]],
            ],
            'contents' => $contents,
            'generationConfig' => [
                'maxOutputTokens' => $maxOutputTokens,
                'temperature' => 0.3,
                'responseMimeType' => 'application/json',
            ],
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        ]);

        $response = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200 || !is_string($response)) {
            return null;
        }

        $data = json_decode($response, true);
        if (!is_array($data)) {
            return null;
        }

        $parts = $data['candidates'][0]['content']['parts'] ?? [];
        if (!is_array($parts)) {
            return null;
        }

        $text = '';
        foreach ($parts as $part) {
            if (is_array($part) && isset($part['text']) && is_string($part['text'])) {
                $text .= $part['text'];
            }
        }

        return trim($text) !== '' ? trim($text) : null;
    }

    private function stripJsonFence(string $raw): string
    {
        $raw = trim($raw);
        if (str_starts_with($raw, '```')) {
            $raw = preg_replace('/^```(?:json)?\s*/i', '', $raw) ?? $raw;
            $raw = preg_replace('/\s*```$/', '', $raw) ?? $raw;
        }
        return trim($raw);
    }
}
