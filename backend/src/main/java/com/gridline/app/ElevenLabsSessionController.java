package com.gridline.app;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

// Gives the React frontend whatever it needs to open a live voice call
// with the ElevenLabs Conversational AI agent, without ever handing the
// browser the ElevenLabs API key itself:
//
//   - Public agent (no auth enabled in the ElevenLabs dashboard): just
//     returns the agent ID, which is safe to use directly client-side.
//   - Private agent (recommended once this is more than a demo): uses
//     the server-side ELEVENLABS_API_KEY to mint a short-lived signed
//     URL via the ElevenLabs REST API and returns that instead.
//
// Once the call ends, ElevenLabs' own post-call webhook (already wired
// up in WebhookController) delivers the transcript/summary here — this
// controller has nothing to do with that half of the flow.
@RestController
@RequestMapping("/api/elevenlabs")
public class ElevenLabsSessionController {

    @Value("${elevenlabs.agent.id:}")
    private String agentId;

    @Value("${elevenlabs.api.key:}")
    private String apiKey;

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build();

    @GetMapping("/session")
    public ResponseEntity<?> session() {
        if (agentId == null || agentId.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "error", "ELEVENLABS_AGENT_ID is not configured on the backend yet"
            ));
        }

        // Public agent — the browser can connect with just the agent ID,
        // no server round trip to ElevenLabs needed.
        if (apiKey == null || apiKey.isBlank()) {
            return ResponseEntity.ok(Map.of("agentId", agentId));
        }

        try {
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(
                    "https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=" + agentId))
                .timeout(Duration.ofSeconds(8))
                .header("xi-api-key", apiKey)
                .GET()
                .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                System.out.println("ElevenLabs get_signed_url failed: " + resp.statusCode() + " " + resp.body());
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of(
                    "error", "ElevenLabs signed-url request failed (" + resp.statusCode() + ")"
                ));
            }

            // ElevenLabs already responds with {"signed_url": "..."} — pass
            // it straight through so the frontend can read signed_url.
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(resp.body());
        } catch (Exception e) {
            System.out.println("ElevenLabs get_signed_url error: " + e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of(
                "error", "Could not reach ElevenLabs to get a signed URL"
            ));
        }
    }
}
