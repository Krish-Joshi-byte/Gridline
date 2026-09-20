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
    private final CitizenReportStore citizenReports;
    private final AutoDispatchService autoDispatch;
    private final ObjectMapper mapper = new ObjectMapper();

    private static final Pattern CODE_PATTERN = Pattern.compile("\\b\\d{1,2}[A-Z]-[A-Z]\\d\\b");

    public WebhookController(CallNoteStore store, CitizenReportStore citizenReports, AutoDispatchService autoDispatch) {
        this.store = store;
        this.citizenReports = citizenReports;
        this.autoDispatch = autoDispatch;
    }

    @PostMapping(value = "/webhooks/elevenlabs/post-call", consumes = "application/json")
    public ResponseEntity<?> handlePostCallWebhook(
            @RequestBody String rawBody,
            @RequestHeader(value = "elevenlabs-signature", required = false) String signatureHeader
    ) throws Exception {

        // Logged unconditionally, before any check that could reject or skip
        // the request, so "nothing in the logs" reliably means "ElevenLabs
        // never reached this endpoint" rather than "it arrived and got
        // silently rejected/ignored somewhere below."
        System.out.println("Received ElevenLabs webhook POST (" + rawBody.length() + " bytes), signature header present: " + (signatureHeader != null));

        if (!verifySignature(rawBody, signatureHeader)) {
            System.out.println("Rejected: signature did not verify (check ELEVENLABS_WEBHOOK_SECRET matches the secret configured on the webhook in the ElevenLabs dashboard)");
            return ResponseEntity.status(401).body(Map.of("error", "invalid signature"));
        }

        JsonNode root = mapper.readTree(rawBody);
        String type = root.path("type").asText("");
        System.out.println("Webhook type: " + type);

        if (!"post_call_transcription".equals(type)) {
            System.out.println("Ignored: not a post_call_transcription event");
            return ResponseEntity.ok(Map.of("ignored", true));
        }

        JsonNode data = root.path("data");
        JsonNode transcript = data.path("transcript");
        String summary = data.path("analysis").path("transcript_summary").asText(null);
        String conversationId = data.path("conversation_id").asText(null);

        // The frontend's live voice call passes the intersection code as
        // a dynamic variable when it starts the session (see CallPanel's
        // startVoiceCall), and ElevenLabs echoes whatever was passed back
        // in this field — so this is the exact code, not a guess. Only
        // fall back to scanning the transcript/summary for calls that
        // didn't originate from the app (e.g. a real inbound phone call).
        String dynamicCode = data.path("conversation_initiation_client_data")
            .path("dynamic_variables").path("code").asText(null);

        String code = (dynamicCode != null && !dynamicCode.isBlank())
            ? dynamicCode.trim().toUpperCase()
            : extractCode(transcript, summary);
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

        // If this call came from the citizen report page (its code always
        // starts with "CIT-"), this webhook is the moment the report itself
        // gets written up — the citizen only shared a location and placed a
        // call, so the type and description on the dispatcher's board come
        // from what the AI operator actually heard, not a guess made before
        // anyone talked to anyone.
        if (code != null && code.startsWith("CIT-")) {
            String inferredType = extractType(summary);
            citizenReports.applyCallSummary(code, inferredType, summary);

            // The AI operator can send a unit live via the dispatch-tool
            // endpoint mid-call (see ElevenLabsDispatchToolController). This
            // is the safety net for when it doesn't — either the tool isn't
            // configured on the agent yet, or it just didn't get called —
            // so a real citizen call never just sits there with a summary
            // and no one actually on the way. Default to "police" the same
            // way the dispatcher board already does for an unclassified
            // citizen report, since some unit should still respond.
            String dispatchType = inferredType != null ? inferredType : "police";
            autoDispatch.dispatchNearestAvailable(code, dispatchType).ifPresentOrElse(
                r -> System.out.println("Auto-dispatched " + r.unit.unitId + " to " + code + " (fallback, no live tool call)"),
                () -> System.out.println("Auto-dispatch skipped or unavailable for " + code)
            );
        }

        System.out.println("Call note stored for " + note.code + " (severity: " + note.severity + ")");
        return ResponseEntity.ok(Map.of("stored", true));
    }

    // Responder-facing lookup — the React app calls this when a
    // dispatcher opens a code, to show any AI-handled call notes for it.
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

    // Best-effort classification so the citizen-report board doesn't sit at
    // "unsure" forever just because the caller never picked a category
    // themselves — same rough-keyword approach as extractSeverity below,
    // not a substitute for a human reading the actual summary.
    private String extractType(String summary) {
        if (summary == null) return null;
        String s = summary.toLowerCase();
        if (s.matches(".*(fire|smoke|flames|burning).*")) return "fire";
        if (s.matches(".*(injur|bleeding|unconscious|breath|medical|chest pain|overdose|seizure).*")) return "medical";
        if (s.matches(".*(break-?in|assault|robbery|weapon|theft|vandalism|suspect|fight).*")) return "police";
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
