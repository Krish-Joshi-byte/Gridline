package com.gridline.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Receives ElevenLabs' post_call_transcription webhook when the fallback
// AI agent handles a call, pulls the intersection code and a summary
// out of it, and stores a "call note" responders can look up by code.
@RestController
public class WebhookController {

    @Value("${elevenlabs.webhook.secret:}")
    private String webhookSecret;

    private final CallNoteStore store;
    private final ObjectMapper mapper = new ObjectMapper();

    private static final Pattern CODE_PATTERN = Pattern.compile("\\b\\d{1,2}[A-Z]-[A-Z]\\d\\b");

    public WebhookController(CallNoteStore store) {
        this.store = store;
    }

    @PostMapping(value = "/webhooks/elevenlabs/post-call", consumes = "application/json")
    public ResponseEntity<?> handlePostCallWebhook(
            @RequestBody String rawBody,
            @RequestHeader(value = "elevenlabs-signature", required = false) String signatureHeader
    ) throws Exception {

        if (!verifySignature(rawBody, signatureHeader)) {
            return ResponseEntity.status(401).body(Map.of("error", "invalid signature"));
        }

        JsonNode root = mapper.readTree(rawBody);
        String type = root.path("type").asText("");

        if (!"post_call_transcription".equals(type)) {
            return ResponseEntity.ok(Map.of("ignored", true));
        }

        JsonNode data = root.path("data");
        JsonNode transcript = data.path("transcript");
        String summary = data.path("analysis").path("transcript_summary").asText(null);
        String conversationId = data.path("conversation_id").asText(null);

        String code = extractCode(transcript, summary);
        if (code == null) {
            System.out.println("No intersection code found in call " + conversationId);
        }

        CallNote note = new CallNote(
            conversationId,
            code != null ? code : "UNRESOLVED",
            summary != null ? summary : "(no summary returned)",
            extractSeverity(summary),
            transcript
        );
        store.add(note);

        System.out.println("Call note stored for " + note.code + " (severity: " + note.severity + ")");
        return ResponseEntity.ok(Map.of("stored", true));
    }

    // Responder-facing lookup — the React app calls this when a
    // dispatcher opens a code, to show any AI-handled call notes for it.
    @CrossOrigin(origins = "*") // demo only — restrict to your frontend's origin before this ships anywhere real
    @GetMapping("/notes/{code}")
    public Map<String, Object> getNotes(@PathVariable String code) {
        String upper = code.toUpperCase();
        Map<String, Object> result = new HashMap<>();
        result.put("code", upper);
        result.put("notes", store.get(upper));
        return result;
    }

    private boolean verifySignature(String rawBody, String signatureHeader) throws Exception {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            System.out.println("elevenlabs.webhook.secret not set — skipping verification (dev only, do not ship like this)");
            return true;
        }
        if (signatureHeader == null || signatureHeader.isBlank()) return false;

        Map<String, String> parts = new HashMap<>();
        for (String chunk : signatureHeader.split(",")) {
            String[] kv = chunk.split("=", 2);
            if (kv.length == 2) parts.put(kv[0].trim(), kv[1].trim());
        }
        if (!parts.containsKey("t") || !parts.containsKey("v0")) return false;

        String payloadToSign = parts.get("t") + "." + rawBody;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] hash = mac.doFinal(payloadToSign.getBytes(StandardCharsets.UTF_8));

        StringBuilder hex = new StringBuilder();
        for (byte b : hash) hex.append(String.format("%02x", b));

        String expected = "v0=" + hex;
        String got = "v0=" + parts.get("v0");
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), got.getBytes(StandardCharsets.UTF_8));
    }

    private String extractCode(JsonNode transcript, String summary) {
        if (summary != null) {
            Matcher m = CODE_PATTERN.matcher(summary.toUpperCase());
            if (m.find()) return m.group();
        }
        if (transcript != null && transcript.isArray()) {
            Iterator<JsonNode> it = transcript.elements();
            while (it.hasNext()) {
                String message = it.next().path("message").asText("");
                Matcher m = CODE_PATTERN.matcher(message.toUpperCase());
                if (m.find()) return m.group();
            }
        }
        return null;
    }

    private String extractSeverity(String summary) {
        if (summary == null) return "low";
        String s = summary.toLowerCase();
        if (s.matches(".*(unconscious|not breathing|severe bleeding|fire spreading|trapped).*")) return "high";
        if (s.matches(".*(injured|smoke|minor|shaken|scared).*")) return "medium";
        return "low";
    }
}
